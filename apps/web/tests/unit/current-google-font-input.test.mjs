import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadCurrentGoogleFontInput } from '../../../../scripts/testing/current-google-font-input.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const families = [
  ['noto-sans-tc', 'Noto+Sans+TC:wght@400;700&display=optional'],
  ['inter', 'Inter:wght@400;500;700&display=swap'],
  ['noto-serif-tc', 'Noto+Serif+TC:wght@700;900&display=swap'],
];
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'tour-current-font-input-'));
  t.after(() => rmSync(root, { recursive:true, force:true }));
  const manifest = { schema:'tour-google-font-input-pack-v1',complete:true,historical_equivalence:false,css:[],fonts:[],licenses:[] };
  const record = (path, bytes) => {
    mkdirSync(join(root, path, '..'), {recursive:true}); writeFileSync(join(root,path),bytes);
    return {local_file:path,bytes:bytes.length,sha256:hash(bytes)};
  };
  for (const [family, query] of families) {
    const url = `https://fonts.gstatic.com/s/${family}/fixture.woff2`;
    // Header-only synthetic bytes test the container contract, never glyph validity.
    const font = Buffer.alloc(48); font.write('wOF2'); font.writeUInt32BE(48,8);
    manifest.fonts.push({...record(`fonts/${family}/fixture.woff2`,font),family,url});
    manifest.css.push({...record(`css/${family}.css`,Buffer.from(`/* latin */\n@font-face {\n src: url(${url}) format('woff2');\n}\n`)),family,request_url:'https://fonts.googleapis.com/css2?family='+query});
    manifest.licenses.push({...record(`licenses/${family}-OFL.txt`,Buffer.from('SIL OPEN FONT LICENSE Version 1.1\nsynthetic unit fixture only')),family});
  }
  const seal = () => {
    const bytes = Buffer.from(JSON.stringify(manifest)); writeFileSync(join(root,'manifest.json'),bytes);
    writeFileSync(join(root,'COMPLETE.json'),JSON.stringify({schema:'tour-google-font-input-pack-completion-v1',complete:true,historical_equivalence:false,manifest_file:'manifest.json',manifest_sha256:hash(bytes),verified_unique_urls:manifest.fonts.length,verified_woff2_v2:manifest.fonts.length,all_font_files_wOF2:true}));
    return hash(bytes);
  };
  return {root,manifest,seal,record};
}
test('consumes complete current pack without exposing mutable internal buffers', t => {
  const f=fixture(t), consumer=loadCurrentGoogleFontInput(f.root,{manifestSha256:f.seal()});
  assert.equal(consumer.summary.fonts,3); assert.equal(consumer.summary.historicalEquivalence,false);
  assert.equal(consumer.summary.canonicalBuild,false); assert.equal(consumer.summary.glyphSemanticsVerified,false);
  for (const entry of f.manifest.css) assert.equal(consumer.getCSS(entry.request_url),readFileSync(join(f.root,entry.local_file),'utf8'));
  const url=f.manifest.fonts[0].url, first=consumer.getFont(url); first.fill(0);
  assert.equal(consumer.getFont(url).toString('ascii',0,4),'wOF2');
  assert.throws(()=>consumer.getCSS('https://example.invalid'),/CSS_NOT_FOUND/);
  assert.throws(()=>consumer.getFont('https://example.invalid'),/FONT_NOT_FOUND/);
});
const mutations = {
  'historical equivalence': f=>{f.manifest.historical_equivalence=true;},
  'incomplete pack': f=>{f.manifest.complete=false;},
  'duplicate font URL': f=>{f.manifest.fonts[1].url=f.manifest.fonts[0].url;},
  'duplicate family': f=>{f.manifest.css[1].family=f.manifest.css[0].family;},
  'missing font': f=>{f.manifest.fonts.pop();},
  'unexpected CSS key': f=>{f.manifest.css[0].request_url+='&extra=1';},
  'nonofficial font URL': f=>{f.manifest.fonts[0].url='https://evil.invalid/font.woff2';},
  'path traversal': f=>{f.manifest.fonts[0].local_file='../outside.woff2';},
  'absolute path': f=>{f.manifest.fonts[0].local_file='/etc/passwd';},
  'missing license': f=>{f.manifest.licenses.pop();},
  'wrong hash': f=>{f.manifest.fonts[0].sha256='0'.repeat(64);},
  'wrong size': f=>{f.manifest.fonts[0].bytes++;},
  'wrong magic': f=>{const e=f.manifest.fonts[0],b=readFileSync(join(f.root,e.local_file));b.write('HTML');Object.assign(e,f.record(e.local_file,b));},
  'wrong header length': f=>{const e=f.manifest.fonts[0],b=readFileSync(join(f.root,e.local_file));b.writeUInt32BE(47,8);Object.assign(e,f.record(e.local_file,b));},
  'non-font CSS reference': f=>{const e=f.manifest.css[0];Object.assign(e,f.record(e.local_file,Buffer.from('src: url(https://evil.invalid/a.woff2);')));},
  'extra file': f=>{f.record('fonts/inter/extra.woff2',Buffer.alloc(48));},
  'file symlink': f=>{const p=join(f.root,f.manifest.fonts[0].local_file);rmSync(p);symlinkSync(join(f.root,f.manifest.fonts[1].local_file),p);},
  'directory symlink': f=>{symlinkSync(join(f.root,'css'),join(f.root,'fonts','extra'));},
};
for (const [name,mutate] of Object.entries(mutations)) test(`rejects ${name}`,t=>{const f=fixture(t);mutate(f);assert.throws(()=>loadCurrentGoogleFontInput(f.root,{manifestSha256:f.seal()}),/CURRENT_FONT_INPUT_/);});
test('requires independently supplied manifest digest and matching completion marker',t=>{
  const f=fixture(t),sha=f.seal();
  assert.throws(()=>loadCurrentGoogleFontInput(f.root),/EXPECTED_DIGEST/);
  assert.throws(()=>loadCurrentGoogleFontInput(f.root,{manifestSha256:'0'.repeat(64)}),/MANIFEST_DIGEST/);
  writeFileSync(join(f.root,'COMPLETE.json'),'{}');
  assert.throws(()=>loadCurrentGoogleFontInput(f.root,{manifestSha256:sha}),/COMPLETION/);
});
