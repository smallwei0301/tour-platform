-- Issue #1796: restore the expiry RPC's function-level search_path after its
-- variable-conflict repair replaced the function definition.
ALTER FUNCTION public.fn_expire_unpaid_order_atomic(uuid, timestamptz)
  SET search_path = pg_catalog, public, pg_temp;

-- Rollback (forward-only migration): if a later, reviewed migration must remove
-- this contract, run ALTER FUNCTION public.fn_expire_unpaid_order_atomic(uuid, timestamptz)
-- RESET search_path; do not edit this closed migration.
