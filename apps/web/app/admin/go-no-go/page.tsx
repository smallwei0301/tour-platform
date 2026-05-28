'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../../../src/components/admin/ui';

type ReadinessStatus = 'pass' | 'warning' | 'fail' | 'manual' | 'evidence_required' | (string & {});

interface ReadinessItem {
  id: string;
  label: string;
  status: ReadinessStatus;
  owner: string;
  note: string;
}

interface Metrics {
  healthyOrderRate: number;
  exceptionRate: number;
  pendingRefunds: number;
  paidConfirmedRatio: number;
  incidents24h: number;
}

type VerdictState = 'GO' | 'HOLD' | 'NO_GO';

interface Verdict {
  state: VerdictState;
  reason: string;
  computedAt: string;
  deploySha: string;
}

interface RecommendedAction {
  label: string;
  href: string;
}

interface GoNoGoData {
  readiness: ReadinessItem[];
  metrics: Metrics;
  verdict: Verdict;
  recommendedActions: RecommendedAction[];
}

const READINESS_STATUS_CONFIG: Record<ReadinessStatus, { label: string; color: string; bg: string }> = {
  pass: { label: '通過', color: '#166534', bg: '#dcfce7' },
  warning: { label: '注意', color: '#854d0e', bg: '#fef9c3' },
  fail: { label: '未通過', color: '#991b1b', bg: '#fee2e2' },
  manual: { label: '人工確認', color: '#1e40af', bg: '#dbeafe' },
  evidence_required: { label: '待補佐證', color: '#7c2d12', bg: '#ffedd5' },
};

const VERDICT_CONFIG: Record<VerdictState, { label: string; color: string; bg: string; border: string }> = {
  GO: { label: '可上線', color: '#166534', bg: '#dcfce7', border: '#86efac' },
  HOLD: { label: '暫緩', color: '#854d0e', bg: '#fef9c3', border: '#fde047' },
  NO_GO: { label: '不可上線', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
};

const READINESS_STATUS_FALLBACK_CONFIG = {
  color: '#475569',
  bg: '#f1f5f9',
};

function ReadinessStatusPill({ status }: { status: ReadinessStatus }) {
  const cfg = READINESS_STATUS_CONFIG[status as keyof typeof READINESS_STATUS_CONFIG] ?? {
    ...READINESS_STATUS_FALLBACK_CONFIG,
    label: `未知狀態：${status}`,
  };
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700,
      display: 'inline-block', letterSpacing: '0.04em',
    }}>
      {cfg.label}
    </span>
  );
}

const READINESS_TEXT: Record<string, { label: string; note: string }> = {
  'ecpay-sandbox': {
    label: 'ECPay 沙盒 → 正式環境金流憑證已輪替',
    note: '確認 ECPAY_HASH_KEY 與 ECPAY_HASH_IV 已改為正式環境值',
  },
  'supabase-rls': {
    label: 'Supabase RLS 權限政策已在所有資料表啟用',
    note: 'Supabase 連線與權限狀態需確認',
  },
  'sentry-dsn': {
    label: 'Sentry DSN 已設定並可接收事件',
    note: '確認 SENTRY_DSN 已設定且錯誤事件能送達',
  },
  'vercel-deploy': {
    label: '最新 Vercel 部署來自正式 production 分支',
    note: '確認目前部署 commit 與 production 分支一致',
  },
  'evidence-alert-drill': {
    label: '#714 首筆付款前告警演練',
    note: '#714：模擬告警觸發 → ops 收警 → on-call 回覆，確認鏈路全通；完成後設定 EVIDENCE_714_SIGNED=true。',
  },
  'evidence-first-payment-qa': {
    label: '#828 首筆付款 QA 閘門決策',
    note: '#828：確認 first-payment QA gate 已簽核可放行；完成後設定 EVIDENCE_828_SIGNED=true。',
  },
  'evidence-booking-v2-qa': {
    label: '#838 Booking V2 回歸 QA（含 #824 / #839）',
    note: '#838 / #824 / #839：Booking V2 近期 PR 與 bug 回歸 QA 須通過；完成後設定 EVIDENCE_838_SIGNED=true。',
  },
  'evidence-restore-drill': {
    label: '#724 復原演練（per #320/#594）',
    note: '#724：依 #320 與 #594 訂定的時限完成 restore drill；完成後設定 EVIDENCE_724_SIGNED=true。',
  },
  'evidence-guide-content': {
    label: '#605 導遊與商品內容上架準備',
    note: '#605：首批導遊與活動內容已完整上架、審核通過；完成後設定 EVIDENCE_605_SIGNED=true。',
  },
  'evidence-guide-onboarding': {
    label: '#318 導遊 onboarding demo run 與回顧',
    note: '#318：真實導遊自助操作 walkthrough；完成後設定 EVIDENCE_318_SIGNED=true。',
  },
  'evidence-cs-sop': {
    label: '#319 客服 SOP 演練（4 種情境）',
    note: '#319：取消／退款／事件／緊急情境 SOP 演練；完成後設定 EVIDENCE_319_SIGNED=true。',
  },
};

