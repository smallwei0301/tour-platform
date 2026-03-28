// Tour Platform MVP — Complete Fixture Data
// Source: 04-tech-architecture/07-andy-lee-mvp-content.json + placeholder guides

export interface GuideProfile {
  slug: string;
  displayName: string;
  headline: string;
  shortBio: string;
  longBio: string;
  region: string;
  languages: string[];
  specialties: string[];
  verificationBadges: string[];
  avatarUrl: string;
  heroImageUrl: string;
  galleryUrls: string[];
  rating: number;
  reviewCount: number;
  serviceCount: number;
}

export interface Schedule {
  startAt: string;
  endAt: string;
  capacity: number;
  bookedCount: number;
  status: 'open' | 'full' | 'closed';
}

export interface Activity {
  slug: string;
  guideSlug: string;
  title: string;
  category: string;
  region: string;
  regionSlug: string;
  tagline: string;
  shortDescription: string;
  longDescription: string;
  price: number;
  priceLabel: string;
  durationMinutes: number;
  durationDisplay: string;
  minParticipants: number;
  maxParticipants: number;
  meetingPoint: string;
  meetingPointMapUrl: string;
  inclusions: string[];
  exclusions: string[];
  goodFor: string[];
  notGoodFor: string[];
  notices: string[];
  refundRules: string[];
  safetyNotice: string;
  faq: { question: string; answer: string }[];
  socialProofQuotes: string[];
  trustPoints: string[];
  imageUrl: string;
  galleryUrls: string[];
  schedules: Schedule[];
  transportMode: string;
  seoTitle: string;
  seoDescription: string;
}

export interface Review {
  id: string;
  activitySlug: string;
  guideSlug: string;
  author: string;
  city: string;
  rating: number;
  text: string;
  date: string;
}

// ============================================================
// GUIDES
// ============================================================

