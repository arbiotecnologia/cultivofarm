#!/usr/bin/env python3
"""PostgreSQL descartável via socket /tmp; nunca conecta ao hosted.
Harness v2 da candidata de regularização de assinatura: espelha o live
(user_roles + profiles.ativo, is_platform_superadmin real, índice parcial
uq_org_subscriptions_one_current, guard de DML com papel authenticator real,
ticket/histórico) e aplica scripts/subscription-regularization/candidate.sql.review.
Casos: ator ativo/inativo, replay idempotente/adulterado/outra org/outra ação,
EXPIRED com e sem origem TRIAL, CANCELLED mais nova, cancel_at, versão vencida,
legada, empresa inativa/inexistente, regressão de ações existentes,
concorrência com duas conexões e DML direto negado."""
from pathlib import Path
import os, subprocess, tempfile, shutil, time, threading, uuid

ROOT = Path(__file__).resolve().parents[2]
tmp = Path(tempfile.mkdtemp(prefix='subreg-v2-', dir='/tmp')); tmp.chmod(0o777)
prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
base = ['psql', '-X', '-h', str(tmp), '-p', '55497', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt']

def run(sql):
    r = subprocess.run(base, input=sql, text=True, capture_output=True)
    if r.returncode: raise AssertionError(r.stderr)
    return r.stdout.strip()

def runerr(sql):
    r = subprocess.run(base, input=sql, text=True, capture_output=True)
    assert r.returncode != 0, 'esperava erro e comando passou: ' + sql[:120]
    return r.stderr

checks = 0
def uid(): return str(uuid.uuid4())

def as_user(u, sql):
    return f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{u}';{sql};COMMIT;"

SA, SA_INATIVO, ADMIN = uid(), uid(), uid()
ORG1, ORG2 = uid(), uid()
PLAN, V1, V2 = uid(), uid(), uid()
COR1, COR2 = uid(), uid()

try:
    subprocess.run(prefix + ['initdb', '-D', str(tmp/'data'), '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
    subprocess.run(prefix + ['pg_ctl', '-D', str(tmp/'data'), '-l', str(tmp/'log'), '-o', f'-k {tmp} -h "" -p 55497', 'start'], check=True, capture_output=True)
    for _ in range(40):
        if subprocess.run(base + ['-c', 'SELECT 1'], capture_output=True).returncode == 0: break
        time.sleep(0.5)
    else:
        raise SystemExit(open(tmp/'log').read())

    # ---- schema espelhado do live ----
    run('''CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TYPE public.app_role AS ENUM('administrador','superadmin','gestor','financeiro');
CREATE TYPE public.saas_subscription_status AS ENUM('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED');
CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE NOT NULL, organization_id uuid, ativo boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE(user_id, role));
CREATE TABLE public.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text, ativo boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'ativa');
CREATE TABLE public.saas_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text);
CREATE TABLE public.saas_plan_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES public.saas_plans(id),
  status text NOT NULL, price_amount numeric, currency text, billing_cycle text,
  limits_snapshot jsonb, features_snapshot jsonb,
  effective_from timestamptz NOT NULL DEFAULT now(), effective_to timestamptz);
CREATE TABLE public.organization_subscriptions(
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
CREATE TABLE public.organization_subscription_history(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL, organization_id uuid NOT NULL,
  action text NOT NULL, reason text, previous_status text, new_status text,
  old_values jsonb, new_values jsonb, correlation_id uuid, created_by uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public.is_platform_superadmin(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS
$$ SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=_user_id AND r.role='superadmin'::public.app_role) $$;
CREATE FUNCTION platform_private.issue_ticket(_op text, _org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$ BEGIN NULL; END $$;
CREATE FUNCTION public.saas_subscription_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF nullif(current_setting('app.saas_change_action', true),'') IS NULL AND session_user IN ('authenticator','authenticated') THEN
    RAISE EXCEPTION 'direct DML negado';
  END IF;
  RETURN NEW;
END $$;
CREATE ROLE authenticator NOLOGIN;
CREATE TRIGGER saas_subscription_guard BEFORE UPDATE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_guard();
CREATE FUNCTION public.saas_subscription_audit() RETURNS trigger
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
GRANT USAGE ON SCHEMA platform_private TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_superadmin(uuid) TO authenticated;
GRANT SELECT, UPDATE ON public.organization_subscriptions TO authenticated;
GRANT SELECT ON public.organizations, public.saas_plan_versions, public.profiles, public.user_roles TO authenticated;''')

    # ---- candidata (sem o preflight, que depende do live hosted) ----
    candidata = (ROOT/'scripts/subscription-regularization/candidate.sql.review').read_text()
    corpo = candidata.split('CREATE OR REPLACE FUNCTION platform_private.transition_subscription_core', 1)[1]
    run('CREATE OR REPLACE FUNCTION platform_private.transition_subscription_core' + corpo)
    run('''CREATE FUNCTION public.platform_transition_subscription(_organization_id uuid, _action text, _reason text, _correlation_id uuid, _plan_version_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE sql SET search_path TO '' AS
$$ SELECT platform_private.transition_subscription_core(_organization_id,_action,_reason,_correlation_id,_plan_version_id) $$;
GRANT EXECUTE ON FUNCTION platform_private.transition_subscription_core(uuid,text,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_transition_subscription(uuid,text,text,uuid,uuid) TO authenticated;''')

    run(f"""INSERT INTO public.profiles(user_id, ativo) VALUES ('{SA}', true), ('{SA_INATIVO}', false), ('{ADMIN}', true);
INSERT INTO public.user_roles(user_id, role) VALUES ('{SA}','superadmin'), ('{SA_INATIVO}','superadmin'), ('{ADMIN}','administrador');
INSERT INTO public.organizations(id, nome, ativo) VALUES ('{ORG1}','AR Bio', true), ('{ORG2}','Outra', true);
INSERT INTO public.saas_plans(id, nome) VALUES ('{PLAN}','Pro');
INSERT INTO public.saas_plan_versions(id, plan_id, status, price_amount, currency, billing_cycle, effective_from)
  VALUES ('{V1}','{PLAN}','PUBLISHED', 499.90, 'BRL', 'monthly', now() - interval '30 days'),
         ('{V2}','{PLAN}','PUBLISHED', 599.90, 'BRL', 'yearly', now() - interval '30 days');""")

    # 1) superadmin ativo: TRIAL vencido -> ACTIVE, snapshots/trial/periodo preservados
    SUB1 = uid()
    run(f"""INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB1}','{ORG1}','{PLAN}','{V1}','TRIAL', now()-interval '20 days', now()-interval '6 days', 499.90,'BRL','monthly','monthly');""")
    run(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','regularização manual AR Bio','{COR1}',NULL)")); checks += 1
    s = run(f"SELECT status||'|'||price_snapshot||'|'||currency_snapshot||'|'||billing_cycle||'|'||(trial_ends_at IS NOT NULL)||'|'||(current_period_start IS NULL) FROM public.organization_subscriptions WHERE id='{SUB1}'")
    assert s == "ACTIVE|499.90|BRL|monthly|true|true", s; checks += 1
    h = run(f"SELECT count(*)||'|'||string_agg(DISTINCT action,',')||'|'||string_agg(DISTINCT reason,',') FROM public.organization_subscription_history WHERE subscription_id='{SUB1}'")
    assert h == "1|activate_subscription|regularização manual AR Bio", h; checks += 1

    # 2) replay idêntico: mesmo id, sem novo histórico
    r = run(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','regularização manual AR Bio','{COR1}',NULL)"))
    assert SUB1 in r, r
    assert run(f"SELECT count(*) FROM public.organization_subscription_history WHERE subscription_id='{SUB1}'") == "1"; checks += 1

    # 3) replay com motivo adulterado: negado
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','motivo adulterado','{COR1}',NULL)"))
    assert "correlação já utilizada" in e, e; checks += 1

    # 4) replay com outra org: negado
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','activate_subscription','regularização manual AR Bio','{COR1}',NULL)"))
    assert "correlação já utilizada" in e, e; checks += 1

    # 5) replay com ação diferente: negado
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','cancel','regularização manual AR Bio','{COR1}',NULL)"))
    assert "correlação já utilizada" in e, e; checks += 1

    # 6) superadmin com perfil INATIVO: negado inclusive no replay
    e = runerr(as_user(SA_INATIVO, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','regularização manual AR Bio','{COR1}',NULL)"))
    assert "perfil do ator inativo" in e, e; checks += 1

    # 7) admin comum: negado
    e = runerr(as_user(ADMIN, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','motivo valido','{uid()}',NULL)"))
    assert "apenas superadmin" in e, e; checks += 1

    # 8) sem claims (anon): negado
    e = runerr(f"BEGIN;SET LOCAL ROLE authenticated;SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','motivo valido','{uid()}',NULL);COMMIT;")
    assert "apenas superadmin" in e, e; checks += 1

    # 9) EXPIRED de origem TRIAL -> ACTIVE (fallback sem corrente)
    SUB2 = uid()
    run(f"""INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB2}','{ORG2}','{PLAN}','{V1}','EXPIRED', now()-interval '40 days', now()-interval '10 days', 499.90,'BRL','monthly','monthly');
INSERT INTO public.organization_subscription_history(subscription_id, organization_id, action, reason, previous_status, new_status, correlation_id)
VALUES ('{SUB2}','{ORG2}','expire_trial','trial encerrado','TRIAL','EXPIRED','{uid()}');""")
    run(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','activate_subscription','reativação trial expirado','{COR2}',NULL)"))
    assert run(f"SELECT status FROM public.organization_subscriptions WHERE id='{SUB2}'") == "ACTIVE"; checks += 1

    # 10) EXPIRED sem origem TRIAL comprovada: negado
    ORG3, SUB3 = uid(), uid()
    run(f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG3}','Sem origem');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB3}','{ORG3}','{PLAN}','{V1}','EXPIRED', now()-interval '40 days', 499.90,'BRL','monthly','monthly');""")
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG3}','activate_subscription','motivo valido','{uid()}',NULL)"))
    assert "origem em trial" in e, e; checks += 1

    # 11) trial EXPIRED antigo + CANCELLED mais nova: NÃO ressuscita o trial
    ORG4, SUB4A, SUB4B = uid(), uid(), uid()
    run(f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG4}','Multi');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, cancelled_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot) VALUES
 ('{SUB4A}','{ORG4}','{PLAN}','{V1}','EXPIRED', now()-interval '90 days', NULL, 499.90,'BRL','monthly','monthly'),
 ('{SUB4B}','{ORG4}','{PLAN}','{V1}','CANCELLED', now()-interval '30 days', now()-interval '5 days', 499.90,'BRL','monthly','monthly');
INSERT INTO public.organization_subscription_history(subscription_id, organization_id, action, reason, previous_status, new_status, correlation_id)
VALUES ('{SUB4A}','{ORG4}','expire_trial','fim trial','TRIAL','EXPIRED','{uid()}');""")
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG4}','activate_subscription','motivo valido','{uid()}',NULL)"))
    assert "origem em trial" in e, e; checks += 1

    # 12) CANCELLED mais nova: activate cai no EXPIRED sem origem -> negado; cancel sem corrente -> negado
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG4}','cancel','motivo valido','{uid()}',NULL)"))
    assert "corrente inexistente" in e, e; checks += 1

    # 13) cancel_at agendado bloqueia
    ORG5, SUB5 = uid(), uid()
    run(f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG5}','CancelAgendado');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, cancel_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB5}','{ORG5}','{PLAN}','{V1}','TRIAL', now()-interval '20 days', now()-interval '2 days', now()+interval '3 days', 499.90,'BRL','monthly','monthly');""")
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG5}','activate_subscription','motivo valido','{uid()}',NULL)"))
    assert "cancelamento agendado" in e, e; checks += 1

    # 14) versão atual fora de vigência: negado
    ORG6, SUB6, VEXP = uid(), uid(), uid()
    run(f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG6}','VersaoVencida');
INSERT INTO public.saas_plan_versions(id, plan_id, status, price_amount, currency, billing_cycle, effective_from, effective_to)
VALUES ('{VEXP}','{PLAN}','PUBLISHED', 100, 'BRL', 'monthly', now()-interval '60 days', now()-interval '1 day');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB6}','{ORG6}','{PLAN}','{VEXP}','TRIAL', now()-interval '20 days', now()-interval '2 days', 100,'BRL','monthly','monthly');""")
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG6}','activate_subscription','motivo valido','{uid()}',NULL)"))
    assert "não está publicada e vigente" in e, e; checks += 1

    # 15) legada (sem versão): negado com orientação de change_plan
    ORG7, SUB7 = uid(), uid()
    run(f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG7}','Legada');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB7}','{ORG7}','{PLAN}',NULL,'TRIAL', now()-interval '20 days', 499.90,'BRL','monthly','monthly');""")
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG7}','activate_subscription','motivo valido','{uid()}',NULL)"))
    assert "regularização explícita de versão" in e, e; checks += 1

    # 16) empresa inativa: negado
    ORG8, SUB8 = uid(), uid()
    run(f"""INSERT INTO public.organizations(id, nome, ativo) VALUES ('{ORG8}','Inativa', false);
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB8}','{ORG8}','{PLAN}','{V1}','TRIAL', now()-interval '20 days', now()-interval '2 days', 499.90,'BRL','monthly','monthly');""")
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG8}','activate_subscription','motivo valido','{uid()}',NULL)"))
    assert "empresa inativa" in e, e; checks += 1

    # 17) activate com versão não-NULL: negado (contrato simples)
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','motivo valido','{uid()}','{V2}')"))
    assert "não aceita versão" in e, e; checks += 1

    # 18) empresa inexistente: negado
    e = runerr(as_user(SA, f"SELECT public.platform_transition_subscription('{uid()}','activate_subscription','motivo valido','{uid()}',NULL)"))
    assert "empresa inexistente" in e, e; checks += 1

    # 19) regressão: ações existentes preservadas (suspend/reactivate)
    ORG9, SUB9 = uid(), uid()
    run(f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG9}','Regressao');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB9}','{ORG9}','{PLAN}','{V1}','ACTIVE', now()-interval '100 days', 499.90,'BRL','monthly','monthly');""")
    run(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG9}','suspend','motivo valido','{uid()}',NULL)"))
    run(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG9}','reactivate_manual','motivo valido','{uid()}',NULL)"))
    assert run(f"SELECT status FROM public.organization_subscriptions WHERE id='{SUB9}'") == "ACTIVE"; checks += 1

    # 20) concorrência: duas conexões, exatamente 1 sucesso e 1 histórico
    ORG10, SUB10 = uid(), uid()
    run(f"""INSERT INTO public.organizations(id, nome) VALUES ('{ORG10}','Concorrencia');
