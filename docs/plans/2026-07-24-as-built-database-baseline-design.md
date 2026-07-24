# Tour Platform 現況竣工圖 Database Baseline Design

> 狀態：2026-07-24 owner 已批准整合設計。本文是 `#1756` D3b fresh-install 路線的新權威設計；既有 frozen migration replay 路線停止。

## 1. 目標

建立一份經 PostgreSQL catalog 逐項驗證的 `baseline v1`，供全新本機、CI、staging 與災難復原環境使用，同時保證既有 production 永遠不會套用 baseline。

這是「依目前房屋實測繪製竣工圖」，不是拆除或重建 production。

## 2. 已批准決策

1. **主線**：現況竣工圖 baseline；不再要求 134 支歷史 migration 從空資料庫完整重播。
2. **凍結歷史**：`supabase/migrations/` 既有檔案 byte-for-byte 凍結；D3b stash 內 8 支 frozen migration 修改不得恢復或提交。
3. **並行 UI**：只做不依賴未確認 table column／API payload 的 shell、loading、empty、error 與 view-model skeleton。
4. **Reference**：active Supabase production project `pyoderxmpeyqjwkeliiu`；只允許唯讀 catalog metadata，不讀 business rows，不執行 production DDL/DML。
5. **Managed-schema 邊界**：逐物件 ownership；Supabase 管理 `auth`／`storage` 內部物件，App 自有跨 schema policy／trigger／grant 以 overlay 管理，unknown ownership 一律 HOLD。
6. **Cutoff**：baseline v1 代表 2026-07-24 capture 時的 production 狀態；6 支 `2026072300*` Midao foundation migrations 全部屬 post-cutoff。
7. **Fresh history**：只記 `baseline_v1` marker 與 post-cutoff migration history，不偽造 134 筆舊 history。
8. **Ledger gate**：PR/source gate 與 production release/verified gate分離。
9. **版本契約**：Supabase CLI `2.87.2`、PostgreSQL `17`；升級需重新 capture、compare 與 review。

## 3. 已取得的唯讀證據

- production `public`：73 張 ordinary tables，73/73 啟用 RLS，114 條 policies。
- `midao_availability_defaults`、`midao_day_overrides`、`midao_requests` 啟用 RLS但目前無 policy，一般角色預設全拒絕。
- 59 張 tables 對 `authenticated` 仍有廣泛底層 write grants。RLS仍是資料列閘門，因此此發現不等於已證實越權寫入；但它違反「app writes走service role」的目標，必須保留為 known security drift，不得在baseline中悄悄合理化。
- 6 支 Midao foundation effects 均未在 production 生效：三張foundation tables、atomic RPC與 `guide_profiles.backend_mode`／`guide_session_version` 均不存在；欄位 probe 回 SQLSTATE `42703`。
- Supabase CLI `db dump --linked --schema public` 在570秒後 exit `124`；留下的147,279-byte SQL無 dump-complete marker且函式／enum片段缺行。該檔已刪除，不得作baseline來源。

## 4. 非目標

- 不把 production data、PII、password hash、token、connection string或storage objects匯入repo。
- 不修改任何 frozen migration。
- 不對 production 套用 baseline、Midao migrations或security remediation。
- 不讓普通 `supabase db reset`／`db push`自行猜 lane。
- 不把目前 production grant drift宣告為理想權限模型。
- 不在本設計內升級Supabase CLI／PostgreSQL。

## 5. 架構

### 5.1 Lane A：existing production

```text
live catalog + live migration history
→ verify existing-lane identity and cutoff manifest
→ select strictly post-cutoff additive migrations
→ authorized apply exactly once
→ recapture catalog
→ update production apply ledger as verified
```

- Baseline SQL永遠不出現在 ordinary production migration discovery path。
- Existing runner若看到 `baseline_v1` marker即fail closed。
- Empty DB執行existing lane即fail closed。
- 未經production schema apply授權，不執行任何步驟中的apply。

### 5.2 Lane B：fresh install

