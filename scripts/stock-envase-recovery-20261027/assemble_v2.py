"""Offline v2 generator rebased on the APPLIED post-atomic/proof state (a566faa4).
Sources: atomic capture/current.json (LIVE 30/10 bodies) + capture/post-expected.json
(bodies installed by release-combined). Never hosted; no grants to clients.
Every transformation must match exactly once (fail-closed)."""
from pathlib import Path
import hashlib, json, re
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'

def bodies():
    cur = json.loads((ATOMIC / 'capture/current.json').read_text())
    sup = json.loads((ATOMIC / 'capture/restore-supplement.json').read_text())
    out = {}
    for f in (cur['functions'] or []) + (sup.get('functions') or []):
        out.setdefault(f['schema'] + '.' + f['name'], []).append(f)
    post = {}
    for e in json.loads((ATOMIC / 'capture/post-expected.json').read_text()):
        ex = e.get('expected')
        if isinstance(ex, list):
            for f in ex:
                if isinstance(f, dict) and 'body' in f and 'signature' in f:
                    post[f['signature']] = f
    return out, post

def one(body, old, new, label):
    n = body.count(old)
    assert n == 1, f'{label}: anchor matched {n} times'
    return body.replace(old, new)

GATE = "PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;\n IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_GATE_UNAVAILABLE' USING ERRCODE='PT503'; END IF;\n"

SIGS = {
    'motor': 'public.rpc_estoque_operar_v1(p_acao text, p_item_id uuid, p_quantidade numeric, p_idempotency_key text, p_payload jsonb)',
    'group': 'public.rpc_cockpit_criar_entrega_v1(p_os_id uuid, p_origem text, p_itens jsonb, p_request_key text, p_dados jsonb, p_os_observed timestamp with time zone)',
}
REGPROC = {
    'motor': 'public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)',
    'batch': 'public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)',
    'group': 'public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)',
    'envase': 'public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text)',
    'material': 'public.fn_envase_material_imutavel()',
    'volume': 'public.fn_validate_envase_volume()',
    'cqparent': 'platform_private.guard_manual_cq_parent_v1()',
}

SCOPE = """CREATE FUNCTION platform_private.stock_envase_scope_v1(p_lote uuid,p_prog uuid,p_os uuid,p_origem text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $scope$
DECLARE org uuid; p public.programacao_producao%ROWTYPE; o public.ordens_servico%ROWTYPE; l public.lotes%ROWTYPE;
BEGIN
 org:=platform_private.stock_motor_actor('reserva');
 IF public.technical_actor_ready(auth.uid()) IS NOT TRUE OR public._saas_user_has_feature(auth.uid(),'envase') IS NOT TRUE
 OR public._saas_user_has_feature(auth.uid(),'ordens_producao') IS NOT TRUE THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF public.fn_cockpit_norm_origem(p_origem) IS DISTINCT FROM 'manual' THEN RAISE EXCEPTION 'ENVASE_ORIGIN_COMPOSITION_PENDING' USING ERRCODE='42501'; END IF;
 IF (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'producao')) IS NOT TRUE THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.programacao_producao WHERE id=p_prog AND organization_id=org;
 IF NOT FOUND OR p.ordem_servico_id IS DISTINCT FROM p_os OR p.ordem_servico_onfarm_id IS NOT NULL THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.ordens_servico WHERE id=p_os AND organization_id=org;
 IF NOT FOUND OR o.partner_order_id IS NOT NULL OR o.partner_order_item_id IS NOT NULL OR o.origem IS DISTINCT FROM 'agronomica'
 OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=o.cliente_id AND organization_id=org) THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.lotes WHERE id=p_lote AND organization_id=org;
 IF NOT FOUND OR l.programacao_id IS DISTINCT FROM p_prog OR l.produto_id IS DISTINCT FROM p.produto_id
 OR l.microrganismo_id IS DISTINCT FROM p.microrganismo_id THEN RAISE EXCEPTION 'ENVASE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN org;
END $scope$;
REVOKE ALL ON FUNCTION platform_private.stock_envase_scope_v1(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
"""

