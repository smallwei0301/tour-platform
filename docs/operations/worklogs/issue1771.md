# issue1771 — 建立 README 文件架構索引與 agent 任務路由
> 最後更新：2026-07-28 12:47:32 CST（Asia/Taipei）｜負責 session：tp-builder-fix

## 目標
建立穩定的 root/docs/domain README 導航與 agent 任務路由，明確區分 current execution、technical contract、QA、OPS、product context、auto-generated snapshot 與 archive；本 worklog 補齊 #1771 的可續接記憶錨點與 builder handoff。

## AC 清單
- [x] 根 README 與六個 domain README 提供穩定導航、真值來源與 freshness／scope boundary。
- [x] Production action gate 依領域分流：DML 走 `sql-guard` audit 與執行後影響回報；schema apply 走 `SQL-OVERRIDE` 與 migration SOP；付款、credential、restore、incident 走各自 runbook／operator-owner approval／必要 audit、rollback 或 containment 證據。
- [x] README relative links、diff whitespace 與 dirty-path scope 通過 focused checks。
- [ ] Rita fresh standalone review 已於 2026-07-28 完成，但結果為 `BLOCKED / CHANGES-REQUESTED`；本 worklog 不代表 merge 或 release approval。

## 範圍與基線
- GitHub issue：#1771
- Repo path：`/root/tour-platform`
- Worktree path：`/root/.hermes/worktrees/tour-platform/docs-issue-1771-readme-index`
- Branch：`docs/issue-1771-readme-index`
- Baseline／HEAD fingerprint（本次實際取得）：`1b0246e0771035cd70fb007f5e54cf75633c8523`
- 起始時間：`2026-07-28 12:47:32 CST`
- 未 commit 原因：本卡只建立 worklog 與可續接 handoff；依 task contract 禁止 commit、push、PR、merge，並保留前一輪 #1771 的 scoped dirty/untracked README 供 fresh review。

## 七個 README 變更（scope boundary）
1. `README.md`：repo 穩定入口、品牌／工程開工順序、任務類型路由、真值與 freshness 邊界、常用指令；不保存即時 issue／PR 數量、Phase 或未驗證 rollout 結論。
2. `docs/README.md`：`docs/` 總索引、文件狀態標籤、任務路由矩陣與各類真值來源；不把索引文件當 runtime、live queue 或 production 授權。
3. `docs/04-tech/README.md`：技術契約、API／Booking／Payment、schema／migration 入口與 code/tests/migrations 真值邊界；不改 code、schema 或 migration。
4. `docs/implementation/README.md`：issue/date-bounded implementation contract、rollout／release／data contract 導航與回查 current code/tests/CI 的界線；不把歷史 contract 當目前 backlog 或授權。
5. `docs/operations/README.md`：runbook、worklog、dated evidence、bounded report 與 readiness snapshot 的分類、入口及 production／高風險 action 分流；不以 README 或 runbook 自行授權 production mutation。
6. `docs/qa/README.md`：QA policy、root/workspace command map、E2E／focused test 導航與 evidence freshness/redaction 邊界；不以 dated evidence 或未實跑結果宣稱目前 pass。
7. `docs/security/README.md`：incident、credential／secret、evidence governance 與安全任務路由；只提供核准流程與 redacted evidence 邊界，不放 secrets、token、cookie、付款 payload 或未遮蔽 PII。

