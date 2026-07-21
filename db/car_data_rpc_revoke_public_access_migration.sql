-- car_data_rpc_revoke_public_access_migration.sql
-- Applied directly via Supabase MCP on 2026-07-20 to BOTH staging (qmqabtrrubqcmafietsr)
-- and production/beta (ktfnnmxrochfcjzifjlw) — this file documents that change for git history.
--
-- CONTEXT: /api/car-generations/route.js had zero authentication checks, and these 6
-- functions granted EXECUTE to `anon`/`authenticated` (staging) or `PUBLIC` (production),
-- meaning anyone with the endpoint URL (or the Supabase REST RPC endpoint directly) could
-- insert/update shared car brand/model/generation/trim reference data with no login at all.
--
-- FIX: revoke public/anon/authenticated EXECUTE so only `service_role` (used server-side via
-- lib/supabaseAdminClient.js) can call these. The API route now authenticates the caller via
-- verifyCaller() + checks they're an owner/manager of at least one shop before calling
-- supabaseAdmin.rpc(...) — see app/api/car-generations/route.js.
--
-- Idempotent: REVOKE is a no-op if the grant doesn't exist, safe to re-run.

REVOKE EXECUTE ON FUNCTION public.get_or_create_brand(text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_or_create_model(bigint, text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.insert_model_generation(
  bigint, text, text, smallint, boolean, smallint, boolean, boolean, text, inet, text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.update_model_generation(
  bigint, text, text, smallint, boolean, smallint, boolean, boolean, text, inet, text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.insert_model_trim(bigint, text, text, text, inet, text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.update_model_trim(bigint, text, text, text, inet, text)
  FROM PUBLIC, anon, authenticated;

-- Verification query (run after applying, on either project):
--
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('insert_model_generation','update_model_generation',
--                        'insert_model_trim','update_model_trim',
--                        'get_or_create_brand','get_or_create_model')
-- ORDER BY routine_name, grantee;
--
-- Expected result: only `postgres` and `service_role` remain as grantees.