const OWNER_LABELS: Record<string, string> = {
  ops: '營運',
  infra: '基礎設施',
  qa: 'QA',
};

const ACTION_LABELS: Record<string, string> = {
  'Review exception orders': '檢查異常訂單',
  'Process pending refunds': '處理待退款項目',
  'View system health incidents': '查看系統健康事件',
  'Review readiness checklist': '檢查上線準備清單',
};

function translateReadinessLabel(item: ReadinessItem) {
  return READINESS_TEXT[item.id]?.label ?? item.label;
}

function translateReadinessNote(item: ReadinessItem) {
  return READINESS_TEXT[item.id]?.note ?? item.note;
}

function translateOwner(owner: string) {
  return OWNER_LABELS[owner] ?? owner;
}

function translateVerdictReason(reason: string) {
  if (/^Exception rate (.+)% exceeds 10% threshold$/.test(reason)) {
    return reason.replace(/^Exception rate (.+)% exceeds 10% threshold$/, '例外率 $1% 超過 10% 上限');
  }
  if (/^Exception rate (.+)% exceeds 5% caution threshold$/.test(reason)) {
    return reason.replace(/^Exception rate (.+)% exceeds 5% caution threshold$/, '例外率 $1% 超過 5% 警戒線');
  }
  if (/^(\d+) critical incident\(s\) in last 24h$/.test(reason)) {
    return reason.replace(/^(\d+) critical incident\(s\) in last 24h$/, '過去 24 小時內有 $1 件 critical 事件');
  }
  if (/^(\d+) pending refunds exceed threshold of 10$/.test(reason)) {
    return reason.replace(/^(\d+) pending refunds exceed threshold of 10$/, '待退款 $1 件，超過 10 件門檻');
  }
  const staticReasons: Record<string, string> = {
    'One or more readiness checklist items are failing': '有一個或多個上線準備項目未通過',
    'Required pre-launch evidence items are unsigned or incomplete': '必要的上線前佐證尚未簽核或未完成',
    'All metrics within acceptable thresholds': '所有指標都在可接受門檻內',
  };
  return staticReasons[reason] ?? reason;
}

function translateActionLabel(label: string) {
  return ACTION_LABELS[label] ?? label;
}