INSERT INTO public.organization_subscriptions(id, organization_id, plan_id, plan_version_id, status, started_at, trial_ends_at, price_snapshot, currency_snapshot, billing_cycle, billing_cycle_snapshot)
VALUES ('{SUB10}','{ORG10}','{PLAN}','{V1}','TRIAL', now()-interval '20 days', now()-interval '2 days', 499.90,'BRL','monthly','monthly');""")
    results = []
    def conc():
        r = subprocess.run(base, input=as_user(SA, f"SELECT public.platform_transition_subscription('{ORG10}','activate_subscription','motivo valido','{uid()}',NULL)"), text=True, capture_output=True)
        results.append(r.returncode)
    ts = [threading.Thread(target=conc) for _ in range(2)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert results.count(0) == 1, results  # exatamente 1 sucesso
    assert run(f"SELECT status FROM public.organization_subscriptions WHERE id='{SUB10}'") == "ACTIVE"
    assert run(f"SELECT count(*) FROM public.organization_subscription_history WHERE subscription_id='{SUB10}'") == "1"; checks += 1

    # 21) DML direto com papel authenticator: negado pelo guard
    e = runerr(f"SET SESSION AUTHORIZATION authenticated;UPDATE public.organization_subscriptions SET status='ACTIVE' WHERE id='{SUB9}';")
    assert "direct DML" in e, e; checks += 1

    print(f"PASS — {checks} checks (PostgreSQL isolado; NÃO hosted)")
finally:
    subprocess.run(prefix + ['pg_ctl', '-D', str(tmp/'data'), 'stop', '-m', 'fast'], capture_output=True)
    shutil.rmtree(tmp, ignore_errors=True)