export const guides: GuideProfile[] = [
  {
    slug: 'andy-lee',
    displayName: 'Andy Lee（李衍錫）',
    headline: '帶你進入高雄柴山真正的地形秘境，不是觀光打卡，是懂路的人帶路。',
    shortBio: '我是 Andy Lee（李衍錫），長期帶領高雄柴山探洞與戶外地形體驗。比起走觀光客會去的地方，我更在意的是帶你安全地走進真正有故事、有地形特色、也有挑戰性的在地路線。',
    longBio: '我是 Andy Lee（李衍錫），主要專注在高雄柴山一帶的戶外特色導覽與探洞體驗。對我來說，好的導覽不是把人帶到一個景點拍照，而是讓參與者真正理解一個地方的地形、環境、節奏與魅力。柴山最吸引人的地方，不只是自然景觀，而是它隱藏在城市邊緣、卻又像另一個世界的地貌層次。很多人來高雄，只會想到港邊、夜市或市區景點，但其實只要有人帶路，你會看到完全不同的高雄。我希望帶給旅客的，不是制式化行程，而是一種更貼近現場、更有記憶點、也更安全可靠的探索體驗。',
    region: '高雄',
    languages: ['中文', '德語', '粵語', '荷蘭語', '日語', '韓語'],
    specialties: ['柴山探洞', '高雄在地', '戶外特色導覽', '地形探索', '小團體驗'],
    verificationBadges: ['壽山國家自然公園巡守員', '環境教育講師', '保育志工證書 21 本', '颱風災後復原感謝狀 x2'],
    avatarUrl: '/images/guides/andy-lee/avatar.jpg',
    heroImageUrl: '/images/guides/andy-lee/hero.jpg',
    galleryUrls: [
      '/images/guides/andy-lee/gallery-01.jpg',
      '/images/activities/chaishan/main.jpg',
      'https://images.pexels.com/photos/1496373/pexels-photo-1496373.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/3763814/pexels-photo-3763814.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1072824/pexels-photo-1072824.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/2325446/pexels-photo-2325446.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ],
    rating: 5.0,
    reviewCount: 23,
    serviceCount: 47,
  },
  {
    slug: 'chen-jian-zhi',
    displayName: '陳建志',
    headline: '帶你走進大稻埕百年街區，看到不在旅遊書上的台北故事。',
    shortBio: '我在大稻埕長大，從小就在迪化街的布行裡穿梭。跟著我走，你看到的不是景點清單，而是這個街區如何活過百年。',
    longBio: '我在大稻埕長大，從小就在迪化街的布行裡穿梭。對我來說，大稻埕不是觀光景點，而是我的生活場域。帶著旅客走在這些街道上，我會告訴你哪間店賣的南北貨最道地、哪條巷子藏著最好吃的碗粿、城隍廟裡的月老到底靈不靈。比起走馬看花，我更希望你離開的時候，覺得自己認識了一個真正在這裡生活的朋友。',
    region: '台北',
    languages: ['中文', '英語'],
    specialties: ['文化歷史', '美食體驗', '夜市導覽', '老街故事'],
    verificationBadges: ['KYC 已驗證', '精選導遊'],
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1470004914212-05527e49370b?w=1600&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1470004914212-05527e49370b?w=800&q=80',
      'https://images.unsplash.com/photo-1576633587382-13ddf37b1fc1?w=800&q=80',
      'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=800&q=80',
    ],
    rating: 5.0,
    reviewCount: 12,
    serviceCount: 47,
  },
  {
    slug: 'lin-a-ming',
    displayName: '林阿明',
    headline: '花蓮的山和溪，是我最好的朋友，也是你最棒的冒險。',
    shortBio: '在花蓮溯溪超過十年，帶過數百團旅客深入秀姑巒溪與慕谷慕魚。安全、專業、讓你帶走一輩子的記憶。',
    longBio: '我是林阿明，花蓮在地人，溯溪與戶外冒險嚮導資歷超過十年。花蓮最美的風景不在公路旁，而是在那些需要有人帶路才能到達的溪谷裡。我帶過的旅客從 8 歲到 68 歲都有，每一次出發前我都會根據當天的水況、天氣和團員狀態調整路線。安全是第一優先，但我保證你會帶走比想像中更多的驚喜。',
    region: '花蓮',
    languages: ['中文', '英語'],
    specialties: ['溯溪', '戶外冒險', '自然生態', '原住民文化'],
    verificationBadges: ['KYC 已驗證', '精選導遊', '急救認證'],
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1504858700536-882c978a3464?w=1600&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1504858700536-882c978a3464?w=800&q=80',
      'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&q=80',
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
    ],
    rating: 5.0,
    reviewCount: 14,
    serviceCount: 32,
  },
];

// ============================================================
// ACTIVITIES
// ============================================================

