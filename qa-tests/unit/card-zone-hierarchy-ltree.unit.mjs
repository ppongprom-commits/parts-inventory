// Card: "Area/Rack/Level location hierarchy (ltree)" (Priority: Highest, Notion status: "Not started"
// — but see db/zone_hierarchy_ltree_migration.sql, most of this was schema drift already live on
// staging; this run exported it + added the missing parent-shop-isolation trigger + fixed the
// delete-block quantity>0 gap in app/admin/zones/page.js)
//
// Unit test of the REAL lib/zoneHelpers.js (imported directly, plain Node — no Playwright/network
// needed). These are the client-side mirrors of the DB-side `path <@` ltree relationship used by
// the parts-list zoneFilter (app/page.js) and the QR print "include all descendants" flow
// (ZoneTreeNode.js) — the DB-side path/cycle-prevention/unique-per-parent logic itself was verified
// directly against staging via Supabase MCP SQL (see migration file header notes), not here.
//
// Run: node qa-tests/unit/card-zone-hierarchy-ltree.unit.mjs
import {
  getChildren,
  isLeaf,
  getAncestorChain,
  formatBreadcrumb,
  formatBreadcrumbShort,
  getDescendantIds,
  getLeafZones,
  getSortedDescendants,
  getSortedZoneList,
} from "../../lib/zoneHelpers.js";

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log("  ok -", name);
  } else {
    failed++;
    console.log("  FAIL -", name);
  }
}

// Tree used across checks:
//   Area1 (A1)
//     Rack1 (R1)
//       Level1 (L1)
//       Level2 (L2)
//   Area2 (A2)                <- no children -> itself is a leaf
const AREA1 = { id: "area1", parent_id: null, code: "A1", name: "โกดังหน้า" };
const AREA2 = { id: "area2", parent_id: null, code: "A2", name: "โกดังหลัง" };
const RACK1 = { id: "rack1", parent_id: "area1", code: "R1", name: null };
const LEVEL1 = { id: "level1", parent_id: "rack1", code: "L1", name: null };
const LEVEL2 = { id: "level2", parent_id: "rack1", code: "L2", name: null };
const ZONES = [AREA1, AREA2, RACK1, LEVEL1, LEVEL2];

// 1. getChildren
check("getChildren(null) returns only root-level Areas, sorted by code", (() => {
  const kids = getChildren(ZONES, null);
  return kids.length === 2 && kids[0].code === "A1" && kids[1].code === "A2";
})());
check("getChildren(area1) returns Rack1 only", getChildren(ZONES, "area1").length === 1 && getChildren(ZONES, "area1")[0].id === "rack1");

// 2. isLeaf — the actual gate used to decide "can this zone be selected on /add /edit"
check("Area1 is NOT a leaf (has Rack1 under it) — matches dynamic-depth-per-branch decision", !isLeaf(ZONES, "area1"));
check("Area2 IS a leaf (no children at all) — a shop can have shallow branches", isLeaf(ZONES, "area2"));
check("Level1 IS a leaf (bottom of this branch)", isLeaf(ZONES, "level1"));
check("Rack1 is NOT a leaf (has Level1/Level2 under it)", !isLeaf(ZONES, "rack1"));

// 3. getAncestorChain / formatBreadcrumb
check("ancestor chain of Level1 is [Area1, Rack1, Level1] in that order", (() => {
  const chain = getAncestorChain(ZONES, "level1");
  return chain.map((z) => z.id).join(",") === "area1,rack1,level1";
})());
check('breadcrumb of Level1 is "A1 › R1 › L1"', formatBreadcrumb(ZONES, "level1") === "A1 › R1 › L1");
check('short breadcrumb (2 levels) of Level1 is "R1 › L1" (for label printing, limited space)', formatBreadcrumbShort(ZONES, "level1", 2) === "R1 › L1");
check("breadcrumb of a leaf Area (Area2) is just its own code", formatBreadcrumb(ZONES, "area2") === "A2");

// 4. getDescendantIds — this is the client-side equivalent of the DB `path <@ x` query used by
// app/page.js's zoneFilter ("select Area -> see rack/level inside too, not sibling Areas")
check("descendants of Area1 include itself + Rack1 + Level1 + Level2 (4 total)", (() => {
  const ids = getDescendantIds(ZONES, "area1").sort();
  return ids.join(",") === ["area1", "level1", "level2", "rack1"].join(",");
})());
check("descendants of Area1 do NOT include sibling Area2 (no cross-branch leakage)", !getDescendantIds(ZONES, "area1").includes("area2"));
check("descendants of a leaf (Level1) is just itself", getDescendantIds(ZONES, "level1").join(",") === "level1");

// 5. getLeafZones — used by ZoneAutocomplete as the full selectable set
check("getLeafZones returns exactly [Area2, Level1, Level2] (not Area1/Rack1, they have children)", (() => {
  const leafIds = getLeafZones(ZONES).map((z) => z.id).sort().join(",");
  return leafIds === ["area2", "level1", "level2"].join(",");
})());

// 6. getSortedDescendants — depth-first, self first, used for "print this zone's QR + all children's QR"
check("sorted descendants of Area1 is depth-first: [Area1, Rack1, Level1, Level2]", (() => {
  const ids = getSortedDescendants(ZONES, "area1").map((z) => z.id);
  return ids.join(",") === "area1,rack1,level1,level2";
})());

// 7. getSortedZoneList — full tree, used by the parts-list zoneFilter dropdown
check("getSortedZoneList never puts a child before its own parent", (() => {
  const list = getSortedZoneList(ZONES);
  const indexOf = (id) => list.findIndex((z) => z.id === id);
  return indexOf("area1") < indexOf("rack1") && indexOf("rack1") < indexOf("level1") && indexOf("rack1") < indexOf("level2");
})());
check("getSortedZoneList includes all 5 zones exactly once", getSortedZoneList(ZONES).length === 5);

console.log(`\n${passed} check(s) passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
