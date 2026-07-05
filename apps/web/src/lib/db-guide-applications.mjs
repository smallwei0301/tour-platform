/**
 * 嚮導申請（建立／列表／審核狀態）
 * #1613 db.mjs strangler：整塊自 db.mjs 純搬移（行為零變更；型別債見 #1597）。
 * db.mjs 以 re-export 保持既有 caller 匯入路徑不變。
 */
import { normalizeRegionToDbValue } from './region-slugs.mjs';
import { createGuideApplication as createGuideApplicationInMemory, listGuideApplications as listGuideApplicationsInMemory, updateGuideApplicationStatus as updateGuideApplicationStatusInMemory } from './services.mjs';
import { getSupabase, hasSupabaseEnv } from './supabase-env.mjs';

export async function createGuideApplicationDb(input = {}) {
  if (!hasSupabaseEnv()) return createGuideApplicationInMemory(input);

  const fullName = String(input?.fullName || '').trim();
  const phone = String(input?.phone || '').trim();
  const email = String(input?.email || '').trim();
  const city = String(input?.city || '').trim();
  const bio = String(input?.bio || '').trim();
  const toStringArray = (value) =>
    Array.isArray(value) ? value.map((v) => String(v || '').trim()).filter(Boolean) : [];
  const specialties = toStringArray(input?.specialties);
  const languages = toStringArray(input?.languages);
  // 熟悉區域統一存全名（高雄→高雄市），與行程地區格式一致；即使前端傳短名也正規化落地。
  const regions = [...new Set(toStringArray(input?.regions).map(normalizeRegionToDbValue).filter(Boolean))];
  const certifications = toStringArray(input?.certs ?? input?.certifications);
  // 收款方式由單選改可複選：優先讀陣列 payments/paymentMethods，向後相容單一 payment 字串。
  const paymentMethods = Array.isArray(input?.payments ?? input?.paymentMethods)
    ? toStringArray(input?.payments ?? input?.paymentMethods)
    : toStringArray([input?.payment ?? input?.paymentMethod]);
  const paymentMethod = paymentMethods[0] || null;
  const profilePhotoUrl = String(input?.profilePhotoUrl || '').trim() || null;
  const heroImageUrl = String(input?.heroImageUrl || '').trim() || null;
  const galleryUrls = toStringArray(input?.galleryUrls).slice(0, 12);

  if (!fullName) throw new Error('fullName is required');
  if (!phone) throw new Error('phone is required');
  if (!email) throw new Error('email is required');
  if (!city) throw new Error('city is required');
  if (!bio) throw new Error('bio is required');

  const supabase = await getSupabase();

  const basePayload = {
    id: crypto.randomUUID(),
    full_name: fullName,
    phone,
    email,
    city,
    bio,
    status: 'pending'
  };
  // payment_methods 為較新欄位（20260623_guide_profile_familiar_regions）；其餘 rich
  // 欄位（specialties…payment_method）由 20260610 加入。分三層 payload 以對應不同
  // migration 進度，確保部分 migrate 的環境不會連帶丟掉舊 rich 欄位。
  const richPayloadV1 = {
    ...basePayload,
    specialties,
    languages,
    regions,
    certifications,
    payment_method: paymentMethod,
    profile_photo_url: profilePhotoUrl,
    hero_image_url: heroImageUrl,
    gallery_urls: galleryUrls,
  };
  const richPayloadV2 = { ...richPayloadV1, payment_methods: paymentMethods };

  const baseSelect = 'id, full_name, phone, email, city, bio, status, admin_note, created_at, updated_at';
  const richSelectV1 = `${baseSelect}, specialties, languages, regions, certifications, payment_method, profile_photo_url, hero_image_url, gallery_urls`;
  const richSelectV2 = `${richSelectV1}, payment_methods`;

  const isMissingColumn = (e) =>
    e && (e.code === '42703' || /column .*does not exist/i.test(e.message || ''));

  // Tier 1：完整欄位（含 payment_methods）。
  let { data, error } = await supabase
    .from('guide_applications')
    .insert(richPayloadV2)
    .select(richSelectV2)
    .single();

  // Tier 2：缺 payment_methods（跑了 20260610、未跑 20260623）→ 退回 V1，保住其餘 rich 欄位。
  if (isMissingColumn(error)) {
    ({ data, error } = await supabase
      .from('guide_applications')
      .insert(richPayloadV1)
      .select(richSelectV1)
      .single());
  }

  // Tier 3：連 20260610 都沒跑 → 退回 base，至少不遺失申請本體。
  if (isMissingColumn(error)) {
    ({ data, error } = await supabase
      .from('guide_applications')
      .insert(basePayload)
      .select(baseSelect)
      .single());
  }

  if (error || !data) throw new Error(error?.message || 'guide application create failed');

  return mapGuideApplicationRow(data);
}

