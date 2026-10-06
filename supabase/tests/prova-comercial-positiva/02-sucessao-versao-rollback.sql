-- Prova da sucessão v1 -> v2 (rollback integral via RAISE no final).
DO $$
DECLARE
  v_sa uuid := 'b2c9bb8c-3ac3-4d65-b977-b7c873954b2e';
  v_adm uuid := 'd856140b-26c9-4d6a-a5aa-8bea47e78fff';
  v1 uuid := '713b1a31-ed4c-48b6-b6e7-22ebd3ee1092';
  v1_h0 text; v1_h1 text; subs0 text; subs1 text; pay0 text; pay1 text;
  d uuid; d2 uuid; pub uuid; pub2 uuid; k uuid := gen_random_uuid(); n int;
  eff timestamptz := '2026-11-01 03:00:00+00';
  feats jsonb := '[{"feature_key":"visitas_tecnicas","enabled":true},{"feature_key":"recomendacoes_alertas","enabled":true},{"feature_key":"fichas_tecnicas","enabled":true}]';
  o text := '';
BEGIN
  SELECT md5((to_jsonb(v) - 'effective_to' - 'updated_at')::text) INTO v1_h0 FROM public.saas_plan_versions v WHERE id=v1;
  SELECT md5(string_agg(row(s.*)::text,'|' ORDER BY s.id)) INTO subs0 FROM public.organization_subscriptions s;
  SELECT (SELECT count(*) FROM public.saas_payment_events)||'/'||(SELECT count(*) FROM public.saas_payment_outbox) INTO pay0;

  -- anon / não-superadmin
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  EXECUTE 'set local role anon';
  BEGIN PERFORM public.platform_save_plan_version_draft(NULL,'base',69.90,'BRL','monthly',14,'{}',eff,feats,'ab',gen_random_uuid()); o:=o||E'\nanon save ACEITO(FALHA)';
  EXCEPTION WHEN OTHERS THEN o:=o||E'\nanon save negado'; END;
  EXECUTE 'reset role';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_adm,'role','authenticated')::text, true);
  EXECUTE 'set local role authenticated';
  BEGIN PERFORM public.platform_save_plan_version_draft(NULL,'base',69.90,'BRL','monthly',14,'{}',eff,feats,'ab',gen_random_uuid()); o:=o||' | admin tenant save ACEITO(FALHA)';
  EXCEPTION WHEN OTHERS THEN o:=o||' | admin tenant save negado'; END;
  EXECUTE 'reset role';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_sa,'role','authenticated')::text, true);
  EXECUTE 'set local role authenticated';
  BEGIN PERFORM public.platform_save_plan_version_draft(v1,'base',69.90,'BRL','monthly',14,'{}',eff,feats,'ab',gen_random_uuid()); o:=o||E'\nsave com id PUBLISHED ACEITO(FALHA)';
  EXCEPTION WHEN OTHERS THEN o:=o||E'\nsave com id PUBLISHED negado ('||left(SQLERRM,40)||')'; END;
  d  := public.platform_save_plan_version_draft(NULL,'base',69.90,'BRL','monthly',14,'{}',eff,feats,'ab',gen_random_uuid());
  d2 := public.platform_save_plan_version_draft(d,'base',79.90,'BRL','monthly',14,'{}',eff,feats,'ab',gen_random_uuid());
  o:=o||format(E'\nv2 criado n=%s; segundo save mesmo draft=%s; drafts=%s',
    (SELECT version_number FROM public.saas_plan_versions WHERE id=d), d=d2,
    (SELECT count(*) FROM public.saas_plan_versions WHERE status='DRAFT'));

  -- falha intermediária: draft com vigência <= v1 -> rollback, v1 intacta
  BEGIN
    PERFORM public.platform_save_plan_version_draft(d,'base',79.90,'BRL','monthly',14,'{}','2026-10-01 00:00+00',feats,'ab',gen_random_uuid());
    PERFORM public.platform_publish_plan_version_draft(d,'ab',gen_random_uuid(),'PUBLICAR');
    o:=o||E'\nvigência anterior ACEITA(FALHA)';
  EXCEPTION WHEN OTHERS THEN o:=o||E'\nvigência anterior negada ('||left(SQLERRM,50)||')'; END;
  o:=o||' v1.effective_to após falha='||coalesce((SELECT effective_to::text FROM public.saas_plan_versions WHERE id=v1),'NULL')
       ||' draft.effective_from='||(SELECT effective_from::text FROM public.saas_plan_versions WHERE id=d);
  BEGIN
    PERFORM public.platform_save_plan_version_draft(d,'base',79.90,'BRL','monthly',14,'{}','2026-10-07 03:13+00',feats,'ab',gen_random_uuid());
    PERFORM public.platform_publish_plan_version_draft(d,'ab',gen_random_uuid(),'PUBLICAR');
    o:=o||E'\nvigência igual ACEITA(FALHA)';
  EXCEPTION WHEN OTHERS THEN o:=o||E'\nvigência igual negada'; END;

  BEGIN PERFORM public.platform_publish_plan_version_draft(d,'ab',k,'publicar'); o:=o||E'\nconfirmação errada ACEITA(FALHA)';
  EXCEPTION WHEN OTHERS THEN o:=o||E'\nconfirmação errada negada'; END;

  pub  := public.platform_publish_plan_version_draft(d,'ab',k,'PUBLICAR');
  pub2 := public.platform_publish_plan_version_draft(d,'  ab ',k,'PUBLICAR'); -- motivo normalizado igual
  o:=o||format(E'\npublicado=%s retry mesmo id=%s auditorias(published,superseded)=%s/%s',
    (SELECT status FROM public.saas_plan_versions WHERE id=d), pub=pub2,
    (SELECT count(*) FROM public.saas_plan_version_audit WHERE idempotency_key=k AND action='published'),
    (SELECT count(*) FROM public.saas_plan_version_audit WHERE idempotency_key=k AND action='superseded'));
  o:=o||format(E'\nv1 status=%s effective_to=%s igual inicio v2=%s',
    (SELECT status FROM public.saas_plan_versions WHERE id=v1),
    (SELECT effective_to FROM public.saas_plan_versions WHERE id=v1),
    (SELECT effective_to FROM public.saas_plan_versions WHERE id=v1) = eff);
  -- mesma chave + mesmo draft + motivo divergente = conflito, sem nova auditoria
  BEGIN PERFORM public.platform_publish_plan_version_draft(d,'outro motivo',k,'PUBLICAR'); o:=o||E'\nretry motivo divergente ACEITO(FALHA)';
  EXCEPTION WHEN OTHERS THEN o:=o||E'\nretry motivo divergente: '||left(SQLERRM,40); END;
  o:=o||format(' | auditorias após retries=%s', (SELECT count(*) FROM public.saas_plan_version_audit WHERE idempotency_key=k));
  -- mesma transação, ticket de sucessão já emitido para v1: encerrar v2 diretamente deve falhar
  BEGIN UPDATE public.saas_plan_versions SET effective_to=now()+interval '1 year' WHERE id=pub; GET DIAGNOSTICS n=ROW_COUNT; o:=o||E'\nencerrar v2 na mesma transação linhas='||n||' (FALHA)';
  EXCEPTION WHEN OTHERS THEN o:=o||E'\nencerrar v2 na mesma transação negado'; END;
  SELECT md5((to_jsonb(v) - 'effective_to' - 'updated_at')::text) INTO v1_h1 FROM public.saas_plan_versions v WHERE id=v1;
  o:=o||' v1 conteúdo inalterado='||(v1_h0=v1_h1);

  -- mesma chave em outro draft = conflito
  d := public.platform_save_plan_version_draft(NULL,'base',89.90,'BRL','monthly',14,'{}','2026-12-01 03:00+00',feats,'ab',gen_random_uuid());
  BEGIN PERFORM public.platform_publish_plan_version_draft(d,'ab',k,'PUBLICAR'); o:=o||E'\nmesma chave outro payload ACEITO(FALHA)';
  EXCEPTION WHEN OTHERS THEN o:=o||E'\nmesma chave outro payload: conflito'; END;

  -- alteração direta de v1 continua bloqueada
  BEGIN UPDATE public.saas_plan_versions SET price_amount=1 WHERE id=v1; GET DIAGNOSTICS n=ROW_COUNT; o:=o||E'\nupdate direto v1 linhas='||n;
  EXCEPTION WHEN OTHERS THEN o:=o||E'\nupdate direto v1 negado'; END;
  -- emitir ticket de sucessão para versão não vigente (v1 já encerrada) é negado
  EXECUTE 'reset role';
  BEGIN PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_supersede',v1); o:=o||E'\nticket p/ versão encerrada ACEITO(FALHA)';
  EXCEPTION WHEN OTHERS THEN o:=o||E'\nticket p/ versão encerrada negado'; END;

  SELECT md5(string_agg(row(s.*)::text,'|' ORDER BY s.id)) INTO subs1 FROM public.organization_subscriptions s;
  SELECT (SELECT count(*) FROM public.saas_payment_events)||'/'||(SELECT count(*) FROM public.saas_payment_outbox) INTO pay1;
  o:=o||format(E'\nassinaturas iguais=%s pagamentos %s->%s', subs0=subs1, pay0, pay1);
  RAISE EXCEPTION 'AUDIT_RESULT_ROLLBACK %', o;
END $$;
