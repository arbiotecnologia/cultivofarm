"""Local-only envase delta. Exact source pin, deterministic catalog guards; no hosted IO."""
from pathlib import Path
import hashlib, json, re
H = Path(__file__).resolve().parent
V2 = H.parent
RPC = 'public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text)'
CAP = 'public.rpc_envase_capability_v1(uuid,uuid,uuid,text)'
LEGACY = ['public.rpc_confirmar_recebimento_entrega(uuid,jsonb)', 'public.rpc_desvincular_etiqueta_entrega(uuid,uuid,text)', 'public.rpc_vincular_etiqueta_embalagem(uuid,uuid)']
def legacy_delta():
    return ''.join(f'REVOKE EXECUTE ON FUNCTION {sig} FROM PUBLIC,anon,authenticated;\n' for sig in LEGACY)

def write_legacy(pre,post):
    delta=legacy_delta()
    acl='DO $acl$ BEGIN '+''.join(f"IF has_function_privilege('authenticated','{sig}','EXECUTE') OR has_function_privilege('anon','{sig}','EXECUTE') THEN RAISE EXCEPTION 'LEGACY_CLIENT_EXECUTE_REMAINS'; END IF;" for sig in LEGACY)+' END $acl$;\n'
    for name,value in [('candidate',delta),('preflight',guard(pre,'LEGACY_PRE_DRIFT')),('postflight',guard(post,'LEGACY_POST_DRIFT')+acl),('install',"BEGIN; SET LOCAL lock_timeout='3s';\n"+guard(pre,'LEGACY_PRE_DRIFT')+delta+guard(post,'LEGACY_POST_DRIFT')+acl+'COMMIT;\n'),('rollback',"BEGIN;\n"+delta+acl+'COMMIT;\n')]:
        (H/f'legacy-closure-{name}.sql.review').write_text(value)

def one(body, old, new):
    assert body.count(old) == 1, ('ANCHOR_CARDINALITY', old[:90], body.count(old))
    return body.replace(old, new)

