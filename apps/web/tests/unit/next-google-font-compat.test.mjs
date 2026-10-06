import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { brotliCompressSync, deflateSync } from 'node:zlib';
import { originalLoaderSource, patchNextGoogleFont } from '../../../../scripts/build/prepare-next-google-font-compat.mjs';

const require = createRequire(import.meta.url);
const nextRoot = dirname(require.resolve('next/package.json'));
const fontRoot = 'dist/compiled/@next/font/dist';
// Own deterministic two-glyph fixtures (.notdef and triangle A), generated with fontTools.
// No brand font or third-party font bytes are stored or substituted in the app build.
const ttf = Buffer.from('AAEAAAAKAIAAAwAgT1MvMkUhRcUAAAEoAAAAYGNtYXAADACUAAABkAAAADRnbHlmAvU7mwAAAcwAAAAaaGVhZGL+RAAAAACsAAAANmhoZWEHCgOGAAAA5AAAACRobXR4BEwAAAAAAYgAAAAGbG9jYQANAAAAAAHEAAAABm1heHAABAAFAAABCAAAACBuYW1l2mYdxQAAAegAAAEOcG9zdAAoAAAAAAL4AAAAJgABAAAAAQAAg2zM818PPPUAAwPoAAAAAAAAAAAAAAAAAAAAAABkAAADhAMgAAAAAwACAAAAAAAAAAEAAAMg/zgAAAPoAGQAZAOEAAEAAAAAAAAAAAAAAAAAAAABAAEAAAACAAMAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwPoAZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAAEEAQQMg/zgAAAMgAMgAAAAAAAAAAAAAAAAAAAAgAAAD6AAAAGQAAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAIAAAAAQABAABAAAAQf//AAAAQf///8AAAQAAAAAAAAAAAA0AAAABAGQAAAOEAyAAAgAAMwEBZAGQAZADIPzgAAAAAAAKAH4AAQAAAAAAAQAOAAAAAQAAAAAAAgAHAA4AAQAAAAAAAwAOABUAAQAAAAAABAAOAAAAAQAAAAAABgANACMAAwABBAkAAQAcADAAAwABBAkAAgAOAEwAAwABBAkAAwAcAFoAAwABBAkABAAcADAAAwABBAkABgAaAHZDb21wYXQgRml4dHVyZVJlZ3VsYXJjb21wYXQtZml4dHVyZUNvbXBhdEZpeHR1cmUAQwBvAG0AcABhAHQAIABGAGkAeAB0AHUAcgBlAFIAZQBnAHUAbABhAHIAYwBvAG0AcABhAHQALQBmAGkAeAB0AHUAcgBlAEMAbwBtAHAAYQB0AEYAaQB4AHQAdQByAGUAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAkAAA=', 'base64');
const otf = Buffer.from('T1RUTwAJAIAAAwAQQ0ZGINvlQMEAAALEAAAAYU9TLzJFIUXFAAABAAAAAGBjbWFwAAwAlAAAAnAAAAA0aGVhZGL+RAAAAACcAAAANmhoZWEHCgOGAAAA1AAAACRobXR4BEwAAAAAAygAAAAGbWF4cAACUAAAAAD4AAAABm5hbWXaZh3FAAABYAAAAQ5wb3N0AAMAAAAAAqQAAAAgAAEAAAABAAATN2R4Xw889QADA+gAAAAAAAAAAAAAAAAAAAAAAGQAAAOEAyAAAAADAAIAAAAAAAAAAQAAAyD/OAAAA+gAZABkA4QAAQAAAAAAAAAAAAAAAAAAAAEAAFAAAAIAAAADA+gBkAAFAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAA/Pz8/AAAAQQBBAyD/OAAAAyAAyAAAAAAAAAAAAAAAAAAAACAAAAAAAAoAfgABAAAAAAABAA4AAAABAAAAAAACAAcADgABAAAAAAADAA4AFQABAAAAAAAEAA4AAAABAAAAAAAGAA0AIwADAAEECQABABwAMAADAAEECQACAA4ATAADAAEECQADABwAWgADAAEECQAEABwAMAADAAEECQAGABoAdkNvbXBhdCBGaXh0dXJlUmVndWxhcmNvbXBhdC1maXh0dXJlQ29tcGF0Rml4dHVyZQBDAG8AbQBwAGEAdAAgAEYAaQB4AHQAdQByAGUAUgBlAGcAdQBsAGEAcgBjAG8AbQBwAGEAdAAtAGYAaQB4AHQAdQByAGUAQwBvAG0AcABhAHQARgBpAHgAdAB1AHIAZQAAAAAAAgAAAAMAAAAUAAMAAQAAABQABAAgAAAABAAEAAEAAABB//8AAABB////wAABAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAEAQABAQEOQ29tcGF0Rml4dHVyZQABAQEY+BsC+BsD+BgE74v6GPm0BdIPi+wS1REAAQEBD0NvbXBhdCBGaXh0dXJlAAAAACIAAgEBBBL6fA76fO8W+CT5tPgk/bQFDgAAAAPoAAAAZAAA', 'base64');
const tables = (font) => Array.from({ length: font.readUInt16BE(4) }, (_, index) => {
  const pos = 12 + index * 16, offset = font.readUInt32BE(pos + 8), length = font.readUInt32BE(pos + 12);
  return { tag: font.toString('latin1', pos, pos + 4), checksum: font.readUInt32BE(pos + 4), bytes: font.subarray(offset, offset + length) };
});
const base128 = (value) => {
  const bytes = [value & 127];
  while ((value = Math.floor(value / 128))) bytes.unshift((value & 127) | 128);
  return Buffer.from(bytes);
};
function wrap(font, woff2) {
  const entries = tables(font), header = Buffer.alloc(woff2 ? 48 : 44);
  header.write(woff2 ? 'wOF2' : 'wOFF'); header.writeUInt32BE(font.readUInt32BE(0), 4); header.writeUInt16BE(entries.length, 12);
  header.writeUInt32BE(12 + entries.length * 16 + entries.reduce((sum, entry) => sum + Math.ceil(entry.bytes.length / 4) * 4, 0), 16);
  header.writeUInt16BE(1, woff2 ? 24 : 20);
  let result;
  if (woff2) {
    const directory = Buffer.concat(entries.map(({ tag, bytes }) => Buffer.concat([
      Buffer.from([tag === 'glyf' || tag === 'loca' ? 255 : 63]), Buffer.from(tag), base128(bytes.length),
    ])));
    const compressed = brotliCompressSync(Buffer.concat(entries.map((entry) => entry.bytes)));
    header.writeUInt32BE(compressed.length, 20); result = Buffer.concat([header, directory, compressed]);
  } else {
    const directory = Buffer.alloc(entries.length * 20), chunks = []; let offset = header.length + directory.length;
    entries.forEach(({ tag, checksum, bytes }, index) => {
      const compressed = deflateSync(bytes), data = compressed.length < bytes.length ? compressed : bytes, pos = index * 20;
      directory.write(tag, pos); directory.writeUInt32BE(offset, pos + 4); directory.writeUInt32BE(data.length, pos + 8);
      directory.writeUInt32BE(bytes.length, pos + 12); directory.writeUInt32BE(checksum, pos + 16);
      const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4); data.copy(padded); chunks.push(padded); offset += padded.length;
    });
    result = Buffer.concat([header, directory, ...chunks]);
  }
  result.writeUInt32BE(result.length, 8); return result;
}
const fonts = { ttf, otf, woff: wrap(ttf, false), woff2: wrap(ttf, true) };
const cssFor = (url) => `/* latin */\n@font-face {\n  font-family: 'Inter';\n  src: url(${url}) format('woff2');\n}\nbody { color: red; }`;
const extensionless = 'https://fonts.gstatic.com/l/font?kit=unit-fixture';

