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

export const orders = [];
export const payments = [];
export const refundRequests = [];
export const guideApplications = [];
export const auditLogs = [];
export const operationsTracking = [];
export const kpiConfig = {
  commissionRate: 0.15,
  paymentFeeRate: 0.035,
  healthyMinContributionTwd: 1,
  healthyAllowException: false,
  updatedAt: nowIso
};