def candidate():
    src = (V2 / 'candidate-v2.sql.review').read_text()
    assert hashlib.sha256(src.encode()).hexdigest() == '12d406373c9f8737aebe59e9fd38d4beddb8f78726f7df7ba8d53faf6c05cb29', 'V2_SOURCE_DRIFT'
    matches = re.findall(r'CREATE OR REPLACE FUNCTION public.rpc_cockpit_registrar_envase_v1\(.*?\$function\$;', src, re.S)
    assert len(matches)==1, 'ENVASE_SOURCE_CARDINALITY'
    body = matches[0]
    body = one(body,'BEGIN\n  PERFORM platform_private.stock_envase_scope_v1',"BEGIN\n  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'ENVASE_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000'; END IF;\n  PERFORM platform_private.stock_envase_scope_v1")
    body = one(body, "  PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;\n  PERFORM platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem);\n IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_GATE_UNAVAILABLE' USING ERRCODE='PT503'; END IF;", "  PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;\n IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_GATE_UNAVAILABLE' USING ERRCODE='PT503'; END IF;")
    body = one(body, '  -- idempotência: LOCK primeiro, leitura definitiva depois (claim atômico)', "  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 OR length(p_idempotency_key)>200 THEN RAISE EXCEPTION 'ENVASE_KEY_REQUIRED' USING ERRCODE='22023'; END IF;\n  -- idempotência: LOCK primeiro, leitura definitiva depois (claim atômico)")
    # Preserve already committed receipts/fingerprints; add a second, exact full-payload digest
    # to new receipt JSON, never rewrite historical receipts. Legacy receipts cannot prove
    # operator/reason equality and remain unavailable for automatic replay in this release.
    body = one(body, '  v_hash text;', '  v_hash text; v_full_hash text; v_org uuid;')
    body = one(body, "  IF p_validade <= current_date THEN RAISE EXCEPTION 'COCKPIT_ENVASE_VALIDADE_INVALIDA'; END IF;", '')
    body = one(body, "    PERFORM pg_advisory_xact_lock(hashtext(v_scope));", "    v_full_hash:=encode(extensions.digest(jsonb_build_object('args',jsonb_build_array(p_lote_id,p_os_id,v_origem,p_programacao_id,p_linhas,p_validade,p_operador,p_permitir_parcial,p_motivo_parcial),'actor',v_uid,'org',platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem))::text,'sha256'),'hex');\n    PERFORM pg_advisory_xact_lock(hashtext(v_scope));")
    body = one(body, "        RETURN v_row.resultado || jsonb_build_object('replay', true);", "        IF v_row.resultado->>'envase_release_fingerprint' IS NULL THEN RAISE EXCEPTION 'ENVASE_LEGACY_RECEIPT_REVIEW_REQUIRED' USING ERRCODE='PT409'; END IF;\n        IF v_row.resultado->>'envase_release_fingerprint' IS DISTINCT FROM v_full_hash THEN RAISE EXCEPTION 'COCKPIT_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409'; END IF;\n        PERFORM platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem);\n        RETURN (v_row.resultado-'envase_release_fingerprint') || jsonb_build_object('replay', true);")
    body = one(body, '  -- contexto canônico e coerência de vínculos', "  IF p_validade <= current_date THEN RAISE EXCEPTION 'COCKPIT_ENVASE_VALIDADE_INVALIDA'; END IF;\n  v_org:=platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem);\n  -- Lock OS before programacao/lote; all fresh states checked after wait.\n  PERFORM 1 FROM public.ordens_servico WHERE id=p_os_id AND organization_id=v_org FOR UPDATE;\n  PERFORM platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem);\n  IF NOT EXISTS(SELECT 1 FROM public.ordens_servico WHERE id=p_os_id AND organization_id=v_org AND status::text IN ('em_cq','envase')) THEN RAISE EXCEPTION 'ENVASE_FRESH_STATE_DENIED' USING ERRCODE='PT409'; END IF;\n  -- contexto canônico e coerência de vínculos")
    body = one(body, '      SET resultado = v_result, status', "      SET resultado = v_result||jsonb_build_object('envase_release_fingerprint',v_full_hash), status")
    # Auth is reread immediately before writes and before final receipt/return.
    body = one(body, "    INSERT INTO public.envase (", "    PERFORM platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem);\n    INSERT INTO public.envase (")
    body = one(body, '  IF v_scope IS NOT NULL THEN', '  PERFORM platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem);\n  IF v_scope IS NOT NULL THEN')
    ctx = """  SELECT * INTO v_ctx FROM public.fn_cockpit_ctx_programacao(p_programacao_id);
  IF v_ctx.os_id <> p_os_id THEN RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_PROGRAMACAO_OS'; END IF;
  IF v_ctx.origem <> v_origem THEN RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ORIGEM'; END IF;
  IF v_ctx.status_os IN ('cancelada','finalizada') THEN RAISE EXCEPTION 'COCKPIT_OS_ESTADO_TERMINAL'; END IF;
  PERFORM public.fn_cockpit_assert_b2b_liberado(v_ctx.partner_order_id);
"""
    body = one(body,ctx,'')
    body = one(body,'  IF v_lote_status IS NULL THEN',ctx+'\n  IF v_lote_status IS NULL THEN')
    roots = """  IF v_lote_status IS DISTINCT FROM 'aprovado' THEN RAISE EXCEPTION 'ENVASE_APPROVED_LOT_REQUIRED' USING ERRCODE='PT409'; END IF;
  IF (SELECT count(*) FROM public.programacao_producao WHERE ordem_servico_id=p_os_id OR ordem_servico_onfarm_id=p_os_id)<>1
   OR (SELECT count(*) FROM public.lotes WHERE programacao_id=p_programacao_id)<>1
   OR EXISTS(SELECT 1 FROM public.production_order_link WHERE ordem_servico_id=p_os_id) THEN RAISE EXCEPTION 'ENVASE_ROOT_AMBIGUOUS' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.estoque_produto s WHERE s.reservado_para_os_id=p_os_id AND s.status::text<>'estornado' AND
   (NOT EXISTS(SELECT 1 FROM public.lotes sl WHERE sl.id=s.lote_id AND sl.organization_id=v_org) OR s.lote_id IS DISTINCT FROM p_lote_id OR s.produto_id IS DISTINCT FROM v_produto_id OR s.microrganismo_id IS DISTINCT FROM v_micro_id
    OR s.reservado_para_os_tipo IS DISTINCT FROM 'manual' OR s.reservado_para_cliente_id IS DISTINCT FROM v_ctx.cliente_id OR s.reservado_para_partner_order_id IS NOT NULL
    OR s.status::text IS DISTINCT FROM 'reservado' OR s.quantidade_reservada IS DISTINCT FROM s.quantidade OR s.volume_total<=0 OR s.volume_total::text IN ('NaN','Infinity','-Infinity'))) THEN
    RAISE EXCEPTION 'ENVASE_RESERVATION_LINEAGE_DENIED' USING ERRCODE='42501'; END IF;
"""
    body = one(body,'  SELECT coalesce(sum(coalesce(volume_por_unidade,0)',roots+'\n  SELECT coalesce(sum(coalesce(volume_por_unidade,0)')
    fresh = """    IF platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'ENVASE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.ordens_servico WHERE id=p_os_id AND organization_id=v_org AND status::text IN ('em_cq','envase')) THEN RAISE EXCEPTION 'ENVASE_FRESH_STATE_DENIED' USING ERRCODE='PT409'; END IF;
    SELECT (resultado::text='aprovado') INTO v_cq_ok FROM public.controle_qualidade WHERE lote_id=p_lote_id ORDER BY created_at DESC,seq DESC LIMIT 1 FOR SHARE;
    IF coalesce(v_cq_ok,false) IS NOT TRUE THEN RAISE EXCEPTION 'ENVASE_FRESH_CQ_DENIED' USING ERRCODE='PT409'; END IF;
"""
    body = one(body,'    INSERT INTO public.envase (',fresh+'    INSERT INTO public.envase (')
    body = one(body,'  -- regra canônica de encerramento',fresh+'\n  -- regra canônica de encerramento')
    # Post-wait returns must preserve the originally locked tenant, not merely authorize any tenant.
    anchor='  -- Lock OS before programacao/lote; all fresh states checked after wait.'
    prefix,suffix=body.split(anchor)
    suffix=suffix.replace('PERFORM platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem);',"IF platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'ENVASE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;")
    body=prefix+anchor+suffix
    body=one(body,"  PERFORM public.fn_estoque_ctx_open(jsonb_build_object('acao','entrada','origem','rpc_cockpit_registrar_envase_v1','usuario_id',auth.uid()::text));","  PERFORM public.fn_estoque_ctx_force(jsonb_build_object('acao','entrada','origem','rpc_cockpit_registrar_envase_v1','usuario_id',auth.uid()::text));")
    env_payload="jsonb_build_object('id',v_envase_id,'lote_id',p_lote_id,'tipo_embalagem',v_tipo,'volume_por_unidade',v_unit_ml,'quantidade',v_qtd,'data_envase',current_date,'operador',nullif(p_operador,''),'organization_id',v_org,'etiqueta_gerada',false,'etiqueta_id',NULL,'etiqueta_gerada_em',NULL,'etiqueta_gerada_por',NULL)"
    body=one(body,'    INSERT INTO public.envase (lote_id,',f"    v_envase_id:=gen_random_uuid();\n    INSERT INTO platform_private.envase_insert_permits_v1(txid,actor,organization_id,action,target,lote,os,prog,payload) VALUES(txid_current(),v_uid,v_org,'envase',v_envase_id,p_lote_id,p_os_id,p_programacao_id,{env_payload});\n    INSERT INTO public.envase (id,lote_id,")
    body=one(body,'    VALUES (p_lote_id, v_tipo::public.tipo_embalagem','    VALUES (v_envase_id,p_lote_id, v_tipo::public.tipo_embalagem')
    # The permit executes before tenant_organization_guard: supply the authoritative
    # tenant explicitly, rather than comparing a NULL pre-trigger row to a filled row.
    body=one(body,'data_envase, operador)\n    VALUES (v_envase_id,','data_envase, operador, organization_id)\n    VALUES (v_envase_id,')
    body=one(body,"v_qtd, current_date, nullif(p_operador, ''))","v_qtd, current_date, nullif(p_operador, ''), v_org)")
    for typ,qty in [('reservado','v_reservadas'),('disponivel','v_livres')]:
        anchor=f'    IF {qty} > 0 THEN\n      INSERT INTO public.estoque_produto ('
        payload=f"jsonb_build_object('id',v_estoque_id,'produto_id',v_produto_id,'microrganismo_id',v_micro_id,'lote_id',p_lote_id,'envase_id',v_envase_id,'quantidade',{qty},'volume_total',(v_unit_ml*{qty})/1000.0,'validade',p_validade,'status','{typ}','reservado_para_os_id',"+('p_os_id' if typ=='reservado' else 'NULL')+",'reservado_para_os_tipo',"+('v_origem' if typ=='reservado' else 'NULL')+",'reservado_para_cliente_id',"+('v_ctx.cliente_id' if typ=='reservado' else 'NULL')+",'reservado_para_partner_id',NULL,'reservado_para_partner_order_id',"+('v_ctx.partner_order_id' if typ=='reservado' else 'NULL')+",'quantidade_reservada',"+(qty if typ=='reservado' else 'NULL')+")"
        payload=payload[:-1]+",'reservado_por',"+('v_uid' if typ=='reservado' else 'NULL')+",'reservado_em',"+('now()' if typ=='reservado' else 'NULL')+",'expedido_por',NULL,'expedido_em',NULL,'observacao_reserva',NULL)"
        body=one(body,anchor,f"    IF {qty} > 0 THEN\n      v_estoque_id:=gen_random_uuid();\n      INSERT INTO platform_private.envase_insert_permits_v1(txid,actor,organization_id,action,target,lote,os,prog,payload) VALUES(txid_current(),v_uid,v_org,'estoque_produto',v_estoque_id,p_lote_id,p_os_id,p_programacao_id,{payload});\n      INSERT INTO public.estoque_produto (id,")
    body=body.replace('        v_produto_id, v_micro_id, p_lote_id, v_envase_id,','        v_estoque_id,v_produto_id, v_micro_id, p_lote_id, v_envase_id,')
    body=one(body,'  v_result := jsonb_build_object(',"  IF EXISTS(SELECT 1 FROM platform_private.envase_insert_permits_v1 WHERE txid=txid_current()) THEN RAISE EXCEPTION 'ENVASE_PERMIT_NOT_CONSUMED' USING ERRCODE='42501'; END IF;\n  v_result := jsonb_build_object(")
    body=body.replace("    IF coalesce(v_cq_ok,false) IS NOT TRUE THEN", "    SELECT (resultado::text='aprovado') INTO v_cq_ok FROM public.controle_qualidade WHERE lote_id=p_lote_id ORDER BY created_at DESC,seq DESC LIMIT 1;\n    IF coalesce(v_cq_ok,false) IS NOT TRUE THEN")
    cap = """CREATE FUNCTION public.rpc_envase_capability_v1(p_lote uuid,p_os uuid,p_prog uuid,p_origem text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $cap$
DECLARE org uuid; allowed boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 BEGIN
  org:=platform_private.stock_envase_scope_v1(p_lote,p_prog,p_os,p_origem);
  -- Endpoint availability includes reconciliation of committed receipts after OS progressed.
  -- Fresh-dispatch status remains checked independently under the writer lock.
  allowed:=has_function_privilege('authenticated','public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text)','EXECUTE')
   AND EXISTS(SELECT 1 FROM cf_user_guards_v1.state WHERE singleton);
 EXCEPTION WHEN insufficient_privilege THEN allowed:=false; END;
 RETURN jsonb_build_object('capability','envase_isolated_v1','available',allowed,'actor_id',auth.uid(),'organization_id',org,'lote_id',p_lote,'os_id',p_os,'programacao_id',p_prog);
END $cap$;
REVOKE ALL ON FUNCTION public.rpc_envase_capability_v1(uuid,uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_envase_capability_v1(uuid,uuid,uuid,text) TO authenticated;
"""
    return (H/'entry.sql.review').read_text()+'\n'+body+'\n'+cap

