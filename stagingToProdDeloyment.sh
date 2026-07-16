#!/bin/bash
set -e

echo "=== ขั้นตอน Deploy staging -> production ==="
echo ""
echo "⚠️ ต้องรันคำสั่งนี้ในโฟลเดอร์ repo หลักที่มีทั้ง 2 branch (main + staging)"
echo "ถ้ายังไม่มี ให้ clone ใหม่: git clone https://github.com/ppongprom/parts-inventory.git"
echo ""
read -p "กด Enter เพื่อเริ่ม (Ctrl+C เพื่อยกเลิก)..."

git fetch origin
git checkout main
git pull origin main

echo ""
echo "[1/3] เอาไฟล์ทั้งหมดจาก staging มาทับ main..."
git checkout origin/staging -- .

echo ""
echo "[2/3] สร้าง commit..."
git add -A
git commit -m "Migrate production to full multi-tenant system (auth, jobs, customer portal, reports)"

echo ""
echo "[3/3] Push ขึ้น GitHub (Vercel จะ build อัตโนมัติ)..."
git push origin main

echo ""
echo "✅ Push เสร็จแล้ว — ไปดูสถานะ build ได้ที่ Vercel Dashboard -> parts-inventory project -> Deployments"