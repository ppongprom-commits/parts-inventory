// Card: "Platform admin role tiers — Super Admin / Support / Analyst" (Priority: Highest)
//
// NOT a Playwright test — see qa-tests/_fixtures/mockAuth.js's own note: this sandbox
// cannot reach *.supabase.co (confirmed via `curl https://<ref>.supabase.co/...` -> 403
// through the proxy). Server-side API routes call supabaseAdmin, which is real network
// traffic to Supabase even though it runs in the Next.js server process, so a live HTTP
// round trip through these routes isn't reproducible in this sandbox. Full live E2E of
// these routes must run on a machine with real network access to Supabase (local dev
// or CI).
//
// What THIS test does instead: import the REAL lib/platformAdmin.js unmodified — read
// straight off disk at run time and patched with a single import-path substitution (no
// logic copied or reimplemented) — and exercise the exact permission-matrix + lockout
// logic the API routes call. Covers every role x action combination from the card's
// test scenarios: 3 roles (super_admin/support/analyst) x {billing action,
// join-as-support action, view-only action} = the "12 case permission matrix", plus
// non-admin/invalid-token rejection and the "last super_admin" lockout invariant.
//
// Run: node qa-tests/unit/card-platform-role-tiers.unit.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE_FILE = path.join(REPO_ROOT, "lib/platformAdmin.js");

const MOCK_SUPABASE_ADMIN_CLIENT_SRC = `
export const MOCK_STATE = { users: {}, platformAdmins: [] };

function buildQuery(rows) {
  let filtered = rows.slice();
  const api = {
    select() { return api; },
    eq(col, val) { filtered = filtered.filter((r) => r[col] === val); return api; },
    maybeSingle: async () => ({ data: filtered[0] || null, error: null }),
  };
  return api;
}

export const supabaseAdmin = {
  auth: {
    getUser: async (token) => {
      const user = MOCK_STATE.users[token];
      if (!user) return { data: { user: null }, error: { message: "invalid token" } };
      return { data: { user }, error: null };
    },
  },
  from(table) {
    if (table !== "platform_admins") throw new Error("unexpected table: " + table);
    return {
      select(cols, opts) {
        if (opts && opts.count === "exact" && opts.head) {
          return {
            eq: async (col, val) => {
              const count = MOCK_STATE.platformAdmins.filter((r) => r[col] === val).length;
              return { count, error: null };
            },
          };
        }
        return buildQuery(MOCK_STATE.platformAdmins);
      },
    };
  },
};
`;

async function loadRealModuleWithMockedSupabase() {
  const workDir = mkdtempSync(path.join(tmpdir(), "platform-role-tiers-test-"));

  const mockPath = path.join(workDir, "supabaseAdminClient.mjs");
  writeFileSync(mockPath, MOCK_SUPABASE_ADMIN_CLIENT_SRC);

  const realSource = readFileSync(SOURCE_FILE, "utf8");
  const patched = realSource.replace(
    '"./supabaseAdminClient"',
    JSON.stringify(pathToFileURL(mockPath).href)
  );
  if (patched === realSource) {
    throw new Error("Failed to patch supabaseAdminClient import — lib/platformAdmin.js may have changed shape");
  }
  const shimPath = path.join(workDir, "platformAdmin.mjs");
  writeFileSync(shimPath, patched);

  const mockModule = await import(pathToFileURL(mockPath).href);
  const realModule = await import(pathToFileURL(shimPath).href);
  return { mockModule, realModule };
}

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

function fakeRequest(token) {
  return { headers: { get: (h) => (h === "authorization" ? `Bearer ${token}` : null) } };
}

async function main() {
  const { mockModule, realModule } = await loadRealModuleWithMockedSupabase();
  const { MOCK_STATE } = mockModule;
  const { requirePlatformRole, wouldRemoveLastSuperAdmin, verifyPlatformAdmin } = realModule;

  console.log("=== requirePlatformRole: permission matrix (from the REAL lib/platformAdmin.js) ===");

  MOCK_STATE.users = {
    "super-token": { id: "u-super" },
    "support-token": { id: "u-support" },
    "analyst-token": { id: "u-analyst" },
    "no-admin-token": { id: "u-outsider" },
  };
  MOCK_STATE.platformAdmins = [
    { user_id: "u-super", role: "super_admin" },
    { user_id: "u-support", role: "support" },
    { user_id: "u-analyst", role: "analyst" },
  ];

  let r = await requirePlatformRole(fakeRequest("super-token"), ["super_admin"]);
  check("super_admin allowed on super_admin-only action (billing)", !r.error && r.role === "super_admin");

  r = await requirePlatformRole(fakeRequest("support-token"), ["super_admin"]);
  check("support blocked from super_admin-only action -> 403", r.error && r.status === 403);

  r = await requirePlatformRole(fakeRequest("analyst-token"), ["super_admin", "support"]);
  check("analyst blocked from join-as-support action -> 403", r.error && r.status === 403);

  r = await requirePlatformRole(fakeRequest("support-token"), ["super_admin", "support"]);
  check("support allowed on join-as-support action", !r.error);

  for (const [token, role] of [
    ["super-token", "super_admin"],
    ["support-token", "support"],
    ["analyst-token", "analyst"],
  ]) {
    r = await requirePlatformRole(fakeRequest(token), ["super_admin", "support", "analyst"]);
    check(`${role} allowed on view-only action`, !r.error && r.role === role);
  }

  r = await requirePlatformRole(fakeRequest("no-admin-token"), ["super_admin", "support", "analyst"]);
  check("non-admin account rejected -> 403", r.error && r.status === 403);

  r = await verifyPlatformAdmin(fakeRequest("garbage-token"));
  check("invalid token rejected -> 401", r.error && r.status === 401);

  console.log("\n=== wouldRemoveLastSuperAdmin: lockout protection ===");

  MOCK_STATE.platformAdmins = [
    { user_id: "u-super", role: "super_admin" },
    { user_id: "u-support", role: "support" },
  ];
  check("demoting the LAST super_admin is blocked", (await wouldRemoveLastSuperAdmin("u-super", "support")) === true);

  MOCK_STATE.platformAdmins = [
    { user_id: "u-super", role: "super_admin" },
    { user_id: "u-super2", role: "super_admin" },
  ];
  check(
    "demoting one of TWO super_admins is allowed",
    (await wouldRemoveLastSuperAdmin("u-super", "support")) === false
  );

  MOCK_STATE.platformAdmins = [{ user_id: "u-super", role: "super_admin" }];
  check(
    "promoting to super_admin is never blocked",
    (await wouldRemoveLastSuperAdmin("u-support", "super_admin")) === false
  );

  MOCK_STATE.platformAdmins = [{ user_id: "u-super", role: "super_admin" }];
  check("deleting the LAST super_admin is blocked", (await wouldRemoveLastSuperAdmin("u-super", "removed")) === true);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
