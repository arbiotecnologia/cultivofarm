#!/usr/bin/env python3
# Harness PostgreSQL descartável para o candidato activate_subscription.
# PostgreSQL isolado (initdb local); NÃO hosted. Espelha o núcleo privado,
# guard de ticket, trigger de auditoria, require_published_version e
# trial_validate. Cobre: superadmin passa; admin comum/outro tenant/anon/
# inativo negam; TRIAL vencido→ACTIVE; EXPIRED-de-trial→ACTIVE; CANCELLED
# nega; versão não vigente falha; replay mesma correlação sem duplicidade;
# replay com payload/org diferente nega; concorrência com duas conexões;
# histórico único; DML direto negado pelo guard.
import subprocess, tempfile, os, threading
from pathlib import Path

tmp = Path(tempfile.mkdtemp(prefix="subreg-", dir="/tmp")); tmp.chmod(0o777)
prefix = ["setpriv","--reuid=1000","--regid=1000","--clear-groups"] if os.getuid()==0 else []
base = ["psql","-X","-h",str(tmp),"-p","55501","-U","postgres","-v","ON_ERROR_STOP=1","-qAt"]

checks = 0
def psql(sql, user=None):
    cmd = base + (["-U", user] if user else []) + ["-d", "postgres"]
    return subprocess.run(cmd, input=sql, text=True, capture_output=True)

def run(sql, user=None):
    r = psql(sql, user)
    assert r.returncode == 0, f"{sql[:160]} -> {r.stderr}"
    return r.stdout.strip()

