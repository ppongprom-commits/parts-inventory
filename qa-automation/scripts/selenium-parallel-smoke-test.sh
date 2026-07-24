#!/bin/bash
# Selenium Grid parallel smoke test — ยิงหลาย session พร้อมกันไปที่หน้าต่างๆ ของแอป
# แล้วยืนยันว่า Grid รับ session พร้อมกันได้จริงตามจำนวน worker ที่ตั้งไว้ (ไม่ใช่รันเรียงต่อคิว)
#
# ใช้ตอน setup/ปรับ SE_NODE_MAX_SESSIONS ของ container selenium-chrome (ดู README.md
# หัวข้อ Selenium/Docker) — สคริปต์นี้ไม่ได้แทนที่ Playwright suite หลัก (tests/) ใช้แค่เช็คว่า
# Selenium Grid เองพร้อมรับโหลดตามจำนวน worker ที่คาดไว้ก่อนเอาไปใช้งานจริง
#
# ตัวแปรแวดล้อมปรับได้:
#   GRID_URL      ค่าเริ่มต้น http://localhost:4444
#   BASE_URL      ค่าเริ่มต้น https://parts-inventory-staging.vercel.app
#
# ตัวอย่าง: GRID_URL=http://192.168.64.3:4444 bash selenium-parallel-smoke-test.sh

set -uo pipefail

GRID="${GRID_URL:-http://localhost:4444}"
BASE="${BASE_URL:-https://parts-inventory-staging.vercel.app}"

declare -a PATHS=("/login" "/staff-login" "/signup" "/legal/tos" "/legal/privacy" "/legal/dpp")
declare -a LABELS=("worker1-login" "worker2-staff-login" "worker3-signup" "worker4-tos" "worker5-privacy" "worker6-dpp")

run_one() {
  local idx=$1
  local path=${PATHS[$idx]}
  local label=${LABELS[$idx]}
  local t0
  t0=$(date +%s.%N)

  SESSION=$(curl -s -X POST "$GRID/session" \
    -H "Content-Type: application/json" \
    -d '{"capabilities":{"alwaysMatch":{"browserName":"chrome"}}}' \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['value']['sessionId'])" 2>/dev/null)

  if [ -z "$SESSION" ]; then
    echo "[$label] FAIL: ไม่ได้ session id (Grid เต็ม/ไม่พร้อม?)"
    return 1
  fi

  curl -s -X POST "$GRID/session/$SESSION/url" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"$BASE$path\"}" > /dev/null

  sleep 1.5

  TITLE=$(curl -s "$GRID/session/$SESSION/title" | python3 -c "import json,sys; print(json.load(sys.stdin)['value'])" 2>/dev/null)
  SSLEN=$(curl -s "$GRID/session/$SESSION/screenshot" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['value']))" 2>/dev/null)

  curl -s -X DELETE "$GRID/session/$SESSION" > /dev/null

  local t1
  t1=$(date +%s.%N)
  local dur
  dur=$(python3 -c "print(f'{$t1-$t0:.2f}')")

  echo "[$label] session=$SESSION path=$path title=\"$TITLE\" screenshot_bytes=$SSLEN duration=${dur}s"
}

echo "=== Grid: $GRID | Target: $BASE ==="
echo "=== เริ่มยิง ${#PATHS[@]} session พร้อมกัน ==="
START=$(date +%s)
for i in "${!PATHS[@]}"; do
  run_one "$i" &
done

sleep 0.8
echo "--- grid status ระหว่างรัน (ควรเห็น busy slots เท่าจำนวน worker ที่ตั้งไว้) ---"
curl -s "$GRID/status" | python3 -c "
import json,sys
d = json.load(sys.stdin)['value']
for n in d['nodes']:
    busy = sum(1 for s in n.get('slots', []) if s.get('session'))
    print(f'busy slots: {busy} / {n[\"maxSessions\"]}')
"

wait
END=$(date +%s)
echo "=== เสร็จทั้งหมดใน $((END-START)) วินาที ==="
