/**
 * 健檢 v2 S1（docs/operations/reports/repo-health-audit-20260702.md）：
 * guide 登入密碼雜湊由單輪 SHA-256(salt+plain) 升級為 scrypt（慢雜湊），
 * 舊格式相容驗證＋登入成功時透明升級（不強制導遊重設密碼）。
 *
 * 格式：
 *   新 — scrypt$N$r$p$salt$hash（6 段，'$' 分隔）
 *   舊 — salt:hash（2 段，':' 分隔，單輪 SHA-256）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const { hashPassword, verifyPassword, needsPasswordRehash } = await import(
  '../../src/lib/guide-auth.ts'
);

function makeLegacyHash(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + plain).digest('hex');
  return `${salt}:${hash}`;
}

describe('hashPassword — scrypt 格式', () => {
  it('產出 scrypt$N$r$p$salt$hash 六段格式', () => {
    const stored = hashPassword('correct horse battery');
    const parts = stored.split('$');
    assert.equal(parts[0], 'scrypt');
    assert.equal(parts.length, 6);
    assert.ok(Number(parts[1]) >= 16384, 'N 至少 16384');
  });

  it('同密碼兩次雜湊 salt 不同', () => {
    const a = hashPassword('same-password');
    const b = hashPassword('same-password');
    assert.notEqual(a, b);
  });
});

describe('verifyPassword — 新格式', () => {
  it('正確密碼通過', () => {
    const stored = hashPassword('s3cret-pw');
    assert.equal(verifyPassword('s3cret-pw', stored), true);
  });

  it('錯誤密碼拒絕', () => {
    const stored = hashPassword('s3cret-pw');
    assert.equal(verifyPassword('s3cret-pW', stored), false);
  });

  it('格式損毀拒絕而非丟錯', () => {
    assert.equal(verifyPassword('x', 'scrypt$bad'), false);
    assert.equal(verifyPassword('x', 'scrypt$a$b$c$d$e'), false);
    assert.equal(verifyPassword('x', ''), false);
  });
});

describe('verifyPassword — 舊格式相容（既有導遊不受影響）', () => {
  it('舊格式正確密碼仍通過', () => {
    const legacy = makeLegacyHash('old-guide-pw');
    assert.equal(verifyPassword('old-guide-pw', legacy), true);
  });

  it('舊格式錯誤密碼拒絕', () => {
    const legacy = makeLegacyHash('old-guide-pw');
    assert.equal(verifyPassword('wrong', legacy), false);
  });
});

describe('needsPasswordRehash — 透明升級判斷', () => {
  it('舊格式 → 需要升級', () => {
    assert.equal(needsPasswordRehash(makeLegacyHash('x')), true);
  });

  it('新 scrypt 格式 → 不需升級', () => {
    assert.equal(needsPasswordRehash(hashPassword('x')), false);
  });

  it('空值 → 需要升級（防呆）', () => {
    assert.equal(needsPasswordRehash(''), true);
    assert.equal(needsPasswordRehash(null), true);
  });
});

describe('source contract — 登入路徑透明升級與單一實作', () => {
  const sessionRouteSrc = fs.readFileSync(
    path.join(ROOT, 'app/api/guide/auth/session/route.ts'),
    'utf8'
  );
  const adminGuideRouteSrc = fs.readFileSync(
    path.join(ROOT, 'app/api/admin/guides/[guideId]/route.ts'),
    'utf8'
  );

  it('guide session route 登入成功時做透明升級（needsPasswordRehash）', () => {
    assert.match(sessionRouteSrc, /needsPasswordRehash/);
    const count = (sessionRouteSrc.match(/needsPasswordRehash\(/g) || []).length;
    assert.ok(count >= 2, 'email 與 legacy guideId 兩條登入分支都要升級');
  });

  it('admin guides route 不再有本地複製的 SHA-256 hashPassword', () => {
    assert.ok(
      !/createHash\('sha256'\)\.update\(salt \+ password\)/.test(adminGuideRouteSrc),
      'admin route 必須收斂到 guide-auth 的共用 hashPassword'
    );
    assert.match(adminGuideRouteSrc, /import\s*\{[^}]*hashPassword[^}]*\}\s*from\s*'.*guide-auth'/);
  });
});
