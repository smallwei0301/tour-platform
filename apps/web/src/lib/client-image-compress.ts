// 上傳前的客戶端影像壓縮：中央裁切到指定比例 + 縮放 + 轉 WebP。
//
// 為什麼需要：Vercel serverless function 的請求 body 有約 4.5MB 硬上限
// （超過會在邊緣回 FUNCTION_PAYLOAD_TOO_LARGE，根本進不到 route handler）。
// 手機原圖動輒 3–12MB，直接上傳一定失敗。先在瀏覽器壓成小張 WebP，
// 申請表單與導遊後台共用同一套參數，確保上傳檔遠小於上限。
//
// 僅能在瀏覽器執行（使用 window.Image / canvas）。

export type ImageKind = 'avatar' | 'hero' | 'gallery';

const CONFIG: Record<ImageKind, { ratio: number; w: number; h: number }> = {
  avatar: { ratio: 1, w: 400, h: 400 },
  hero: { ratio: 16 / 9, w: 1920, h: 1080 },
  gallery: { ratio: 3 / 2, w: 1200, h: 800 },
};

export async function compressImage(file: File, kind: ImageKind): Promise<File> {
  const config = CONFIG[kind];

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      const srcRatio = width / height;
      let cropW = width, cropH = height, cropX = 0, cropY = 0;
      if (srcRatio > config.ratio) {
        cropW = height * config.ratio;
        cropX = (width - cropW) / 2;
      } else {
        cropH = width / config.ratio;
        cropY = (height - cropH) / 2;
      }
      const canvas = document.createElement('canvas');
      canvas.width = config.w;
      canvas.height = config.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('無法建立 canvas context')); return; }
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, config.w, config.h);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('壓縮失敗')); return; }
        resolve(new File([blob], `${kind}.webp`, { type: 'image/webp' }));
      }, 'image/webp', 0.85);
    };
    img.onerror = () => reject(new Error('圖片載入失敗（可能是不支援的格式，例如 HEIC，請改用 JPG／PNG）'));
    img.src = url;
  });
}
