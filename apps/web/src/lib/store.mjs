// In-memory fallback store for MVP booking flow

const nowIso = new Date().toISOString();

export const experiences = [
  {
    id: 'exp_chaishan_001',
    slug: 'kaohsiung-chaishan-cave-experience',
    aliases: ['chaishan-cave-tour'],
    title: '高雄柴山探洞體驗｜跟著 Andy Lee 走進城市邊緣的地形秘境',
    guideSlug: 'andy-lee',
    priceTwd: 2000,
    schedules: [
      {
        id: 'sch_chaishan_0401',
        startAt: '2026-04-01T09:00:00+08:00',
        endAt: '2026-04-01T13:00:00+08:00',
        capacity: 12,
        bookedCount: 1,
        status: 'open'
      },
      {
        id: 'sch_chaishan_0403',
        startAt: '2026-04-03T09:00:00+08:00',
        endAt: '2026-04-03T13:00:00+08:00',
        capacity: 12,
        bookedCount: 12,
        status: 'full'
      },
      {
        id: 'sch_chaishan_0410',
        startAt: '2026-04-10T09:00:00+08:00',
        endAt: '2026-04-10T13:00:00+08:00',
        capacity: 12,
        bookedCount: 0,
        status: 'open'
      }
    ],
    createdAt: nowIso
  },
  {
    id: 'exp_dadaocheng_001',
    slug: 'dadadaocheng-walk',
    aliases: [],
    title: '大稻埕百年老街深度漫步',
    guideSlug: 'chen-jian-zhi',
    priceTwd: 1500,
    schedules: [
      {
        id: 'sch_dadaocheng_0402',
        startAt: '2026-04-02T09:00:00+08:00',
        endAt: '2026-04-02T12:00:00+08:00',
        capacity: 8,
        bookedCount: 3,
        status: 'open'
      }
    ],
    createdAt: nowIso
  }
];

export const orders = [
  {
    id: 'ord_mock_001',
    experienceId: 'exp_chaishan_001',
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0401',
    scheduleStartAt: '2026-04-01T09:00:00+08:00',
    status: 'paid',
    totalTwd: 4000,
    peopleCount: 2,
    contactName: '王小明',
    contactPhone: '0912345678',
    contactEmail: 'wang@example.com',
    adminNote: null,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    paidAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'ord_mock_002',
    experienceId: 'exp_dadaocheng_001',
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    scheduleStartAt: '2026-04-02T09:00:00+08:00',
    status: 'confirmed',
    totalTwd: 1500,
    peopleCount: 1,
    contactName: '陳美玲',
    contactPhone: '0987654321',
    contactEmail: 'chen@example.com',
    adminNote: '已電話確認',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    paidAt: new Date(Date.now() - 3600000 * 23).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 23).toISOString(),
  },
  {
    id: 'ord_mock_003',
    experienceId: 'exp_chaishan_001',
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0403',
    scheduleStartAt: '2026-04-03T09:00:00+08:00',
    status: 'refund_pending',
    totalTwd: 6000,
    peopleCount: 3,
    contactName: '林大志',
    contactPhone: '0933111222',
    contactEmail: 'lin@example.com',
    adminNote: '旅客因故取消',
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    paidAt: new Date(Date.now() - 3600000 * 47).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 10).toISOString(),
  },
  {
    id: 'ord_mock_004',
    experienceId: 'exp_chaishan_001',
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    scheduleStartAt: '2026-04-10T09:00:00+08:00',
    status: 'pending_payment',
    totalTwd: 2000,
    peopleCount: 1,
    contactName: '張雅文',
    contactPhone: '0966333444',
    contactEmail: 'chang@example.com',
    adminNote: null,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    paidAt: null,
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'ord_mock_005',
    experienceId: 'exp_dadaocheng_001',
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    scheduleStartAt: '2026-04-02T09:00:00+08:00',
    status: 'completed',
    totalTwd: 3000,
    peopleCount: 2,
    contactName: '吳俊宏',
    contactPhone: '0955666777',
    contactEmail: 'wu@example.com',
    adminNote: '順利完成',
    createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
    paidAt: new Date(Date.now() - 3600000 * 71).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 20).toISOString(),
  },
];

