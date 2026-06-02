const REGION_REGISTRY = Object.freeze({
  taipei: { slug: 'taipei', displayName: '台北', dbValue: '台北市' },
  'new-taipei': { slug: 'new-taipei', displayName: '新北', dbValue: '新北市' },
  taoyuan: { slug: 'taoyuan', displayName: '桃園', dbValue: '桃園市' },
  taichung: { slug: 'taichung', displayName: '台中', dbValue: '台中市' },
  tainan: { slug: 'tainan', displayName: '台南', dbValue: '台南市' },
  kaohsiung: { slug: 'kaohsiung', displayName: '高雄', dbValue: '高雄市' },
  keelung: { slug: 'keelung', displayName: '基隆', dbValue: '基隆市' },
  hsinchu: { slug: 'hsinchu', displayName: '新竹', dbValue: '新竹市' },
  hualien: { slug: 'hualien', displayName: '花蓮', dbValue: '花蓮縣' },
  taitung: { slug: 'taitung', displayName: '台東', dbValue: '台東縣' },
  nantou: { slug: 'nantou', displayName: '南投', dbValue: '南投縣' },
  yilan: { slug: 'yilan', displayName: '宜蘭', dbValue: '宜蘭縣' },
  pingtung: { slug: 'pingtung', displayName: '屏東', dbValue: '屏東縣' },
  miaoli: { slug: 'miaoli', displayName: '苗栗', dbValue: '苗栗縣' },
  chiayi: { slug: 'chiayi', displayName: '嘉義', dbValue: '嘉義縣' },
  penghu: { slug: 'penghu', displayName: '澎湖', dbValue: '澎湖縣' },
  kinmen: { slug: 'kinmen', displayName: '金門', dbValue: '金門縣' },
  matsu: { slug: 'matsu', displayName: '馬祖', dbValue: '連江縣' },
});

export function getRegionBySlug(slug) {
  if (typeof slug !== 'string' || slug.length === 0) return null;
  return REGION_REGISTRY[slug] ?? null;
}

export function isKnownRegionSlug(slug) {
  return getRegionBySlug(slug) !== null;
}

export { REGION_REGISTRY };