export const activities: Activity[] = [
  {
    slug: 'kaohsiung-chaishan-cave-experience',
    guideSlug: 'andy-lee',
    title: '高雄柴山探洞體驗｜跟著 Andy Lee 走進城市邊緣的地形秘境',
    category: 'outdoor',
    region: '高雄市',
    regionSlug: 'kaohsiung',
    tagline: '不是一般健行路線，而是由熟悉地形的人帶你走進平常不會自己到達的柴山探洞路線。',
    shortDescription: '如果你想看的不是一般觀光景點，而是高雄更有記憶點的一面，Andy Lee 的柴山探洞體驗，會帶你用安全、有節奏、有人帶的方式，進入城市邊緣最有特色的地形路線。',
    longDescription: '這不是一條普通的散步行程，也不是制式化的觀光路線。Andy Lee 會帶你走進高雄柴山具有地形特色的探洞體驗路線，讓你從不同角度認識這座城市邊緣最有層次、也最容易被忽略的自然地貌。整個體驗重點不在趕景點，而在於讓你真正感受到路線的變化、環境的細節，以及有人帶領時才能安全進入的探索感。對第一次接觸這類型戶外體驗的人來說，這是一種既新鮮、又具有故事感的高雄打開方式；對已經玩過一般市區景點的人來說，這會是完全不同等級的記憶點。',
    price: 2000,
    priceLabel: 'NT$2,000 / 人',
    durationMinutes: 240,
    durationDisplay: '3-4 小時',
    minParticipants: 4,
    maxParticipants: 12,
    meetingPoint: '壽山國家自然公園遊客中心停車場',
    meetingPointMapUrl: 'https://maps.google.com/?q=%E5%A3%BD%E5%B1%B1%E5%9C%8B%E5%AE%B6%E8%87%AA%E7%84%B6%E5%85%AC%E5%9C%92%E9%81%8A%E5%AE%A2%E4%B8%AD%E5%BF%83',
    inclusions: ['Andy Lee 導覽帶領', '路線說明與安全提醒', '活動過程中的在地地形介紹', '基本裝備（頭燈、手套、安全帽）', '活動紀錄照'],
    exclusions: ['個人保險', '個人交通費', '個人飲水與補給', '其他未明列私人支出'],
    goodFor: ['想體驗高雄不同面貌的旅客', '喜歡戶外探索與小團活動者', '不想參加制式化觀光行程的人'],
    notGoodFor: ['行動不便者', '對較特殊地形環境高度不適者', '無法配合現場安全指示者'],
    notices: ['請穿著適合活動的服裝與鞋子', '請依現場導遊指示行動', '若遇天候或安全因素，活動安排可能調整'],
    refundRules: ['活動 7 天前取消：100% 退款', '活動 3–7 天前取消：70% 退款', '活動 24–72 小時前取消：50% 退款', '活動 24 小時內取消：不退款', '若因導遊因素取消：全額退款'],
    safetyNotice: '本活動屬戶外特色體驗，參與者需配合導遊現場指示與安全安排。',
    faq: [
      { question: '這個行程適合什麼樣的人？', answer: '本行程適合喜歡自然探索、戶外體驗、洞穴地景與在地生態導覽的旅客。親子、朋友同行、小型團體皆可參加。' },
      { question: '沒有探洞經驗也可以參加嗎？', answer: '可以。此活動為初階到中階體驗，由導遊帶領進行，會先做路線與安全說明。' },
      { question: '活動大約多久？', answer: '約 3-4 小時，實際時間依路線、天候與團體狀況調整。' },
      { question: '一團幾個人？', answer: '最少 4 人、最多 12 人。若為包團或教育單位，可再另行安排。' },
      { question: '費用包含什麼？', answer: '包含：導覽服務、安全說明、基本裝備（頭燈、手套、安全帽）、活動紀錄照。' },
      { question: '需要準備什麼裝備？', answer: '建議穿著方便活動的衣物、運動鞋或止滑鞋，並自備飲水、防蚊用品與個人物品。' },
      { question: '下雨天還會出團嗎？', answer: '若遇天候不佳或路線安全疑慮，活動可能延期或調整。' },
      { question: '可以包團或客製化嗎？', answer: '可以，親子團、學校團、企業團與外國旅客團體皆可洽詢客製安排。' },
    ],
    socialProofQuotes: ['大人小人都開心😍', '奇幻的探洞之旅', '謝謝 Andy 的導覽，會想再參加一次', '很棒、下次再去'],
    trustPoints: ['多元客群：親子、教師、外國遊客、研究生', '有實際帶團與環境教育背景', '具壽山巡守與保育志工信任背書'],
    imageUrl: '/images/activities/chaishan/main.jpg',
    galleryUrls: [
      '/images/activities/chaishan/main.jpg',
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
      'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&q=80',
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80',
    ],
    schedules: [
      { startAt: '2026-04-01T09:00:00+08:00', endAt: '2026-04-01T13:00:00+08:00', capacity: 12, bookedCount: 1, status: 'open' },
      { startAt: '2026-04-03T09:00:00+08:00', endAt: '2026-04-03T13:00:00+08:00', capacity: 12, bookedCount: 12, status: 'full' },
      { startAt: '2026-04-10T09:00:00+08:00', endAt: '2026-04-10T13:00:00+08:00', capacity: 12, bookedCount: 0, status: 'open' },
      { startAt: '2026-04-15T09:00:00+08:00', endAt: '2026-04-15T13:00:00+08:00', capacity: 12, bookedCount: 4, status: 'open' },
    ],
    transportMode: '步行',
    seoTitle: '高雄柴山洞穴探險｜壽山環境教育導覽｜Andy Lee',
    seoDescription: '跟著 Andy Lee 體驗高雄柴山探洞路線，探索城市邊緣最有記憶點的地形秘境。',
  },
  {
    slug: 'dadadaocheng-walk',
    guideSlug: 'chen-jian-zhi',
    title: '大稻埕百年老街深度漫步',
    category: 'culture',
    region: '台北市',
    regionSlug: 'taipei',
    tagline: '不是走馬看花，而是真正認識一個活了百年的街區。',
    shortDescription: '跟著在地人陳建志走進大稻埕，從迪化街布行、霞海城隍廟到永樂市場，聽這個街區如何從清朝活到現在。',
    longDescription: '跟著在地導遊陳建志走進大稻埕街區，從迪化街布行、霞海城隍廟到永樂市場，不是打卡式走馬看花，而是把街區背後的人物與歷史串成真正可感受的故事。你會知道哪間店的南北貨最道地、哪條巷子藏著最好吃的碗粿、城隍廟裡的月老到底靈不靈。',
    price: 1500,
    priceLabel: 'NT$1,500 / 人',
    durationMinutes: 180,
    durationDisplay: '3 小時',
    minParticipants: 1,
    maxParticipants: 8,
    meetingPoint: '捷運大橋頭站 2 號出口',
    meetingPointMapUrl: 'https://maps.google.com/?q=大橋頭站',
    inclusions: ['專業在地導遊全程陪同', '路線導覽與文化解說', '行程說明材料'],
    exclusions: ['交通費（捷運/計程車）', '餐飲費用', '個人消費'],
    goodFor: ['喜歡歷史文化的旅客', '想深度認識台北的人', '攝影愛好者'],
    notGoodFor: ['趕時間只想拍照打卡的人'],
    notices: ['請穿舒適步行鞋', '導覽全程約 3 公里步行'],
    refundRules: ['活動 48 小時前取消：全額退款', '活動 24–48 小時前取消：50% 退款', '活動 24 小時內取消：不退款'],
    safetyNotice: '本行程為步行導覽，適合一般體能。',
    faq: [
      { question: '適合帶小孩嗎？', answer: '適合，但建議 6 歲以上，因全程步行約 3 公里。' },
      { question: '下雨天怎麼辦？', answer: '小雨照常出發（大稻埕有很多騎樓），大雨可協調改期。' },
    ],
    socialProofQuotes: ['比任何旅遊書都精彩', '建志超會講故事', '來台北必推這個行程'],
    trustPoints: ['KYC 已驗證', '精選導遊', '47 次帶團經驗'],
    imageUrl: 'https://images.unsplash.com/photo-1470004914212-05527e49370b?w=800&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1470004914212-05527e49370b?w=800&q=80',
      'https://images.unsplash.com/photo-1576633587382-13ddf37b1fc1?w=800&q=80',
      'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=800&q=80',
    ],
    schedules: [
      { startAt: '2026-04-02T09:00:00+08:00', endAt: '2026-04-02T12:00:00+08:00', capacity: 8, bookedCount: 3, status: 'open' },
      { startAt: '2026-04-05T14:00:00+08:00', endAt: '2026-04-05T17:00:00+08:00', capacity: 8, bookedCount: 8, status: 'full' },
    ],
    transportMode: '步行',
    seoTitle: '大稻埕老街導覽｜台北深度文化體驗｜陳建志',
    seoDescription: '跟著在地人走進大稻埕百年街區，聽迪化街布行與霞海城隍廟的真實故事。',
  },
  {
    slug: 'taipei-night-market-food-tour',
    guideSlug: 'chen-jian-zhi',
    title: '台北夜市美食文化探索',
    category: 'food',
    region: '台北市',
    regionSlug: 'taipei',
    tagline: '不只吃，還要懂為什麼好吃。',
    shortDescription: '跟著建志走進寧夏夜市和大龍街，不只帶你吃最道地的小吃，還告訴你每攤背後的故事。',
    longDescription: '台北的夜市不是只有排隊和拍照。跟著陳建志走進寧夏夜市，你會知道哪攤的蚵仔煎用的是澎湖直送的蚵仔、哪間滷肉飯已經傳了三代人。這不是美食清單，而是一趟味覺記憶之旅。',
    price: 1200,
    priceLabel: 'NT$1,200 / 人',
    durationMinutes: 180,
    durationDisplay: '3 小時',
    minParticipants: 2,
    maxParticipants: 6,
    meetingPoint: '捷運中山站 1 號出口',
    meetingPointMapUrl: 'https://maps.google.com/?q=中山站',
    inclusions: ['導遊全程帶領', '精選 5 攤美食試吃', '文化故事解說'],
    exclusions: ['額外購買的食物', '交通費'],
    goodFor: ['美食愛好者', '第一次來台北的旅客', '想深度體驗夜市文化的人'],
    notGoodFor: ['嚴格素食者（部分攤位無素食選項）'],
    notices: ['請空腹前來', '有食物過敏請提前告知'],
    refundRules: ['活動 48 小時前取消：全額退款', '活動 24 小時內取消：不退款'],
    safetyNotice: '夜市環境較擁擠，請注意隨身物品。',
    faq: [
      { question: '可以指定想吃的攤位嗎？', answer: '可以跟導遊討論，會盡量安排。' },
    ],
    socialProofQuotes: ['吃到撐還想再吃', '終於知道哪攤最值得排'],
    trustPoints: ['在地 30 年美食經驗'],
    imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
      'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=800&q=80',
    ],
    schedules: [
      { startAt: '2026-04-04T18:00:00+08:00', endAt: '2026-04-04T21:00:00+08:00', capacity: 6, bookedCount: 2, status: 'open' },
    ],
    transportMode: '步行',
    seoTitle: '台北夜市美食導覽｜寧夏夜市深度體驗',
    seoDescription: '跟著在地人走進台北夜市，不只吃美食，還聽每一攤背後的故事。',
  },
  {
    slug: 'hualien-river-trekking',
    guideSlug: 'lin-a-ming',
    title: '花蓮秀姑巒溪溯溪全日冒險',
    category: 'outdoor',
    region: '花蓮縣',
    regionSlug: 'hualien',
    tagline: '走進台灣最純淨的野溪，用雙腳感受花蓮的力量。',
    shortDescription: '由專業嚮導林阿明帶領，深入花蓮秀姑巒溪進行溯溪冒險。全套裝備、安全保障，讓你安心探索台灣最美的溪谷。',
    longDescription: '花蓮最美的風景不在公路旁，而是在那些需要有人帶路才能到達的溪谷裡。林阿明會帶你穿過巨石、涉過清澈的溪水、在瀑布下感受大自然的震撼。不管你是第一次溯溪的新手，還是想挑戰更高難度的老手，阿明都會根據當天的狀況為你安排最適合的路線。',
    price: 3200,
    priceLabel: 'NT$3,200 / 人',
    durationMinutes: 480,
    durationDisplay: '全天（約 8 小時）',
    minParticipants: 4,
    maxParticipants: 8,
    meetingPoint: '花蓮火車站前廣場',
    meetingPointMapUrl: 'https://maps.google.com/?q=花蓮火車站',
    inclusions: ['專業嚮導全程帶領', '全套溯溪裝備（防寒衣、安全帽、救生衣、溯溪鞋）', '接駁交通', '簡易午餐', '活動保險'],
    exclusions: ['個人物品防水袋', '額外餐飲'],
    goodFor: ['喜歡戶外冒險的旅客', '想體驗台灣溪谷之美的人', '團體出遊'],
    notGoodFor: ['不會游泳且極度恐水者', '嚴重心血管疾病患者'],
    notices: ['請穿可濕的衣物', '攜帶換洗衣物', '遵守嚮導安全指示'],
    refundRules: ['活動 7 天前取消：全額退款', '活動 3 天前取消：50% 退款', '活動當天取消：不退款', '天候因素取消：全額退款'],
    safetyNotice: '溯溪屬中高強度戶外活動，請確認自身健康狀況適合參加。',
    faq: [
      { question: '不會游泳可以參加嗎？', answer: '基礎路線不需要游泳能力，全程穿救生衣。但如果極度恐水建議先考慮。' },
      { question: '幾月最適合溯溪？', answer: '5-10 月是最佳季節，水溫舒適、溪水清澈。' },
    ],
    socialProofQuotes: ['人生清單打勾！', '阿明超專業，全程很安心', '花蓮最棒的體驗沒有之一'],
    trustPoints: ['10 年以上溯溪經驗', '急救認證', '零事故紀錄'],
    imageUrl: 'https://images.unsplash.com/photo-1504858700536-882c978a3464?w=800&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1504858700536-882c978a3464?w=800&q=80',
      'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&q=80',
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
    ],
    schedules: [
      { startAt: '2026-04-06T07:00:00+08:00', endAt: '2026-04-06T15:00:00+08:00', capacity: 8, bookedCount: 5, status: 'open' },
      { startAt: '2026-04-12T07:00:00+08:00', endAt: '2026-04-12T15:00:00+08:00', capacity: 8, bookedCount: 0, status: 'open' },
    ],
    transportMode: '包車',
    seoTitle: '花蓮溯溪體驗｜秀姑巒溪全日冒險｜林阿明',
    seoDescription: '由專業嚮導帶領深入花蓮秀姑巒溪，全套裝備、安全保障的溯溪冒險。',
  },
];

