"""Single reject delta from captured LIVE; no hosted operations, no grants."""
import hashlib, json, re
from pathlib import Path
H = Path(__file__).resolve().parent
SOURCE = H.parent / 'captured/public.reject_b2b_payment_terms_secure.40777d0c.local-20261030.sql'
PROVENANCE = H.parents[1] / 'commercial-plans-tenant-20261108/capture/provenance-20261108T1626Z.json'
SIG = 'public.reject_b2b_payment_terms_secure(uuid,text)'
LIVE_MD5 = '40777d0cec6a7d8a8d4dfcb3370b08b6'
SELLER = '007bb519-cba0-4704-be2c-cb93ad010048'
ACL = ['authenticated=X/postgres', 'postgres=X/postgres', 'service_role=X/postgres']
CANDIDATE_MD5 = ''  # measured preliminary rehearsal; blank refuses final generation
ROLLBACK_MD5 = ''
FILES = ('01-pre.sql.readonly','02-install.sql.review','03-post.sql.readonly','04-rollback-deny.sql.review')

def candidate():
    src = SOURCE.read_text()
    assert hashlib.md5((src.rstrip('\n')+'\n').encode()).hexdigest() == LIVE_MD5
    assert json.loads(PROVENANCE.read_text())['facts']['arbio_organization_id'] == SELLER
    head = src.split('AS $function$')[0]
    assert src.count('UPDATE public.partner_orders') == 1 and src.count('INSERT INTO public.partner_order_audit_logs') == 1
    # Keep the exact public signature, return type, DEFINER and search_path from LIVE.
    return head + '''AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_order public.partner_orders%ROWTYPE;
  v_terms public.partner_order_payment_terms%ROWTYPE;
  v_observed_terms uuid;
  v_observed_revision timestamptz;
  v_observed_partner uuid;
  v_external boolean;
BEGIN
  IF v_uid IS NULL OR current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'B2B_REJECT_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT po.*, po.c2_external_origin_snapshot IS NOT NULL INTO v_order
    FROM public.partner_orders po WHERE po.id=p_partner_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'B2B_REJECT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  v_observed_partner := v_order.partner_id;
  v_observed_terms := v_order.payment_terms_id;
  SELECT updated_at INTO v_observed_revision FROM public.partner_order_payment_terms
    WHERE id=v_observed_terms AND partner_order_id=p_partner_order_id;
  v_external := v_order.c2_external_origin_snapshot IS NOT NULL;
  v_org := public.h15_actor_organization();
  __AUTH__
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'reason_required' USING ERRCODE='22023'; END IF;
  -- Same first lock as stock batch, then approval's order -> child order.
  PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_GATE_UNAVAILABLE' USING ERRCODE='PT503'; END IF;
  SELECT * INTO v_order FROM public.partner_orders WHERE id=p_partner_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.partner_id IS DISTINCT FROM v_observed_partner
    OR v_order.payment_terms_id IS DISTINCT FROM v_observed_terms THEN
    RAISE EXCEPTION 'B2B_REJECT_CAS_CONFLICT' USING ERRCODE='PT409'; END IF;
  __AUTH__
  SELECT * INTO v_terms FROM public.partner_order_payment_terms
    WHERE id=v_order.payment_terms_id AND partner_order_id=v_order.id FOR UPDATE;
  IF NOT FOUND OR v_terms.updated_at IS DISTINCT FROM v_observed_revision THEN
    RAISE EXCEPTION 'B2B_REJECT_CAS_CONFLICT' USING ERRCODE='PT409'; END IF;
  __AUTH__
  IF v_terms.approval_status IS DISTINCT FROM 'pending' OR v_terms.approved_by IS NOT NULL
    OR v_terms.approved_at IS NOT NULL OR v_order.approved_by IS NOT NULL OR v_order.approved_at IS NOT NULL
    OR public.fn_b2b_status_is_approved_or_later(v_order.status::text)
    OR v_order.status::text IN ('cancelado','reprovado')
    OR EXISTS(SELECT 1 FROM public.estoque_produto s WHERE s.reservado_para_partner_order_id=v_order.id
      OR s.reservado_para_os_id IN (SELECT id FROM public.ordens_servico WHERE partner_order_id=v_order.id))
    OR EXISTS(SELECT 1 FROM public.estoque_movimentacoes m
      WHERE (m.acao='reserva' OR coalesce(m.reservado_posterior,0)>coalesce(m.reservado_anterior,0))
      AND (m.os_id IN (SELECT id FROM public.ordens_servico WHERE partner_order_id=v_order.id)
        OR m.metadata->>'partner_order_id'=v_order.id::text)) THEN
    RAISE EXCEPTION 'B2B_REJECT_STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  UPDATE public.partner_order_payment_terms SET approval_status='rejected', approved_by=v_uid,
    approved_at=now(), approval_notes=btrim(p_reason), updated_at=now()
    WHERE id=v_terms.id AND partner_order_id=v_order.id AND approval_status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'B2B_REJECT_STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  -- Frozen header and economic snapshots remain byte-identical. No notification/outbox.
  INSERT INTO public.partner_order_audit_logs(order_id,acao,usuario_id,dados_novos)
    VALUES(v_order.id,'payment_terms_rejected',v_uid,jsonb_build_object('reason',btrim(p_reason)));
  RETURN jsonb_build_object('success',true,'status','rejected');
END;
$function$
'''.replace('SELECT po.*, po.c2_external_origin_snapshot IS NOT NULL INTO v_order','SELECT po.* INTO v_order').replace('__AUTH__', auth_sql())

