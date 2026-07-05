'use client';

/**
 * Issue #1591 / #1594 — checkout「加購＋點數折抵」整合區塊。
 * 從 booking 頁抽出：擁有加購/點數的互動狀態，渲染兩個選購器，並把
 * 「顯示用」金額（加購小計、實際折抵、選擇）回報給頁面（server 下單時以 DB 快照重算為準）。
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckoutAddonPicker } from './CheckoutAddonPicker';
import { CheckoutPointsRedeem } from './CheckoutPointsRedeem';

export interface CheckoutExtrasValue {
  addonSelections: Array<{ addonId: string; quantity: number }>;
  redeemPoints: number;
  addonTotal: number;
  effectiveDiscount: number;
}

export function CheckoutExtrasSection({
  activityId,
  peopleCount,
  baseTotal,
  onChange,
}: {
  activityId: string;
  peopleCount: number;
  baseTotal: number;
  onChange: (v: CheckoutExtrasValue) => void;
}) {
  const [addonSelections, setAddonSelections] = useState<Array<{ addonId: string; quantity: number }>>([]);
  const [addonTotal, setAddonTotal] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [redeemDiscount, setRedeemDiscount] = useState(0);

  const grandTotal = baseTotal + addonTotal;
  const effectiveDiscount = Math.min(redeemDiscount, grandTotal);

  useEffect(() => {
    onChange({ addonSelections, redeemPoints, addonTotal, effectiveDiscount });
  }, [addonSelections, redeemPoints, addonTotal, effectiveDiscount, onChange]);

  const handleAddonsChange = useCallback((sels: Array<{ addonId: string; quantity: number }>, total: number) => {
    setAddonSelections(sels);
    setAddonTotal(total);
  }, []);
  const handleRedeemChange = useCallback((points: number, discount: number) => {
    setRedeemPoints(points);
    setRedeemDiscount(discount);
  }, []);

  return (
    <>
      {/* 加購選購（無啟用加購項時整塊不顯示） */}
      {activityId && (
        <CheckoutAddonPicker activityId={activityId} peopleCount={peopleCount} onChange={handleAddonsChange} />
      )}
      {/* 點數折抵（未登入或無餘額時整塊不顯示） */}
      <CheckoutPointsRedeem orderTwd={grandTotal} onChange={handleRedeemChange} />
    </>
  );
}