## 已完成（附證據）
- 2026-07-28 第一輪 README docs-only builder 已保留七個 scoped dirty/untracked README；本 worklog 未重排、刪除或改寫其既有 README 內容。
- 2026-07-28 Rita 第一輪 blocker：`README.md:21` 將 worklog 寫成「有指定時先讀」，與 `CLAUDE.md` 每個 issue 建立／接續 worklog 及里程碑雙寫規則衝突；同時缺少可獨立接續的 changed files、exact commands/results、fingerprint、risk handoff。
- `t_65b33d26` builder evidence（production action gate v2）：
  - `git diff --check`：PASS。
  - deterministic relative-link scan：7 個 scoped README、155 個 relative links、`broken=0`。
  - production-action-gate audit：`required_missing=[]`、`forbidden_blanket=[]`、PASS。
  - scope audit：dirty/untracked 僅在七個 README ALLOWED_FILES，PASS。
  - gate 修正為 DML → `sql-guard` audit＋執行後影響回報；schema apply → `SQL-OVERRIDE`＋migration SOP；payment、credential、restore、incident 各自依 runbook／operator-owner approval／audit／rollback-containment 邊界處理。
  - 未 commit、未 push、未開 PR；Rita fresh review 已完成但為 `BLOCKED / CHANGES-REQUESTED`，仍不可視為 merge 或 release approval。
- `t_ba83cc0b` control-plane evidence：worker 在編輯前因 injected skill resolution crash 結束（`Error: Unknown skill(s): bounded-fix-salvage`），沒有新增 diff；此事件不是 docs failure，不得誤記為文件驗證失敗。

## 本次 worktree fingerprint 與狀態
- 實際命令：`git rev-parse HEAD`、`git branch --show-current`、`git status --short --branch`、`git diff --stat`、`git diff --numstat`、`git diff --check`。
- 結果：HEAD `1b0246e0771035cd70fb007f5e54cf75633c8523`；branch `docs/issue-1771-readme-index`；起始時相對 `origin/main` 無 ahead/behind。
- worklog 建立前 dirty/untracked：`README.md`、`docs/04-tech/README.md`、`docs/README.md`、`docs/implementation/README.md`、`docs/operations/README.md`、`docs/qa/README.md`、`docs/security/README.md`；加上本檔後共八個允許路徑。
- worklog 建立前 diff stat：tracked README 三檔共 `202 insertions(+), 479 deletions(-)`；未追蹤 README 四檔尚未納入 `git diff --stat`。
- `git diff --check`：PASS。

## 可重跑 audit 指令與本次結果

以下指令均在本 worktree 執行；只讀、不執行 production action、不讀取 secrets。命令本身與短結果一併保存，後續 worker 可直接貼上重跑，不需依賴聊天記憶。

### README relative-link scan

```bash
python3 - <<'PY'
from pathlib import Path
import re
readmes=[Path('README.md'),Path('docs/README.md'),Path('docs/04-tech/README.md'),Path('docs/implementation/README.md'),Path('docs/operations/README.md'),Path('docs/qa/README.md'),Path('docs/security/README.md')]
links=0; broken=[]; anchors=0
for source in readmes:
    for raw in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)', source.read_text()):
        target=raw.strip().split()[0].strip('<>')
        if not target or target.startswith(('#','http://','https://','mailto:')): continue
        links += 1
        path, _, fragment = target.partition('#')
        if fragment: anchors += 1
        if not (source.parent/path).resolve().exists(): broken.append(f'{source}:{raw}')
print(f'readmes={len(readmes)} relative_links={links} anchors={anchors} broken={len(broken)}')
if broken: print('\n'.join(broken)); raise SystemExit(1)
PY
```

Result: `readmes=7 relative_links=155 anchors=0 broken=0` (PASS).

### Production-action-gate audit

```bash
python3 - <<'PY'
from pathlib import Path
import re
files=[Path('README.md'),Path('docs/README.md'),Path('docs/04-tech/README.md'),Path('docs/implementation/README.md'),Path('docs/operations/README.md'),Path('docs/qa/README.md'),Path('docs/security/README.md')]
text='\n'.join(p.read_text() for p in files)
required=['sql-guard','SQL-OVERRIDE','migration SOP','payment','credential','restore','incident','operator','owner approval','audit','rollback','containment']
missing=[term for term in required if term not in text]
forbidden=[]
for i,line in enumerate(text.splitlines(),1):
    if re.search(r'blanket approval|automatically execute|自動授權|一律核准',line,re.I) and not re.search(r'不使用|不能|不可|not use|not equal|不是',line,re.I): forbidden.append(i)
print(f'readmes={len(files)} required_missing={missing} forbidden_blanket={forbidden}')
if missing or forbidden: raise SystemExit(1)
PY
```

