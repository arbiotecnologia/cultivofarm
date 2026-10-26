#!/usr/bin/env bash
# Prova sintética em PostgreSQL descartável — nunca hosted. Auth simulada via GUC.
# v3 (revisão SQL 5db): executa o ciclo COMPLETO preflight -> candidate -> postflight
# -> rollback. O stub não reproduz os hashes hosted de has_role/policies; as variantes
# *-stub.sql recebem os pins recalculados do stub (prova da MECÂNICA fail-closed).
# Os arquivos de revisão mantêm os pins hosted reais.
set -euo pipefail
if [ "$(id -u)" = "0" ]; then exec setpriv --reuid=1000 --regid=1000 --clear-groups bash "$0" "$@"; fi
DIR=/tmp/pg-c2admin
PKG="$(cd "$(dirname "$0")" && pwd)"
pkill -f "postgres -D $DIR/data" 2>/dev/null || true
for i in $(seq 1 25); do pgrep -f "postgres -D $DIR/data" >/dev/null 2>&1 || break; sleep 0.2; done
rm -rf "$DIR/data" "$DIR/socket"; mkdir -p "$DIR/socket"
initdb -D "$DIR/data" -U postgres --auth=trust >/dev/null
postgres -D "$DIR/data" -k "$DIR/socket" -p 55444 -c listen_addresses='' &
PGPID=$!
trap 'kill $PGPID 2>/dev/null || true' EXIT
for i in $(seq 1 50); do pg_isready -h "$DIR/socket" -p 55444 -q && break; sleep 0.2; done

psql -h "$DIR/socket" -p 55444 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
-- Stubs mínimos (schema reduzido; não é prova do schema real)
CREATE SCHEMA auth;
CREATE SCHEMA platform_private;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','financeiro','gestor');
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.organizations (id uuid PRIMARY KEY, ativo boolean, status text);
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean);
CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
CREATE OR REPLACE FUNCTION platform_private.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE TABLE public.partner_accounts (id uuid PRIMARY KEY, razao_social text, ativo boolean, deleted_at timestamptz, commercial_owner_organization_id uuid);
CREATE TYPE public.partner_order_status AS ENUM ('em_analise_comercial','aprovado','aguardando_aprovacao_credito');
CREATE TABLE public.partner_orders (id uuid PRIMARY KEY, numero text, status public.partner_order_status, total numeric, created_at timestamptz, requested_delivery_date date, estimated_delivery_date date, partner_id uuid, c2_external_origin_snapshot jsonb);
-- Roles de banco para ACL
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ACL materializada de has_role (mesma forma do pin; valor exato recalculado no stub)
REVOKE ALL ON FUNCTION platform_private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION platform_private.has_role(uuid, public.app_role) TO authenticated;
-- RLS + 5 policies stub em partner_orders (hashes recalculados no stub)
ALTER TABLE public.partner_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Financeiro read partner_orders" ON public.partner_orders AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "b2b_phase1_tenant_guard" ON public.partner_orders AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "partner_orders_insert" ON public.partner_orders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "partner_orders_select" ON public.partner_orders AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "partner_orders_update" ON public.partner_orders AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- Fixtures: org A dona do parceiro P1; org B sem carteira
INSERT INTO public.organizations VALUES
  ('22222222-2222-4222-8222-222222222222', true, 'ativa'),
  ('99999999-9999-4999-8999-999999999999', true, 'ativa'),
  ('77777777-7777-4777-8777-777777777777', false, 'ativa');
INSERT INTO public.profiles VALUES
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', true),  -- admin A
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99999999-9999-4999-8999-999999999999', true),  -- admin B
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', true),  -- externo sem papel interno
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '77777777-7777-4777-8777-777777777777', true),  -- org inativa
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', true),  -- papel misto admin+externo
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', false); -- perfil revogado
INSERT INTO public.user_roles VALUES
  ('11111111-1111-4111-8111-111111111111', 'administrador'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'administrador'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'parceiro_b2b'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'administrador'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'parceiro_b2b'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'administrador');
INSERT INTO public.partner_accounts VALUES
  ('33333333-3333-4333-8333-333333333333', 'Parceiro teste4', true, NULL, '22222222-2222-4222-8222-222222222222'),
  ('44444444-4444-4444-8444-444444444444', 'Parceiro inativo', false, NULL, '22222222-2222-4222-8222-222222222222'),
  ('55555555-5555-4555-8555-555555555555', 'Parceiro deletado', true, now(), '22222222-2222-4222-8222-222222222222');