# Reviewed, transaction-specific authority for em_cq -> envase -> pronto_entrega.
# Not a CQ ticket: it never creates/edits CQ rows or lot status; it requires the
# existing CQ criteria (lot aprovado + latest CQ aprovado) and the envase rows of
# this lot, and is only callable from the envase core (no client EXECUTE).
COMPLETE = """CREATE FUNCTION platform_private.stock_envase_complete_v1(p_os uuid,p_prog uuid,p_lote uuid,p_estado text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' SET lock_timeout TO '3s' AS $complete$
DECLARE org uuid; o public.ordens_servico%ROWTYPE; p public.programacao_producao%ROWTYPE; l public.lotes%ROWTYPE; last_cq text; reserved numeric; prev text;
BEGIN
 org:=platform_private.stock_envase_scope_v1(p_lote,p_prog,p_os,'manual');
 IF p_estado NOT IN ('completed','completed_override') THEN RAISE EXCEPTION 'ENVASE_TRANSITION_STATE' USING ERRCODE='PT409'; END IF;
 IF p_estado='completed_override' AND public.fn_cockpit_is_gestor() IS NOT TRUE THEN RAISE EXCEPTION 'ENVASE_TRANSITION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.ordens_servico WHERE id=p_os AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR o.origem IS DISTINCT FROM 'agronomica' OR o.partner_order_id IS NOT NULL OR o.partner_order_item_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.production_order_link WHERE ordem_servico_id=p_os) THEN RAISE EXCEPTION 'ENVASE_TRANSITION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF org IS DISTINCT FROM platform_private.stock_envase_scope_v1(p_lote,p_prog,p_os,'manual') THEN RAISE EXCEPTION 'ENVASE_TRANSITION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 prev:=o.status::text;
 IF prev='pronto_entrega' THEN RETURN jsonb_build_object('success',true,'replay',true,'status','pronto_entrega'); END IF;
 IF prev NOT IN ('em_cq','envase') THEN RAISE EXCEPTION 'ENVASE_TRANSITION_STATE' USING ERRCODE='PT409'; END IF;
 SELECT * INTO p FROM public.programacao_producao WHERE id=p_prog AND organization_id=org AND ordem_servico_id=p_os AND ordem_servico_onfarm_id IS NULL FOR SHARE;
 SELECT * INTO l FROM public.lotes WHERE id=p_lote AND organization_id=org AND programacao_id=p_prog FOR SHARE;
 IF p.id IS NULL OR l.id IS NULL
 OR (SELECT count(*) FROM public.programacao_producao WHERE ordem_servico_id=p_os OR ordem_servico_onfarm_id=p_os)<>1
 OR (SELECT count(*) FROM public.lotes WHERE programacao_id=p_prog)<>1 THEN RAISE EXCEPTION 'ENVASE_TRANSITION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- Existing CQ criteria, unchanged: lot approved by the reviewed CQ core and latest result aprovado.
 SELECT resultado::text INTO last_cq FROM public.controle_qualidade WHERE lote_id=p_lote ORDER BY created_at DESC, seq DESC LIMIT 1;
 IF l.status::text IS DISTINCT FROM 'aprovado' OR last_cq IS DISTINCT FROM 'aprovado' THEN RAISE EXCEPTION 'ENVASE_TRANSITION_CQ_REQUIRED' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.envase WHERE lote_id=p_lote AND organization_id=org) THEN RAISE EXCEPTION 'ENVASE_TRANSITION_NO_ENVASE' USING ERRCODE='PT409'; END IF;
 SELECT coalesce(sum(volume_total),0)*1000 INTO reserved FROM public.estoque_produto
  WHERE reservado_para_os_id=p_os AND reservado_para_os_tipo='manual' AND status::text<>'estornado';
 IF p_estado='completed' AND reserved < coalesce(p.volume_necessario,0) THEN RAISE EXCEPTION 'ENVASE_TRANSITION_COVERAGE' USING ERRCODE='PT409'; END IF;
 -- Re-authorize after the programacao/lote/CQ waits and immediately before the first mutation.
 IF org IS DISTINCT FROM platform_private.stock_envase_scope_v1(p_lote,p_prog,p_os,'manual') THEN RAISE EXCEPTION 'ENVASE_TRANSITION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(pg_catalog.txid_current(),'manual_envase_transition_v1',p_os);
 IF prev='em_cq' THEN UPDATE public.ordens_servico SET status='envase' WHERE id=p_os; END IF;
 UPDATE public.ordens_servico SET status='pronto_entrega' WHERE id=p_os;
 DELETE FROM platform_private.authz_tickets WHERE txid=pg_catalog.txid_current() AND scope='manual_envase_transition_v1' AND target=p_os;
 INSERT INTO public.laboratorio_esteira_eventos(os_id,origem_os,programacao_id,lote_id,etapa_anterior,etapa_nova,acao,usuario_id,observacao)
 VALUES(p_os,'manual',p_prog,p_lote,prev,'pronto_entrega','concluir_envase_v2',auth.uid(),jsonb_build_object('estado',p_estado,'reservado_ml',reserved,'cq','aprovado')::text);
 RETURN jsonb_build_object('success',true,'replay',false,'status','pronto_entrega','status_anterior',prev);
END $complete$;
REVOKE ALL ON FUNCTION platform_private.stock_envase_complete_v1(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
"""

