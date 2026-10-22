import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';

const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const fdPath = (handle) => `/proc/self/fd/${handle.fd}`;
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino;
const sameFile = (a, b) => sameIdentity(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

function parts(relative) {
  const result = relative.split('/');
  if (path.isAbsolute(relative) || result.some((part) => !part || part === '.' || part === '..')) throw new Error('WORLD_MEDIA_SOURCE_PATH_INVALID');
  return result;
}

async function canonicalHandle(handle, expected) {
  if (await fs.realpath(fdPath(handle)) !== expected) throw new Error('WORLD_MEDIA_COPY_BOUNDARY_CHANGED');
}

/** Linux FD anchors：不支援時停止，不能退回 pathname-based copy。 */
export async function openSourceDirectory(absolute) {
  if (process.platform !== 'linux' || !constants.O_NOFOLLOW || !constants.O_DIRECTORY) throw new Error('WORLD_MEDIA_SECURE_COPY_PLATFORM_REQUIRED');
  const before = await fs.lstat(absolute, { bigint: true });
  if (!before.isDirectory() || await fs.realpath(absolute) !== absolute) throw new Error('WORLD_MEDIA_REGULAR_DIRECTORY_REQUIRED');
  const handle = await fs.open(absolute, directoryFlags);
  try {
    if (!sameIdentity(before, await handle.stat({ bigint: true }))) throw new Error('WORLD_MEDIA_COPY_BOUNDARY_CHANGED');
    await canonicalHandle(handle, absolute);
    return { handle, absolute };
  } catch (error) { await handle.close(); throw error; }
}

async function openCreatedDirectory(parentHandle, name, absolute) {
  const anchored = path.join(fdPath(parentHandle), name);
  const created = await fs.lstat(anchored, { bigint: true });
  if (!created.isDirectory()) throw new Error('WORLD_MEDIA_STAGE_DIRECTORY_CHANGED');
  const handle = await fs.open(anchored, directoryFlags);
  try {
    if (!sameIdentity(created, await handle.stat({ bigint: true }))) throw new Error('WORLD_MEDIA_STAGE_DIRECTORY_CHANGED');
    await canonicalHandle(handle, absolute);
    // 既有內容代表它不是可接受的新空目錄；不能寫入或清掉未知資料。
    if ((await fs.readdir(fdPath(handle))).length) throw new Error('WORLD_MEDIA_STAGE_DIRECTORY_NOT_EMPTY');
    return { handle, stat: created };
  } catch (error) { await handle.close(); throw error; }
}

/**
 * 前置條件：caller 排他控制 checkout、parent 與 stage namespace，期间沒有其他 writer。
 * 核對 post-mkdir lstat 與 opened FD 一致／當時為空；不是 mkdir 的原子 creation proof。
 * 無法排除 hostile concurrent same-UID replacement，exclusiveControl 是 caller 聲明而非證明。
 */
export async function createStageDirectory(parent, name, { exclusiveControl = false } = {}) {
  if (exclusiveControl !== true) throw new Error('WORLD_MEDIA_EXCLUSIVE_CONTROL_REQUIRED');
  if (parts(name).length !== 1) throw new Error('WORLD_MEDIA_STAGE_NAME_INVALID');
  await canonicalHandle(parent.handle, parent.absolute);
  const anchored = path.join(fdPath(parent.handle), name);
  await fs.mkdir(anchored, { mode: 0o700 });
  const absolute = path.join(parent.absolute, name);
  const { handle, stat } = await openCreatedDirectory(parent.handle, name, absolute);
  return { handle, absolute, ownedDirectories: new Map([['', stat]]), ownedFiles: new Map() };
}

async function inParent(root, relative, create, action) {
  const segments = parts(relative);
  const opened = [];
  let handle = root.handle;
  let absolute = root.absolute;
  try {
    await canonicalHandle(handle, absolute);
    for (const segment of segments.slice(0, -1)) {
      const anchored = path.join(fdPath(handle), segment);
      absolute = path.join(absolute, segment);
      const relativeDirectory = path.relative(root.absolute, absolute).split(path.sep).join('/');
      let created = false;
      if (create) {
        if (!root.ownedDirectories) throw new Error('WORLD_MEDIA_STAGE_OWNERSHIP_REQUIRED');
        try { await fs.mkdir(anchored, { mode: 0o700 }); created = true; } catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      if (created) {
        const child = await openCreatedDirectory(handle, segment, absolute);
        handle = child.handle;
        root.ownedDirectories.set(relativeDirectory, child.stat);
      } else {
        handle = await fs.open(anchored, directoryFlags);
      }
      opened.push(handle);
      if (root.ownedDirectories) {
        const expected = root.ownedDirectories.get(relativeDirectory);
        if (!expected || !sameIdentity(expected, await handle.stat({ bigint: true }))) throw new Error('WORLD_MEDIA_STAGE_DIRECTORY_NOT_OWNED');
      }
      await canonicalHandle(handle, absolute);
    }
    return await action({ handle, absolute, name: segments.at(-1) });
  } finally { for (const handle of opened.reverse()) await handle.close(); }
}

async function sourceFile(root, relative, expected, read) {
  return inParent(root, relative, false, async (parent) => {
    const anchored = path.join(fdPath(parent.handle), parent.name);
    const before = await fs.lstat(anchored, { bigint: true });
    if (!before.isFile() || expected && !sameFile(before, expected)) throw new Error('WORLD_MEDIA_REGULAR_FILE_CHANGED');
    const handle = await fs.open(anchored, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat({ bigint: true });
      if (!stat.isFile() || !sameFile(before, stat)) throw new Error('WORLD_MEDIA_REGULAR_FILE_CHANGED');
      await canonicalHandle(parent.handle, parent.absolute);
      await canonicalHandle(handle, path.join(parent.absolute, parent.name));
      const bytes = read ? await handle.readFile() : null;
      if (!sameFile(stat, await handle.stat({ bigint: true }))) throw new Error('WORLD_MEDIA_REGULAR_FILE_CHANGED');
      await canonicalHandle(handle, path.join(parent.absolute, parent.name));
      return { stat, bytes };
    } finally { await handle.close(); }
  });
}

export const inspectSourceFile = async (root, relative) => (await sourceFile(root, relative, null, false)).stat;
export const readSourceFile = (root, relative, expected = null) => sourceFile(root, relative, expected, true);

/** 只向 FD 錨定的 stage 寫新檔；無 pathname overwrite 或 symlink follow。 */
export async function writeStageFile(root, relative, bytes, mode = 0o644) {
  if (!root.ownedDirectories || !root.ownedFiles) throw new Error('WORLD_MEDIA_STAGE_OWNERSHIP_REQUIRED');
  return inParent(root, relative, true, async (parent) => {
    const handle = await fs.open(path.join(fdPath(parent.handle), parent.name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
    try {
      await canonicalHandle(parent.handle, parent.absolute);
      await canonicalHandle(handle, path.join(parent.absolute, parent.name));
      root.ownedFiles.set(relative, await handle.stat({ bigint: true }));
      await handle.writeFile(bytes);
      await canonicalHandle(handle, path.join(parent.absolute, parent.name));
      return await handle.stat({ bigint: true });
    } finally { await handle.close(); }
  });
}

/** 失敗時不沿未知 replacement directory 遞迴刪除；只清目前同 inode 的 owned stage。 */
export async function removeOwnedStage(parent, stage) {
  const anchored = path.join(fdPath(parent.handle), path.basename(stage.absolute));
  const stat = await fs.lstat(anchored, { bigint: true }).catch(() => null);
  if (!stat || !sameIdentity(stat, await stage.handle.stat({ bigint: true }))) return false;
  await canonicalHandle(parent.handle, parent.absolute);
  // 每一層都以已開啟 directory FD 清理；rmdir 不會遞迴跟隨被替換的 symlink。
  const clean = async (handle, relative = '') => {
    for (const name of await fs.readdir(fdPath(handle))) {
      const file = path.join(fdPath(handle), name);
      const entry = await fs.lstat(file, { bigint: true });
      const childRelative = relative ? `${relative}/${name}` : name;
      if (entry.isSymbolicLink()) { await fs.unlink(file); continue; }
      if (!entry.isDirectory()) {
        const expected = stage.ownedFiles.get(childRelative);
        if (!expected || !sameIdentity(expected, entry)) throw new Error('WORLD_MEDIA_STAGE_UNKNOWN_FILE');
        await fs.unlink(file); continue;
      }
      const expected = stage.ownedDirectories.get(childRelative);
      if (!expected || !sameIdentity(expected, entry)) throw new Error('WORLD_MEDIA_STAGE_UNKNOWN_DIRECTORY');
      const child = await fs.open(file, directoryFlags);
      try {
        if (!sameIdentity(entry, await child.stat({ bigint: true }))) throw new Error('WORLD_MEDIA_STAGE_DIRECTORY_CHANGED');
        await clean(child, childRelative);
      } finally { await child.close(); }
      await fs.rmdir(file);
    }
  };
  await clean(stage.handle);
  await fs.rmdir(anchored);
  return true;
}

/** 成功回傳前，整個 stage namespace 都必須只有本次建立的已知 regular files／目錄。 */
export async function validateOwnedStageContents(stage) {
  const visit = async (handle, relative = '') => {
    await canonicalHandle(handle, relative ? path.join(stage.absolute, relative) : stage.absolute);
    for (const name of await fs.readdir(fdPath(handle))) {
      const childRelative = relative ? `${relative}/${name}` : name;
      const anchored = path.join(fdPath(handle), name);
      const entry = await fs.lstat(anchored, { bigint: true });
      if (entry.isFile()) {
        const expected = stage.ownedFiles.get(childRelative);
        if (!expected || !sameIdentity(expected, entry)) throw new Error('WORLD_MEDIA_STAGE_UNKNOWN_FILE');
      } else if (entry.isDirectory()) {
        const expected = stage.ownedDirectories.get(childRelative);
        if (!expected || !sameIdentity(expected, entry)) throw new Error('WORLD_MEDIA_STAGE_UNKNOWN_DIRECTORY');
        const child = await fs.open(anchored, directoryFlags);
        try {
          if (!sameIdentity(entry, await child.stat({ bigint: true }))) throw new Error('WORLD_MEDIA_STAGE_DIRECTORY_CHANGED');
          await visit(child, childRelative);
        } finally { await child.close(); }
      } else throw new Error('WORLD_MEDIA_STAGE_NONREGULAR_ENTRY');
    }
  };
  await visit(stage.handle);
}