function fixture(t, patched = true) {
  const root = mkdtempSync(join(nextRoot, '../.tour-font-compat-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(nextRoot, fontRoot), join(root, fontRoot), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '15.5.14' }));
  const loaderPath = join(root, fontRoot, 'google/loader.js');
  writeFileSync(loaderPath, originalLoaderSource(readFileSync(loaderPath, 'utf8')));
  if (patched) assert.equal(patchNextGoogleFont(root), 'patched');
  const vendor = new Module(loaderPath); vendor.filename = loaderPath;
  vendor.paths = [...Module._nodeModulePaths(dirname(loaderPath)), ...Module._nodeModulePaths(nextRoot)];
  vendor._compile(readFileSync(loaderPath, 'utf8'), loaderPath);
  const fetcher = require(join(root, fontRoot, 'google/fetch-resource.js'));
  const responses = { css: cssFor(extensionless), font: fonts.woff2, requests: [], emitted: [] };
  assert.equal(process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES, undefined);
  t.mock.method(fetcher, 'fetchResource', async (url, isDev, message) => {
    responses.requests.push({ url, isDev, message });
    return url.startsWith('https://fonts.googleapis.com/') ? Buffer.from(responses.css) : responses.font;
  });
  const load = () => vendor.exports.default({
    functionName: 'Inter', data: [{ weight: '400', display: 'swap', subsets: ['latin'], variable: '--font-inter' }],
    isDev: false, isServer: true,
    emitFontFile(buffer, ext, preload, adjust) {
      responses.emitted.push({ buffer, ext, preload, adjust }); return `/_next/static/media/test.${ext}`;
    },
  });
  return { root, loaderPath, responses, load };
}

test('original real vendor loader reproduces extensionless null-capture failure', async (t) => {
  const { responses, load } = fixture(t, false);
  await assert.rejects(load(), /Cannot read properties of null/);
  assert.equal(responses.requests.length, 2); assert.equal(responses.emitted.length, 0);
});
for (const [ext, bytes] of Object.entries(fonts)) test(`vendor loader parses valid ${ext} bytes and emits unchanged bytes`, async (t) => {
  const { responses, load } = fixture(t); responses.font = bytes;
  const mod = require(join(nextRoot, fontRoot, 'fontkit')).default;
  const parsed = (mod.default || mod)(bytes);
  assert.equal(parsed.familyName, 'Compat Fixture'); assert.equal(parsed.numGlyphs, 2);
  assert.deepEqual(parsed.glyphForCodePoint(65).path.commands.map(({ command }) => command), ['moveTo', 'lineTo', 'lineTo', 'closePath']);
  const result = await load();
  assert.deepEqual(responses.emitted, [{ buffer: bytes, ext, preload: true, adjust: true }]);
  assert.match(result.css, new RegExp(`/_next/static/media/test[.]${ext}`));
  assert.doesNotMatch(result.css, /fonts[.]gstatic|body \{/); assert.equal(result.variable, '--font-inter');
  assert.equal(result.weight, '400'); assert.equal(result.style, 'normal');
  assert.deepEqual(responses.requests.map(({ isDev }) => isDev), [false, false]);
  await load(); assert.equal(responses.requests.length, 2); // original client/server cache consumption
  await load(); assert.equal(responses.requests.length, 4);
});
for (const ext of ['woff', 'woff2', 'eot', 'ttf', 'otf']) test(`normal ${ext} URL retains original extension path`, async (t) => {
  const { responses, load } = fixture(t); responses.css = cssFor(`https://fonts.gstatic.com/font.${ext}`);
  responses.font = Buffer.from('original loader does not parse extension-bearing URLs');
  await load(); assert.equal(responses.emitted[0].ext, ext); assert.strictEqual(responses.emitted[0].buffer, responses.font);
});
test('guard is idempotent and rejects unexpected version/source/parser without writing', (t) => {
  const { root, loaderPath } = fixture(t); const patched = readFileSync(loaderPath, 'utf8');
  assert.equal(patchNextGoogleFont(root), 'already-patched'); assert.equal(readFileSync(loaderPath, 'utf8'), patched);
  writeFileSync(join(root, 'package.json'), '{"version":"15.5.15"}');
  assert.throws(() => patchNextGoogleFont(root), /UNSUPPORTED_NEXT_VERSION/);
  assert.equal(readFileSync(loaderPath, 'utf8'), patched); writeFileSync(join(root, 'package.json'), '{"version":"15.5.14"}');
  writeFileSync(loaderPath, patched + '\n// unexpected change');
  assert.throws(() => patchNextGoogleFont(root), /UNSUPPORTED_LOADER_DIGEST/);
  assert.equal(readFileSync(loaderPath, 'utf8'), patched + '\n// unexpected change');
  writeFileSync(loaderPath, patched); writeFileSync(join(root, fontRoot, 'fontkit/index.js'), 'unexpected');
  assert.throws(() => patchNextGoogleFont(root), /UNSUPPORTED_FONTKIT_DIGEST/); assert.equal(readFileSync(loaderPath, 'utf8'), patched);
});
const mutate = (buffer, change) => { const copy = Buffer.from(buffer); change(copy); return copy; };
const invalid = {
  html: Buffer.from('<html>not a font</html>'), unknown: Buffer.alloc(100), headerOnly: fonts.woff2.subarray(0, 48),
  shortMagic: Buffer.from('wOF2'), badReserved: mutate(fonts.woff2, (b) => b.writeUInt16BE(1, 14)),
  invalidFlavor: mutate(fonts.woff2, (b) => b.write('ttcf', 4)), zeroTables: mutate(fonts.woff2, (b) => b.writeUInt16BE(0, 12)),
  truncatedTtf: ttf.subarray(0, ttf.length - 1), truncatedWoff: fonts.woff.subarray(0, fonts.woff.length - 1),
  truncatedWoff2: fonts.woff2.subarray(0, fonts.woff2.length - 1), truncatedOtf: otf.subarray(0, 800),
  repairedLengthWoff: mutate(fonts.woff.subarray(0, fonts.woff.length - 1), (b) => b.writeUInt32BE(b.length, 8)),
  repairedLengthWoff2: mutate(fonts.woff2.subarray(0, fonts.woff2.length - 1), (b) => b.writeUInt32BE(b.length, 8)),
  brokenBrotli: mutate(fonts.woff2, (b) => b.fill(0, 120)), brokenDeflate: mutate(fonts.woff, (b) => b.fill(0, 244)),
  sfntOutOfBounds: mutate(ttf, (b) => b.writeUInt32BE(b.length, 20)),
  sfntBadHead: mutate(ttf, (b) => b.writeUInt32BE(0, 184)),
};
for (const [name, bytes] of Object.entries(invalid)) test(`vendor loader fails closed before emit: ${name}`, async (t) => {
  const { responses, load } = fixture(t); responses.font = bytes;
  await assert.rejects(load(), /NEXT_FONT_COMPAT_INVALID_FONT/); assert.equal(responses.emitted.length, 0);
});
for (const [format, font] of Object.entries({ ttf, otf })) {
  for (let index = 0; index < font.readUInt16BE(4); index++) {
    const position = 12 + index * 16, tag = font.toString('latin1', position, position + 4);
    if (tag === 'OS/2') continue;
    test(`declared one-byte ${format} ${tag.trim()} table fails before emit`, async (t) => {
      const { responses, load } = fixture(t);
      responses.font = mutate(font, (bytes) => bytes.writeUInt32BE(1, position + 12));
      await assert.rejects(load(), /NEXT_FONT_COMPAT_INVALID_FONT/); assert.equal(responses.emitted.length, 0);
    });
  }
}
test('app build invokes guarded compatibility before unchanged next build', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.build, 'node ../../scripts/build/prepare-next-google-font-compat.mjs && next build');
});
