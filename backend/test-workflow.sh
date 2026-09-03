#!/usr/bin/env bash
set -e
BASE=http://localhost:4000/api

login() {
  curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
    -d "{\"identifier\":\"$1\",\"password\":\"Demo@1234\"}" | jq -r .token
}

echo "== Logging in =="
SA=$(login superadmin@fahifund.test)
ADMIN=$(login ahmed.shah@fahifund.test)
ALI=$(login ali.waheed@fahifund.test)
echo "Super Admin token: ${SA:0:20}..."
echo "Admin token: ${ADMIN:0:20}..."
echo "Ali token: ${ALI:0:20}..."
[ -z "$SA" ] && { echo "LOGIN FAILED"; exit 1; }

echo
echo "== Super Admin dashboard =="
curl -s $BASE/dashboard/super-admin -H "Authorization: Bearer $SA" | jq .

echo
echo "== List funds (Super Admin) =="
curl -s $BASE/funds -H "Authorization: Bearer $SA" | jq '.[] | {name: .fund.name, status: .fund.status, memberCount, currentMonth}'

FUND_A=$(curl -s $BASE/funds -H "Authorization: Bearer $SA" | jq -r '.[] | select(.fund.name=="Fahi Fund - Demo 2026") | .fund.id')
echo "Fund A id: $FUND_A"

echo
echo "== Fund A detail (as Ali, a member) =="
curl -s $BASE/funds/$FUND_A -H "Authorization: Bearer $ALI" | jq '{name: .fund.name, currentMonth, currentBeneficiary, viewerRole, memberCount}'

echo
echo "== Fund A month 3 summary before completing =="
curl -s $BASE/funds/$FUND_A/months/3 -H "Authorization: Bearer $ADMIN" | jq '{status, paidCount, pendingCount, expectedTotal, receivedTotal, beneficiary}'

echo
echo "== Ali submits month 3 payment =="
curl -s -X POST $BASE/funds/$FUND_A/payments -H "Authorization: Bearer $ALI" -H 'Content-Type: application/json' -d '{"referenceNumber":"TEST-ALI-M3"}' | jq '{status, paidCount, pendingCount}'

echo
echo "== Admin confirms Ali's payment =="
PAYMENT_ID=$(curl -s $BASE/funds/$FUND_A/months/3 -H "Authorization: Bearer $ADMIN" | jq -r '.payments[] | select(.member_id != null) | select(.status=="SENT" and .reference_number=="TEST-ALI-M3") | .id')
echo "Payment id: $PAYMENT_ID"
curl -s -X PATCH $BASE/funds/$FUND_A/payments/$PAYMENT_ID/verify -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"CONFIRM"}' | jq '{status, paidCount, pendingCount}'

echo
echo "== Admin confirms own (Ahmed) pending month 3 payment =="
AHMED_PAYMENT_ID=$(curl -s $BASE/funds/$FUND_A/months/3 -H "Authorization: Bearer $ADMIN" | jq -r '.payments[] | select(.status=="SENT") | .id')
echo "Ahmed payment id: $AHMED_PAYMENT_ID"
curl -s -X PATCH $BASE/funds/$FUND_A/payments/$AHMED_PAYMENT_ID/verify -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"CONFIRM"}' | jq '{status, paidCount, pendingCount, payout}'

echo
echo "== Admin completes month 3 payout =="
curl -s -X POST $BASE/funds/$FUND_A/payouts/3/complete -H "Authorization: Bearer $ADMIN" -F "payoutDate=2026-09-01" -F "referenceNumber=TXN-TEST-0003" | jq '{status, payout}'

echo
echo "== Fund A current month after payout (should now be month 4) =="
curl -s $BASE/funds/$FUND_A -H "Authorization: Bearer $ADMIN" | jq '{currentMonth, currentBeneficiary, monthsCompleted}'

echo
echo "== Fund B: complete a payout using the pre-seeded READY month =="
FUND_B=$(curl -s $BASE/funds -H "Authorization: Bearer $SA" | jq -r '.[] | select(.fund.name=="Fahi Fund - Family Circle") | .fund.id')
curl -s -X POST $BASE/funds/$FUND_B/payouts/1/complete -H "Authorization: Bearer $ALI" -F "payoutDate=2026-09-01" -F "referenceNumber=TXN-B-0001" | jq '{status, payout}'

echo
echo "== Fund C: run and lock the Fortune Wheel live =="
FUND_C=$(curl -s $BASE/funds -H "Authorization: Bearer $SA" | jq -r '.[] | select(.fund.name=="Fahi Fund - Office Group") | .fund.id')
curl -s -X POST $BASE/funds/$FUND_C/fortune-wheel/generate -H "Authorization: Bearer $SA" | jq '.order | map({position, name})'
curl -s -X POST $BASE/funds/$FUND_C/fortune-wheel/lock -H "Authorization: Bearer $SA" | jq '{status: .fund.status, fortuneLockedAt: .fund.fortuneLockedAt}'

echo
echo "== Reports: fund report CSV (Super Admin) =="
curl -s "$BASE/reports/funds?format=csv" -H "Authorization: Bearer $SA"

echo
echo
echo "== Audit logs (last 5) =="
curl -s "$BASE/audit-logs" -H "Authorization: Bearer $SA" | jq '.[0:5] | map({action, description})'

echo
echo "== Permission check: Ali (USER) cannot access audit logs =="
curl -s -o /dev/null -w "status=%{http_code}\n" "$BASE/audit-logs" -H "Authorization: Bearer $ALI"

echo
echo "== Permission check: Ali cannot lock fortune wheel =="
curl -s -o /dev/null -w "status=%{http_code}\n" -X POST "$BASE/funds/$FUND_A/fortune-wheel/lock" -H "Authorization: Bearer $ALI"

echo
echo "ALL WORKFLOW CHECKS DONE"