# Entire relevant catalog (not counts): bodies/ACL/owner/config, columns/constraints,
# policies and exact trigger definitions. C ordering is independent of database locale.
TABLES = "'envase','estoque_produto','estoque_movimentacoes','lotes','controle_qualidade','ordens_servico','programacao_producao','entregas','produto_etiquetas','entrega_etiquetas','cockpit_operacao_idempotencia','laboratorio_esteira_eventos','organizations','organization_subscriptions','saas_plan_versions','saas_plan_version_features','saas_features','saas_modules','organization_feature_overrides','clientes','profiles','user_roles','platform_org_admin_invites'"
STATE = f"""SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid)),p.proacl::text,pg_get_userbyid(p.proowner),p.proconfig,p.prosecdef) ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C") FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('public','platform_private','cf_user_guards_v1')),
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.oid::regclass::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner)) ORDER BY c.oid::regclass::text COLLATE "C") FROM pg_class c WHERE (c.relnamespace='public'::regnamespace AND c.relname IN ({TABLES})) OR (c.relnamespace='platform_private'::regnamespace AND c.relname='envase_insert_permits_v1')),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text) ORDER BY a.attrelid::regclass::text COLLATE "C",a.attname COLLATE "C") FROM pg_attribute a WHERE a.attnum>0 AND NOT a.attisdropped AND a.attrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ({TABLES}))),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid),convalidated) ORDER BY conrelid::regclass::text COLLATE "C",conname COLLATE "C") FROM pg_constraint WHERE conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ({TABLES}))),
 'policies',(SELECT jsonb_agg(jsonb_build_array(tablename,policyname,permissive,roles::text,cmd,qual,with_check) ORDER BY tablename COLLATE "C",policyname COLLATE "C") FROM pg_policies WHERE schemaname='public' AND tablename IN ({TABLES})),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgrelid::regclass::text,tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgrelid::regclass::text COLLATE "C",tgname COLLATE "C",tgenabled::text COLLATE "C") FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ({TABLES}))))"""
