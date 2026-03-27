'use client';

import { use } from 'react';
import { useState } from 'react';

export default function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const [refundApplied, setRefundApplied] = useState(false);

  return (
    <main className="tp-container tp-order-detail-page">
      <a className="tp-link" href="/orders">← 返回訂單列表</a>
      <h1>訂單 #{orderId}</h1>
      <p className="tp-status tp-status-upcoming">已確認</p>

      <section className="tp-step-card">
        <h2>行程資訊</h2>
        <p>大稻埕百年老街深度漫步</p>
        <p>📅 2026/04/01（三）  ⏰ 09:00 ~ 12:00</p>
        <p>📍 集合：捷運大橋頭站 2 號出口</p>
        <p>👤 導遊：陳建志</p>
      </section>

      <section className="tp-step-card">
        <h2>費用明細</h2>
        <p>成人 × 2：NT$3,000</p>
        <p>兒童 × 1：NT$800</p>
        <strong>總計：NT$3,800</strong>
        <p>付款方式：信用卡（****1234）</p>
      </section>

      <section className="tp-step-card">
        <h2>取消 / 退款</h2>
        <p>取消期限：2026/03/30 09:00 前（全額退款）</p>
        <button className="tp-btn tp-btn-ghost" onClick={() => setRefundApplied(true)}>申請取消</button>

        {refundApplied && (
          <div className="tp-refund-track">
            <h3>退款進度追蹤</h3>
            <div className="tp-refund-steps">
              <span className="done">申請提交</span>
              <span className="active">審核中</span>
              <span>退款處理</span>
              <span>到帳</span>
            </div>
            <p>已於 2026/03/29 14:00 提交，預計 3 個工作天內完成。</p>
          </div>
        )}
      </section>

      <button className="tp-btn tp-btn-danger">🚨 緊急聯繫</button>
    </main>
  );
}
