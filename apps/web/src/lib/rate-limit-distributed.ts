/**
 * 分散式 rate limiter（健檢 v2 S5 / issue #1599）。
 *
 * 問題：src/lib/rate-limit.ts 的記憶體 Map 在 Vercel serverless 各實例獨立、冷啟重置——
 * 攻擊者把請求打散到不同實例即可稀釋名目限制。對 adminLogin／guideLogin 暴力破解防護有限。
 *
 * 解法：可插拔的 async store——
 * - `UPSTASH_REDIS_REST_URL`＋`UPSTASH_REDIS_REST_TOKEN` 存在 → Upstash Redis（跨實例共享，
 *   fixed-window 與既有記憶體版語意一致，僅改為跨實例計數）
 * - 不存在（本地／測試／未 provision）→ 共享記憶體 store fallback（對齊 hasSupabaseEnv 模式，
 *   測試不需 Redis）
 * - Redis 逾時／錯誤 → **fail-open**（放行）＋事故上報，不讓限流服務故障變成登入全站不可用
 *
 * 範圍：先接 adminLogin／guideLogin 兩個高價值點；其餘 route 沿用同步記憶體版。
 * Upstash 實例 provisioning（Vercel Marketplace）＋staging drill 為 owner 動作（見 #1599）。
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  maxRequests: number;
}

export interface RateStore {
  /** 讀當前 count（不遞增）；key 不存在或過期回 0。 */
  peekCount(key: string): Promise<number>;
  /** 遞增 key；首次命中設定 windowMs 到期；回遞增後 count 與 resetAt。 */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

// ── 記憶體 store（預設 fallback；跨本模組共享，但仍是單實例）──────────────────
interface MemEntry { count: number; resetAt: number }

export class MemoryRateStore implements RateStore {
  private store = new Map<string, MemEntry>();

  async peekCount(key: string): Promise<number> {
    const e = this.store.get(key);
    if (!e || e.resetAt <= Date.now()) return 0;
    return e.count;
  }

  async hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    let e = this.store.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 1, resetAt: now + windowMs };
      this.store.set(key, e);
      return { count: 1, resetAt: e.resetAt };
    }
    e.count += 1;
    return { count: e.count, resetAt: e.resetAt };
  }
}

// ── Upstash Redis REST store（env-gated；fetch-based，無需 SDK）─────────────────
export class UpstashRateStore implements RateStore {
  private url: string;
  private token: string;
  private timeoutMs: number;

  constructor(url: string, token: string, timeoutMs: number = 500) {
    this.url = url;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  private async cmd(args: (string | number)[]): Promise<unknown> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(args),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`upstash ${res.status}`);
      const json = (await res.json()) as { result?: unknown; error?: string };
      if (json.error) throw new Error(json.error);
      return json.result;
    } finally {
      clearTimeout(t);
    }
  }

  async peekCount(key: string): Promise<number> {
    const raw = await this.cmd(['GET', key]);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  async hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const count = Number(await this.cmd(['INCR', key]));
    if (count === 1) {
      // 首次命中才設到期，形成 fixed window
      await this.cmd(['PEXPIRE', key, windowMs]);
      return { count, resetAt: Date.now() + windowMs };
    }
    const pttl = Number(await this.cmd(['PTTL', key]));
    const resetAt = Number.isFinite(pttl) && pttl > 0 ? Date.now() + pttl : Date.now() + windowMs;
    return { count, resetAt };
  }
}

// ── store 解析（env-gated，單例）───────────────────────────────────────────────
const sharedMemoryStore = new MemoryRateStore();
let cachedStore: RateStore | null = null;

export function resolveRateStore(env: NodeJS.ProcessEnv = process.env): RateStore {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    if (!cachedStore || !(cachedStore instanceof UpstashRateStore)) {
      cachedStore = new UpstashRateStore(url, token);
    }
    return cachedStore;
  }
  return sharedMemoryStore;
}

/** 測試用：重置 store 快取。 */
export function __resetStoreCache(): void {
  cachedStore = null;
}

export interface DistributedLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * peek（不遞增）——login route 用來在驗證前擋掉已超額 IP。Redis 錯誤 → fail-open（allowed）。
 */
export async function peekDistributed(
  key: string,
  cfg: DistributedLimitConfig,
  store: RateStore = resolveRateStore(),
): Promise<RateLimitResult> {
  try {
    const count = await store.peekCount(key);
    return {
      allowed: count < cfg.maxRequests,
      remaining: Math.max(0, cfg.maxRequests - count),
      resetAt: Date.now() + cfg.windowMs,
      maxRequests: cfg.maxRequests,
    };
  } catch (err) {
    await reportRateStoreFailure(err, 'peek', key);
    return { allowed: true, remaining: cfg.maxRequests, resetAt: Date.now() + cfg.windowMs, maxRequests: cfg.maxRequests };
  }
}

/**
 * record（遞增）——login route 只在「失敗」時呼叫。Redis 錯誤 → 靜默（fail-open），不阻斷回應。
 */
export async function recordDistributed(
  key: string,
  cfg: DistributedLimitConfig,
  store: RateStore = resolveRateStore(),
): Promise<RateLimitResult> {
  try {
    const { count, resetAt } = await store.hit(key, cfg.windowMs);
    return {
      allowed: count <= cfg.maxRequests,
      remaining: Math.max(0, cfg.maxRequests - count),
      resetAt,
      maxRequests: cfg.maxRequests,
    };
  } catch (err) {
    await reportRateStoreFailure(err, 'record', key);
    return { allowed: true, remaining: cfg.maxRequests, resetAt: Date.now() + cfg.windowMs, maxRequests: cfg.maxRequests };
  }
}

async function reportRateStoreFailure(err: unknown, op: string, key: string): Promise<void> {
  try {
    const { recordIncident } = await import('./incidents');
    await recordIncident({
      severity: 'warn',
      source: 'rate-limit-distributed',
      category: 'rate_store_failure',
      message: `distributed rate store ${op} failed: ${err instanceof Error ? err.message : String(err)}`,
      // key 前綴含 IP，屬 PII——只記 limiter 名稱前綴，不記完整 key
      metadata: { limiter: key.split(':')[0] ?? 'unknown' },
    });
  } catch {
    // 上報失敗不得影響 fail-open。
  }
}