INSERT INTO public.partner_orders VALUES
  ('d4539dd9-b090-4433-9ed3-6f8f5d3e767b', 'PB-001029', 'em_analise_comercial', 2, '2026-10-26T15:00:00+00', '2026-11-05', NULL, '33333333-3333-4333-8333-333333333333', '{"contract":"C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1","accounting_validated":false}'),
  ('66666666-6666-4666-8666-666666666666', 'PB-000900', 'aprovado', 10, '2026-10-20T10:00:00+00', NULL, NULL, '33333333-3333-4333-8333-333333333333', NULL),
  ('77777777-7777-4777-8777-777777777778', 'PB-INATIVO', 'aprovado', 5, '2026-10-21T10:00:00+00', NULL, NULL, '44444444-4444-4444-8444-444444444444', NULL),
  ('88888888-8888-4888-8888-888888888889', 'PB-DELETADO', 'aprovado', 5, '2026-10-22T10:00:00+00', NULL, NULL, '55555555-5555-4555-8555-555555555555', NULL);
SQL

Q() { psql -h "$DIR/socket" -p 55444 -U postgres -d postgres -tAc "$1"; }
QU() { PGOPTIONS="-c test.uid=$1" psql -h "$DIR/socket" -p 55444 -U postgres -d postgres -tAc "$2"; }

# --- Gera variantes *-stub.sql com os pins recalculados do stub -------------------
HAS_ROLE_PIN=$(Q "SELECT md5(p.prosrc) || '|' || coalesce(p.proacl::text, 'NULL') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND p.proname='has_role';")
STUB_HR_MD5="${HAS_ROLE_PIN%%|*}"
STUB_HR_ACL="${HAS_ROLE_PIN#*|}"
STUB_TUPLES=$(Q "SELECT string_agg(format('         (%L, %s, %L, %L)', polname, polpermissive, qm, cm), E',\n' ORDER BY polname) FROM (SELECT pol.polname, pol.polpermissive, md5(coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')) AS qm, md5(coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) AS cm FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='partner_orders') p;")
export STUB_HR_MD5 STUB_HR_ACL STUB_TUPLES
PKG="$PKG" python3 - <<'PY'
import os, pathlib, re
pkg = pathlib.Path(os.environ["PKG"])
hr_md5, hr_acl, tuples = os.environ["STUB_HR_MD5"], os.environ["STUB_HR_ACL"], os.environ["STUB_TUPLES"]
policy_re = re.compile(r"IN \(\n.*?\n       \)\)", re.S)
def adapt(name_in, name_out):
    text = (pkg / name_in).read_text()
    text = text.replace("05f82a3d57ca71ca6d966fd6c7cf1a1b", hr_md5)
    text = text.replace("{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}", hr_acl)
    text = policy_re.sub("IN (\n" + tuples + "\n       ))", text)
    (pkg.parent / name_out).write_text(text) if False else pathlib.Path(f"/tmp/pg-c2admin/{name_out}").write_text(text)
for src, dst in [("preflight.sql", "preflight-stub.sql"), ("candidate.sql.review", "candidate-stub.sql"), ("postflight.sql", "postflight-stub.sql")]:
    adapt(src, dst)
print("variantes stub geradas")
PY

