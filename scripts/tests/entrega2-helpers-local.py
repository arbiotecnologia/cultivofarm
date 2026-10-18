"""ENTREGA 2 rev 2.2: harness PostgreSQL descartável; nunca conecta ao hosted.

Extrai os TRÊS CORPOS REAIS da candidata (docs/auditorias/vinculos-b2b-entrega2-
helpers-candidato-20261018.sql) e o corpo real instalado da Entrega 1, instala-os
em PostgreSQL descartável com stubs mínimos e roda a matriz comportamental
(entrega2-helpers-local.sql). Em seguida:
  1. computa os hashes md5 canônicos dos 3 corpos candidatos;
  2. reescreve a guarda do rollback (entre os marcadores BEGIN/END HASH GUARD)
     com os hashes exatos — substituindo a verificação por position();
  3. prova que o rollback aceita a instalação exata, rejeita atomicamente um
     drift que preserva os antigos marcadores textuais e restaura o baseline.
"""
from pathlib import Path
import os, re, shutil, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[2]
PORT = '55499'
CANDIDATE = ROOT / 'docs/auditorias/vinculos-b2b-entrega2-helpers-candidato-20261018.sql'
ROLLBACK = ROOT / 'docs/auditorias/vinculos-b2b-entrega2-helpers-rollback-20261018.sql'
MATRIX = ROOT / 'scripts/tests/entrega2-helpers-local.sql'

# Corpo real instalado da Entrega 1 em produção (evidência externa 2026-10-18;
# md5(pg_get_functiondef) = 4e0c374caa04bb9bf9fac9cc4e6723f1 — verificado no lab).
ENTREGA1_BODY = """CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_user_id uuid, _cliente_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE(public.has_role(_user_id,'administrador'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'gestor_comercial'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'gestor'::app_role), false)
  THEN
    RETURN true;
  END IF;

  -- HARDENING: papéis técnicos exigem carteira ativa e vigente.
  IF COALESCE(public.has_role(_user_id,'tecnico_agronomo'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'consultor_tecnico'::app_role), false)
  THEN
    RETURN COALESCE(
      public.has_active_user_cliente_access(
        _user_id, _cliente_id, ARRAY['read','execute','manage']
      ), false);
  END IF;

  IF COALESCE(public.has_role(_user_id,'parceiro_b2b'::app_role), false) THEN
    RETURN COALESCE((EXISTS (
      SELECT 1 FROM public.partner_clients pc
      JOIN public.partner_users pu ON pu.partner_id = pc.partner_id
      JOIN public.partner_accounts pa ON pa.id = pu.partner_id
      WHERE pu.user_id = _user_id AND pc.cliente_id = _cliente_id AND pc.active = true
        AND pu.revoked_at IS NULL
        AND pa.ativo = true AND pa.deleted_at IS NULL
        AND pa.commercial_owner_organization_id IS NOT NULL
        AND pu.tenant_id IS NOT NULL
        AND pu.tenant_id = pa.commercial_owner_organization_id
    )), false);
  END IF;

  IF COALESCE(public.has_role(_user_id,'parceiro_b2b_tecnico'::app_role), false) THEN
    RETURN COALESCE((EXISTS (
      SELECT 1 FROM public.partner_user_clients puc
      JOIN public.partner_users pu2 ON pu2.partner_id = puc.partner_id AND pu2.user_id = puc.user_id
      JOIN public.partner_accounts pa2 ON pa2.id = puc.partner_id
      WHERE puc.user_id = _user_id AND puc.cliente_id = _cliente_id AND puc.active = true
        AND pu2.revoked_at IS NULL
        AND pa2.ativo = true AND pa2.deleted_at IS NULL
        AND pa2.commercial_owner_organization_id IS NOT NULL
        AND pu2.tenant_id IS NOT NULL
        AND pu2.tenant_id = pa2.commercial_owner_organization_id
    ) OR EXISTS (
      SELECT 1 FROM public.partner_technician_clients ptc
      JOIN public.partner_users pu3 ON pu3.partner_id = ptc.partner_id AND pu3.user_id = ptc.technician_user_id
      JOIN public.partner_accounts pa3 ON pa3.id = ptc.partner_id
      WHERE ptc.technician_user_id = _user_id AND ptc.cliente_id = _cliente_id AND ptc.active = true
        AND pu3.revoked_at IS NULL
        AND pa3.ativo = true AND pa3.deleted_at IS NULL
        AND pa3.commercial_owner_organization_id IS NOT NULL
        AND pu3.tenant_id IS NOT NULL
        AND pu3.tenant_id = pa3.commercial_owner_organization_id
    )), false);
  END IF;

  RETURN COALESCE((EXISTS (
    SELECT 1 FROM public.user_clientes uc
    WHERE uc.user_id = _user_id
      AND uc.cliente_id = _cliente_id
      AND uc.is_active = true
      AND uc.revoked_at IS NULL
      AND (uc.valid_from IS NULL OR uc.valid_from <= now())
      AND (uc.valid_until IS NULL OR uc.valid_until >= now())
  )), false);
END;
$function$;
"""

