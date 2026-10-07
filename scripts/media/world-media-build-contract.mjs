/** 本輪唯一核准的 Preview／store／origin；不是可擴張的環境設定。 */
export const WORLD_MEDIA_TRIAL = Object.freeze({
  branch: 'trial/blob-reversible-local',
  projectId: 'prj_KrrA4UrpyZtEfsQZeSHUJ5zaw4Re',
  storeId: 'store_pEKGELFM9z6nKVFj',
  storeOrigin: 'https://pekgelfm9z6nkvfj.public.blob.vercel-storage.com',
});

/** 非指定 Preview 直接原 build；trial 缺條件則停止，不能默默用 local 代替試驗。 */
export function worldMediaBuildMode(env, { nodeVersion, sourceRoot, appRoot, exclusiveCheckout = false }) {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== WORLD_MEDIA_TRIAL.branch) return 'local';
  if (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== 'preview' || env.VERCEL !== '1' || env.VERCEL_PROJECT_ID !== WORLD_MEDIA_TRIAL.projectId || env.TOUR_WORLD_BLOB_STORE_ID !== WORLD_MEDIA_TRIAL.storeId) throw new Error('WORLD_MEDIA_TRIAL_CONTEXT_INVALID');
  if (!/^22\./.test(nodeVersion) || !/^\/vercel\/path\d+$/.test(sourceRoot) || appRoot !== `${sourceRoot}/apps/web` || exclusiveCheckout !== true) throw new Error('WORLD_MEDIA_TRIAL_EXCLUSIVE_CHECKOUT_REQUIRED');
  if (!Object.hasOwn(env, 'VERCEL_OIDC_TOKEN')) throw new Error('WORLD_MEDIA_TRIAL_OIDC_REQUIRED');
  // 只檢查 key presence，不讀取 token value，也不允許 SDK fallback／API-origin override。
  for (const key of ['BLOB_READ_WRITE_TOKEN', 'TOUR_WORLD_BLOB_READ_WRITE_TOKEN', 'VERCEL_BLOB_API_URL', 'NEXT_PUBLIC_VERCEL_BLOB_API_URL']) {
    if (Object.hasOwn(env, key)) throw new Error('WORLD_MEDIA_TRIAL_UNSUPPORTED_AUTH_ORIGIN');
  }
  return 'blob-trial';
}

/** media-src 只對同一試驗 Preview 與已核 manifest origin 放行。 */
export function worldMediaCspSource(state, env) {
  if (state?.mode !== 'blob-trial') return "media-src 'self'";
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== WORLD_MEDIA_TRIAL.branch || env.VERCEL_PROJECT_ID !== WORLD_MEDIA_TRIAL.projectId || env.TOUR_WORLD_BLOB_STORE_ID !== WORLD_MEDIA_TRIAL.storeId || state.storeOrigin !== WORLD_MEDIA_TRIAL.storeOrigin) throw new Error('WORLD_MEDIA_TRIAL_CSP_CONTEXT_INVALID');
  return `media-src 'self' ${WORLD_MEDIA_TRIAL.storeOrigin}`;
}
