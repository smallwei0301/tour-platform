'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createRefundRequest, fetchMyOrderDetail, fetchRefundRequests } from '../../../src/lib/client-api'";

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [order, setOrder] = useState<any>(null);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [refundApplied, setRefundApplied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchMyOrderDetail(orderId), fetchRefundRequests(orderId).catch(() => [])])
      .then(([detail, refundRows]) => {
        setOrder(detail);
        setRefunds(Array.isArray(refundRows) ? refundRows : []);
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  async function handleApplyRefund() {
    try {
      setSubmittingRefund(true);
      setError('');
      const created = await createRefundRequest({
        orderId,
        reason: 'user_request',
        note: '由旅客發起取消申請'
      });
      setRefundApplied(true);
      setRefunds((prev) => [created, ...prev]);
      setOrder((prev: any) => ({ ...prev, status: 'refund_pending' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '退款申請失敗');
    } finally {
      setSubmittingRefund(false);
    }
  }

  if (loading) {
    return <main className="tp-container tp-order-detail-page"><p>載入中…</p></main>;
  }

  if (!order) {
    return <main className="tp-container tp-order-detail-page"><p>找不到訂單。</p></main>;
  }

  const scheduleText = order.scheduleStartAt ? new Date(order.scheduleStartAt).toLocaleString('zh-TW') : '—';
  const latestRefund = refunds[0] || null;

  return (
    <main className="tp-container tp-order-detail-page">
      <Link className="tp-link" href="/orders">← 返回訂單列表</Link>
      <h1>訂單 #{order.id}</h1>
      <p className="tp-status tp-status-upcoming">{order.status}</p>

      <section className="tp-step-card">
        <h2>行程資訊</h2>
        <p>{order.title || order.experienceSlug}</p>
        <p>📅 {scheduleText}</p>
        <p>👥 人數：{order.peopleCount || 1}</p>
        <p>👤 聯絡人：{order.contactName || '—'}（{order.contactPhone || '—'}）</p>
      </section>

      <section className="tp-step-card">
        <h2>費用明細</h2>
        <strong>總計：NT${Number(order.totalTwd || 0).toLocaleString()}</strong>
        <p>付款狀態：{order.status}</p>
      </section>

      <section className="tp-step-card">
        <h2>取消 / 退款</h2>
        <p>取消與退款依行程規則辦理。</p>
        <button className="tp-btn tp-btn-ghost" onClick={handleApplyRefund} disabled={submittingRefund || !!latestRefund}>
          {latestRefund ? '已送出退款申請' : submittingRefund ? '送出中…' : '申請取消'}
        </button>

        {error && <p style={{ color: '#b42318', fontSize: 14 }}>⚠️ {error}</p>}

        {(refundApplied || latestRefund) && (
          <div className="tp-refund-track">
            <h3>退款進度追蹤</h3>
            <div className="tp-refund-steps">
              <span className="done">申請提交</span>
              <span className="active">審核中</span>
              <span>退款處理</span>
              <span>到帳</span>
            </div>
            <p>
              申請時間：{latestRefund?.requestedAt ? new Date(latestRefund.requestedAt).toLocaleString('zh-TW') : '剛剛'}
              <br />
              狀態：{latestRefund?.status || 'requested'}
            </p>
          </div>
        )}
      </section>

      <button className="tp-btn tp-btn-danger">🚨 緊急聯繫</button>
    </main>
  );
}