def auth_sql():
    return f'''IF auth.uid() IS DISTINCT FROM v_uid OR public.h15_actor_organization() IS DISTINCT FROM v_org
    OR platform_private.platform_actor_access_ready(v_uid) IS NOT TRUE
    OR public.is_platform_superadmin(v_uid) IS TRUE
    OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_uid AND role IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor','superadmin'))
    OR (v_order.c2_external_origin_snapshot IS NOT NULL) IS DISTINCT FROM v_external THEN
    RAISE EXCEPTION 'B2B_REJECT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  IF v_external THEN
    IF v_org IS DISTINCT FROM '{SELLER}'::uuid
      OR platform_private.c2p1_internal_actor(ARRAY['financeiro']::public.app_role[]) IS DISTINCT FROM v_org
      OR public._saas_user_has_feature(v_uid,'pedidos_b2b') IS NOT TRUE
      OR NOT EXISTS(SELECT 1 FROM public.partner_accounts pa JOIN public.organizations o ON o.id=pa.commercial_owner_organization_id
        WHERE pa.id=v_order.partner_id AND pa.commercial_owner_organization_id=v_org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL AND o.ativo IS TRUE AND o.status='ativa')
      OR v_order.internal_origin_snapshot IS NOT NULL
      OR platform_private.c2_external_origin_contract_valid(v_order.c2_external_origin_snapshot) IS NOT TRUE
      OR v_order.c2_external_origin_snapshot->>'organization_id' IS DISTINCT FROM v_org::text
      OR v_order.c2_external_origin_snapshot->>'partner_id' IS DISTINCT FROM v_order.partner_id::text
      OR v_order.c2_external_origin_snapshot->>'actor_user_id' IS DISTINCT FROM v_order.created_by::text
      OR NOT EXISTS(SELECT 1 FROM public.partner_users pu JOIN public.profiles p ON p.user_id=pu.user_id
        WHERE pu.user_id=v_order.created_by AND pu.partner_id=v_order.partner_id AND pu.tenant_id=v_org
          AND pu.revoked_at IS NULL AND (pu.valid_from IS NULL OR pu.valid_from<=clock_timestamp())
          AND p.ativo IS TRUE AND p.organization_id=v_org AND public.is_valid_b2b_partner_user(pu.user_id,pu.partner_id)) THEN
      RAISE EXCEPTION 'B2B_REJECT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  ELSE
    -- Legacy visibility is never widened; common state fences only narrow it.
    IF public.b2b_phase1_order_visible(p_partner_order_id) IS NOT TRUE
      OR NOT(public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'financeiro') OR public.has_role(v_uid,'gestor_comercial')) THEN
      RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;
  END IF;'''

def rollback():
    return SOURCE.read_text().split('AS $function$')[0] + "AS $function$\nBEGIN\n RAISE EXCEPTION 'B2B_REJECT_ROLLBACK_CLOSED' USING ERRCODE='42501';\nEND;\n$function$\n"

def guard(md5s):
    vals=','.join("'"+x+"'" for x in md5s)
    return f'''DO $$DECLARE p oid:=to_regprocedure('{SIG}'); BEGIN
 IF p IS NULL OR md5(pg_get_functiondef(p)) NOT IN ({vals}) OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=p) IS DISTINCT FROM 'postgres'
 OR (SELECT array_agg(a::text ORDER BY a::text) FROM pg_proc,unnest(proacl) a WHERE oid=p) IS DISTINCT FROM ARRAY[{','.join(repr(x) for x in ACL)}]::text[] THEN
 RAISE EXCEPTION 'B2B_REJECT_CATALOG_DRIFT'; END IF;END$$;\n'''

def render():
    assert re.fullmatch('[0-9a-f]{32}',CANDIDATE_MD5) and re.fullmatch('[0-9a-f]{32}',ROLLBACK_MD5), 'MEASURE_FIRST'
    pre=guard([LIVE_MD5]); post=guard([CANDIDATE_MD5]); rb=guard([ROLLBACK_MD5])
    return dict(zip(FILES, ('BEGIN READ ONLY;\n'+pre+"SELECT 'PRE_PASS';\nROLLBACK;\n",
      'BEGIN;\n'+pre+candidate()+';\n'+post+'COMMIT;\n',
      'BEGIN READ ONLY;\n'+post+"SELECT 'POST_PASS';\nROLLBACK;\n",
      'BEGIN;\n'+guard([LIVE_MD5,CANDIDATE_MD5,ROLLBACK_MD5])+rollback()+';\n'+rb+'COMMIT;\n')))

def verify_on_disk():
    files=render()
    assert all((H/n).read_bytes()==t.encode() for n,t in files.items()), 'FINAL_BYTES_DRIFT'
    return {n:hashlib.sha256(t.encode()).hexdigest() for n,t in files.items()}

def main():
    for n,t in render().items(): (H/n).write_text(t)
    (H/'candidate.sql.review').write_text(candidate()+';\n')
    (H/'manifest.json').write_text(json.dumps(dict(status='REVIEW_ONLY_INACTIVE',signature=SIG,live_md5=LIVE_MD5,candidate_md5=CANDIDATE_MD5,rollback_md5=ROLLBACK_MD5,acl=ACL,seller=SELLER,source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),provenance_sha256=hashlib.sha256(PROVENANCE.read_bytes()).hexdigest(),files=verify_on_disk()),indent=2)+'\n')
if __name__=='__main__': main()