Result: `readmes=7 required_missing=[] forbidden_blanket=[]` (PASS). This verifies wording only; it does not authorize or execute DML, schema apply, payment, credential, restore, or incident actions.

### Dirty-path scope audit

```bash
python3 - <<'PY'
allowed={'README.md','docs/README.md','docs/04-tech/README.md','docs/implementation/README.md','docs/operations/README.md','docs/operations/worklogs/issue1771.md','docs/qa/README.md','docs/security/README.md'}
import subprocess
paths=[line[3:] for line in subprocess.check_output(['git','status','--porcelain'],text=True).splitlines()]
extra=sorted(set(paths)-allowed); missing=sorted(allowed-set(paths))
print(f'dirty_paths={len(paths)} allowed={len(allowed)} extra={extra} missing={missing}')
if extra or missing: raise SystemExit(1)
PY
```

Result: `dirty_paths=8 allowed=8 extra=[] missing=[]` (PASS).

### Worklog marker/safety audit

```bash
python3 - <<'PY'
from pathlib import Path
import re
p=Path('docs/operations/worklogs/issue1771.md'); text=p.read_text()
markers=['可重跑 audit 指令與本次結果','relative-link scan','Production-action-gate audit','Dirty-path scope audit','Result:','Risk：中']
prose=re.sub(r'```.*?```','',text,flags=re.S)
safety=[term for term in ['PRIVATE KEY','GITHUB_TOKEN','AWS_SECRET_ACCESS_KEY','Bearer ','cookie='] if term.lower() in prose.lower()]
missing=[term for term in markers if term not in text]
print(f'markers_missing={missing} safety_hits={safety}')
if missing or safety: raise SystemExit(1)
PY
```

Result: `markers_missing=[] safety_hits=[]` (PASS).

## 風險與禁止事項
- Risk：中；README 導航或 production gate wording 若錯誤，可能讓後續 agent 誤判真值、授權或 side effect。此風險等級與 Rita fresh review／gate-fix contract 一致。
- 本次未觸碰 `CLAUDE.md`、`.cursor/harness/**`、程式、schema、CI、snapshot 或任何 ALLOWED_FILES 外路徑。
- Worklog 不含 secrets、credential、token、cookie、付款 payload、PII 或虛構 test 結果；`t_ba83cc0b` 只記為已知 control-plane crash。
- 禁止本卡 commit、push、PR、merge；禁止重跑或修改既有 README gate。

## 下一步
- Rita fresh standalone review 已回報 `BLOCKED / CHANGES-REQUESTED`：relative-link、scope、gate 與 safety 證據通過，但指出 root README mandatory worklog wording 仍需另案修正；本卡明確禁止修改 README，因此不在此卡處理。
- 只有後續 fresh review 通過後，才可由後續流程處理 issue／PR 的正式整合；本 worklog 目前狀態是「review blocked，等待窄修正」。

## 絕不重做（Do-NOT-redo）
- 不重做第一輪七個 README 的導覽架構；本卡只補 `docs/operations/worklogs/issue1771.md`。
- 不重寫 production action gate；`t_65b33d26` 已完成窄修正並留下 focused evidence。
- 不把 `t_ba83cc0b` skill-resolution crash 當成 docs test failure；它是控制面事件，留作 retrospective 證據。
- 不以本 worklog 或 builder 自述取代 Rita fresh review。

## P0-OVERRIDE 使用紀錄
- N/A；本次沒有修改凍結區或執行 production side effect。

## Handoff
- Status：worklog 已補齊可重跑 audit commands/results；README 變更仍是未 commit 的 scoped dirty/untracked 狀態，fresh review 為 `BLOCKED / CHANGES-REQUESTED`。
- Next role：Ava → fresh standalone Rita review（`tp-reviewer`）。
- Reviewer blockers：確認 `README.md:21` worklog 開工規則已由後續 handoff 明確補足；確認七個 README 的 gate wording、relative links、scope 與 evidence 可重現。