STUBS = r"""
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS platform_private;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS lab;
CREATE TYPE public.app_role AS ENUM
  ('administrador','gestor_comercial','gestor','tecnico_agronomo','consultor_tecnico',
   'parceiro_b2b','parceiro_b2b_tecnico');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('lab.actor', true),'')::uuid $$;
CREATE TABLE public.partner_accounts(id uuid, ativo boolean, deleted_at timestamptz, commercial_owner_organization_id uuid);
CREATE TABLE public.partner_users(user_id uuid, partner_id uuid, papel text, tenant_id uuid, revoked_at timestamptz);
CREATE TABLE public.user_roles(user_id uuid, role text);
CREATE TABLE public.organizations(id uuid, partner_account_id uuid, ativo boolean, status text);
CREATE TABLE public.clientes(id uuid);
CREATE TABLE public.partner_clients(partner_id uuid, cliente_id uuid, active boolean);
CREATE TABLE public.partner_user_clients(partner_id uuid, user_id uuid, cliente_id uuid, active boolean);
CREATE TABLE public.partner_technician_clients(partner_id uuid, technician_user_id uuid, cliente_id uuid, active boolean);
CREATE TABLE public.user_clientes(user_id uuid, cliente_id uuid, is_active boolean, revoked_at timestamptz, valid_from timestamptz, valid_until timestamptz);
CREATE TABLE lab.entitlements(user_id uuid, feature_key text);
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('lab.actor_org', true),'')::uuid $$;
CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS
$$ SELECT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id = $1 AND r.role = $2::text) $$;
CREATE FUNCTION public.has_active_user_cliente_access(uuid, uuid, text[]) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT false $$;
CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE AS
$$ SELECT e.feature_key FROM lab.entitlements e WHERE e.user_id = $1 $$;
CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid, boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
"""


def extract_bodies(candidate_sql: str) -> list[str]:
    """Extrai os 3 CREATE OR REPLACE FUNCTION reais da candidata (sem os guards)."""
    bodies = re.findall(
        r'CREATE OR REPLACE FUNCTION (?:public|platform_private)\.[a-z_]+\(.*?\$function\$;',
        candidate_sql, flags=re.S)
    assert len(bodies) == 3, f'esperava 3 corpos, extraiu {len(bodies)}'
    return bodies


