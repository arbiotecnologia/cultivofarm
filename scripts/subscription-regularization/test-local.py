#!/usr/bin/env python3
"""Harness PostgreSQL descartável da candidata v2 de regularização de assinatura.

Espelha o live: user_roles + profiles(ativo), is_platform_superadmin real,
índice parcial uq_org_subscriptions_one_current, guards de DML com papel
authenticator real, ticket/histórico e a candidata candidate.sql.review.
NUNCA roda contra o hosted; cria bodoque local temporário.
"""
import subprocess, sys, uuid, os, shutil, tempfile, time

PG_BIN = os.environ.get("PG_BIN", "/usr/lib/postgresql/16/bin")
INITDB, PG_CTL, PSQL = (f"{PG_BIN}/{b}" for b in ("initdb", "pg_ctl", "psql"))

def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)

def psql(db, sql, user=None, expect_err=False):
    env = dict(os.environ)
    cmd = [PSQL, "-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-d", db]
    if user:
        cmd += ["-U", user]
    r = run(cmd, input=sql, env=env)
    if not expect_err and r.returncode != 0:
        raise AssertionError(f"psql falhou: {r.stderr}\nSQL: {sql[:400]}")
    return r

def main():
    checks = 0
    tmp = tempfile.mkdtemp(prefix="pg-subreg-")
    run([INITDB, "-D", f"{tmp}/data", "-U", "postgres", "--auth=trust"])
    port = "55439"
    run([PG_CTL, "-D", f"{tmp}/data", "-o", f"-p {port} -k {tmp}", "-l", f"{tmp}/log", "start"])
    time.sleep(1)
    os.environ["PGHOST"], os.environ["PGPORT"], os.environ["PGUSER"] = tmp, port, "postgres"
    try:
        psql("postgres", "CREATE DATABASE harness;")
        db = "harness"
        # --- schema espelhado do live ---
        psql(db, r"""
CREATE SCHEMA platform_private;
CREATE TYPE public.app_role AS ENUM ('administrador','superadmin','gestor','financeiro');
CREATE TYPE public.saas_subscription_status AS ENUM ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED');
CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE NOT NULL, organization_id uuid, ativo boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE(user_id, role));
CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text, ativo boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'ativa');
CREATE TABLE public.saas_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text);
CREATE TABLE public.saas_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES public.saas_plans(id),
  status text NOT NULL, price_amount numeric, currency text, billing_cycle text,
  limits_snapshot jsonb, features_snapshot jsonb,
  effective_from timestamptz NOT NULL DEFAULT now(), effective_to timestamptz);
CREATE TABLE public.organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
  plan_id uuid REFERENCES public.saas_plans(id), plan_version_id uuid REFERENCES public.saas_plan_versions(id),
  status public.saas_subscription_status NOT NULL, billing_cycle text,
  started_at timestamptz NOT NULL DEFAULT now(), trial_ends_at timestamptz,
  current_period_start timestamptz, current_period_end timestamptz,
  cancel_at timestamptz, cancelled_at timestamptz, suspended_at timestamptz,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  price_snapshot numeric, currency_snapshot text, billing_cycle_snapshot text,
  limits_snapshot jsonb, features_snapshot jsonb,
  state_changed_at timestamptz, last_correlation_id uuid);
CREATE UNIQUE INDEX uq_org_subscriptions_one_current ON public.organization_subscriptions(organization_id)
  WHERE status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED');
CREATE TABLE public.organization_subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL, organization_id uuid NOT NULL,
  action text NOT NULL, reason text, previous_status text, new_status text,
  old_values jsonb, new_values jsonb, correlation_id uuid, created_by uuid, created_at timestamptz NOT NULL DEFAULT now());
-- is_platform_superadmin: definição fiel ao live (SÓ user_roles)
CREATE OR REPLACE FUNCTION public.is_platform_superadmin(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=_user_id AND r.role='superadmin'::public.app_role)
$$;
-- ticket + guarda de DML + histórico (espelho simplificado dos triggers live)
CREATE OR REPLACE FUNCTION platform_private.issue_ticket(_op text, _org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$ BEGIN NULL; END $$;
CREATE OR REPLACE FUNCTION public.saas_subscription_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF current_setting('app.saas_change_action', true) IS NULL AND session_user = 'authenticator' THEN
    RAISE EXCEPTION 'direct DML negado';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER saas_subscription_guard BEFORE UPDATE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_guard();
CREATE OR REPLACE FUNCTION public.saas_subscription_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  INSERT INTO public.organization_subscription_history(subscription_id,organization_id,action,reason,previous_status,new_status,old_values,new_values,correlation_id,created_by)
  VALUES (NEW.id, NEW.organization_id,
          current_setting('app.saas_change_action', true),
          current_setting('app.saas_change_reason', true),
          OLD.status::text, NEW.status::text, to_jsonb(OLD), to_jsonb(NEW),
          nullif(current_setting('app.saas_correlation_id', true),'')::uuid, auth.uid());
  RETURN NEW;
END $$;
CREATE TRIGGER saas_subscription_audit AFTER UPDATE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_audit();
CREATE ROLE authenticator NOLOGIN;
GRANT USAGE ON SCHEMA public, platform_private TO authenticator;
GRANT SELECT, UPDATE ON public.organization_subscriptions TO authenticator;
GRANT SELECT ON public.organizations, public.saas_plan_versions, public.profiles, public.user_roles TO authenticator;
""")

        candidata = open("scripts/subscription-regularization/candidate.sql.review").read()
        # remove preflight (depende do live hosted)
        candidata = candidata.split("-- ---------------------------------------------------------------------")[2]
        candidata = "-- " + candidata if not candidata.startswith("CREATE") else candidata
        psql(db, candidata)

        def uid(): return str(uuid.uuid4())
        SA, SA_INATIVO, ADMIN, OUTRO = uid(), uid(), uid(), uid()
        ORG1, ORG2 = uid(), uid()
        PLAN, V1, V2 = uid(), uid(), uid()
        psql(db, f"""
INSERT INTO public.profiles(user_id, ativo) VALUES
  ('{SA}', true), ('{SA_INATIVO}', false), ('{ADMIN}', true), ('{OUTRO}', true);
INSERT INTO public.user_roles(user_id, role) VALUES
  ('{SA}','superadmin'), ('{SA_INATIVO}','superadmin'), ('{ADMIN}','administrador');
INSERT INTO public.organizations(id, nome, ativo) VALUES ('{ORG1}','AR Bio', true), ('{ORG2}','Outra', true);
INSERT INTO public.saas_plans(id, nome) VALUES ('{PLAN}','Pro');
INSERT INTO public.saas_plan_versions(id, plan_id, status, price_amount, currency, billing_cycle, effective_from)
  VALUES ('{V1}','{PLAN}','PUBLISHED', 499.90, 'BRL', 'monthly', now() - interval '30 days'),
         ('{V2}','{PLAN}','PUBLISHED', 599.90, 'BRL', 'yearly', now() - interval '30 days');
""")

        def as_user(user, sql, expect_err=False):
            wrapped = f"SET LOCAL ROLE authenticator; SELECT set_config('request.jwt.claims', '{{\"sub\":\"{user}\"}}', true); {sql}"
            return psql(db, f"BEGIN; {wrapped};", expect_err=expect_err)

        # auth.uid() via claims
        psql(db, """CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'::text::uuid $$;""")
        psql(db, """CREATE SCHEMA IF NOT EXISTS auth;""")
        psql(db, """CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;""")

        COR1, COR2, COR3 = uid(), uid(), uid()

        # 1) superadmin ativo: TRIAL vencido -> ACTIVE
        SUB1 = uid()
        psql(db, f"""INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB1}','{ORG1}','{PLAN}','{V1}','TRIAL', now()-interval '20 days', now()-interval '6 days', 499.90,'BRL','monthly','monthly');""")
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','regularização manual AR Bio','{COR1}',NULL)")
        assert r.returncode == 0, r.stderr; checks += 1
        s = psql(db, f"SELECT status, price_snapshot, currency_snapshot, billing_cycle, trial_ends_at IS NOT NULL, current_period_start IS NULL FROM public.organization_subscriptions WHERE id='{SUB1}'").stdout.strip()
        assert s == "ACTIVE|499.90|BRL|monthly|t|t", s; checks += 1  # snapshots e trial_ends_at preservados; período inalterado
        h = psql(db, f"SELECT count(*), string_agg(DISTINCT action,','), string_agg(DISTINCT reason,',') FROM public.organization_subscription_history WHERE subscription_id='{SUB1}'").stdout.strip()
        assert h == "1|activate_subscription|regularização manual AR Bio", h; checks += 1

        # 2) replay idêntico: mesmo id, sem novo histórico
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','regularização manual AR Bio','{COR1}',NULL)")
        assert r.returncode == 0 and SUB1 in r.stdout, r.stderr
        h = psql(db, f"SELECT count(*) FROM public.organization_subscription_history WHERE subscription_id='{SUB1}'").stdout.strip()
        assert h == "1", h; checks += 1

        # 3) replay com motivo adulterado: negado
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','motivo adulterado','{COR1}',NULL)", expect_err=True)
        assert r.returncode != 0 and "correlação já utilizada" in r.stderr, r.stderr; checks += 1

        # 4) replay com outra org: negado
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','activate_subscription','regularização manual AR Bio','{COR1}',NULL)", expect_err=True)
        assert r.returncode != 0 and "correlação já utilizada" in r.stderr, r.stderr; checks += 1

        # 5) replay com ação diferente: negado
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','cancel','regularização manual AR Bio','{COR1}',NULL)", expect_err=True)
        assert r.returncode != 0 and "correlação já utilizada" in r.stderr, r.stderr; checks += 1

        # 6) superadmin com perfil INATIVO: negado (inclusive replay)
        r = as_user(SA_INATIVO, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','regularização manual AR Bio','{COR1}',NULL)", expect_err=True)
        assert r.returncode != 0 and "perfil do ator inativo" in r.stderr, r.stderr; checks += 1

        # 7) admin comum: negado
        r = as_user(ADMIN, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','x'.repeat(5),'{'{}'.format(uid())}',NULL)".replace("x'.repeat(5)'","'motivo valido'"), expect_err=True)
        assert r.returncode != 0 and "apenas superadmin" in r.stderr, r.stderr; checks += 1

        # 8) sem claims (anon): negado
        r = psql(db, f"BEGIN; SET LOCAL ROLE authenticator; SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','motivo valido','{uid()}',NULL);", expect_err=True)
        assert r.returncode != 0, r.stderr; checks += 1

        # 9) EXPIRED de origem TRIAL -> ACTIVE (fallback sem corrente)
        SUB2 = uid()
        psql(db, f"""INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB2}','{ORG2}','{PLAN}','{V1}','EXPIRED', now()-interval '40 days', now()-interval '10 days', 499.90,'BRL','monthly','monthly');
INSERT INTO public.organization_subscription_history(subscription_id, organization_id, action, reason, previous_status, new_status, correlation_id)
VALUES ('{SUB2}','{ORG2}','expire_trial','trial encerrado','TRIAL','EXPIRED','{uid()}');""")
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','activate_subscription','reativação trial expirado','{COR2}',NULL)")
        assert r.returncode == 0, r.stderr
        s = psql(db, f"SELECT status FROM public.organization_subscriptions WHERE id='{SUB2}'").stdout.strip()
        assert s == "ACTIVE", s; checks += 1

        # 10) EXPIRED sem origem TRIAL comprovada: negado
        ORG3, SUB3 = uid(), uid()
        psql(db, f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG3}','Sem origem');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB3}','{ORG3}','{PLAN}','{V1}','EXPIRED', now()-interval '40 days', 499.90,'BRL','monthly','monthly');""")
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG3}','activate_subscription','motivo valido','{uid()}',NULL)", expect_err=True)
        assert r.returncode != 0 and "origem em trial" in r.stderr, r.stderr; checks += 1

        # 11) trial antigo EXPIRED + CANCELLED mais nova: NÃO ressuscita
        ORG4, SUB4A, SUB4B = uid(), uid(), uid()
        psql(db, f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG4}','Multi');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, cancelled_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot) VALUES
 ('{SUB4A}','{ORG4}','{PLAN}','{V1}','EXPIRED', now()-interval '90 days', NULL, 499.90,'BRL','monthly','monthly'),
 ('{SUB4B}','{ORG4}','{PLAN}','{V1}','CANCELLED', now()-interval '30 days', now()-interval '5 days', 499.90,'BRL','monthly','monthly');
INSERT INTO public.organization_subscription_history(subscription_id, organization_id, action, reason, previous_status, new_status, correlation_id)
VALUES ('{SUB4A}','{ORG4}','expire_trial','fim trial','TRIAL','EXPIRED','{uid()}');""")
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG4}','activate_subscription','motivo valido','{uid()}',NULL)", expect_err=True)
        assert r.returncode != 0 and "origem em trial" in r.stderr, r.stderr; checks += 1

        # 12) CANCELLED corrente inexistente -> assinatura corrente inexistente
        r2 = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG4}','cancel','motivo valido','{uid()}',NULL)", expect_err=True)
        assert r2.returncode != 0 and "corrente inexistente" in r2.stderr, r2.stderr; checks += 1

        # 13) cancel_at agendado bloqueia
        ORG5, SUB5 = uid(), uid()
        psql(db, f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG5}','CancelAgendado');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, cancel_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB5}','{ORG5}','{PLAN}','{V1}','TRIAL', now()-interval '20 days', now()-interval '2 days', now()+interval '3 days', 499.90,'BRL','monthly','monthly');""")
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG5}','activate_subscription','motivo valido','{uid()}',NULL)", expect_err=True)
        assert r.returncode != 0 and "cancelamento agendado" in r.stderr, r.stderr; checks += 1

        # 14) versão atual fora de vigência: negado
        ORG6, SUB6, VEXP = uid(), uid(), uid()
        psql(db, f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG6}','VersaoVencida');
INSERT INTO public.saas_plan_versions(id, plan_id, status, price_amount, currency, billing_cycle, effective_from, effective_to)
VALUES ('{VEXP}','{PLAN}','PUBLISHED', 100, 'BRL', 'monthly', now()-interval '60 days', now()-interval '1 day');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB6}','{ORG6}','{PLAN}','{VEXP}','TRIAL', now()-interval '20 days', now()-interval '2 days', 100,'BRL','monthly','monthly');""")
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG6}','activate_subscription','motivo valido','{uid()}',NULL)", expect_err=True)
        assert r.returncode != 0 and "não está publicada e vigente" in r.stderr, r.stderr; checks += 1

        # 15) legada (sem versão): negado com orientação de change_plan
        ORG7, SUB7 = uid(), uid()
        psql(db, f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG7}','Legada');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB7}','{ORG7}','{PLAN}',NULL,'TRIAL', now()-interval '20 days', 499.90,'BRL','monthly','monthly');""")
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG7}','activate_subscription','motivo valido','{uid()}',NULL)", expect_err=True)
        assert r.returncode != 0 and "regularização explícita de versão" in r.stderr, r.stderr; checks += 1

        # 16) empresa inativa: negado
        ORG8, SUB8 = uid(), uid()
        psql(db, f"""INSERT INTO public.organizations(id, nome, ativo) VALUES ('{ORG8}','Inativa', false);
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB8}','{ORG8}','{PLAN}','{V1}','TRIAL', now()-interval '20 days', now()-interval '2 days', 499.90,'BRL','monthly','monthly');""")
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG8}','activate_subscription','motivo valido','{uid()}',NULL)", expect_err=True)
        assert r.returncode != 0 and "empresa inativa" in r.stderr, r.stderr; checks += 1

        # 17) activate com versão não-NULL: negado (contrato simples)
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','motivo valido','{uid()}','{V2}')", expect_err=True)
        assert r.returncode != 0 and "não aceita versão" in r.stderr, r.stderr; checks += 1

        # 18) empresa inexistente: negado
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{uid()}','activate_subscription','motivo valido','{uid()}',NULL)", expect_err=True)
        assert r.returncode != 0 and "empresa inexistente" in r.stderr, r.stderr; checks += 1

        # 19) regressão: ações existentes preservadas (suspend ACTIVE->SUSPENDED, reactivate)
        ORG9, SUB9 = uid(), uid()
        psql(db, f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG9}','Regressao');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB9}','{ORG9}','{PLAN}','{V1}','ACTIVE', now()-interval '100 days', 499.90,'BRL','monthly','monthly');""")
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG9}','suspend','motivo valido','{uid()}',NULL)")
        assert r.returncode == 0, r.stderr
        r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG9}','reactivate_manual','motivo valido','{uid()}',NULL)")
        assert r.returncode == 0, r.stderr
        s = psql(db, f"SELECT status FROM public.organization_subscriptions WHERE id='{SUB9}'").stdout.strip()
        assert s == "ACTIVE", s; checks += 1

        # 20) concorrência: duas conexões, exatamente 1 sucesso e 1 histórico
        ORG10, SUB10 = uid(), uid()
        psql(db, f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG10}','Concorrencia');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB10}','{ORG10}','{PLAN}','{V1}','TRIAL', now()-interval '20 days', now()-interval '2 days', 499.90,'BRL','monthly','monthly');""")
        import threading
        results = []
        def conc():
            r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG10}','activate_subscription','motivo valido','{uid()}',NULL)", expect_err=True)
            results.append(r.returncode)
        ts = [threading.Thread(target=conc) for _ in range(2)]
        [t.start() for t in ts]; [t.join() for t in ts]
        oks = results.count(0)
        assert oks >= 1, results
        s = psql(db, f"SELECT status FROM public.organization_subscriptions WHERE id='{SUB10}'").stdout.strip()
        h = psql(db, f"SELECT count(*) FROM public.organization_subscription_history WHERE subscription_id='{SUB10}'").stdout.strip()
        assert s == "ACTIVE" and h == "1", (s, h); checks += 1

        # 21) DML direto com papel authenticator: negado pelo guard
        r = psql(db, f"BEGIN; SET LOCAL ROLE authenticator; UPDATE public.organization_subscriptions SET status='ACTIVE' WHERE id='{SUB9}';", expect_err=True)
        assert r.returncode != 0 and "direct DML" in r.stderr, r.stderr; checks += 1

        print(f"PASS — {checks} checks (PostgreSQL isolado; NÃO hosted)")
        return 0
    finally:
        run([PG_CTL, "-D", f"{tmp}/data", "stop", "-m", "fast"])
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__":
    sys.exit(main())