def guard(expected, code):
    literal=json.dumps(expected).replace("'", "''")
    return f"DO $guard$ BEGIN IF ({STATE}) IS DISTINCT FROM '{literal}'::jsonb THEN RAISE EXCEPTION '{code}'; END IF; END $guard$;\n"
def write(pre, post):
    delta=candidate()
    for name,value in [('candidate.sql.review',delta),('preflight.sql.review',guard(pre,'ENVASE_PRE_DRIFT')),('postflight.sql.review',guard(post,'ENVASE_POST_DRIFT')),('state.sql.review',STATE+';\n')]: (H/name).write_text(value)
    (H/'install.sql.review').write_text("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';\n"+guard(pre,'ENVASE_PRE_DRIFT')+delta+guard(post,'ENVASE_POST_DRIFT')+'COMMIT;\n')
    # Candidate deliberately leaves writer closed. Separate release requires independent review.
    (H/'release.sql.review').write_text("BEGIN;\n"+guard(post,'ENVASE_RELEASE_DRIFT')+"DO $blocked$ BEGIN RAISE EXCEPTION 'ENVASE_RELEASE_REVIEW_AND_CONCURRENCY_REQUIRED' USING ERRCODE='42501'; END $blocked$;\nROLLBACK;\n")
    (H/'rollback.sql.review').write_text("BEGIN; SET LOCAL lock_timeout='3s';\n"+guard(post,'ENVASE_ROLLBACK_DRIFT')+f"REVOKE EXECUTE ON FUNCTION {RPC} FROM PUBLIC,anon,authenticated,service_role;\nCREATE OR REPLACE FUNCTION public.rpc_envase_capability_v1(p_lote uuid,p_os uuid,p_prog uuid,p_origem text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $deny$ BEGIN RETURN jsonb_build_object('capability','envase_isolated_v1','available',false,'actor_id',auth.uid(),'organization_id',NULL,'lote_id',p_lote,'os_id',p_os,'programacao_id',p_prog); END $deny$;\nCOMMIT;\n")
    for n,v in [('pre-state.json',pre),('post-state.json',post)]: (H/n).write_text(json.dumps(v,indent=2)+'\n')