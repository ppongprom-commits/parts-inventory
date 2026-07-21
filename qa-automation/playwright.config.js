import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

const STAGING_BASE_URL = process.env.STAGING_BASE_URL;

if (!STAGING_BASE_URL) {
  // ไม่ throw ตรงนี้เพราะบางคำสั่ง (เช่น --list) ไม่จำเป็นต้องมี env จริง
  console.warn(
    "[playwright.config] ⚠️  STAGING_BASE_URL ยังไม่ถูกตั้งค่า — คัดลอก .env.example เป็น .env แล้วกรอกค่าก่อนรันจริง"
  );
}

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // ปิด parallel เพราะหลาย test แชร์ shop/staff account เดียวกัน อาจชน state กัน
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/results.json" }],
    ["html", { outputFolder: "test-results/html-report", open: "never" }],
  ],
  use: {
    baseURL: STAGING_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