export const payments = [];

export const refundRequests = [
  {
    id: 'ref_mock_001',
    orderId: 'ord_mock_003',
    reason: '行程日期無法參加',
    note: '旅客提前 7 天申請退款',
    requestedAt: new Date(Date.now() - 3600000 * 10).toISOString(),
  },
];

export const guideApplications = [
  {
    id: 'ga_mock_001',
    fullName: '許志豪',
    email: 'hsu.zhihao@guide.com',
    phone: '0911222333',
    city: '台北市',
    bio: '擁有 10 年大稻埕導覽經驗，熟悉百年建築歷史與茶商文化，曾帶領超過 500 組旅客深度探索迪化街。',
    status: 'pending',
    adminNote: null,
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'ga_mock_002',
    fullName: '蔡依珊',
    email: 'tsai.yishan@guide.com',
    phone: '0922333444',
    city: '高雄市',
    bio: '專業登山嚮導，持有中高級嚮導證，帶領柴山、大崗山等南部自然地景探索活動 6 年。',
    status: 'pending',
    adminNote: null,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: 'ga_mock_003',
    fullName: '黃建國',
    email: 'huang.jianguo@guide.com',
    phone: '0933444555',
    city: '台南市',
    bio: '台南在地文史工作者，主攻老屋、廟宇與小吃文化，著有《安平漫遊指南》。',
    status: 'approved',
    adminNote: '背景查核完成',
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
  },
];
export const auditLogs = [
  { id: 'al_001', orderId: 'ord_mock_001', action: 'status_changed', actor: 'system', payload: { from: 'pending_payment', to: 'paid' }, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'al_002', orderId: 'ord_mock_002', action: 'status_changed', actor: 'admin', payload: { from: 'paid', to: 'confirmed' }, createdAt: new Date(Date.now() - 3600000 * 23).toISOString() },
  { id: 'al_003', orderId: 'ord_mock_003', action: 'status_changed', actor: 'system', payload: { from: 'confirmed', to: 'refund_pending' }, createdAt: new Date(Date.now() - 3600000 * 10).toISOString() },
];

export const operationsTracking = [
  { orderId: 'ord_mock_001', manualMinutes: 15, manualCostTwd: 75, refundAmountTwd: 0, subsidyTwd: 0, isRescheduled: false, hasComplaint: false, hasGuideAdjustment: false, hasOversellIssue: false, note: null },
  { orderId: 'ord_mock_002', manualMinutes: 10, manualCostTwd: 50, refundAmountTwd: 0, subsidyTwd: 0, isRescheduled: false, hasComplaint: false, hasGuideAdjustment: false, hasOversellIssue: false, note: null },
  { orderId: 'ord_mock_003', manualMinutes: 45, manualCostTwd: 225, refundAmountTwd: 6000, subsidyTwd: 0, isRescheduled: false, hasComplaint: false, hasGuideAdjustment: false, hasOversellIssue: false, note: '退款處理中' },
  { orderId: 'ord_mock_005', manualMinutes: 0, manualCostTwd: 0, refundAmountTwd: 0, subsidyTwd: 0, isRescheduled: false, hasComplaint: false, hasGuideAdjustment: false, hasOversellIssue: false, note: null },
];
export const kpiConfig = {
  commissionRate: 0.15,
  paymentFeeRate: 0.035,
  guidePayoutRate: 0.85,
  healthyMinContributionTwd: 1,
  healthyAllowException: false,
  updatedAt: nowIso
};

export const kpiConfigHistory = [
  {
    versionId: 'kpi_v_000001',
    actor: 'system',
    action: 'init',
    note: 'initial defaults',
    config: { ...kpiConfig },
    createdAt: nowIso
  }
];