export default function GoNoGoPage() {
  const [data, setData] = useState<GoNoGoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/go-no-go', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j?.data) {
          setData(j.data);
        } else {
          setError(j?.error?.message || '載入面板時發生未知錯誤');
        }
      })
      .catch((e) => setError(e?.message || '網路連線錯誤'))
      .finally(() => setLoading(false));
  }, []);

  const verdict = data?.verdict;
  const verdictCfg = verdict ? VERDICT_CONFIG[verdict.state] : null;

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader
        title="Go/No-Go 上線決策面板"
        subtitle="上線準備清單與系統決策摘要"
        actions={
          verdict && verdictCfg ? (
            <span style={{
              background: verdictCfg.bg,
              color: verdictCfg.color,
              border: `1.5px solid ${verdictCfg.border}`,
              borderRadius: 999, padding: '6px 20px',
              fontSize: 16, fontWeight: 800, letterSpacing: '0.08em',
            }}>
              {verdictCfg.label}
            </span>
          ) : null
        }
      />

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {loading && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            載入中…
          </div>
        )}

        {error && (
          <Card style={{ padding: '20px 24px', borderColor: '#fecaca', background: '#fff5f5' }}>
            <p style={{ margin: 0, color: '#991b1b', fontWeight: 600 }}>{error}</p>
          </Card>
        )}

        {/* ── Block 1: 上線準備清單 ── */}
        {data && (
          <Card>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>
                上線準備清單
              </h2>
            </div>
            <div style={{ padding: '12px 20px' }}>
              {data.readiness.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    padding: '12px 0', borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <ReadinessStatusPill status={item.status} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{translateReadinessLabel(item)}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{translateReadinessNote(item)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                    負責：{translateOwner(item.owner)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Block 2: 核心指標 ── */}
        {data && (
          <Card>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>
                核心指標 <span style={{ fontWeight: 400, fontSize: 12, color: '#9ca3af' }}>（最近 7 天）</span>
              </h2>
            </div>
            <div style={{
              padding: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 16,
            }}>
              {[
                { label: '健康訂單率', value: `${data.metrics.healthyOrderRate}%`, alert: data.metrics.healthyOrderRate < 80 },
                { label: '例外率', value: `${data.metrics.exceptionRate}%`, alert: data.metrics.exceptionRate > 5 },
                { label: '待退款數', value: String(data.metrics.pendingRefunds), alert: data.metrics.pendingRefunds > 10 },
                { label: '已付款／已確認比率', value: `${data.metrics.paidConfirmedRatio}%`, alert: false },
                { label: '24 小時事件數', value: String(data.metrics.incidents24h), alert: data.metrics.incidents24h > 0 },
              ].map((m) => (
                <div
                  key={m.label}
                  style={{
                    background: m.alert ? '#fff5f5' : '#f9fafb',
                    borderRadius: 10, padding: '14px 16px',
                    border: `1px solid ${m.alert ? '#fecaca' : '#e5e7eb'}`,
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 800, color: m.alert ? '#991b1b' : '#111' }}>
                    {m.value}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Block 3: 今日決策 ── */}
        {data && verdict && verdictCfg && (
          <Card style={{ borderColor: verdictCfg.border }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>
                {"今日決策"}
              </h2>
              <span style={{
                background: verdictCfg.bg,
                color: verdictCfg.color,
                border: `1.5px solid ${verdictCfg.border}`,
                borderRadius: 999, padding: '4px 18px',
                fontSize: 15, fontWeight: 800, letterSpacing: '0.06em',
              }}>
                {verdictCfg.label}
              </span>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151', fontWeight: 500 }}>
                {translateVerdictReason(verdict.reason)}
              </p>
              <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <span>計算時間：{new Date(verdict.computedAt).toLocaleString()}</span>
                <span>部署 SHA： <code style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{verdict.deploySha.slice(0, 8)}</code></span>
              </div>
            </div>
          </Card>
        )}

        {/* ── Block 4: 建議處置 ── */}
        {data && (
          <Card>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>
                建議處置
              </h2>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {data.recommendedActions.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>✅</span>
                  <span style={{ fontSize: 14, color: '#166534', fontWeight: 500 }}>
                    目前不需處置，系統健康且可準備上線。
                  </span>
                </div>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.recommendedActions.map((action, i) => (
                    <li key={i}>
                      <a
                        href={action.href}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          color: 'var(--tp-primary)', fontWeight: 600, fontSize: 14,
                          textDecoration: 'none',
                        }}
                      >
                        <span>→</span>
                        {translateActionLabel(action.label)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}