try:
    subprocess.run(prefix+["initdb","-D",str(tmp/"data"),"-A","trust","-U","postgres"],check=True,capture_output=True)
    subprocess.run(prefix+["pg_ctl","-D",str(tmp/"data"),"-l",str(tmp/"log"),"-o",f'-k {tmp} -h "" -p 55501',"start"],check=True,capture_output=True)

    # ---- Espelho mínimo do schema live ----
    run("CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE ROLE authenticator NOLOGIN;")
    run("CREATE SCHEMA auth; CREATE SCHEMA platform_private; GRANT USAGE ON SCHEMA platform_private TO authenticated;")
    run("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;")
    run("CREATE TYPE public.saas_subscription_status AS ENUM ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED');")
    run("""CREATE TABLE public.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text);
CREATE TABLE public.saas_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_key text);
CREATE TABLE public.saas_plan_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid, version_number int, status text, effective_from timestamptz, effective_to timestamptz, price_amount numeric, currency text, billing_cycle text, trial_days int, limits_snapshot jsonb, features_snapshot jsonb, name_snapshot text);
CREATE TABLE public.organization_subscriptions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, plan_id uuid NOT NULL,
  status public.saas_subscription_status NOT NULL, billing_cycle text,
  started_at timestamptz NOT NULL, trial_ends_at timestamptz,
  current_period_start timestamptz, current_period_end timestamptz,
  cancel_at timestamptz, cancelled_at timestamptz, suspended_at timestamptz,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  plan_version_id uuid, price_snapshot numeric, currency_snapshot text, billing_cycle_snapshot text,
  limits_snapshot jsonb, features_snapshot jsonb, state_changed_at timestamptz, last_correlation_id uuid);
CREATE TABLE public.organization_subscription_history(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL, organization_id uuid NOT NULL,
  actor_user_id uuid, source text NOT NULL, reason text, old_values jsonb, new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), action text, correlation_id uuid,
  previous_status public.saas_subscription_status, new_status public.saas_subscription_status,
  previous_plan_id uuid, new_plan_id uuid, previous_plan_version_id uuid, new_plan_version_id uuid,
  price_snapshot numeric, currency_snapshot text, billing_cycle_snapshot text, limits_snapshot jsonb,
  payment_event_id text);
CREATE TABLE platform_private.authz_tickets(txid bigint, scope text, target uuid, UNIQUE(txid, scope, target));
CREATE TABLE public.platform_superadmins(user_id uuid PRIMARY KEY, ativo boolean NOT NULL DEFAULT true);""")
    run("""CREATE OR REPLACE FUNCTION public.is_platform_superadmin(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_superadmins WHERE user_id = u AND ativo); $$;""")
    run("""CREATE OR REPLACE FUNCTION platform_private.issue_ticket(_scope text, _target uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  INSERT INTO platform_private.authz_tickets(txid, scope, target) VALUES (txid_current(), _scope, _target) ON CONFLICT DO NOTHING; $$;
CREATE OR REPLACE FUNCTION platform_private.has_ticket(_scope text, _target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM platform_private.authz_tickets WHERE txid = txid_current() AND scope = _scope AND target = _target); $$;""")
    # Triggers live espelhados
    run("""CREATE OR REPLACE FUNCTION public.saas_subscription_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF session_user = 'authenticator' AND NOT platform_private.has_ticket('saas_subscription_write', NEW.organization_id) THEN
    RAISE EXCEPTION 'platform_forbidden: assinatura alterada fora do fluxo autorizado' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER saas_subscription_guard_trg BEFORE INSERT OR UPDATE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_guard();""")
    run("""CREATE OR REPLACE FUNCTION public.saas_subscription_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_old jsonb; v_new jsonb; v_reason text; v_action text; v_correlation uuid;
BEGIN
  v_new := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN v_old := to_jsonb(OLD); IF v_old = v_new THEN RETURN NEW; END IF; END IF;
  v_reason := nullif(current_setting('app.saas_change_reason', true), '');
  v_action := nullif(current_setting('app.saas_change_action', true), '');
  BEGIN v_correlation := nullif(current_setting('app.saas_correlation_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN v_correlation := NULL; END;
  INSERT INTO public.organization_subscription_history(
    subscription_id, organization_id, actor_user_id, source, reason, old_values, new_values, action, correlation_id,
    previous_status, new_status, previous_plan_id, new_plan_id, previous_plan_version_id, new_plan_version_id,
    price_snapshot, currency_snapshot, billing_cycle_snapshot, limits_snapshot)
  VALUES (NEW.id, NEW.organization_id, auth.uid(),
    CASE WHEN v_action = 'expire_trial' THEN 'system' ELSE 'rpc' END,
    COALESCE(v_reason, CASE WHEN TG_OP = 'INSERT' THEN 'subscription_created' ELSE 'subscription_updated' END),
    v_old, v_new, COALESCE(v_action, lower(TG_OP)), v_correlation,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END, NEW.status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_id ELSE NULL END, NEW.plan_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_version_id ELSE NULL END, NEW.plan_version_id,
    NEW.price_snapshot, NEW.currency_snapshot, NEW.billing_cycle_snapshot, NEW.limits_snapshot);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_org_subscriptions_audit AFTER INSERT OR UPDATE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_audit();""")
    run("""CREATE OR REPLACE FUNCTION public.saas_subscription_require_published_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_status text; v_trial_days integer;
BEGIN
  IF NEW.plan_version_id IS NULL THEN RETURN NEW; END IF;
  SELECT status,trial_days INTO v_status,v_trial_days FROM public.saas_plan_versions WHERE id=NEW.plan_version_id;
  IF v_status IS DISTINCT FROM 'PUBLISHED' THEN RAISE EXCEPTION 'platform_invalid: assinatura exige versão publicada' USING ERRCODE='22023'; END IF;
  IF NEW.status='TRIAL' AND TG_OP='INSERT' THEN
    IF v_trial_days IS NULL THEN RAISE EXCEPTION 'platform_invalid: versão sem período de teste' USING ERRCODE='22023'; END IF;
    NEW.trial_ends_at:=coalesce(NEW.started_at,now())+make_interval(days=>v_trial_days);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER saas_subscription_require_published_version_trg BEFORE INSERT OR UPDATE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_require_published_version();""")
    run("""CREATE OR REPLACE FUNCTION public.saas_trial_validate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.status='TRIAL' AND NEW.plan_version_id IS NOT NULL AND (NEW.started_at IS NULL OR NEW.trial_ends_at IS NULL OR NEW.trial_ends_at<>NEW.started_at+interval '14 days') THEN
    RAISE EXCEPTION 'platform_invalid: trial novo deve ter exatamente 14 dias' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER saas_trial_validate_trg BEFORE INSERT OR UPDATE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.saas_trial_validate();""")

    # Proteções do histórico (imutabilidade) espelhadas
    run("""CREATE OR REPLACE FUNCTION public.saas_subscription_history_no_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN RAISE EXCEPTION 'platform_forbidden: histórico imutável' USING ERRCODE='42501'; END $$;
CREATE TRIGGER organization_subscription_history_no_delete_trg BEFORE DELETE ON public.organization_subscription_history FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_history_no_mutation();
CREATE TRIGGER organization_subscription_history_no_mutation_trg BEFORE UPDATE ON public.organization_subscription_history FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_history_no_mutation();
CREATE TRIGGER trg_org_sub_history_no_mutation BEFORE TRUNCATE ON public.organization_subscription_history FOR EACH STATEMENT EXECUTE FUNCTION public.saas_subscription_history_no_mutation();""")

    # Núcleo no estado baseline (sem activate_subscription), depois wrapper,
    # e por fim o candidato substitui o núcleo — ordem da aplicação real.
    baseline = open(os.path.join(os.path.dirname(__file__), "baseline/transition_subscription_core.live.sql")).read()
    baseline = "\n".join(l for l in baseline.splitlines() if not l.strip().startswith("--"))
    run(baseline)
    run("""CREATE OR REPLACE FUNCTION public.platform_transition_subscription(_organization_id uuid, _action text, _reason text, _correlation_id uuid, _plan_version_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path TO '' AS $$
 SELECT platform_private.transition_subscription_core(_organization_id,_action,_reason,_correlation_id,_plan_version_id); $$;
GRANT EXECUTE ON FUNCTION public.platform_transition_subscription(uuid,text,text,uuid,uuid) TO authenticated;""")

    # ---- Candidato (comentários removidos) ----
    cand = open(os.path.join(os.path.dirname(__file__), "candidate.sql.review")).read()
    cand = "\n".join(l for l in cand.splitlines() if not l.strip().startswith("--"))
    run(cand)

    # ---- Identidades e dados ----
    SA  = "00000000-0000-4000-8000-0000000000a1"  # superadmin ativo
    ADM = "00000000-0000-4000-8000-0000000000a2"  # admin comum (não superadmin)
    INA = "00000000-0000-4000-8000-0000000000a3"  # superadmin inativo
    ORG1, ORG2 = "00000000-0000-4000-8000-0000000000e1", "00000000-0000-4000-8000-0000000000e2"
    PLAN = "00000000-0000-4000-8000-0000000000b1"
    VIG  = "00000000-0000-4000-8000-0000000000d1"  # versão vigente
    VENC = "00000000-0000-4000-8000-0000000000d2"  # versão fora de vigência
    run(f"""INSERT INTO public.platform_superadmins(user_id, ativo) VALUES ('{SA}', true), ('{INA}', false);
INSERT INTO public.organizations(id, nome) VALUES ('{ORG1}','Org Um'), ('{ORG2}','Org Dois');
INSERT INTO public.saas_plans(id, plan_key) VALUES ('{PLAN}','essencial');
INSERT INTO public.saas_plan_versions(id, plan_id, version_number, status, effective_from, effective_to, price_amount, currency, billing_cycle, trial_days, limits_snapshot, features_snapshot, name_snapshot)
VALUES ('{VIG}','{PLAN}',1,'PUBLISHED',now()-interval '30 days',NULL,499,'BRL','monthly',14,'{{}}','{{}}','Essencial v1'),
       ('{VENC}','{PLAN}',0,'PUBLISHED',now()-interval '2 years',now()-interval '1 year',399,'BRL','monthly',14,'{{}}','{{}}','Essencial v0');""")

    def as_user(u, sql):
        return psql(f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='{u}'; {sql}; COMMIT;")
    def ok_user(u, sql):
        r = as_user(u, sql); assert r.returncode == 0, f"{sql[:140]} -> {r.stderr}"; return r.stdout.strip()

    COR1 = "11111111-1111-4111-8111-111111111111"

    # 1. TRIAL vencido → ACTIVE (superadmin) — via RPC, com triggers reais
    ok_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','start_trial','trial inicial','{COR1}','{VIG}')")
    run(f"UPDATE public.organization_subscriptions SET trial_ends_at = now() - interval '1 day' WHERE organization_id='{ORG1}'")
    COR2 = "22222222-2222-4222-8222-222222222222"
    sub1 = ok_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','regularização contratual','{COR2}',NULL)")
    st = run(f"SELECT status || '|' || coalesce(billing_cycle,'-') || '|' || (current_period_end IS NOT NULL) || '|' || (trial_ends_at < now()) || '|' || (started_at < now()) FROM public.organization_subscriptions WHERE id='{sub1}'")
    assert st == "ACTIVE|monthly|true|true|true", st; checks += 1
    # trial_ends_at preservado (histórico), started_at preservado, período derivado do ciclo

    # 2. histórico único com ação/motivo/correlação e old/new status
    h = run(f"SELECT count(*), bool_and(action='activate_subscription' AND previous_status='TRIAL' AND new_status='ACTIVE' AND reason='regularização contratual' AND correlation_id='{COR2}' AND actor_user_id='{SA}') FROM public.organization_subscription_history WHERE subscription_id='{sub1}' AND action='activate_subscription'")
    assert h == "1|t", h; checks += 1

    # 3. replay mesma correlação/org/ação: retorna mesma assinatura, sem duplicar histórico
    again = ok_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','regularização contratual','{COR2}',NULL)")
    assert again == sub1, (again, sub1)
    c = run(f"SELECT count(*) FROM public.organization_subscription_history WHERE correlation_id='{COR2}'")
    assert c == "1", c; checks += 1

    # 4. replay mesma correlação com ORG diferente: negado
    r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','activate_subscription','outra org','{COR2}',NULL)")
    assert r.returncode != 0 and "correlação já utilizada" in r.stderr, r.stderr; checks += 1

    # 5. replay mesma correlação com AÇÃO diferente: negado
    r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','cancel','outro motivo','{COR2}',NULL)")
    assert r.returncode != 0 and "correlação já utilizada" in r.stderr, r.stderr; checks += 1

    # 6. admin comum negado; 7. anon negado; 8. superadmin inativo negado
    r = as_user(ADM, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','tentativa admin','33333333-3333-4333-8333-333333333333',NULL)")
    assert r.returncode != 0 and "apenas superadmin" in r.stderr, r.stderr; checks += 1
    r = psql(f"SET ROLE authenticated; SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','tentativa anon','44444444-4444-4444-8444-444444444444',NULL)")
    assert r.returncode != 0, r.stderr; checks += 1
    r = as_user(INA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','tentativa inativo','55555555-5555-4555-8555-555555555555',NULL)")
    assert r.returncode != 0 and "apenas superadmin" in r.stderr, r.stderr; checks += 1

    # 9. já ACTIVE: transição inválida (não amplia implicitamente)
    r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','já ativa','66666666-6666-4666-8666-666666666666',NULL)")
    assert r.returncode != 0 and "transição inválida" in r.stderr, r.stderr; checks += 1

    # 10. EXPIRED decorrente de trial → ACTIVE
    run(f"UPDATE public.organization_subscriptions SET status='TRIAL' WHERE id='{sub1}'")  # como superuser (sem guard de authenticator)
    ok_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','expire_trial','fim do trial','77777777-7777-4777-8777-777777777777',NULL)")
    assert run(f"SELECT status FROM public.organization_subscriptions WHERE id='{sub1}'") == "EXPIRED"
    COR3 = "88888888-8888-4888-8888-888888888888"
    again2 = ok_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','reativação pós-trial','{COR3}',NULL)")
    assert again2 == sub1
    assert run(f"SELECT status FROM public.organization_subscriptions WHERE id='{sub1}'") == "ACTIVE"; checks += 1

    # 11. CANCELLED nega
    ok_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','cancel','cancelamento','99999999-9999-4999-8999-999999999999',NULL)")
    r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG1}','activate_subscription','cancelado','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL)")
    assert r.returncode != 0 and ("transição inválida" in r.stderr or "assinatura corrente inexistente" in r.stderr), r.stderr; checks += 1

    # 12. versão fora de vigência falha
    ok_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','start_trial','trial org2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{VIG}')")
    run(f"UPDATE public.organization_subscriptions SET trial_ends_at = now() - interval '1 day' WHERE organization_id='{ORG2}'")
    r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','activate_subscription','versão vencida','cccccccc-cccc-4ccc-8ccc-cccccccccccc','{VENC}')")
    assert r.returncode != 0 and "fora de vigência" in r.stderr, r.stderr; checks += 1

    # 13. assinatura sem versão comercial: exige regularização antes (sem autoeleição)
    run(f"INSERT INTO public.organization_subscriptions(organization_id, plan_id, status, started_at, trial_ends_at) VALUES ('{ORG2}','{PLAN}','TRIAL',now()+interval '1 minute',now()-interval '6 days')")
    r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','activate_subscription','sem versão','dddddddd-dddd-4ddd-8ddd-dddddddddddd',NULL)")
    assert r.returncode != 0 and ("sem versão comercial" in r.stderr or "assinatura corrente inexistente" in r.stderr or "transição inválida" in r.stderr or "legada" in r.stderr), r.stderr; checks += 1
    # (a assinatura corrente de ORG2 é a mais recente por started_at — a legada sem versão)

    # 14. concorrência: duas conexões, mesma org, correlações diferentes — apenas uma converte
    run(f"UPDATE public.organization_subscriptions SET status='TRIAL' WHERE organization_id='{ORG2}' AND plan_version_id='{VIG}'")
    run(f"DELETE FROM public.organization_subscriptions WHERE organization_id='{ORG2}' AND plan_version_id IS NULL")
    results = []
    def concurrent(cor):
        results.append(as_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','activate_subscription','concorrência','{cor}',NULL)"))
    t1 = threading.Thread(target=concurrent, args=("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",))
    t2 = threading.Thread(target=concurrent, args=("ffffffff-ffff-4fff-8fff-ffffffffffff",))
    t1.start(); t2.start(); t1.join(); t2.join()
    oks = [r for r in results if r.returncode == 0]
    assert len(oks) >= 1 and run(f"SELECT status FROM public.organization_subscriptions WHERE organization_id='{ORG2}'") == "ACTIVE"
    assert run(f"SELECT count(*) FROM public.organization_subscriptions WHERE organization_id='{ORG2}' AND status='ACTIVE'") == "1"; checks += 1

    # 15. DML direto como authenticator sem ticket: negado pelo guard
    run("GRANT SELECT, UPDATE ON public.organization_subscriptions TO authenticator;")
    r = psql(f"SET SESSION AUTHORIZATION authenticator; UPDATE public.organization_subscriptions SET status='ACTIVE' WHERE organization_id='{ORG2}'")
    assert r.returncode != 0 and "fora do fluxo autorizado" in r.stderr, r.stderr; checks += 1

    # 16. ações existentes preservadas: suspend em ACTIVE funciona
    r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','suspend','suspensão teste','12121212-1212-4212-8212-121212121212',NULL)")
    assert r.returncode == 0 and run(f"SELECT status FROM public.organization_subscriptions WHERE organization_id='{ORG2}'") == "SUSPENDED"; checks += 1

    # 17. activate em SUSPENDED nega (não amplia implicitamente)
    r = as_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','activate_subscription','suspensa','13131313-1313-4313-8313-131313131313',NULL)")
    assert r.returncode != 0 and "transição inválida" in r.stderr, r.stderr; checks += 1

    # 18. cancel_at preservado (não limpo silenciosamente)
    run(f"UPDATE public.organization_subscriptions SET status='TRIAL', cancel_at=now()+interval '5 days' WHERE organization_id='{ORG2}'")
    ok_user(SA, f"SELECT public.platform_transition_subscription('{ORG2}','activate_subscription','com cancel_at','14141414-1414-4414-8414-141414141414',NULL)")
    assert run(f"SELECT status || '|' || (cancel_at IS NOT NULL) FROM public.organization_subscriptions WHERE organization_id='{ORG2}'") == "ACTIVE|true"; checks += 1

    print(f"PASS — {checks} checks (PostgreSQL isolado; NÃO hosted)")
finally:
    subprocess.run(prefix+["pg_ctl","-D",str(tmp/"data"),"-m","immediate","stop"],capture_output=True)
