// 導遊刪除領域檔（db.mjs strangler：#1385／#1570 — 新資料存取不進 db.mjs）。
//
// 刪除 guide_profiles 的安全順序（順序受契約測試鎖定）：
//   1. pre-check 四張 RESTRICT／無 ON DELETE 外鍵表（bookings、payouts、
//      payout_items、experiences）：任一有紀錄 → 回 GUIDE_HAS_RECORDS，
//      把 DB 層的財務保護轉成友善訊息而非 500。
//   2. 逐一刪除名下活動（重用 deleteActivityDb：含 storage 圖片與
//      activity_schedules 清理）。owner 2026-07-03 拍板：刪導遊連同活動。
//   3. 清 guides bucket 的頭像檔（best-effort，失敗僅 warn）。
//   4. 刪 guide_profiles row — CASCADE 自動清 guide_balances、
//      availability_rules、blackout_dates、slot_conflict_overrides、
//      trip_reports、LINE mapping/bind_code。
//   5. audit log（刪除成功後才寫，記錄實際發生的事）。
//
// 非原子性註記：步驟 2 中途失敗會留下「部分活動已刪、profile 還在」，
// 重跑同一刪除即可補完（逐活動冪等）；storage I/O 本無法交易，不硬包 transaction。
//
// 函式契約：預期中的結果（含擋刪）回結果物件、不 throw；只有基礎設施錯誤才 throw。
import { hasSupabaseEnv, getSupabase } from './supabase-env.mjs';
import { deleteActivityDb } from './db.mjs';
import { insertAuditLogDb, appendAuditLog } from './audit-log.mjs';
import { listGuideApplications, deleteGuideApplication } from './services.mjs';

const RESTRICT_TABLES = [
  { table: 'bookings', key: 'bookings' },
  { table: 'payouts', key: 'payouts' },
  { table: 'payout_items', key: 'payoutItems' },
  // legacy v1 表：可能不存在（42P01／schema cache miss），視為 0 筆。
  { table: 'experiences', key: 'experiences', tolerateMissing: true },
];

function isMissingRelation(error) {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /does not exist|could not find the table/i.test(error.message || '')
  );
}

async function countGuideRecords(supabase, guideId) {
  const counts = {};
  for (const { table, key, tolerateMissing } of RESTRICT_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('guide_id', guideId);
    if (error) {
      if (tolerateMissing && isMissingRelation(error)) {
        counts[key] = 0;
        continue;
      }
      throw new Error(`countGuideRecords(${table}): ${error.message}`);
    }
    counts[key] = count || 0;
  }
  return counts;
}

function hasAnyRecords(counts) {
  return Object.values(counts).some((n) => n > 0);
}

function findInMemoryApplication(applicationId) {
  return listGuideApplications().find((a) => a.id === applicationId) || null;
}

/**
 * 刪除前預檢（modal UX 用；DELETE 端點內部仍會權威重查）。
 * 回傳：
 *   { ok:true, kind:'profile', displayName, slug, activityCount, blocked:null|counts }
 *   { ok:true, kind:'application', fullName, activityCount:0, blocked:null }
 *   { ok:false, code:'NOT_FOUND' }
 */
export async function getGuideDeletePrecheckDb(guideId) {
  if (!hasSupabaseEnv()) {
    // in-memory 僅有 guide_applications store（store.mjs）；profile 無對應。
    const app = findInMemoryApplication(guideId);
    if (!app) return { ok: false, code: 'NOT_FOUND' };
    return { ok: true, kind: 'application', fullName: app.fullName, activityCount: 0, blocked: null };
  }

  const supabase = await getSupabase();
  const { data: profile } = await supabase
    .from('guide_profiles')
    .select('id, display_name, slug')
    .eq('id', guideId)
    .maybeSingle();

  if (profile) {
    const counts = await countGuideRecords(supabase, guideId);
    const { count: activityCount } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('guide_id', guideId);
    return {
      ok: true,
      kind: 'profile',
      displayName: profile.display_name,
      slug: profile.slug,
      activityCount: activityCount || 0,
      blocked: hasAnyRecords(counts) ? counts : null,
    };
  }

  const { data: app } = await supabase
    .from('guide_applications')
    .select('id, full_name')
    .eq('id', guideId)
    .maybeSingle();
  if (app) {
    return { ok: true, kind: 'application', fullName: app.full_name, activityCount: 0, blocked: null };
  }
  return { ok: false, code: 'NOT_FOUND' };
}

/**
 * 刪除已上線導遊（guide_profiles）＋名下活動＋頭像。
 * 回傳：
 *   { ok:true, deleted:{ guideId, displayName, slug, guideEmail, activities:[{id,slug,region,regionSlug}], activitiesDeleted } }
 *   { ok:false, code:'NOT_FOUND' }
 *   { ok:false, code:'GUIDE_HAS_RECORDS', counts, displayName }
 */
