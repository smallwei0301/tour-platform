import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NEXT_VERSION = '15.5.14';
export const LOADER_SHA256 = '45e38a6da7efde1a8f53c29619af2eb8f202d352119dbc91c7714db07db385f4';
const FONTKIT_SHA256 = '8d93c603e18bbb06f66d42c0aa07381d1968ebb2f1efd8727e3057f6d7b0cf53';
const originalLine = 'const ext = /\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1];';
const replacementLine = 'const ext = tourGoogleFontExtension(googleFontFileUrl, fontFileBuffer);';
const digest = (source) => createHash('sha256').update(source).digest('hex');

// Injected into the pinned CommonJS loader; relative require uses Next's own fontkit.
function tourGoogleFontExtension(url, buffer) {
  const match = /\.(woff|woff2|eot|ttf|otf)$/.exec(url);
  if (match) return match[1];
  const invalid = () => { throw new Error('NEXT_FONT_COMPAT_INVALID_FONT'); };
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) invalid();
    const magic = buffer.toString('latin1', 0, 4);
    const ext = { wOF2: 'woff2', wOFF: 'woff', OTTO: 'otf', true: 'ttf', '\u0000\u0001\u0000\u0000': 'ttf' }[magic];
    if (!ext) invalid();
    const wrapped = ext === 'woff' || ext === 'woff2';
    const headerSize = ext === 'woff2' ? 48 : wrapped ? 44 : 12;
    if (buffer.length < headerSize) invalid();
    const count = buffer.readUInt16BE(wrapped ? 12 : 4);
    if (!count || count > 4095) invalid();
    if (wrapped && (buffer.readUInt32BE(8) !== buffer.length || buffer.readUInt16BE(14) !== 0)) invalid();
    const flavor = wrapped ? buffer.readUInt32BE(4) : buffer.readUInt32BE(0);
    if (![0x00010000, 0x74727565, 0x4f54544f].includes(flavor)) invalid();
    const range = (offset, length, minimum) => {
      if (offset < minimum || length < 0 || offset + length > buffer.length) invalid();
    };
    if (wrapped) {
      const meta = ext === 'woff2' ? 28 : 24;
      for (const [offsetIndex, lengthIndex] of [[meta, meta + 4], [meta + 12, meta + 16]]) {
        const offset = buffer.readUInt32BE(offsetIndex), length = buffer.readUInt32BE(lengthIndex);
        if (offset || length) { if (!offset || !length) invalid(); range(offset, length, headerSize); }
      }
      if (!buffer.readUInt32BE(meta) && buffer.readUInt32BE(meta + 8)) invalid();
    }
    const mod = require('../fontkit').default;
    const font = (mod.default || mod)(buffer);
    const tables = Object.values(font.directory.tables);
    if (tables.length !== count) invalid();
    const directoryEnd = ext === 'woff2' ? font._dataPos : headerSize + count * (wrapped ? 20 : 16);
    if (directoryEnd > buffer.length) invalid();
    const sfntSize = 12 + count * 16 + tables.reduce((size, table) => size + Math.ceil(table.length / 4) * 4, 0);
    if (wrapped && font.directory.totalSfntSize !== sfntSize) invalid();
    const { inflateSync, brotliDecompressSync } = require('node:zlib');
    if (ext === 'woff2') {
      const compressedSize = font.directory.totalCompressedSize;
      range(directoryEnd, compressedSize, directoryEnd);
      const size = tables.reduce((total, table) => total + (table.transformLength ?? table.length), 0);
      if (!size || brotliDecompressSync(buffer.subarray(directoryEnd, directoryEnd + compressedSize), { maxOutputLength: size }).length !== size) invalid();
    } else {
      const spans = [];
      for (const table of tables) {
        const length = wrapped ? table.compLength : table.length;
        range(table.offset, Math.ceil(length / 4) * 4, directoryEnd);
        if (table.offset % 4 || (wrapped && length > table.length)) invalid();
        if (wrapped && length < table.length && inflateSync(buffer.subarray(table.offset, table.offset + length), { maxOutputLength: table.length }).length !== table.length) invalid();
        if (length) spans.push([table.offset, table.offset + length]);
      }
      spans.sort((a, b) => a[0] - b[0]);
      if (spans.some((span, index) => index && span[0] < spans[index - 1][1])) invalid();
    }
    // Fontkit otherwise reads beyond a table's declared span into neighbouring bytes.
    const getTableStream = font._getTableStream.bind(font);
    font._getTableStream = (tag) => {
      const stream = getTableStream(tag), table = font.directory.tables[tag];
      if (!stream) return null;
      const length = table.transformLength ?? table.length, start = stream.pos;
      if (start < 0 || start + length > stream.buffer.length) invalid();
      const bounded = new stream.constructor(stream.buffer.subarray(start, start + length));
      const readBuffer = bounded.readBuffer.bind(bounded);
      bounded.readBuffer = (size) => {
        if (bounded.pos < 0 || bounded.pos + size > length) invalid();
        return readBuffer(size);
      };
      return bounded;
    };
    const decodeTable = font._decodeTable.bind(font);
    font._decodeTable = (table) => {
      if (table.tag === 'maxp' && flavor === 0x4f54544f) {
        const stream = font._getTableStream('maxp'), version = stream.readUInt32BE(), numGlyphs = stream.readUInt16BE();
        // CFF maxp 0.5 contains only this six-byte header; fontkit assumes the 32-byte TTF form.
        if (version === 0x00005000) return { version, numGlyphs };
      }
      return decodeTable(table);
    };
    for (const tag of ['head', 'maxp', 'hhea', 'hmtx', 'cmap', 'name', 'post']) {
      const table = font.directory.tables[tag];
      if (!table || !font._decodeTable(table)) invalid();
    }
    if (font.head.magicNumber !== 0x5f0f3cf5 || font.unitsPerEm < 16 || font.unitsPerEm > 16384 || !font.numGlyphs) invalid();
    if (flavor === 0x4f54544f ? !font.directory.tables['CFF '] && !font.directory.tables.CFF2 : !font.directory.tables.glyf || !font.directory.tables.loca) invalid();
    // Force lazy cmap and glyph decoding, rather than accepting a header-only probe.
    if (!font.characterSet.length) invalid();
    for (let index = 0; index < font.numGlyphs; index++) {
      const glyph = font.getGlyph(index);
      if (!Number.isFinite(glyph.advanceWidth) || !Array.isArray(glyph.path.commands)) invalid();
    }
    return ext;
  } catch { invalid(); }
}