def build():
    fs, post = bodies()
    def rec(n):
        v = fs[n]; assert len(v) == 1, (n, len(v)); return v[0]
    def cur(n): return rec(n)['body'].replace('\r\n', '\n')
    def pin(n):
        r = rec(n); assert hashlib.md5(r['body'].encode()).hexdigest() == r['md5'], ('capture md5 mismatch', n); return r['md5']
    pre = {}
    out = ['-- INACTIVE v2. Rebased on applied release-combined a566faa4. No client grants.\n', SCOPE, COMPLETE]

    # 1) Motor: CURRENT post-atomic body (split delta kept byte-identical); gate inserted before its first row lock.
    m = post[SIGS['motor']]['body']; pre['motor'] = hashlib.md5(m.encode()).hexdigest()
    m = one(m, "  SELECT * INTO v_item FROM public.estoque_produto WHERE id=p_item_id FOR UPDATE;\n  PERFORM platform_private.stock_motor_context_set(NULL);",
            "  " + GATE + "  SELECT * INTO v_item FROM public.estoque_produto WHERE id=p_item_id FOR UPDATE;\n  PERFORM platform_private.stock_motor_context_set(NULL);", 'motor gate')
    out.append(m)

    # 2) Batch reserve: same gate before any lock.
    b = cur('public.rpc_estoque_reservar_v1'); pre['batch'] = pin('public.rpc_estoque_reservar_v1')
    b = one(b, '\nBEGIN\n', '\nBEGIN\n ' + GATE, 'batch gate')
    out.append(b)

    # 3) Envase core: scope, gate first, recheck after waits, NaN/line checks, reviewed transition.
    e = cur('public.rpc_cockpit_registrar_envase_v1'); pre['envase'] = pin('public.rpc_cockpit_registrar_envase_v1')
    check = "PERFORM platform_private.stock_envase_scope_v1(p_lote_id,p_programacao_id,p_os_id,p_origem);"
    e = re.sub(r"( SET search_path TO [^\n]+)", r"\1\n SET lock_timeout TO '3s'", e, count=1)
    e = one(e, '\nBEGIN\n', '\nBEGIN\n  ' + check + '\n  ' + GATE + '  ' + check + '\n', 'envase gate')
    n0 = e.count(check)
    e = re.sub(r'(pg_advisory_xact_lock\([^;]+;|FOR UPDATE;)', r'\1\n  ' + check, e)
    assert e.count(check) > n0 + 2, 'envase post-wait rechecks'
    e = one(e, 'IF v_produzido_ml <= 0 THEN', "IF v_produzido_ml <= 0 OR v_produzido_ml::text IN ('NaN','Infinity','-Infinity') THEN", 'envase nan')
    e = one(e, "IF (v_linha->>'quantidade') !~ '^[0-9]+$' THEN", "IF jsonb_typeof(v_linha)<>'object' OR NOT (v_linha ? 'quantidade') OR coalesce(v_linha->>'quantidade','') !~ '^[0-9]+$' THEN", 'envase line')
    e = one(e, "v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, v_origem, 'concluir_envase', p_programacao_id);",
            "v_avanco := platform_private.stock_envase_complete_v1(p_os_id, p_programacao_id, p_lote_id, v_estado);", 'envase transition')
    out.append(e)

    # 4) Material immutability without purge escape; finite volumes.
    mt = cur('public.fn_envase_material_imutavel'); pre['material'] = pin('public.fn_envase_material_imutavel')
    mt2 = re.sub(r'  -- Escape controlado.*?\n  END IF;\n', '', mt, count=1, flags=re.S)
    assert mt2 != mt and 'estoque_purge_fixture' not in mt2, 'purge escape removal'
    out.append(mt2)
    v = cur('public.fn_validate_envase_volume'); pre['volume'] = pin('public.fn_validate_envase_volume')
    v = one(v, 'IF NEW.volume_por_unidade IS NULL OR NEW.volume_por_unidade <= 0 THEN', "IF NEW.volume_por_unidade IS NULL OR NEW.volume_por_unidade <= 0 OR NEW.volume_por_unidade::text IN ('NaN','Infinity','-Infinity') THEN", 'vol unit')
    v = one(v, 'IF v_produzido IS NULL OR v_produzido <= 0 THEN', "IF v_produzido IS NULL OR v_produzido <= 0 OR v_produzido::text IN ('NaN','Infinity','-Infinity') THEN", 'vol prod')
    out.append(v)

    # 5) CQ parent guard: one additive branch for the envase ticket only (status-only em_cq->envase).
    g = cur('platform_private.guard_manual_cq_parent_v1'); pre['cqparent'] = pin('platform_private.guard_manual_cq_parent_v1')
    anchor = "  linked:=EXISTS(SELECT 1 FROM public.programacao_producao p JOIN public.lotes l ON l.programacao_id=p.id WHERE p.ordem_servico_id=OLD.id AND l.organization_id IS NOT NULL);\n"
    g = one(g, anchor, anchor + """  IF linked AND OLD.status::text='em_cq' AND NEW.status::text='envase'
   AND (to_jsonb(NEW)-'status'-'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at')
   AND EXISTS(SELECT 1 FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='manual_envase_transition_v1' AND target=OLD.id)
   AND EXISTS(SELECT 1 FROM public.programacao_producao p JOIN public.lotes l ON l.programacao_id=p.id
    WHERE p.ordem_servico_id=OLD.id AND l.status::text='aprovado' AND l.organization_id=OLD.organization_id)
  THEN RETURN NEW; END IF;
""", 'cq parent envase branch')
    out.append(g)

    # 6) Group delivery: consume a reservation proven exclusive to this OS (whole row), no release/re-reserve.
    d = post[SIGS['group']]['body']; pre['group'] = hashlib.md5(d.encode()).hexdigest()
    # 6a) Exact replay first: after actor/tenant authorization, request serialization, gate and OS scope lock,
    # but BEFORE any fresh-dispatch requirement (OS CAS/client/status, stock state). A committed group legitimately
    # leaves the OS/stock in a different state; the stored receipt is the answer. Fingerprint mismatch -> conflict;
    # revoked/foreign actor never reaches here (delivery_actor rechecked after every wait and right before return).
    d = one(d, """ IF v_os.cliente_id IS DISTINCT FROM v_original_client OR v_os.updated_at IS DISTINCT FROM p_os_observed THEN RAISE EXCEPTION 'DELIVERY_OBSERVED_CONFLICT' USING ERRCODE='PT409'; END IF;
 PERFORM 1 FROM public.clientes""", """ SELECT * INTO v_prev FROM platform_private.delivery_requests_20261030 WHERE request_key=p_request_key AND actor=v_actor AND organization_id=v_org AND action='group';
 IF FOUND THEN
  IF v_prev.fingerprint IS DISTINCT FROM v_fp THEN RAISE EXCEPTION 'DELIVERY_REPLAY_CONFLICT' USING ERRCODE='PT409'; END IF;
  -- Reference scope still binds the replay: client unchanged during the wait, still in tenant, and every receipt
  -- delivery belongs to this tenant/OS/client. Only the fresh-dispatch CAS/status/stock state is not required.
  IF v_os.cliente_id IS DISTINCT FROM v_original_client OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=v_os.cliente_id AND organization_id=v_org)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_prev.result->'itens') i LEFT JOIN public.entregas e ON e.id=(i.value->>'entrega_id')::uuid
   WHERE e.id IS NULL OR e.organization_id IS DISTINCT FROM v_org OR e.ordem_servico_id IS DISTINCT FROM p_os_id OR e.cliente_id IS DISTINCT FROM v_os.cliente_id)
  THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  IF platform_private.delivery_actor_20261030('group') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'DELIVERY_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  RETURN v_prev.result||jsonb_build_object('replay',true);
 END IF;
 IF v_os.cliente_id IS DISTINCT FROM v_original_client OR v_os.updated_at IS DISTINCT FROM p_os_observed THEN RAISE EXCEPTION 'DELIVERY_OBSERVED_CONFLICT' USING ERRCODE='PT409'; END IF;
 PERFORM 1 FROM public.clientes""", 'group early replay')
    # pre-lock observed check would also refuse a legitimate replay; keep it only as a fresh-dispatch fast path
    d = one(d, """ IF v_os.updated_at IS DISTINCT FROM p_os_observed THEN RAISE EXCEPTION 'DELIVERY_OBSERVED_CONFLICT' USING ERRCODE='PT409'; END IF;
 v_original_client:=v_os.cliente_id;""", """ v_original_client:=v_os.cliente_id;""", 'group prelock observed')
    # 6b) Delivery metadata: exact allowlist of EXISTING public.entregas columns that the single-item writer already
    # persists, with schema-appropriate validation BEFORE the fingerprint (so replay compares validated input).
    # Server-derived/boundary columns (cliente_id, grupo_entrega_id, status, receivable/financial/fiscal, proof,
    # confirmation, organization) are never accepted from the client.
    d = one(d, """ IF p_dados IS NULL OR jsonb_typeof(p_dados)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(p_dados) WHERE key NOT IN ('data_saida','motorista','veiculo','tipo_entrega','endereco_origem') OR jsonb_typeof(value) NOT IN ('string','null')) THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023'; END IF;""",
""" IF p_dados IS NULL OR jsonb_typeof(p_dados)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(p_dados) WHERE key NOT IN ('data_saida','motorista','veiculo','tipo_entrega','endereco_origem',
   'motorista_telefone','motorista_documento','veiculo_placa','veiculo_tipo','hora_saida_prevista','data_chegada_prevista','hora_chegada_prevista',
   'destinatario_nome','destinatario_telefone','destinatario_whatsapp','endereco_logradouro','endereco_numero','endereco_complemento',
   'endereco_bairro','endereco_cidade','endereco_uf','endereco_cep','endereco_referencia') OR jsonb_typeof(value) NOT IN ('string','null')
   OR (jsonb_typeof(value)='string' AND length(value#>>'{}')>300)) THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023'; END IF;
 FOR v_dk IN SELECT key FROM jsonb_each_text(p_dados) WHERE nullif(value,'') IS NOT NULL LOOP
  v_dv:=p_dados->>v_dk;
  IF v_dk IN ('data_saida','data_chegada_prevista') THEN
   IF v_dv !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023'; END IF;
   BEGIN IF to_char(v_dv::date,'YYYY-MM-DD')<>v_dv THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023'; END IF;
   EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023'; END;
  ELSIF v_dk IN ('hora_saida_prevista','hora_chegada_prevista') THEN
   IF v_dv !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023'; END IF;
  ELSIF v_dk='tipo_entrega' AND v_dv NOT IN ('motorista','retirada') THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023';
  ELSIF v_dk='endereco_origem' AND v_dv NOT IN ('cadastro','personalizado') THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023';
  ELSIF v_dk='endereco_uf' AND v_dv !~ '^[A-Za-z]{2}$' THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023';
  ELSIF v_dk='endereco_cep' AND v_dv !~ '^[0-9]{5}-?[0-9]{3}$' THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023';
  ELSIF v_dk IN ('motorista_telefone','destinatario_telefone','destinatario_whatsapp') AND v_dv !~ '^[0-9+() .-]{8,20}$' THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023';
  ELSIF btrim(v_dv)='' OR v_dv ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'DELIVERY_DATA_INVALID' USING ERRCODE='22023';
  END IF;
 END LOOP;""", 'group metadata allowlist')
    d = one(d, " v_result jsonb:='[]'; v_index integer:=0;", " v_row public.estoque_produto%ROWTYPE; v_free jsonb:='[]'; v_fi integer:=0; v_dk text; v_dv text;\n v_result jsonb:='[]'; v_index integer:=0;", 'group decl')
    d = one(d, """  PERFORM 1 FROM public.estoque_produto WHERE id=v_id FOR UPDATE;
  PERFORM platform_private.stock_motor_item(v_id,'reserva',jsonb_build_object('os_id',p_os_id,'os_tipo','manual','cliente_id',v_os.cliente_id));""",
            """  SELECT * INTO v_row FROM public.estoque_produto WHERE id=v_id FOR UPDATE;
  IF v_row.status::text='reservado' THEN
   IF v_row.reservado_para_os_id IS DISTINCT FROM p_os_id OR v_row.reservado_para_os_tipo IS DISTINCT FROM 'manual'
    OR v_row.reservado_para_cliente_id IS DISTINCT FROM v_os.cliente_id OR v_row.reservado_para_partner_id IS NOT NULL
    OR v_row.reservado_para_partner_order_id IS NOT NULL OR v_row.quantidade_reservada IS DISTINCT FROM v_row.quantidade
    OR v_row.quantidade IS DISTINCT FROM (v_item->>'quantidade')::numeric THEN RAISE EXCEPTION 'DELIVERY_RESERVATION_NOT_OWNED' USING ERRCODE='PT409'; END IF;
   PERFORM platform_private.stock_motor_item(v_id,'expedicao',jsonb_build_object('os_id',p_os_id,'os_tipo','manual','cliente_id',v_os.cliente_id));
  ELSIF v_row.status::text='disponivel' THEN
   PERFORM platform_private.stock_motor_item(v_id,'reserva',jsonb_build_object('os_id',p_os_id,'os_tipo','manual','cliente_id',v_os.cliente_id));
   v_free:=v_free||jsonb_build_array(v_item-'observed_updated_at');
  ELSE RAISE EXCEPTION 'DELIVERY_STOCK_UNAVAILABLE' USING ERRCODE='PT409'; END IF;""", 'group classify')
    d = one(d, """ v_batch:=public.rpc_estoque_reservar_v1(p_os_id,'manual',(SELECT jsonb_agg(value-'observed_updated_at') FROM jsonb_array_elements(v_items)),'delivery-reserve:'||md5(jsonb_build_array(v_actor,v_org,p_request_key)::text),jsonb_build_object('cliente_id',v_os.cliente_id));
 IF v_batch->>'ok' IS DISTINCT FROM 'true' OR v_batch->>'replay' IS DISTINCT FROM 'false' OR jsonb_array_length(v_batch->'itens')<>jsonb_array_length(v_items) THEN RAISE EXCEPTION 'DELIVERY_RESERVE_ACK_INVALID' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.stock_batch_requests WHERE request_key='delivery-reserve:'||md5(jsonb_build_array(v_actor,v_org,p_request_key)::text) AND result=v_batch) THEN RAISE EXCEPTION 'DELIVERY_RESERVE_ACK_INVALID' USING ERRCODE='PT409'; END IF;""",
            """ IF jsonb_array_length(v_free)>0 THEN
 v_batch:=public.rpc_estoque_reservar_v1(p_os_id,'manual',v_free,'delivery-reserve:'||md5(jsonb_build_array(v_actor,v_org,p_request_key)::text),jsonb_build_object('cliente_id',v_os.cliente_id));
 IF v_batch->>'ok' IS DISTINCT FROM 'true' OR v_batch->>'replay' IS DISTINCT FROM 'false' OR jsonb_array_length(v_batch->'itens')<>jsonb_array_length(v_free) THEN RAISE EXCEPTION 'DELIVERY_RESERVE_ACK_INVALID' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.stock_batch_requests WHERE request_key='delivery-reserve:'||md5(jsonb_build_array(v_actor,v_org,p_request_key)::text) AND result=v_batch) THEN RAISE EXCEPTION 'DELIVERY_RESERVE_ACK_INVALID' USING ERRCODE='PT409'; END IF;
 END IF;""", 'group batch')
    d = one(d, "  v_reserved:=(v_batch->'itens'->>v_index)::uuid; v_qty:=(v_item->>'quantidade')::numeric;",
            """  IF v_free @> jsonb_build_array(jsonb_build_object('item_id',v_item->'item_id')) THEN
   v_reserved:=(v_batch->'itens'->>v_fi)::uuid; v_fi:=v_fi+1;
  ELSE v_reserved:=(v_item->>'item_id')::uuid; END IF;
  v_qty:=(v_item->>'quantidade')::numeric;""", 'group map')
    out.append(d)

    cand = '\n'.join(x.rstrip() if x.rstrip().endswith(';') else x.rstrip() + ';' for x in out) + '\n'
    (H / 'candidate-v2.sql.review').write_text(cand)
    pins = {k: {'regprocedure': REGPROC[k], 'pre_md5': v} for k, v in pre.items()}
    (H / 'v2-pre-pins.json').write_text(json.dumps(pins, indent=2) + '\n')
    checks = ' OR '.join(f"md5(pg_get_functiondef('{p['regprocedure']}'::regprocedure))<>'{p['pre_md5']}'" for p in pins.values())
    absent = "to_regprocedure('platform_private.stock_envase_scope_v1(uuid,uuid,uuid,text)') IS NOT NULL OR to_regprocedure('platform_private.stock_envase_complete_v1(uuid,uuid,uuid,text)') IS NOT NULL"
    applied = "to_regclass('platform_private.delivery_context_20261030') IS NULL OR (SELECT count(*) FROM pg_trigger WHERE tgname='zz_delivery_mutation_closed')<>1"
    preflight = f"DO $pre$ BEGIN\n IF {applied} THEN RAISE EXCEPTION 'STOCK_V2_PRE_RELEASE_COMBINED_MISSING'; END IF;\n IF {absent} THEN RAISE EXCEPTION 'STOCK_V2_ALREADY_INSTALLED'; END IF;\n IF {checks} THEN RAISE EXCEPTION 'STOCK_V2_PRE_DRIFT'; END IF;\nEND $pre$;\n"
    (H / 'preflight-v2.sql.review').write_text(preflight)
    # Rollback: deny-only. Transition helper fails closed; guard returns to the exact
    # LIVE restrictive body; motor/batch/group return to the exact applied bodies.
    # Material/volume hardening stays (never restore the purge escape).
    rb = ["BEGIN;\n", "CREATE OR REPLACE FUNCTION platform_private.stock_envase_complete_v1(p_os uuid,p_prog uuid,p_lote uuid,p_estado text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $rb$ BEGIN RAISE EXCEPTION 'ENVASE_TRANSITION_CLOSED' USING ERRCODE='42501'; END $rb$;\n",
          post[SIGS['motor']]['body'] + ';\n', rec('public.rpc_estoque_reservar_v1')['body'] + ';\n', post[SIGS['group']]['body'] + ';\n', rec('platform_private.guard_manual_cq_parent_v1')['body'] + ';\n',
          "REVOKE ALL ON FUNCTION platform_private.stock_envase_complete_v1(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;\n", "COMMIT;\n"]
    (H / 'rollback-v2.sql.review').write_text(''.join(rb))
    return pins

if __name__ == '__main__':
    print(json.dumps(build(), indent=1))