def run_psql(tmp: Path, sql: str, check: bool = True) -> subprocess.CompletedProcess:
    r = subprocess.run(['psql', '-X', '-h', str(tmp), '-p', PORT, '-U', 'postgres', '-d',
                        'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
                       input=sql, text=True, capture_output=True, timeout=60)
    if r.stdout:
        print(r.stdout)
    if r.stderr:
        print(r.stderr)
    if check and r.returncode:
        raise SystemExit(f'FAIL psql exit {r.returncode}')
    return r


def main():
    tmp = Path(tempfile.mkdtemp(prefix='entrega2-', dir='/tmp'))
    tmp.chmod(0o777)
    pre = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    data = tmp / 'data'
    started = False
    try:
        subprocess.run(pre + ['initdb', '-D', str(data), '-U', 'postgres', '-A', 'trust'],
                       check=True, capture_output=True)
        subprocess.run(pre + ['pg_ctl', '-D', str(data), '-l', str(tmp / 'server.log'),
                              '-o', f'-k {tmp} -h "" -p {PORT}', '-w', 'start'],
                       check=True, capture_output=True)
        started = True

        candidate_sql = CANDIDATE.read_text()
        bodies = extract_bodies(candidate_sql)

        # 1) Instala stubs + corpos reais (Entrega 1 instalada + 3 da candidata) e roda a matriz.
        setup = STUBS + ENTREGA1_BODY + '\n'.join(bodies) + '\nCOMMIT;\n'
        run_psql(tmp, setup)
        run_psql(tmp, MATRIX.read_text())

        # 2) Prova de fidelidade do corpo da Entrega 1 embutido (hash de produção).
        r = run_psql(tmp, "SELECT md5(pg_get_functiondef('public.can_user_access_cliente(uuid,uuid)'::regprocedure));")
        m = re.search(r'([0-9a-f]{32})', r.stdout)
        assert m and m.group(1) == '4e0c374caa04bb9bf9fac9cc4e6723f1', \
            f'hash Entrega 1 divergente: {m and m.group(1)}'
        print('PASS fidelidade Entrega 1: md5 confere com produção (4e0c374caa04bb9bf9fac9cc4e6723f1)')

        # 3) Hashes canônicos dos 3 corpos candidatos.
        r = run_psql(tmp, """
SELECT md5(pg_get_functiondef('public.get_user_partner_id()'::regprocedure));
SELECT md5(pg_get_functiondef('public.get_partner_papel(uuid)'::regprocedure));
SELECT md5(pg_get_functiondef('platform_private.b2b_commercial_context()'::regprocedure));
""")
        hashes = re.findall(r'([0-9a-f]{32})', r.stdout)
        assert len(hashes) == 3, f'hashes extraídos: {hashes}'
        h1, h2, h3 = hashes
        print(f'hashes candidatos rev 2.2: get_user_partner_id={h1} get_partner_papel={h2} b2b_commercial_context={h3}')

        # 4) Reescreve a guarda do rollback com hashes exatos (entre marcadores).
        rb = ROLLBACK.read_text()
        guard = (
            '  -- BEGIN HASH GUARD (gerado por scripts/tests/entrega2-helpers-local.py; rev 2.2)\n'
            f"  IF md5(d1) IS DISTINCT FROM '{h1}'\n"
            f"     OR md5(d2) IS DISTINCT FROM '{h2}'\n"
            f"     OR md5(d3) IS DISTINCT FROM '{h3}' THEN\n"
            "    RAISE EXCEPTION 'entrega2_rollback_antidrift: corpos divergem do instalado; abortando';\n"
            '  END IF;\n'
            '  -- END HASH GUARD')
        rb_new, n = re.subn(
            r'  -- BEGIN HASH GUARD.*?-- END HASH GUARD', guard, rb, flags=re.S)
        assert n == 1, 'marcadores BEGIN/END HASH GUARD não encontrados no rollback'
        ROLLBACK.write_text(rb_new)
        print('PASS rollback: guarda reescrita com hashes exatos pg_get_functiondef')

        # 5a) Rollback aceita a instalação exata (guarda passa, baseline restaurado).
        rb_sql = re.sub(r"^BEGIN;.*?^\$guard\$;\n", '', rb_new, flags=re.S | re.M)  # corpos baseline + verify
        guard_sql = re.search(r'DO \$guard\$.*?\$guard\$;', rb_new, flags=re.S).group(0)
        run_psql(tmp, 'BEGIN;\n' + guard_sql + '\n' + rb_sql.replace('COMMIT;', '') + '\nCOMMIT;')
        r = run_psql(tmp, "SELECT pg_get_functiondef('public.get_user_partner_id()'::regprocedure) LIKE '%LIMIT 1%' AS baseline_restaurado;")
        assert ' t' in r.stdout or '| t' in r.stdout, 'baseline não restaurado após rollback'
        print('PASS rollback 5a: instalação exata aceita e baseline restaurado')

        # 5b) Drift que PRESERVA os antigos marcadores textuais deve ser rejeitado
        #     atomicamente (a guarda antiga por position() aceitaria).
        drift = """
CREATE OR REPLACE FUNCTION public.get_user_partner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN count(*) FILTER (WHERE pu.revoked_at IS NULL) <> 1 THEN NULL
           WHEN bool_or(pa.ativo IS TRUE AND pa.deleted_at IS NULL
                        AND pa.commercial_owner_organization_id IS NOT NULL
                        AND pu.tenant_id IS NOT NULL
                        AND pu.tenant_id = pa.commercial_owner_organization_id
                        AND (pu.user_id IS NOT NULL OR pu.user_id IS NULL))
                FILTER (WHERE pu.revoked_at IS NULL)
           THEN (array_agg(pu.partner_id) FILTER (WHERE pu.revoked_at IS NULL))[1]
         END
  FROM public.partner_users pu
  LEFT JOIN public.partner_accounts pa ON pa.id = pu.partner_id
  WHERE pu.user_id = auth.uid();
$function$;
"""
        run_psql(tmp, 'BEGIN;\n' + '\n'.join(bodies) + '\n' + drift + '\nCOMMIT;')
        r = run_psql(tmp, 'BEGIN;\n' + guard_sql + '\nCOMMIT;', check=False)
        assert r.returncode != 0 and 'entrega2_rollback_antidrift' in r.stderr, \
            'guarda deveria rejeitar drift com marcadores preservados'
        print('PASS rollback 5b: drift com marcadores preservados rejeitado atomicamente')

        print('NO-GO hosted installation: homologação JWT/RLS A/B com sessões reais pendente')
    finally:
        if started:
            subprocess.run(pre + ['pg_ctl', '-D', str(data), '-m', 'immediate', 'stop'],
                           capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
