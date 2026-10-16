import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline diagnostic input only: no Next imports, build hooks, environment changes,
// network calls, downloads, writes, or claim of font glyph/semantic validation.
const families = new Map([
  ['noto-sans-tc', 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=optional'],
  ['inter', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap'],
  ['noto-serif-tc', 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700;900&display=swap'],
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = code => { throw new Error(`CURRENT_FONT_INPUT_${code}`); };
const check = (condition, code) => { if (!condition) fail(code); };

export function loadCurrentGoogleFontInput(packRoot, { manifestSha256 } = {}) {
  check(digest(manifestSha256), 'EXPECTED_DIGEST');
  try {
    check(typeof packRoot === 'string' && isAbsolute(packRoot), 'ROOT');
    const root = resolve(packRoot);
    check(root === packRoot && realpathSync(root) === root && lstatSync(root).isDirectory(), 'ROOT');
    const read = (relative, cap) => {
      check(typeof relative === 'string' && !isAbsolute(relative) && !relative.includes('\\') &&
        relative.split('/').every(p => p && p !== '.' && p !== '..'), 'PATH');
      const file = join(root, relative);
      check(realpathSync(file) === file, 'SYMLINK');
      const stat = lstatSync(file);
      check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= cap, 'FILE');
      const bytes = readFileSync(file);
      check(bytes.length === stat.size && bytes.length <= cap, 'FILE_SIZE');
      return bytes;
    };
    const manifestBytes = read('manifest.json', 4 * 1024 * 1024);
    check(hash(manifestBytes) === manifestSha256, 'MANIFEST_DIGEST');
    const manifest = JSON.parse(manifestBytes);
    const completion = JSON.parse(read('COMPLETE.json', 65536));
    check(manifest.schema === 'tour-google-font-input-pack-v1' && manifest.complete === true &&
      manifest.historical_equivalence === false, 'MANIFEST');
    check(completion.schema === 'tour-google-font-input-pack-completion-v1' && completion.complete === true &&
      completion.historical_equivalence === false && completion.manifest_file === 'manifest.json' &&
      completion.manifest_sha256 === manifestSha256 && completion.all_font_files_wOF2 === true, 'COMPLETION');
    check(Array.isArray(manifest.css) && manifest.css.length === 3 &&
      Array.isArray(manifest.licenses) && manifest.licenses.length === 3 &&
      Array.isArray(manifest.fonts) && manifest.fonts.length > 0 && manifest.fonts.length <= 4096, 'INVENTORY');
    check(completion.verified_unique_urls === manifest.fonts.length &&
      completion.verified_woff2_v2 === manifest.fonts.length, 'COMPLETION_COUNTS');
    const expectedPaths = new Set(), css = new Map(), fonts = new Map(), urlsByFamily = new Map();
    let totalBytes = 0;
    const consume = (entry, cap) => {
      check(entry && digest(entry.sha256) && Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= cap, 'ENTRY');
      check(!expectedPaths.has(entry.local_file), 'DUPLICATE_PATH'); expectedPaths.add(entry.local_file);
      const bytes = read(entry.local_file, cap);
      check(bytes.length === entry.bytes && hash(bytes) === entry.sha256, 'CONTENT_DIGEST');
      totalBytes += bytes.length; check(totalBytes <= 64 * 1024 * 1024, 'TOTAL_SIZE');
      return bytes;
    };
    const officialFontURL = value => {
      check(typeof value === 'string', 'FONT_URL'); const url = new URL(value);
      check(url.origin === 'https://fonts.gstatic.com' && !url.username && !url.password && !url.search && !url.hash &&
        url.href === value && url.pathname.endsWith('.woff2'), 'FONT_URL');
    };
    for (const entry of manifest.css) {
      check(families.has(entry.family) && entry.request_url === families.get(entry.family) &&
        entry.local_file === `css/${entry.family}.css` && !css.has(entry.request_url), 'CSS_CONTRACT');
      const text = consume(entry, 1024 * 1024).toString('utf8');
      const urls = [...text.matchAll(/url\(\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s)'"\n]+))\s*\)/g)].map(m => m[1] ?? m[2] ?? m[3]);
      check(urls.length > 0 && urls.length <= 16384, 'CSS_URLS');
      for (const url of urls) officialFontURL(url);
      css.set(entry.request_url, text); urlsByFamily.set(entry.family, new Set(urls));
    }
    for (const entry of manifest.fonts) {
      check(families.has(entry.family) && typeof entry.local_file === 'string' &&
        entry.local_file.startsWith(`fonts/${entry.family}/`) && entry.local_file.split('/').length === 3 &&
        entry.local_file.endsWith('.woff2'), 'FONT_PATH');
      officialFontURL(entry.url);
      check(!fonts.has(entry.url) && urlsByFamily.get(entry.family)?.has(entry.url), 'FONT_MAPPING');
      const bytes = consume(entry, 8 * 1024 * 1024);
      check(bytes.length >= 48 && bytes.toString('ascii',0,4) === 'wOF2' && bytes.readUInt32BE(8) === bytes.length, 'WOFF2_HEADER');
      fonts.set(entry.url, bytes);
    }
    const referenced = new Set([...urlsByFamily.values()].flatMap(urls => [...urls]));
    check(referenced.size === fonts.size && [...referenced].every(url => fonts.has(url)), 'URL_COVERAGE');
    const licensed = new Set();
    for (const entry of manifest.licenses) {
      check(families.has(entry.family) && !licensed.has(entry.family) &&
        entry.local_file === `licenses/${entry.family}-OFL.txt`, 'LICENSE');
      licensed.add(entry.family);
      check(/SIL OPEN FONT LICENSE/i.test(consume(entry,65536).toString('utf8')), 'LICENSE_TEXT');
    }
    const actualPaths = new Set();
    function walk(relative) {
      const directory = join(root,relative);
      check(realpathSync(directory) === directory && !lstatSync(directory).isSymbolicLink(), 'SYMLINK');
      for (const entry of readdirSync(directory,{withFileTypes:true})) {
        const child = relative + '/' + entry.name;
        check(!entry.isSymbolicLink(), 'SYMLINK');
        if (entry.isDirectory()) walk(child);
        else { check(entry.isFile() && expectedPaths.has(child), 'EXTRA_FILE'); actualPaths.add(child); }
      }
    }
    for (const directory of ['css','fonts','licenses']) walk(directory);
    check(actualPaths.size === expectedPaths.size, 'FILE_COVERAGE');
    // The digest anchors caller-supplied bytes, not source authenticity. No signed
    // provenance or complete font parsing is implied by a successful container check.
    return Object.freeze({
      summary:Object.freeze({scope:'current-official-input-offline-diagnostic',manifestSha256,css:css.size,fonts:fonts.size,licenses:licensed.size,totalBytes,historicalEquivalence:false,canonicalBuild:false,glyphSemanticsVerified:false}),
      getCSS(url) { check(css.has(url),'CSS_NOT_FOUND'); return css.get(url); },
      getFont(url) { check(fonts.has(url),'FONT_NOT_FOUND'); return Buffer.from(fonts.get(url)); },
    });
  } catch (error) {
    if (error instanceof Error && /^CURRENT_FONT_INPUT_[A-Z0-9_]+$/.test(error.message)) throw error;
    fail('INVALID_PACK');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    check(process.argv.length === 4,'USAGE');
    console.log(JSON.stringify(loadCurrentGoogleFontInput(process.argv[2],{manifestSha256:process.argv[3]}).summary));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