```text
pinned Supabase/Postgres platform bootstrap
→ materialize runner-owned temporary workdir
→ baseline_v1 synthetic migration
→ managed-schema app overlays
→ six Midao post-cutoff migrations
→ later post-cutoff migrations
→ deterministic non-secret seed
→ extract normalized terminal catalog
→ exact compare against expected terminal catalog
```

- Temporary workdir只含baseline marker與manifest選出的post-cutoff migrations。
- Fresh runner若偵測到occupied application schema即拒絕。
- 不回填134支舊history。
- Future environments仍需走lane-aware runner；普通全歷史reset不是受支持入口。

## 6. Capture與credential邊界

1. 使用固定binary `/root/.hermes/toolchains/supabase/2.87.2/supabase`，先驗SHA-256、owner、mode與regular-file identity。
2. `supabase db dump --linked --dry-run`只寫入runner-owned `0600` FD-backed temporary file；parser只接受reviewed exact shape。
3. 解析到的 `PGPASSWORD`／host／user只存在於父程序記憶體與受控child env；禁止argv、log、manifest與repo artifact保存。
4. 使用PostgreSQL 17 client執行：
   - `pg_dump --schema-only --format=custom`建立runner-owned臨時archive；archive只作metadata source，不直接提交；
   - `pg_restore --list`取得結構化TOC，與ownership manifest逐項對應；
   - `pg_restore --use-list --file`只render已批准的application entries與application-overlay entries，明確排除既存platform schema creation／platform objects；禁止用regex或line filter裁切SQL statement；
   - allowlisted `pg_catalog` extractor輸出canonical JSON，作為object完整性與terminal comparison真相。
5. Custom archive、TOC與rendered SQL必須綁digest；TOC missing/extra/unknown identity、同一object多重分類或rendered SQL不完整均HOLD。
6. Captured secret FD、temp files與child processes必須在success、error、signal、timeout全部清除；cleanup failure使整次capture non-zero。
7. Catalog query固定 `BEGIN READ ONLY`／`SET TRANSACTION READ ONLY`，只允許一個reviewed SQL檔；不得接受caller supplied SQL。
8. Published artifact只能包含schema metadata；rendered SQL須做credential-pattern、COPY/business INSERT與syntax scans。Custom archive不進repo，完成baseline發布及digest read-back後安全刪除。

## 7. Baseline artifact

```text
supabase/baselines/v1/
  baseline.sql
  managed-overlays.sql
  manifest.json
  catalog.normalized.json
  role-map.json
  ownership-boundary.json
  exclusions.json
  platform-prerequisites.json
  frozen-migrations.sha256
  catalog.sha256
```

### 7.1 `manifest.json`

至少包含：

- schema version與extractor version；
- source project ref、capture timestamp（Asia/Taipei與UTC）；
- cutoff filename/version與每支post-cutoff filename/version/SHA-256；
- raw capture digest與normalized catalog digest；
- CLI binary version/SHA-256；
- PostgreSQL server/client major version；
- required platform image identity；
- role-map、ownership-boundary、exclusions與SQL artifacts digest；
- fresh marker identity；
- prohibited lane combinations。

不得包含connection string、password、service key或raw command output。

### 7.2 `ownership-boundary.json`

每個object必須唯一分類：

- `application`：baseline.sql建立與擁有；
- `platform`：Supabase bootstrap提供，只驗prerequisite；
- `application_overlay`：App在platform relation建立的policy／trigger／grant；
- `extension`：extension-owned，只驗extension與版本；
- `excluded_environmental`：只允許具理由且owner批准的環境差異。

重疊、missing或unknown分類均fail closed。

## 8. Catalog正規化契約

必須比較：

- schemas、tables、partitioned tables、views、materialized views、sequences；
- columns順序、type、collation、nullability、default、identity、generated；
- enum/domain/composite types；
- PK、UK、FK、check、exclusion constraints與validated state；
- indexes method、keys/order、include、expression、predicate、uniqueness；
- functions/procedures exact identity、arguments、return、language、volatility、parallel、leakproof、security-definer、search path與body digest；
- triggers及enabled state；
- RLS enabled/forced與完整policy roles/cmd/permissive/qual/with-check；
- schema/table/sequence/function grants，包含PUBLIC；
- ownership role class與default privileges；
- extensions與允許版本；
- app-owned `auth`／`storage` overlays；
- publication/realtime membership（若app contract依賴）。

