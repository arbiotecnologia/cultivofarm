#!/usr/bin/env python3
"""Gera o delta a partir do corpo v2 instalado (stock-envase-recovery install-v2, LIVE md5 3e0dc7c4...).
Uma única âncora; nunca editar 02 à mão."""
import hashlib
from pathlib import Path
H=Path(__file__).parent
SRC=H.parents[1]/"stock-envase-recovery-20261027/install-v2.sql.review"
lines=SRC.read_text().splitlines(keepends=True)
start=next(i for i,l in enumerate(lines) if l.startswith("CREATE OR REPLACE FUNCTION public.rpc_estoque_reservar_v1("))
end=next(i for i in range(start,len(lines)) if lines[i].startswith("END $function$"))
live="".join(lines[start:end+1])
OLD=""" IF FOUND THEN
  IF v_prev.actor IS DISTINCT FROM v_actor OR v_prev.organization_id IS DISTINCT FROM v_org OR v_prev.fingerprint IS DISTINCT FROM v_fp THEN RAISE EXCEPTION 'ESTQ_IDEMPOTENCY_CONFLITO' USING ERRCODE='23505'; END IF;
  RETURN v_prev.result||jsonb_build_object('replay',true);
 END IF;
"""
NEW=""" IF FOUND THEN
  IF v_prev.actor IS DISTINCT FROM v_actor OR v_prev.organization_id IS DISTINCT FROM v_org OR v_prev.fingerprint IS DISTINCT FROM v_fp THEN RAISE EXCEPTION 'ESTQ_IDEMPOTENCY_CONFLITO' USING ERRCODE='23505'; END IF;
  -- Pós-espera: autoridade/tenant/referências/vigência ATUAIS antes de devolver qualquer recibo.
  IF platform_private.stock_motor_actor('reserva') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'ESTQ_REPLAY_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
   v_id:=(v_item->>'item_id')::uuid;
   PERFORM platform_private.stock_motor_item(v_id,'reserva',v_payload);
   IF NOT EXISTS(SELECT 1 FROM public.estoque_produto s WHERE s.id=v_id AND s.organization_id=v_org) THEN RAISE EXCEPTION 'ESTQ_REPLAY_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
   IF EXISTS(SELECT 1 FROM public.estoque_produto s WHERE s.id=v_id AND s.origem_estoque IS NOT NULL
     AND (CASE v_tipo
       WHEN 'b2b' THEN platform_private.resale_pilot_scope_v1('b2b_resale','reserve',v_actor,v_org,v_partner,v_order,(SELECT os.partner_order_item_id FROM public.ordens_servico os WHERE os.id=p_os_id AND os.organization_id=v_org),s.produto_id,s.id,NULL)
       WHEN 'manual' THEN platform_private.resale_pilot_scope_v1('finished_product','reserve',v_actor,v_org,NULL,NULL,NULL,s.produto_id,s.id,NULL)
       ELSE false END) IS NOT TRUE)
   THEN RAISE EXCEPTION 'RESALE_PILOT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  END LOOP;
  RETURN v_prev.result||jsonb_build_object('replay',true);
 END IF;
"""
assert live.count(OLD)==1,"ANCHOR_DRIFT"
cand=live.replace(OLD,NEW)
(H/"live-v2-body.sql").write_text(live)
(H/"02-install.sql.review").write_text(
"-- Delta INATIVO revisável (revisor: agente Codex). Só altera o ramo de recibo; caminho novo, splits e outras origens intactos.\n"
"-- Rodar somente após 01-pre PASS. Sem GRANT novo; ACL preservada pelo CREATE OR REPLACE.\nBEGIN;\n"
"DO $$BEGIN IF md5(pg_get_functiondef('public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)'::regprocedure)) IS DISTINCT FROM '3e0dc7c48ab28f4402699b234476aa8a' THEN RAISE EXCEPTION 'INSTALL_PIN_DRIFT_OR_RERUN'; END IF; END$$;\n"
+cand.rstrip("\n")+";\nCOMMIT;\n")
print(hashlib.sha256(live.encode()).hexdigest(), hashlib.sha256(cand.encode()).hexdigest())
