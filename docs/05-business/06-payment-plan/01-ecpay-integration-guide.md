# ECPay 綠界串接指南

> 最後更新：2026-04-20
> 狀態：已發布 v1（2026-05）

## 1. 目的
定義 Tour Platform 串接 ECPay 的最小必要流程，確保沙箱、正式環境、callback、退款與營運對帳都可追蹤。

## 2. 最小串接範圍
- 建立付款單
- 導向綠界付款頁
- callback 驗簽
- 更新訂單狀態
- 付款成功後通知旅客
- 退款流程可回溯

## 3. 上線前最小 checklist
- 已取得正式 MerchantID / HashKey / HashIV
- 已完成沙箱付款測試
- callback URL 已可公開存取
- 訂單狀態與金流狀態對應邏輯已確認
- 已定義退款與對帳流程

## 4. 風險點
- callback 驗簽錯誤
- 重複 callback 未做冪等
- 訂單金額與 ECPay 金額不一致
- 退款成功但平台狀態未同步

## 5. 環境區分
### 沙箱
- 用於完整付款流程測試
- 驗證 callback、訂單更新、通知、log

### 正式環境
- 僅在沙箱與小額真實交易驗證完成後開啟
- 所有正式金鑰只放在安全 env，不進 repo

## 6. 與其他文件的連動
- `03-settlement-rules.md`
- `04-refund-policy-detail.md`
- 客服 SOP
- incident response（若金流中斷或 callback 異常）

## 7. Go-Live 前待補
- 真實正式 Merchant 資訊表
- callback 驗簽實作對照表
- ECPay 退款 API 操作步驟
- 金流異常客服話術