排除：OID、object address、statistics、row counts、sequence current values、timestamps與ephemeral runtime state。

任一section缺失、duplicate canonical key、unknown object kind、extractor version mismatch或unexpected diff即non-zero。

## 9. Known security drift處理

- Production現況與理想security policy分開表示。
- `catalog.normalized.json`如實記錄production effective grants。
- Security policy gate另行指出59張table的`authenticated` broad grants，不得以exclusion隱藏。
- 若owner批准修復，必須新增一支post-cutoff additive migration，先在fresh與existing rehearsal證明，再依production apply SOP授權套用。
- Baseline建立本身不改production，也不把既有drift稱為PASS。

## 10. Ledger與history

- `docs/operations/migration-ledger.json`維持production apply事實來源。
- 新增`docs/operations/baseline-ledger.json`記錄capture provenance、review、digests與baseline版本；不得冒充production apply。
- PR/source gate驗證：歷史hash、命名、source contract、post-cutoff manifest與測試。
- Release/apply gate驗證：實際production history、已授權apply、post-apply catalog與production ledger verified record。
- Supabase history、production ledger、baseline ledger三者不可互相替代。

## 11. Fail-closed lifecycle

- 全repo lock序列化local Supabase、capture與fresh runs。
- Fixed ports、project ID、containers、volumes與image identity全部驗證ownership。
- Captured IDs／names／labels在cleanup前重新核對；identity drift時不得刪foreign resource。
- Timeout與signal必須終止owned child，清temp credential/workdir；不刪Docker images。
- Partial output、cleanup failure、manifest rename failure或secret scan failure都使primary result non-zero。

## 12. 最低驗收矩陣

1. 134支frozen migrations hash drift即FAIL。
2. Extractor同一DB連跑兩次byte-identical。
3. Raw capture與normalized artifacts無data rows／secrets。
4. 空DB成功：platform→baseline→overlay→post-cutoff→seed。
5. Fresh terminal catalog與expected exact match。
6. Production-shaped existing rehearsal只跑post-cutoff，baseline execution count為零。
7. Fresh／existing terminal catalog等價。
8. Occupied→fresh、empty→existing、baseline marker→existing全部拒絕。
9. ACL與RLS分開驗；函式exact regprocedure、PUBLIC/anon/authenticated execute與safe search path完整驗證。
10. D3b schema、D3c rollback、D3d concurrency/idempotency保持真PostgreSQL PASS。
11. Managed-schema／extension／version drift全部HOLD。
12. PR source gate與release verified gate各自有hostile tests。

## 13. 端到端操作例

### Fresh CI

```text
CI取得clean checkout
→ 驗134支hash
→ 建runner-owned local Supabase
→ 確認empty lane
→ 套baseline_v1 marker
→ 套managed overlay
→ 套6支Midao migration
→ 套local seed
→ 擷取terminal catalog
→ exact compare
→ 跑ACL/RLS/RPC/concurrency與Playwright
→ ownership-safe cleanup
```

### Existing production release

```text
取得owner production apply授權
→ 唯讀驗project/cutoff/live history
→ 確認無baseline marker
→ 只套尚未套用的post-cutoff migration
→ 唯讀recapture與功能驗證
→ 寫production ledger verified record
```

沒有授權時，流程停在唯讀preflight。

## 14. 完成定義

Baseline v1只有在以下全部成立時才算完成：

- spec與implementation plan fresh review無blocking；
- full authoritative production catalog成功capture；
- baseline SQL可在empty pinned stack materialize；
- normalized exact comparison PASS；
- fresh／existing lanes與混線拒絕PASS；
- D3／E2E／full regression gates完成；
- artifacts無secrets／business rows；
- 未修改任何frozen migration；
- 未經另行授權沒有production schema mutation。