// ============================================================
// REVIEWS
// ============================================================

export const reviews: Review[] = [
  { id: 'r1', activitySlug: 'kaohsiung-chaishan-cave-experience', guideSlug: 'andy-lee', author: '小美', city: '台北', rating: 5, text: '大人小人都開心😍 Andy 很有耐心，路線比想像中刺激但又很安全！', date: '2026-03-15' },
  { id: 'r2', activitySlug: 'kaohsiung-chaishan-cave-experience', guideSlug: 'andy-lee', author: 'David K.', city: '香港', rating: 5, text: '奇幻的探洞之旅，完全不像在高雄市區旁邊！Andy 的德語解說也很棒。', date: '2026-03-08' },
  { id: 'r3', activitySlug: 'kaohsiung-chaishan-cave-experience', guideSlug: 'andy-lee', author: '阿翔', city: '台中', rating: 5, text: '謝謝 Andy 的導覽，會想再參加一次。帶小朋友去也很適合。', date: '2026-02-28' },
  { id: 'r4', activitySlug: 'kaohsiung-chaishan-cave-experience', guideSlug: 'andy-lee', author: '陳老師', city: '高雄', rating: 5, text: '帶學生去的戶外教學，孩子們超興奮，學到很多地質知識。', date: '2026-02-14' },
  { id: 'r5', activitySlug: 'dadadaocheng-walk', guideSlug: 'chen-jian-zhi', author: 'Vivian C.', city: '台北', rating: 5, text: '本來以為只是一般古蹟導覽，沒想到建志帶我們走進了老屋廚房、爬上二樓看迪化街全景。比任何旅遊書都精彩！', date: '2026-02-14' },
  { id: 'r6', activitySlug: 'dadadaocheng-walk', guideSlug: 'chen-jian-zhi', author: '佐藤太郎', city: '東京', rating: 5, text: '台北最棒的體驗，建志的英語解說非常清楚。強烈推薦！', date: '2026-01-20' },
  { id: 'r7', activitySlug: 'hualien-river-trekking', guideSlug: 'lin-a-ming', author: '小琪', city: '新竹', rating: 5, text: '人生清單打勾！阿明超專業，全程很安心。花蓮最棒的體驗沒有之一！', date: '2026-03-01' },
  { id: 'r8', activitySlug: 'hualien-river-trekking', guideSlug: 'lin-a-ming', author: 'Mike W.', city: 'Sydney', rating: 5, text: 'Best river trekking experience ever! Ming is incredibly professional and fun.', date: '2026-02-20' },
];

// ============================================================
// HELPERS
// ============================================================

export function getGuideBySlug(slug: string): GuideProfile | undefined {
  return guides.find((g) => g.slug === slug);
}

export function getActivityBySlug(slug: string): Activity | undefined {
  return activities.find((a) => a.slug === slug);
}

export function getActivitiesByGuide(guideSlug: string): Activity[] {
  return activities.filter((a) => a.guideSlug === guideSlug);
}

export function getReviewsByActivity(activitySlug: string): Review[] {
  return reviews.filter((r) => r.activitySlug === activitySlug);
}

export function getReviewsByGuide(guideSlug: string): Review[] {
  return reviews.filter((r) => r.guideSlug === guideSlug);
}
