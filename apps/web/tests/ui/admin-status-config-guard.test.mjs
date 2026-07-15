import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const adminAppDir = new URL('../../app/(non-locale)/admin/', import.meta.url);

function listTsxFiles(dirUrl) {
  const dir = dirUrl.pathname;
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return listTsxFiles(new URL(`${entry}/`, dirUrl));
    return entry.endsWith('.tsx') ? [path] : [];
  });
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function hasFallback(source, mapName, accessEnd) {
  const after = source.slice(accessEnd, accessEnd + 80);
  if (/^\s*(\?\?|\|\|)/.test(after)) return true;

  const lineStart = source.lastIndexOf('\n', accessEnd) + 1;
  const lineEnd = source.indexOf('\n', accessEnd);
  const line = source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  if (line.includes(`${mapName}.`) || line.includes('Object.prototype.hasOwnProperty')) return true;

  return false;
}

describe('admin status/config map access guard', () => {
  it('does not directly read *_CONFIG/*_BADGE/*_LABEL maps without fallback or typed literal coverage', () => {
    const violations = [];

    for (const filePath of listTsxFiles(adminAppDir)) {
      const source = readFileSync(filePath, 'utf8');
      const rel = relative(adminAppDir.pathname, filePath);
      const mapNames = Array.from(source.matchAll(/const\s+(\w*(?:CONFIG|BADGE|LABELS|COLOR)\w*)\s*:/g)).map((m) => m[1]);

      for (const mapName of mapNames) {
        const directAccess = new RegExp(`${mapName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\[[^\]]+\\]`, 'g');
        for (const match of source.matchAll(directAccess)) {
          const index = match.index ?? 0;
          const access = match[0];
          const accessEnd = index + access.length;
          const nextChars = source.slice(accessEnd, accessEnd + 2);

          // Direct property access on a map lookup is the crash-prone pattern:
          // MAP[key].bg / MAP[key].label / MAP[key].color.
          if (/^\.[A-Za-z_$]/.test(nextChars)) {
            violations.push(`${rel}:${lineNumber(source, index)} direct ${access} property access needs fallback`);
            continue;
          }

          // Assignment to a local cfg that is later dereferenced is allowed only if
          // the lookup itself includes a nearby fallback (?? or ||).
          const assignmentLineStart = source.lastIndexOf('\n', index) + 1;
          const assignmentLineEnd = source.indexOf('\n', accessEnd);
          const line = source.slice(assignmentLineStart, assignmentLineEnd === -1 ? undefined : assignmentLineEnd);
          const assignedVar = line.match(/const\s+(\w+)\s*=\s*.*$/)?.[1];
          if (assignedVar && !hasFallback(source, mapName, accessEnd)) {
            const window = source.slice(assignmentLineEnd, assignmentLineEnd + 240);
            const deref = new RegExp(`\\b${assignedVar}\\.[A-Za-z_$]`).test(window);
            if (deref) {
              violations.push(`${rel}:${lineNumber(source, index)} ${assignedVar} from ${access} is dereferenced without fallback`);
            }
          }
        }
      }
    }

    assert.deepEqual(violations, []);
  });
});