set +e
CHECKS=0; FAILS=0
check() { # descricao esperado atual
  CHECKS=$((CHECKS+1))
  if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (esperado=$2 atual=$3)"; FAILS=$((FAILS+1)); fi
}
ERR() { local out; out=$(PGOPTIONS="-c test.uid=$1" psql -h "$DIR/socket" -p 55444 -U postgres -d postgres -tAc "$2" 2>&1 || true); if printf '%s' "$out" | grep -q "$3"; then echo "$3"; else echo "sem-erro"; fi; }
RUN_FILE() { # arquivo padrao_esperado (vazio = deve passar)
  local out; out=$(psql -h "$DIR/socket" -p 55444 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$1" 2>&1)
  if [ -z "$2" ]; then [ $? -eq 0 ] && echo "ok" || echo "falhou:$out";
  else printf '%s' "$out" | grep -q "$2" && echo "$2" || echo "sem-$2"; fi
}

# === FASE 1: ciclo completo pre -> apply -> post ==================================
R=$(RUN_FILE "$DIR/preflight-stub.sql" ""); check "preflight completo PASS" "ok" "$R"
R=$(RUN_FILE "$DIR/candidate-stub.sql" ""); check "candidate completo PASS (asserts + DDL numa transação)" "ok" "$R"
R=$(RUN_FILE "$DIR/postflight-stub.sql" ""); check "postflight completo PASS (hashes reais, sem placeholders)" "ok" "$R"

# === FASE 2: comportamento =========================================================
R=$(QU 11111111-1111-4111-8111-111111111111 "SELECT jsonb_array_length(public.c2_commercial_owner_orders_projection()->'orders');")
check "admin A lista 2 pedidos da carteira" "2" "$R"
R=$(QU 11111111-1111-4111-8111-111111111111 "SELECT public.c2_commercial_owner_orders_projection()->'orders'->0->>'numero';")
check "admin A vê PB-001029 primeiro (created_at DESC)" "PB-001029" "$R"
R=$(QU 11111111-1111-4111-8111-111111111111 "SELECT public.c2_commercial_owner_orders_projection()->>'organization_id';")
check "organization_id é a org do ator" "22222222-2222-4222-8222-222222222222" "$R"
R=$(QU 11111111-1111-4111-8111-111111111111 "SELECT jsonb_array_length(public.c2_commercial_owner_orders_projection('em_analise_comercial')->'orders');")
check "filtro em_analise_comercial => 1" "1" "$R"
R=$(QU 11111111-1111-4111-8111-111111111111 "SELECT jsonb_array_length(public.c2_commercial_owner_orders_projection('solicitado')->'orders');")
check "filtro sem correspondência => 0 (enum inválido não quebra)" "0" "$R"
R=$(QU aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa "SELECT jsonb_array_length(public.c2_commercial_owner_orders_projection()->'orders');")
check "admin B (deny) => 0 pedidos" "0" "$R"
R=$(ERR bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb "SELECT public.c2_commercial_owner_orders_projection();" actor_not_allowed)
check "externo sem papel interno => actor_not_allowed" "actor_not_allowed" "$R"
R=$(ERR cccccccc-cccc-4ccc-8ccc-cccccccccccc "SELECT public.c2_commercial_owner_orders_projection();" actor_scope_unavailable)
check "org inativa => actor_scope_unavailable" "actor_scope_unavailable" "$R"
R=$(psql -h "$DIR/socket" -p 55444 -U postgres -d postgres -tAc "SELECT public.c2_commercial_owner_orders_projection();" 2>&1 || true); R=$(printf '%s' "$R" | grep -q auth_required && echo auth_required || echo sem-erro)
check "anônimo => auth_required" "auth_required" "$R"
R=$(QU dddddddd-dddd-4ddd-8ddd-dddddddddddd "SELECT jsonb_array_length(public.c2_commercial_owner_orders_projection()->'orders');")
check "papel misto admin+externo => carteira da propria org" "2" "$R"
R=$(ERR eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee "SELECT public.c2_commercial_owner_orders_projection();" actor_scope_unavailable)
check "perfil revogado => actor_scope_unavailable" "actor_scope_unavailable" "$R"
R=$(Q "SELECT p.prosecdef::text || '|' || r.rolname || '|' || p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='platform_private' AND p.proname='c2_commercial_owner_orders_core';")
check "core DEFINER postgres ACL canonica" "true|postgres|{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}" "$R"
R=$(Q "SELECT p.prosecdef::text || '|' || r.rolname || '|' || p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='public' AND p.proname='c2_commercial_owner_orders_projection';")
check "wrapper INVOKER postgres ACL canonica" "false|postgres|{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}" "$R"
R=$(Q "SELECT p.proconfig::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND p.proname='c2_commercial_owner_orders_core';")
check "core search_path vazio" '{"search_path=\"\""}' "$R"

# Hashes reais dos corpos — devem bater com postflight.sql e rollback.sql.review
CORE_MD5=$(Q "SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND p.proname='c2_commercial_owner_orders_core';")
WRAP_MD5=$(Q "SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='c2_commercial_owner_orders_projection';")
echo "CORE_MD5=$CORE_MD5"; echo "WRAP_MD5=$WRAP_MD5"
check "md5 core == pin do postflight/rollback" "9d9fdb93f3a9bb098a1941145014c1cf" "$CORE_MD5"
check "md5 wrapper == pin do postflight/rollback" "f0e65bc2546eea58ad5f5510a8a4cc12" "$WRAP_MD5"

# === FASE 3: verificação de unicidade corrigida (rejeita parcial/inválido/composto/expressão)
psql -h "$DIR/socket" -p 55444 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE public.t_uni_partial (user_id uuid, ativo boolean);
CREATE UNIQUE INDEX t_uni_partial_idx ON public.t_uni_partial (user_id) WHERE ativo;
CREATE TABLE public.t_uni_composite (user_id uuid, other uuid);
CREATE UNIQUE INDEX t_uni_composite_idx ON public.t_uni_composite (user_id, other);
CREATE TABLE public.t_uni_expr (user_id uuid);
CREATE UNIQUE INDEX t_uni_expr_idx ON public.t_uni_expr (lower(user_id::text));
CREATE TABLE public.t_uni_invalid (user_id uuid);
CREATE UNIQUE INDEX t_uni_invalid_idx ON public.t_uni_invalid (user_id);
UPDATE pg_index SET indisvalid = false WHERE indexrelid = 'public.t_uni_invalid_idx'::regclass;
SQL
UNIQ_Q() { Q "SELECT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$1' AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]<>0 AND (SELECT a.attname FROM pg_attribute a WHERE a.attrelid=i.indrelid AND a.attnum=i.indkey[0])='user_id');"; }
R=$(UNIQ_Q profiles);        check "unicidade: PK real de profiles.user_id aceita" "t" "$R"
R=$(UNIQ_Q t_uni_partial);   check "unicidade: índice parcial rejeitado" "f" "$R"
R=$(UNIQ_Q t_uni_composite); check "unicidade: índice composto rejeitado" "f" "$R"
R=$(UNIQ_Q t_uni_expr);      check "unicidade: índice de expressão rejeitado" "f" "$R"
R=$(UNIQ_Q t_uni_invalid);   check "unicidade: índice inválido rejeitado" "f" "$R"

# === FASE 4: rollback guardado =====================================================
sed -e "s/9d9fdb93f3a9bb098a1941145014c1cf/00000000000000000000000000000000/" -e "s/f0e65bc2546eea58ad5f5510a8a4cc12/00000000000000000000000000000000/" "$PKG/rollback.sql.review" > "$DIR/rollback-wrong.sql"
R=$(RUN_FILE "$DIR/rollback-wrong.sql" rollback_guard_failed); check "rollback com md5 errado aborta" "rollback_guard_failed" "$R"
R=$(Q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname LIKE 'c2_commercial_owner_orders%';")
check "funções preservadas após rollback abortado" "2" "$R"
R=$(RUN_FILE "$PKG/rollback.sql.review" ""); check "rollback com md5 correto remove as 2 funções" "ok" "$R"
R=$(Q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname LIKE 'c2_commercial_owner_orders%';")
check "funções ausentes após rollback" "0" "$R"

# === FASE 5: negativos dos pinos incorporados ======================================
# 5a) Policy divergente => preflight E candidate abortam, sem criar funções
Q "DROP POLICY \"partner_orders_select\" ON public.partner_orders;" >/dev/null
R=$(RUN_FILE "$DIR/preflight-stub.sql" preflight_failed); check "preflight aborta com policy ausente" "preflight_failed" "$R"
R=$(RUN_FILE "$DIR/candidate-stub.sql" candidate_failed); check "candidate aborta com policy ausente (pinos na transação)" "candidate_failed" "$R"
R=$(Q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname LIKE 'c2_commercial_owner_orders%';")
check "candidate abortado não deixou funções" "0" "$R"
Q "CREATE POLICY \"partner_orders_select\" ON public.partner_orders AS PERMISSIVE FOR SELECT TO authenticated USING (true);" >/dev/null

# 5b) Reaplicar com baseline íntegro => PASS; corpo adulterado => postflight falha e rollback guardado aborta
R=$(RUN_FILE "$DIR/candidate-stub.sql" ""); check "candidate reaplicado PASS após restore da policy" "ok" "$R"
Q "CREATE OR REPLACE FUNCTION public.c2_commercial_owner_orders_projection(p_status text DEFAULT NULL, p_partner_id uuid DEFAULT NULL, p_start timestamptz DEFAULT NULL, p_end timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS \$\$ SELECT platform_private.c2_commercial_owner_orders_core(p_status, p_partner_id, p_start, p_end); -- adulterado
\$\$;" >/dev/null
R=$(RUN_FILE "$DIR/postflight-stub.sql" postflight_failed); check "postflight detecta corpo adulterado" "postflight_failed" "$R"
R=$(RUN_FILE "$PKG/rollback.sql.review" rollback_guard_failed); check "rollback guardado aborta sobre corpo adulterado" "rollback_guard_failed" "$R"
Q "DROP FUNCTION public.c2_commercial_owner_orders_projection(text, uuid, timestamptz, timestamptz); DROP FUNCTION platform_private.c2_commercial_owner_orders_core(text, uuid, timestamptz, timestamptz);" >/dev/null

echo "TOTAL=$CHECKS FAILS=$FAILS"
[ "$FAILS" -eq 0 ]
