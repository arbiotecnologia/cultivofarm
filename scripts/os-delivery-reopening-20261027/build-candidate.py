"""Offline review artifact generation. No network/database connection."""
import hashlib
import json
from pathlib import Path

H = Path(__file__).resolve().parent
fs = json.loads((H / 'live/definitions.json').read_text())['functions']
names = ['public.rpc_cockpit_criar_entrega_v1', 'public.fn_entrega_confirmar_engine_v1', 'public.rpc_entrega_cancelar_v1']
helper = """CREATE OR REPLACE FUNCTION platform_private.delivery_recovery_scope_v1(p_os uuid,p_origin text,p_delivery uuid,p_action text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $scope$
DECLARE u uuid:=auth.uid(); org uuid; o record; e record; allowed boolean;
BEGIN
 -- VOLATILE refresh after each wait. GUC stock context never grants authority.
 SELECT p.organization_id INTO org FROM public.profiles p JOIN public.organizations c
 ON c.id=p.organization_id AND c.ativo IS TRUE WHERE p.user_id=u AND p.ativo IS TRUE;
 IF u IS NULL OR org IS NULL OR public.technical_actor_ready(u) IS NOT TRUE
 OR public._saas_user_has_feature(u,'ordens_producao') IS NOT TRUE THEN
 RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_delivery IS NOT NULL THEN
 SELECT * INTO e FROM public.entregas WHERE id=p_delivery AND organization_id=org;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF e.partner_order_id IS NOT NULL THEN RAISE EXCEPTION 'DELIVERY_B2B_COMPOSITION_PENDING' USING ERRCODE='42501'; END IF;
 IF e.ordem_servico_onfarm_id IS NOT NULL THEN p_origin:='onfarm'; p_os:=e.ordem_servico_onfarm_id;
 ELSE p_origin:='manual'; p_os:=e.ordem_servico_id; END IF;
 END IF;
 IF p_origin IS NULL OR p_origin NOT IN ('manual','onfarm') OR p_os IS NULL THEN
 RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_origin='manual' THEN
 SELECT id,cliente_id,organization_id,partner_order_id INTO o FROM public.ordens_servico WHERE id=p_os AND organization_id=org;
 ELSE
 SELECT s.id,s.cliente_id,c.organization_id,NULL::uuid partner_order_id INTO o
 FROM public.ordens_servico_onfarm s JOIN public.clientes c ON c.id=s.cliente_id
 WHERE s.id=p_os AND c.organization_id=org;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF o.partner_order_id IS NOT NULL THEN RAISE EXCEPTION 'DELIVERY_B2B_COMPOSITION_PENDING' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=o.cliente_id AND organization_id=org) THEN
 RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u AND
 (r.role::text IN ('administrador','gestor')
 OR (p_action='create' AND r.role::text='producao')
 OR (p_action='confirm' AND r.role::text IN ('producao','administrativo'))
 OR (p_action='cancel' AND r.role::text='administrativo')
 OR (p_action IN ('create','confirm') AND p_origin='onfarm' AND r.role::text='operador_onfarm'
 AND EXISTS(SELECT 1 FROM public.user_clientes uc WHERE uc.user_id=u AND uc.cliente_id=o.cliente_id)))) INTO allowed;
 IF allowed IS NOT TRUE THEN RAISE EXCEPTION 'DELIVERY_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN org;
END $scope$;
REVOKE ALL ON FUNCTION platform_private.delivery_recovery_scope_v1(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.delivery_recovery_scope_v1(uuid,text,uuid,text) TO service_role;
"""
out=[]; pins=[]
for n in names:
 b=fs[n]['definition'].replace('\r\n','\n')
 b=b.replace(" SET search_path TO 'public', 'pg_temp'", " SET search_path TO 'public', 'pg_temp'\n SET lock_timeout TO '3s'")
 if 'criar' in n:
  scope="PERFORM platform_private.delivery_recovery_scope_v1(p_os_id,public.fn_cockpit_norm_origem(p_origem),NULL,'create');"
 elif 'engine' in n:
  scope="PERFORM platform_private.delivery_recovery_scope_v1(NULL,NULL,p_entrega_id,'confirm');"
 else:
  scope="PERFORM platform_private.delivery_recovery_scope_v1(NULL,NULL,p_entrega_id,'cancel');"
 b=b.replace('\nBEGIN\n','\nBEGIN\n'+scope+"\nPERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR SHARE;\nIF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_GATE_UNAVAILABLE' USING ERRCODE='42501'; END IF;\n"+scope+'\n',1)
 # Reauthorize immediately after every explicit advisory/row wait, before replay/write.
 import re
 b=re.sub(r'(PERFORM pg_advisory_xact_lock\([^;]+;)',r'\1\n'+scope,b)
 b=re.sub(r'(FOR UPDATE;)',r'\1\n'+scope,b)
 if 'criar' in n:
  b=b.replace('IF coalesce(p_quantidade, 0) <= 0 THEN', "IF p_quantidade IS NULL OR p_quantidade <= 0 OR p_quantidade::text IN ('NaN','Infinity','-Infinity') THEN")
  b=b.replace('  INSERT INTO public.entregas (',scope+"\n  PERFORM public.fn_estoque_ctx_open(jsonb_build_object('acao','entrega','origem','rpc_cockpit_criar_entrega_v1','usuario_id',v_uid::text));\n  INSERT INTO public.entregas (",1)
 if 'engine' in n:
  # Match inactive billing package ordering; acquire this key BEFORE delivery row.
  b=b.replace("  PERFORM pg_advisory_xact_lock(hashtext('cockpit_entrega:'", "  PERFORM pg_advisory_xact_lock(hashtext('entrega_faturar:' || p_entrega_id::text));\n"+scope+"\n  PERFORM pg_advisory_xact_lock(hashtext('cockpit_entrega:'",1)
  b=b.replace('  UPDATE public.entregas\n',scope+'\n  UPDATE public.entregas\n',1)
 if 'cancelar' in n:
  b=b.replace('  PERFORM set_config(',scope+'\n  PERFORM set_config(',1)
 out.append(b)
 pins.append({'name':n,'baseline':fs[n]['md5'],'candidate_source_sha256':hashlib.sha256(b.encode()).hexdigest(),'note':'pg_get_functiondef hash must come from local-candidate-hashes.json, not source text'})
body=helper+'\n'.join(out)
(H/'candidate-hardening.sql.review').write_text('-- INACTIVE HARDENING ONLY. NO CLIENT GRANTS. NOT A RELEASE MIGRATION.\n'+body)
(H/'candidate-pins.json').write_text(json.dumps(pins,indent=2)+'\n')
print('Generated three hardening bodies; client release remains blocked.')