const injection = `${tourGoogleFontExtension.toString()}\n`;
const marker = 'const cssCache = new Map();';

export function originalLoaderSource(source) {
  const original = source.replace(injection, '').replace(replacementLine, originalLine);
  if (digest(original) !== LOADER_SHA256) throw new Error('NEXT_FONT_COMPAT_UNSUPPORTED_LOADER_DIGEST');
  const patched = original.replace(marker, injection + marker).replace(originalLine, replacementLine);
  if (source !== original && source !== patched) throw new Error('NEXT_FONT_COMPAT_UNSUPPORTED_LOADER_DIGEST');
  return original;
}

export function patchNextGoogleFont(nextPackagePath) {
  const require = createRequire(import.meta.url);
  const packagePath = nextPackagePath ?? dirname(require.resolve('next/package.json'));
  if (JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8')).version !== NEXT_VERSION) throw new Error('NEXT_FONT_COMPAT_UNSUPPORTED_NEXT_VERSION');
  const fontRoot = join(packagePath, 'dist/compiled/@next/font/dist');
  if (digest(readFileSync(join(fontRoot, 'fontkit/index.js'))) !== FONTKIT_SHA256) throw new Error('NEXT_FONT_COMPAT_UNSUPPORTED_FONTKIT_DIGEST');
  const loaderPath = join(fontRoot, 'google/loader.js');
  const source = readFileSync(loaderPath, 'utf8');
  const original = originalLoaderSource(source);
  const patched = original.replace(marker, injection + marker).replace(originalLine, replacementLine);
  if (source === patched) return 'already-patched';
  writeFileSync(loaderPath, patched);
  return 'patched';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Next Google-font compatibility: ${patchNextGoogleFont()}`);
}
