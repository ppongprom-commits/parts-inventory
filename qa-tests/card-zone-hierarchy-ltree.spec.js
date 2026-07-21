// Card: "Area/Rack/Level location hierarchy (ltree)" (Priority: Highest, Notion status: "Not started")
//
// Scope this run actually touched (see db/zone_hierarchy_ltree_migration.sql header for the full
// schema-drift-export writeup — parent_id/path/ltree extension/triggers/unique-code-per-parent index
// were already live on staging from a previous session and are now captured in a migration file;
// the new pieces added THIS run are (a) a parent-shop-isolation trigger, verified directly against
// staging via Supabase MCP SQL — not re-tested here since it's DB-only, no UI surface — and (b) the
// quantity>0 fix below):
//
// Defect found while cross-checking app/admin/zones/page.js's delete-block against the card's own
// decision #3 ("Block ห้ามลบ... นับเฉพาะอะไหล่ที่ quantity > 0 เท่านั้น — ของที่ขายหมดแล้ว/historical
// record ไม่นับเป็นตัวบล็อก"): the pre-existing check queried `parts` by zone_id with NO quantity
// filter, so a zone whose only linked parts were already sold out (quantity = 0) would still be
// incorrectly blocked from deletion. Fixed by adding `.gt("quantity", 0)` to that query.
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const AREA_ID = "aaaaaaaa-1111-0000-0000-000000000001";
const RACK_ID = "aaaaaaaa-1111-0000-0000-000000000002";

function zoneRow(overrides = {}) {
  return { id: AREA_ID, shop_id: SHOP_ID, parent_id: null, code: "A1", name: "โกดังหน้า", owner_type: "own", ...overrides };
}

async function mockZonesAdminRoutes(page, { zones, partsForZone = [], deleteCapture = null }) {
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url.includes("/rest/v1/zones")) {
      if (method === "DELETE") {
        if (deleteCapture) deleteCapture.push(url);
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      // both the main zone list fetch AND the delete-block "children of this zone" check hit
      // this same endpoint shape (?parent_id=eq.<id>) — return zones whose OWN parent_id matches
      // whichever id is being queried for (i.e. "who are the children of <id>"):
      if (url.includes("parent_id=eq.")) {
        const match = zones.filter((z) => z.parent_id && url.includes(`parent_id=eq.${z.parent_id}`));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(match) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(zones) });
    }
    if (url.includes("/rest/v1/parts") && url.includes("zone_id=eq.")) {
      // the fixed query now includes quantity=gt.0 — assert it's actually sent, then answer
      // according to what the test scenario wants "really" in stock
      const wantsPositiveQtyOnly = url.includes("quantity=gt.0");
      const body = wantsPositiveQtyOnly ? partsForZone.filter((p) => (p.quantity ?? 0) > 0) : partsForZone;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    return route.fallback();
  });
}

test.describe("Zone delete-block on /admin/zones", () => {
  test("zone whose only linked part is sold out (quantity=0) is NOT blocked from deletion", async ({ page }) => {
    const deleteCapture = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockZonesAdminRoutes(page, {
      zones: [zoneRow()],
      partsForZone: [{ id: "part-sold-out", part_name: "โช้คอัพ (ขายหมดแล้ว)", quantity: 0 }],
      deleteCapture,
    });

    page.once("dialog", (dialog) => dialog.accept());

    await page.goto("/admin/zones");
    await expect(page.getByText("A1", { exact: false }).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "ลบ" }).first().click();

    await expect.poll(() => deleteCapture.length, { timeout: 5000 }).toBeGreaterThan(0);
    await expect(page.getByText("ลบแล้ว")).toBeVisible();
  });

  test("zone with an in-stock part (quantity > 0) IS blocked, and the message names the part", async ({ page }) => {
    const deleteCapture = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockZonesAdminRoutes(page, {
      zones: [zoneRow()],
      partsForZone: [{ id: "part-in-stock", part_name: "โช้คอัพ (ของจริงยังอยู่)", quantity: 3 }],
      deleteCapture,
    });

    await page.goto("/admin/zones");
    await expect(page.getByText("A1", { exact: false }).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "ลบ" }).first().click();

    await expect(page.getByText(/ยังมีของอยู่ข้างใน/)).toBeVisible();
    await expect(page.getByText(/โช้คอัพ \(ของจริงยังอยู่\)/)).toBeVisible();
    // must NOT have fired the actual delete
    expect(deleteCapture.length).toBe(0);
  });

  test("zone with a child zone (Rack under this Area) is blocked, listing the child", async ({ page }) => {
    const deleteCapture = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockZonesAdminRoutes(page, {
      zones: [zoneRow(), { id: RACK_ID, shop_id: SHOP_ID, parent_id: AREA_ID, code: "R1", name: null, owner_type: "own" }],
      partsForZone: [],
      deleteCapture,
    });

    await page.goto("/admin/zones");
    await expect(page.getByText("A1", { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // the top-level "ลบ" button belongs to Area A1 (first rendered node)
    await page.getByRole("button", { name: "ลบ" }).first().click();

    await expect(page.getByText(/ยังมีของอยู่ข้างใน/)).toBeVisible();
    await expect(page.getByText(/โซนย่อย: R1/)).toBeVisible();
    expect(deleteCapture.length).toBe(0);
  });
});
