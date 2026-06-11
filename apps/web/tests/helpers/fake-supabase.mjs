/**
 * In-memory fake Supabase client for node --test behavioral tests.
 *
 * Supports the query shapes used by the payout/settlement db.mjs helpers:
 *   select / insert / update / upsert / eq / gt / gte / in / order /
 *   limit / single / maybeSingle — awaited as a thenable.
 *
 * Faithfulness notes:
 * - select results are deep copies (structuredClone), mirroring real
 *   Supabase JSON responses — later mutations must not leak into rows the
 *   caller already fetched (this caught a real test bug in #1360 follow-up).
 * - insert auto-assigns `id` (`<table>-<n>`) and `created_at` when absent.
 *
 * @param {Record<string, Array<Record<string, any>>>} tables — mutable table
 *   map; assert directly on it after exercising the helper under test.
 */
export function createFakeSupabase(tables) {
  function exec(q) {
    const rows = (tables[q.table] ??= []);

    if (q.op === 'insert') {
      const row = {
        id: q.payload.id ?? `${q.table}-${rows.length + 1}`,
        created_at: new Date().toISOString(),
        ...q.payload,
      };
      rows.push(row);
      return { data: q.single ? structuredClone(row) : [structuredClone(row)], error: null };
    }

    if (q.op === 'upsert') {
      const key = q.onConflict || 'id';
      const existing = rows.find((r) => r[key] === q.payload[key]);
      if (existing) Object.assign(existing, q.payload);
      else rows.push({ ...q.payload });
      return { data: null, error: null };
    }

    let matched = rows.filter((r) =>
      q.filters.every((f) => {
        if (f.type === 'gte') return r[f.col] >= f.val;
        if (f.type === 'gt') return r[f.col] > f.val;
        if (f.type === 'in') return f.val.includes(r[f.col]);
        return r[f.col] === f.val;
      }),
    );

    if (q.op === 'update') {
      for (const r of matched) Object.assign(r, q.payload);
    }

    if (q.order) {
      const { col, ascending } = q.order;
      matched = [...matched].sort((a, b) =>
        ascending ? (a[col] > b[col] ? 1 : -1) : (a[col] < b[col] ? 1 : -1),
      );
    }
    if (q.limit != null) matched = matched.slice(0, q.limit);

    if (q.single) {
      return matched.length
        ? { data: structuredClone(matched[0]), error: null }
        : { data: null, error: { message: `${q.table}: row not found` } };
    }
    if (q.maybeSingle) return { data: matched[0] ? structuredClone(matched[0]) : null, error: null };
    return { data: structuredClone(matched), error: null };
  }

  return {
    from(table) {
      const q = {
        table, filters: [], op: 'select', payload: null,
        single: false, maybeSingle: false, onConflict: null, order: null, limit: null,
      };
      const api = {
        select: () => api,
        insert: (p) => { q.op = 'insert'; q.payload = p; return api; },
        update: (p) => { q.op = 'update'; q.payload = p; return api; },
        upsert: (p, opts) => { q.op = 'upsert'; q.payload = p; q.onConflict = opts?.onConflict ?? null; return api; },
        eq: (col, val) => { q.filters.push({ type: 'eq', col, val }); return api; },
        gt: (col, val) => { q.filters.push({ type: 'gt', col, val }); return api; },
        gte: (col, val) => { q.filters.push({ type: 'gte', col, val }); return api; },
        in: (col, val) => { q.filters.push({ type: 'in', col, val }); return api; },
        order: (col, opts = {}) => { q.order = { col, ascending: opts.ascending !== false }; return api; },
        limit: (n) => { q.limit = n; return api; },
        single: () => { q.single = true; return api; },
        maybeSingle: () => { q.maybeSingle = true; return api; },
        then: (resolve, reject) => Promise.resolve(exec(q)).then(resolve, reject),
      };
      return api;
    },
  };
}