function mapGuideApplicationRow(r) {
  const arr = (value) => (Array.isArray(value) ? value : []);
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    city: r.city,
    bio: r.bio,
    specialties: arr(r.specialties),
    languages: arr(r.languages),
    regions: arr(r.regions),
    certifications: arr(r.certifications),
    paymentMethod: r.payment_method ?? null,
    paymentMethods: (() => {
      const list = arr(r.payment_methods ?? r.paymentMethods);
      if (list.length) return list;
      // 向後相容：尚無 payment_methods 欄位時，由單選 payment_method 推出單元素陣列。
      return r.payment_method ? [r.payment_method] : [];
    })(),
    profilePhotoUrl: r.profile_photo_url ?? r.profilePhotoUrl ?? null,
    heroImageUrl: r.hero_image_url ?? r.heroImageUrl ?? null,
    galleryUrls: arr(r.gallery_urls ?? r.galleryUrls),
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export async function listGuideApplicationsDb(input = {}) {
  if (!hasSupabaseEnv()) return listGuideApplicationsInMemory(input);

  const status = String(input?.status || '').trim();
  const supabase = await getSupabase();

  const baseSelect = 'id, full_name, phone, email, city, bio, status, admin_note, created_at, updated_at';
  const richSelectV1 = `${baseSelect}, specialties, languages, regions, certifications, payment_method, profile_photo_url, hero_image_url, gallery_urls`;
  const richSelectV2 = `${richSelectV1}, payment_methods`;

  const buildQuery = (selectClause) => {
    let q = supabase
      .from('guide_applications')
      .select(selectClause)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    return q;
  };

  const isMissingColumn = (e) =>
    e && (e.code === '42703' || /column .*does not exist/i.test(e.message || ''));

  // Schema drift guard（三層，見 createGuideApplicationDb）：payment_methods → 其餘 rich → base。
  let { data, error } = await buildQuery(richSelectV2);
  if (isMissingColumn(error)) ({ data, error } = await buildQuery(richSelectV1));
  if (isMissingColumn(error)) ({ data, error } = await buildQuery(baseSelect));
  if (error) throw new Error(error.message);

  return (data || []).map(mapGuideApplicationRow);
}

export async function updateGuideApplicationStatusDb(input = {}) {
  if (!hasSupabaseEnv()) return updateGuideApplicationStatusInMemory(input);

  const applicationId = String(input?.applicationId || '').trim();
  const action = String(input?.action || '').trim();
  const adminNote = String(input?.adminNote || '').trim() || null;

  if (!applicationId) throw new Error('applicationId is required');
  if (!['approve', 'reject', 'suspend'].includes(action)) throw new Error('invalid guide action');

  const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'suspended';

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_applications')
    .update({ status: nextStatus, admin_note: adminNote, updated_at: new Date().toISOString() })
    .eq('id', applicationId)
    .select('id, full_name, phone, email, city, bio, status, admin_note, created_at, updated_at')
    .single();

  if (error || !data) throw new Error(error?.message || 'guide application update failed');

  return {
    id: data.id,
    fullName: data.full_name,
    phone: data.phone,
    email: data.email,
    city: data.city,
    bio: data.bio,
    status: data.status,
    adminNote: data.admin_note,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