export async function deleteGuideProfileDb(guideId) {
  if (!hasSupabaseEnv()) {
    // in-memory 沒有 guide_profiles store — 明文契約：一律 NOT_FOUND，
    // dev fallback 模式誠實回「找不到」而非假裝刪除成功。
    return { ok: false, code: 'NOT_FOUND' };
  }

  const supabase = await getSupabase();
  const { data: profile } = await supabase
    .from('guide_profiles')
    .select('id, display_name, slug, guide_email, profile_photo_url')
    .eq('id', guideId)
    .maybeSingle();
  if (!profile) return { ok: false, code: 'NOT_FOUND' };

  const counts = await countGuideRecords(supabase, guideId);
  if (hasAnyRecords(counts)) {
    return { ok: false, code: 'GUIDE_HAS_RECORDS', counts, displayName: profile.display_name };
  }

  // 逐一刪活動（含 storage 圖片、schedules）；回傳 slug/region 供呼叫端 revalidate。
  const { data: activityRows, error: actListError } = await supabase
    .from('activities')
    .select('id, slug, region, region_slug')
    .eq('guide_id', guideId);
  if (actListError) throw new Error(`list activities: ${actListError.message}`);

  const activities = [];
  for (const row of activityRows || []) {
    const res = await deleteActivityDb(row.id);
    activities.push({ id: row.id, slug: res.slug, region: res.region, regionSlug: res.regionSlug });
  }

  // 頭像清理：upload-avatar 以 {guideId}/avatar-<ts>.<ext> 累積檔案，整個 prefix 掃掉。
  try {
    const { data: files } = await supabase.storage.from('guides').list(guideId);
    if (files?.length) {
      await supabase.storage.from('guides').remove(files.map((f) => `${guideId}/${f.name}`));
    }
  } catch (err) {
    console.warn('[deleteGuideProfileDb] avatar storage cleanup failed:', err?.message || err);
  }

  const { error: deleteError } = await supabase
    .from('guide_profiles')
    .delete()
    .eq('id', guideId);
  if (deleteError) {
    // 23503 = foreign_key_violation：pre-check 與 delete 之間殺進新紀錄（race），
    // 或未盤點到的 RESTRICT 外鍵 — DB 才是權威防線，映成同一友善結果。
    if (deleteError.code === '23503') {
      return { ok: false, code: 'GUIDE_HAS_RECORDS', counts, displayName: profile.display_name };
    }
    throw new Error(`delete guide_profiles: ${deleteError.message}`);
  }

  await insertAuditLogDb(supabase, {
    actor: 'admin',
    action: 'guide_profile_delete',
    metadata: {
      guideId,
      displayName: profile.display_name,
      slug: profile.slug,
      guideEmail: profile.guide_email,
      activitiesDeleted: activities.length,
    },
  });

  return {
    ok: true,
    deleted: {
      guideId,
      displayName: profile.display_name,
      slug: profile.slug,
      guideEmail: profile.guide_email,
      activities,
      activitiesDeleted: activities.length,
    },
  };
}

/**
 * 刪除導遊申請（guide_applications；全 repo 零 inbound FK，硬刪安全）。
 * 回傳：{ ok:true, deleted:{ id, fullName, email, status } } | { ok:false, code:'NOT_FOUND' }
 */
export async function deleteGuideApplicationDb(applicationId) {
  if (!hasSupabaseEnv()) {
    const removed = deleteGuideApplication({ applicationId });
    if (!removed) return { ok: false, code: 'NOT_FOUND' };
    appendAuditLog({
      actor: 'admin',
      action: 'guide_application_delete',
      metadata: { applicationId, fullName: removed.fullName },
    });
    return {
      ok: true,
      deleted: { id: removed.id, fullName: removed.fullName, email: removed.email, status: removed.status },
    };
  }

  const supabase = await getSupabase();
  const { data: app } = await supabase
    .from('guide_applications')
    .select('id, full_name, email, status')
    .eq('id', applicationId)
    .maybeSingle();
  if (!app) return { ok: false, code: 'NOT_FOUND' };

  const { error } = await supabase.from('guide_applications').delete().eq('id', applicationId);
  if (error) throw new Error(`delete guide_applications: ${error.message}`);

  await insertAuditLogDb(supabase, {
    actor: 'admin',
    action: 'guide_application_delete',
    metadata: { applicationId, fullName: app.full_name, email: app.email },
  });

  return {
    ok: true,
    deleted: { id: app.id, fullName: app.full_name, email: app.email, status: app.status },
  };
}
