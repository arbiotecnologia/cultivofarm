#!/usr/bin/env bash
# Disposable PG17. Synthetic minimal schema (declared seam): only the columns the guard reads.
# Not JWT/RLS/PostgREST proof; real writers are NOT loaded here.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd); W=$(mktemp -d /tmp/ccr.XXXX); PORT=55481
initdb -D "$W/db" -U postgres -A trust >/dev/null
pg_ctl -D "$W/db" -o "-p $PORT -k $W" -l "$W/log" -w start >/dev/null
trap 'pg_ctl -D "$W/db" -m fast stop >/dev/null' EXIT
P="psql -h $W -p $PORT -U postgres -v ON_ERROR_STOP=1 -qAt"
$P <<'SQL'
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA platform_private;
CREATE TABLE public.partner_accounts(id uuid primary key, commercial_owner_organization_id uuid);
CREATE TABLE public.partner_orders(id uuid primary key, partner_id uuid, payment_plan_id uuid);
CREATE TABLE platform_private.b2b_condition_versions(organization_id uuid, plan_id uuid, version int, method text, configuration_approved bool);
CREATE TABLE platform_private.b2b_condition_retirements(organization_id uuid, plan_id uuid, version int, method text);
CREATE TABLE platform_private.b2b_order_condition_snapshots(order_id uuid);
CREATE TABLE platform_private.b2b_order_condition_quote_snapshots(order_id uuid);
INSERT INTO public.partner_accounts VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000f');
INSERT INTO platform_private.b2b_condition_versions VALUES ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1',1,'boleto',true),
  ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c2',1,'boleto',false),
  ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c3',1,'boleto',true);
INSERT INTO platform_private.b2b_condition_retirements VALUES ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c3',1,'boleto');
-- pre-existing legacy order on configured plan (like PB-001038) must survive install
INSERT INTO public.partner_orders VALUES ('00000000-0000-0000-0000-000000000038','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1');
SQL
$P -f "$D/81-condition-required-install.sql.review"
$P -f "$D/82-condition-required-post.sql.readonly"
pass=0; fail(){ echo "FAIL $1"; exit 1; }; ok(){ echo "PASS $1"; pass=$((pass+1)); }
deny(){ if $P -c "$2" 2>"$W/e"; then fail "$1"; else grep -q payment_condition_contract_required "$W/e" && ok "$1" || { cat "$W/e"; fail "$1"; }; fi; }
allow(){ $P -c "$2" && ok "$1" || fail "$1"; }
deny  "legacy_on_configured_plan_denied" "INSERT INTO partner_orders VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1')"
allow "condition_writer_with_snapshot_allowed" "BEGIN; INSERT INTO partner_orders VALUES ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1'); INSERT INTO platform_private.b2b_order_condition_snapshots VALUES ('00000000-0000-0000-0000-000000000101'); COMMIT;"
allow "quote_snapshot_allowed" "BEGIN; INSERT INTO partner_orders VALUES ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1'); INSERT INTO platform_private.b2b_order_condition_quote_snapshots VALUES ('00000000-0000-0000-0000-000000000102'); COMMIT;"
allow "unapproved_version_legacy_allowed" "INSERT INTO partner_orders VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c2')"
allow "retired_version_legacy_allowed" "INSERT INTO partner_orders VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c3')"
allow "other_seller_unconfigured_allowed" "INSERT INTO partner_orders VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1')"
allow "null_plan_allowed" "INSERT INTO partner_orders VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000a1',NULL)"
deny  "update_cannot_launder_insert" "BEGIN; INSERT INTO partner_orders VALUES ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c2'); UPDATE partner_orders SET payment_plan_id='00000000-0000-0000-0000-0000000000c1' WHERE id='00000000-0000-0000-0000-000000000103'; COMMIT;"
[ "$($P -c "SELECT count(*) FROM partner_orders WHERE id='00000000-0000-0000-0000-000000000038'")" = 1 ] && ok "historical_order_preserved" || fail historical
$P -c "UPDATE partner_orders SET payment_plan_id=payment_plan_id WHERE id='00000000-0000-0000-0000-000000000038'" && ok "historical_update_not_blocked" || fail hist_upd
[ "$($P -c "SELECT has_function_privilege('authenticated','platform_private.b2b_condition_contract_required_guard()','EXECUTE')::text||has_function_privilege('anon','platform_private.b2b_condition_contract_required_guard()','EXECUTE')::text")" = falsefalse ] && ok "no_client_execute" || fail acl
if $P -f "$D/81-condition-required-install.sql.review" 2>"$W/e"; then fail rerun; else grep -q CCR_PRE_ALREADY_INSTALLED "$W/e" && ok "rerun_aborts" || fail rerun; fi
$P -f "$D/96-condition-required-rollback.sql.review"
allow "rollback_restores_legacy" "INSERT INTO partner_orders VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1')"
$P -f "$D/81-condition-required-install.sql.review" && $P -f "$D/82-condition-required-post.sql.readonly" && ok "reinstall_after_rollback" || fail reinstall
echo "RESULT PASS $pass $( $P -c 'show server_version' )"
