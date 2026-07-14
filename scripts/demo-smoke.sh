#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

echo "[1/4] GET /api/experiences"
curl -sS "$BASE_URL/api/experiences" | tee /tmp/tour-experiences.json

echo "[2/4] POST /api/orders"
ORDER_JSON=$(curl -sS -X POST "$BASE_URL/api/orders" \
  -H 'content-type: application/json' \
  -d '{"experienceSlug":"chaishan-cave-tour"}')
echo "$ORDER_JSON" | tee /tmp/tour-order.json

ORDER_ID=$(echo "$ORDER_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(j.data?.id||'');}catch{process.stdout.write('')}})")
if [[ -z "$ORDER_ID" ]]; then
  echo "[ERROR] 無法取得 orderId"
  exit 1
fi

echo "[3/4] POST /api/payments/ecpay/callback orderId=$ORDER_ID"
curl -sS -X POST "$BASE_URL/api/payments/ecpay/callback" \
  -H 'content-type: application/json' \
  -d "{\"orderId\":\"$ORDER_ID\"}" | tee /tmp/tour-callback.json

echo "[4/4] GET /api/v2/admin/orders"
curl -sS "$BASE_URL/api/v2/admin/orders" | tee /tmp/tour-admin-orders.json

echo "✅ Demo smoke 完成"
