#!/usr/bin/env python3
"""Gera o candidato de produto acabado com corpos/pins capturados, sem hosted."""
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
DELIVERY = ROOT / "scripts/delivery-atomic-hardening-20261030"
CONF = DELIVERY / "confirmation"
BASE = json.loads((HERE / "baseline.json").read_text())
LIVE_FACTS = json.loads((HERE / "live-entry-guards-20261107T1737Z.json").read_text())
CURRENT = json.loads((DELIVERY / "capture/current.json").read_text())


def extract(text, qualified):
    m = None
    if qualified in ("platform_private.envase_insert_guard_v1", "platform_private.envase_insert_final_v1"):
        tag = "entry" if qualified.endswith("guard_v1") else "final"
        m = re.search(r"CREATE (?:OR REPLACE )?FUNCTION " + re.escape(qualified) + r"\b.*?END\s*\$" + tag + r"\$;", text, re.S)
    if m is None:
        m = re.search(r"CREATE (?:OR REPLACE )?FUNCTION " + re.escape(qualified) + r"\b.*?END \$\$;", text, re.S)
    if not m:
        m = re.search(r"CREATE (?:OR REPLACE )?FUNCTION " + re.escape(qualified) + r"\b.*?END;\s*\$function\$", text, re.S)
    if not m:
        m = re.search(r"CREATE (?:OR REPLACE )?FUNCTION " + re.escape(qualified) + r"\b.*?END\s*\$entry\$;", text, re.S)
    if not m:
        raise AssertionError("missing source " + qualified)
    return re.sub(r"^CREATE (?:OR REPLACE )?FUNCTION", "CREATE OR REPLACE FUNCTION", m.group())


def captured(qualified):
    short = qualified.split(".", 1)[1].split("(", 1)[0]
    matches = [f for f in CURRENT["functions"] if f["name"] == short and qualified.split("(", 1)[0] in f["signature"].replace("DEFAULT NULL::uuid", "")]
    # Assinaturas capturadas incluem defaults; selecionar pelo nome e arity esperada.
    if qualified.startswith("public.reservar_estoque_item"):
        matches = [f for f in CURRENT["functions"] if f["name"] == "reservar_estoque_item"]
    elif qualified.startswith("public.rpc_cockpit_criar_entrega_v1"):
        matches = [f for f in CURRENT["functions"] if f["name"] == "rpc_cockpit_criar_entrega_v1" and "p_estoque_produto_id" in f["signature"]]
    elif qualified.startswith("public.fn_sync_os_classica_downstream"):
        matches = [f for f in CURRENT["functions"] if f["name"] == "fn_sync_os_classica_downstream"]
    if len(matches) != 1:
        raise AssertionError("captured source drift " + qualified)
    body = matches[0]["body"].strip()
    if not body.endswith(";"):
        body += ";"
    return body


def one_replace(body, old, new, label):
    if body.count(old) != 1:
        raise AssertionError("anchor drift " + label + " count=" + str(body.count(old)))
    return body.replace(old, new)


def lit(value):
    return "'" + str(value).replace("'", "''") + "'"


def function_pin(entry, expected=None):
    sig = entry["signature"]
    expected = expected or entry["md5"]
    return f"""DO $$DECLARE p oid:=to_regprocedure({lit(sig)});BEGIN
 IF p IS NULL OR md5(pg_get_functiondef(p)) IS DISTINCT FROM {lit(expected)} THEN RAISE EXCEPTION 'FINISHED_PRE_FUNCTION_DRIFT {sig}';END IF;
 IF (SELECT r.rolname FROM pg_proc x JOIN pg_roles r ON r.oid=x.proowner WHERE x.oid=p) IS DISTINCT FROM {lit(entry['owner'])} THEN RAISE EXCEPTION 'FINISHED_PRE_OWNER_DRIFT {sig}';END IF;
 IF (SELECT coalesce(x.proacl::text,'') FROM pg_proc x WHERE x.oid=p) IS DISTINCT FROM {lit(entry['acl'])} THEN RAISE EXCEPTION 'FINISHED_PRE_ACL_DRIFT {sig}';END IF;
END$$;"""


def dependency_pin(entry):
    sig = entry["signature"]
    return f"""DO $$DECLARE p oid:=to_regprocedure({lit(sig)});BEGIN
 IF p IS NULL THEN RAISE EXCEPTION 'FINISHED_PRE_DEPENDENCY_MISSING {sig}';END IF;
 IF md5(pg_get_functiondef(p)) IS DISTINCT FROM {lit(entry['md5'])} THEN RAISE EXCEPTION 'FINISHED_PRE_FUNCTION_DRIFT {sig}';END IF;
 IF (SELECT r.rolname FROM pg_proc x JOIN pg_roles r ON r.oid=x.proowner WHERE x.oid=p) IS DISTINCT FROM {lit(entry['owner'])} THEN RAISE EXCEPTION 'FINISHED_PRE_OWNER_DRIFT {sig}';END IF;
 IF (SELECT coalesce(x.proacl::text,'') FROM pg_proc x WHERE x.oid=p) IS DISTINCT FROM {lit(entry['acl'])} THEN RAISE EXCEPTION 'FINISHED_PRE_ACL_DRIFT {sig}';END IF;
END$$;"""


def trigger_pin(entry):
    label = f"{entry['schema']}.{entry['table']}.{entry['name']}"
    return f"""DO $$DECLARE d text;e text;ty smallint;BEGIN
 SELECT pg_get_triggerdef(t.oid),t.tgenabled::text,t.tgtype INTO d,e,ty FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname={lit(entry['schema'])} AND c.relname={lit(entry['table'])} AND t.tgname={lit(entry['name'])};
 IF NOT FOUND OR d IS DISTINCT FROM {lit(entry['definition'])} OR e IS DISTINCT FROM {lit(entry['enabled'])} OR ty IS DISTINCT FROM {int(entry['type'])} THEN RAISE EXCEPTION 'FINISHED_TRIGGER_DRIFT {label}';END IF;
END$$;"""


def build():
    functions = {x["signature"]: x for x in BASE["functions"]}
    dependencies = {x["signature"]: x for x in BASE.get("dependency_functions", [])}
    if len(functions) != 11 or len(dependencies) != 1 or len(BASE.get("dependency_triggers", [])) != 1 or BASE["existing_candidate_columns"]:
        raise AssertionError("baseline incompleta ou colunas já presentes")
    for signature, entry in list(functions.items()) + list(dependencies.items()):
        reported = LIVE_FACTS["functions"].get(signature)
        if reported and entry["md5"] != reported["reported_md5"]:
            raise AssertionError("reported LIVE pin drift " + signature)
    reservar = captured("public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)")
    criar = captured("public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)")
    merge = extract((DELIVERY / "candidate.sql.review").read_text(), "platform_private.delivery_merge_split_20261030")
    confirm = extract((CONF / "candidate.sql.review").read_text(), "platform_private.delivery_confirm_apply_v1")
    send = extract((CONF / "send/candidate.sql.review").read_text(), "platform_private.delivery_send_apply_v1")
    sync = captured("public.fn_sync_os_classica_downstream()")
    isolated_source = (ROOT / "scripts/stock-envase-recovery-20261027/isolated/candidate.sql.review").read_text()
    entry_guard = extract(isolated_source, "platform_private.envase_insert_guard_v1")
    entry_final = extract(isolated_source, "platform_private.envase_insert_final_v1")
    lot_guard = captured("platform_private.guard_manual_lot_write_v1()")
    lab_guard = captured("platform_private.trg_lab_lot_biological_only()")
    entry_validate = captured("public.validate_estoque_entrada()")
    additive_fields = "'origem_estoque'-'unidade_comercial'-'conteudo_por_unidade'-'unidade_conteudo'-'quantidade_conteudo'-'embalagem_id'-'embalagem_versao'"
    for label, body in (("entry", entry_guard), ("final", entry_final)):
        changed = body.replace("(to_jsonb(NEW)-'created_at'-'updated_at')", "(to_jsonb(NEW)-'created_at'-'updated_at'-" + additive_fields + ")")
        changed = changed.replace("IS DISTINCT FROM p.payload", "IS DISTINCT FROM (p.payload-" + additive_fields + ")")
        if changed == body:
            raise AssertionError("additive image anchor drift " + label)
        if label == "entry": entry_guard = changed
        else: entry_final = changed
    entry_guard = one_replace(entry_guard, " -- Preserve ONLY the installed canonical partial reservation semantics under", """ -- Compra para revenda: contexto transacional e ticket específicos do writer privado.
 IF TG_TABLE_NAME='estoque_produto' AND NEW.origem_estoque='compra_produto_acabado_revenda'
  AND NEW.quantidade_reservada IS NULL
  AND EXISTS(SELECT 1 FROM platform_private.stock_motor_context x WHERE x.txid=txid_current() AND x.actor=auth.uid() AND x.ctx->>'acao'='entrada') THEN
  SELECT * INTO c FROM platform_private.stock_motor_context WHERE txid=txid_current() AND actor=auth.uid();
  IF FOUND AND c.item=NEW.id AND c.ctx->>'acao'='entrada' AND c.ctx->>'origem'='finished_product_purchase_entry_v1'
   AND c.ctx->'metadata'->>'stock_request_item'=NEW.id::text
   AND c.ctx->'metadata'->>'produto_id'=NEW.produto_id::text
   AND c.ctx->'metadata'->>'embalagem_id'=NEW.embalagem_id::text
   AND c.ctx->'metadata'->>'unidade_conteudo'=NEW.unidade_conteudo
   AND (c.ctx->'metadata'->>'conteudo_por_unidade')::numeric=NEW.conteudo_por_unidade
   AND (c.ctx->'metadata'->>'quantidade_conteudo')::numeric=NEW.quantidade_conteudo
   AND platform_private.finished_product_stock_valid_v1(NEW) IS TRUE
   AND EXISTS(SELECT 1 FROM platform_private.authz_tickets t WHERE t.txid=txid_current() AND t.scope='finished_product_purchase_entry_v1' AND t.target=NEW.id)
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'FINISHED_PRODUCT_PURCHASE_CONTEXT_DENIED' USING ERRCODE='42501';
 END IF;
 -- Preserve ONLY the installed canonical partial reservation semantics under""", "entry purchase guard")
    entry_guard = one_replace(entry_guard, "    AND NEW.validade IS NOT DISTINCT FROM parent.validade AND NEW.volume_total=NEW.quantidade*parent.volume_total/parent.quantidade", "    AND NEW.validade IS NOT DISTINCT FROM parent.validade\n    AND ((parent.origem_estoque IS NULL AND NEW.volume_total=NEW.quantidade*parent.volume_total/parent.quantidade) OR (parent.origem_estoque='compra_produto_acabado_revenda' AND platform_private.finished_product_stock_valid_v1(parent) IS TRUE AND NEW.origem_estoque=parent.origem_estoque AND NEW.unidade_comercial=parent.unidade_comercial AND NEW.conteudo_por_unidade=parent.conteudo_por_unidade AND NEW.unidade_conteudo=parent.unidade_conteudo AND NEW.quantidade_conteudo=NEW.quantidade*parent.conteudo_por_unidade AND NEW.embalagem_id=parent.embalagem_id AND NEW.embalagem_versao=parent.embalagem_versao AND NEW.volume_total IS NOT DISTINCT FROM (NEW.quantidade*parent.volume_total/parent.quantidade)))", "entry guard finished split")
    sync = one_replace(sync, "     AND (NEW.produto_id IS NOT NULL OR NEW.microrganismo_id IS NOT NULL) THEN", "     AND (NEW.produto_id IS NOT NULL OR NEW.microrganismo_id IS NOT NULL)\n     AND NOT EXISTS(SELECT 1 FROM public.entregas d JOIN public.estoque_produto s ON s.id=d.estoque_produto_id WHERE d.ordem_servico_id=NEW.id AND d.produto_id=NEW.produto_id AND d.status::text<>'cancelada' AND s.origem_estoque='compra_produto_acabado_revenda') THEN", "sync finished product")

    lot_guard = one_replace(lot_guard, " -- No JWT/GUC/current_user/service-role escape: only the reviewed insert RPC", """ org:=platform_private.h15_actor_organization();
 -- Compra de produto acabado para revenda: ticket privado, tenant e catálogo atual.
 IF TG_OP='INSERT' AND NEW.programacao_id IS NULL AND NEW.microrganismo_id IS NULL
  AND NEW.produto_id IS NOT NULL AND NEW.volume_produzido IS NULL AND NEW.status::text='aprovado'
  AND org IS NOT NULL AND NEW.organization_id=org AND public.technical_actor_ready(auth.uid()) IS TRUE
  AND public.fn_estoque_pode_operar(auth.uid(),'entrada') IS TRUE
  AND EXISTS(SELECT 1 FROM public.produtos pr WHERE pr.id=NEW.produto_id AND pr.owner_organization_id=org AND pr.ativo IS TRUE AND pr.familia_catalogo IN ('quimico','fertilizante_adubo'))
  AND EXISTS(SELECT 1 FROM platform_private.authz_tickets t WHERE t.txid=pg_catalog.txid_current() AND t.scope='finished_product_purchase_entry_v1' AND t.target=NEW.id)
 THEN RETURN NEW; END IF;

 -- No JWT/GUC/current_user/service-role escape: only the reviewed insert RPC""", "purchase lot guard")
    lab_guard = one_replace(lab_guard, "BEGIN\n  IF TG_OP='UPDATE'", """BEGIN
  IF TG_OP='INSERT' AND NEW.programacao_id IS NULL AND NEW.microrganismo_id IS NULL AND NEW.volume_produzido IS NULL
   AND EXISTS(SELECT 1 FROM platform_private.authz_tickets t WHERE t.txid=pg_catalog.txid_current() AND t.scope='finished_product_purchase_entry_v1' AND t.target=NEW.id)
  THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE'""", "purchase biological guard")
    entry_validate = one_replace(entry_validate, "  IF NEW.quantidade_reservada IS NOT NULL THEN\n    RETURN NEW;\n  END IF;", """  IF NEW.quantidade_reservada IS NOT NULL THEN
    -- Só uma divisão parcial no contexto canônico pode usar o retorno de reserva.
    IF NEW.origem_estoque='compra_produto_acabado_revenda' AND NOT EXISTS(
      SELECT 1 FROM platform_private.stock_motor_context x
      JOIN public.estoque_produto parent ON parent.id=x.item
      WHERE x.txid=pg_catalog.txid_current() AND x.actor=auth.uid() AND x.ctx->>'acao'='reserva'
        AND parent.id IS DISTINCT FROM NEW.id AND parent.origem_estoque='compra_produto_acabado_revenda'
        AND parent.lote_id=NEW.lote_id AND parent.status::text='disponivel'
        AND NEW.status::text='reservado' AND NEW.quantidade>0 AND NEW.quantidade<parent.quantidade
        AND NEW.quantidade_reservada=NEW.quantidade
    ) THEN
      RAISE EXCEPTION 'FINISHED_PRODUCT_RESERVATION_CONTEXT_DENIED' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;""", "purchase reservation shortcut")
    entry_validate = one_replace(entry_validate, "  -- Exigir envase para o lote\n  IF NOT EXISTS (SELECT 1 FROM public.envase WHERE lote_id = NEW.lote_id) THEN\n    RAISE EXCEPTION 'Não é possível criar entrada no estoque: o lote ainda não possui registro de envase.'\n      USING ERRCODE = 'check_violation';\n  END IF;", """  -- Compra para revenda usa ticket privado e snapshot; demais entradas continuam exigindo envase.
  IF NEW.origem_estoque='compra_produto_acabado_revenda' THEN
    IF platform_private.finished_product_stock_valid_v1(NEW) IS NOT TRUE
     OR NOT EXISTS(SELECT 1 FROM platform_private.authz_tickets t WHERE t.txid=pg_catalog.txid_current() AND t.scope='finished_product_purchase_entry_v1' AND t.target=NEW.id) THEN
      RAISE EXCEPTION 'FINISHED_PRODUCT_PURCHASE_ENTRY_DENIED' USING ERRCODE='42501';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.envase WHERE lote_id = NEW.lote_id) THEN
    RAISE EXCEPTION 'Não é possível criar entrada no estoque: o lote ainda não possui registro de envase.'
      USING ERRCODE = 'check_violation';
  END IF;""", "purchase stock entry guard")

    reservar = one_replace(reservar, "  v_volume_reservado := CASE", """  IF v_item.origem_estoque IS NOT NULL AND platform_private.finished_product_stock_valid_v1(v_item) IS NOT TRUE THEN
    RAISE EXCEPTION 'FINISHED_PRODUCT_STOCK_CONTRACT_DENIED' USING ERRCODE='23514';
  END IF;
  IF v_item.unidade_comercial='unidade' AND p_qty<>trunc(p_qty) THEN
    RAISE EXCEPTION 'FINISHED_PRODUCT_WHOLE_PACK_REQUIRED' USING ERRCODE='23514';
  END IF;

  v_volume_reservado := CASE""", "reserva contract")
    reservar = one_replace(reservar, "      quantidade_reservada, observacao_reserva\n    ) VALUES (", "      quantidade_reservada, observacao_reserva,\n      origem_estoque,unidade_comercial,conteudo_por_unidade,unidade_conteudo,quantidade_conteudo,embalagem_id,embalagem_versao\n    ) VALUES (", "reserva insert columns")
    reservar = one_replace(reservar, "      p_qty, p_observacao\n    ) RETURNING id INTO v_new_id;", "      p_qty, p_observacao,\n      v_item.origem_estoque,v_item.unidade_comercial,v_item.conteudo_por_unidade,v_item.unidade_conteudo,p_qty*v_item.conteudo_por_unidade,v_item.embalagem_id,v_item.embalagem_versao\n    ) RETURNING id INTO v_new_id;", "reserva insert values")
    reservar = one_replace(reservar, "      quantidade = v_item.quantidade - p_qty,\n      volume_total = CASE", "      quantidade = v_item.quantidade - p_qty,\n      quantidade_conteudo = CASE WHEN v_item.conteudo_por_unidade IS NOT NULL THEN (v_item.quantidade-p_qty)*v_item.conteudo_por_unidade ELSE NULL END,\n      volume_total = CASE", "reserva parent content")

    old_volume = """  IF v_est.volume_total IS NULL OR v_est.volume_total <= 0 OR v_est.volume_total::text IN ('NaN','Infinity','-Infinity')
     OR v_est.quantidade IS NULL OR v_est.quantidade <= 0 THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_VOLUME_ESTOQUE_INVALIDO';
  END IF;"""
    new_volume = """  IF v_est.quantidade IS NULL OR v_est.quantidade <= 0 THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_VOLUME_ESTOQUE_INVALIDO';
  END IF;
  IF v_est.origem_estoque IS NOT NULL THEN
    IF platform_private.finished_product_stock_valid_v1(v_est) IS NOT TRUE THEN
      RAISE EXCEPTION 'FINISHED_PRODUCT_STOCK_CONTRACT_DENIED' USING ERRCODE='23514';
    END IF;
  ELSIF v_est.volume_total IS NULL OR v_est.volume_total <= 0 OR v_est.volume_total::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_VOLUME_ESTOQUE_INVALIDO';
  END IF;"""
    criar = one_replace(criar, old_volume, new_volume, "criar volume")
    criar = one_replace(criar, "    data_saida, motorista, veiculo\n  ) VALUES (", "    data_saida, motorista, veiculo,\n    origem_estoque,unidade_comercial,conteudo_por_unidade,unidade_conteudo,quantidade_conteudo,embalagem_id,embalagem_versao\n  ) VALUES (", "entrega insert columns")
    criar = one_replace(criar, "    nullif(p_dados->>'veiculo','')\n  ) RETURNING id INTO v_id;", "    nullif(p_dados->>'veiculo',''),\n    v_est.origem_estoque,v_est.unidade_comercial,v_est.conteudo_por_unidade,v_est.unidade_conteudo,CASE WHEN v_est.origem_estoque='compra_produto_acabado_revenda' THEN p_quantidade*v_est.conteudo_por_unidade ELSE NULL END,v_est.embalagem_id,v_est.embalagem_versao\n  ) RETURNING id INTO v_id;", "entrega insert values")
    criar = one_replace(criar, "    volume_entregue_ml = round((v_est.volume_total / v_est.quantidade) * p_quantidade * 1000, 6),", "    volume_entregue_ml = CASE WHEN v_est.origem_estoque='compra_produto_acabado_revenda' AND v_est.unidade_conteudo IN ('kg','g') THEN NULL ELSE round((v_est.volume_total / v_est.quantidade) * p_quantidade * 1000, 6) END,", "entrega no weight ml")

    merge = one_replace(merge, " OR v_s.volume_total IS NULL OR v_s.volume_total<=0 OR v_s.volume_total::text IN ('NaN','Infinity','-Infinity')", " OR (v_s.origem_estoque IS NULL AND (v_s.volume_total IS NULL OR v_s.volume_total<=0 OR v_s.volume_total::text IN ('NaN','Infinity','-Infinity'))) OR (v_s.origem_estoque IS NOT NULL AND platform_private.finished_product_stock_valid_v1(v_s) IS NOT TRUE)", "merge source balance")
    merge = one_replace(merge, "v_main.validade IS DISTINCT FROM v_s.validade", "v_main.validade IS DISTINCT FROM v_s.validade OR v_main.origem_estoque IS DISTINCT FROM v_s.origem_estoque OR v_main.unidade_comercial IS DISTINCT FROM v_s.unidade_comercial OR v_main.conteudo_por_unidade IS DISTINCT FROM v_s.conteudo_por_unidade OR v_main.unidade_conteudo IS DISTINCT FROM v_s.unidade_conteudo OR v_main.embalagem_id IS DISTINCT FROM v_s.embalagem_id OR v_main.embalagem_versao IS DISTINCT FROM v_s.embalagem_versao", "merge metadata")
    merge = one_replace(merge, " OR v_main.volume_total IS NULL OR v_main.volume_total<=0 OR v_main.volume_total::text IN ('NaN','Infinity','-Infinity')", " OR (v_main.origem_estoque IS NULL AND (v_main.volume_total IS NULL OR v_main.volume_total<=0 OR v_main.volume_total::text IN ('NaN','Infinity','-Infinity')))", "merge main balance")
    merge = one_replace(merge, "v_total:=v_main.quantidade+v_s.quantidade; v_volume:=v_main.volume_total+v_s.volume_total;", "v_total:=v_main.quantidade+v_s.quantidade; v_volume:=CASE WHEN v_main.volume_total IS NULL AND v_s.volume_total IS NULL THEN NULL ELSE coalesce(v_main.volume_total,0)+coalesce(v_s.volume_total,0) END;", "merge volume sum")
    merge = one_replace(merge, " IF v_total IS NULL OR v_volume IS NULL OR v_total<=0 OR v_volume<=0 OR v_total::text IN ('NaN','Infinity','-Infinity') OR v_volume::text IN ('NaN','Infinity','-Infinity') THEN", " IF v_total IS NULL OR v_total<=0 OR v_total::text IN ('NaN','Infinity','-Infinity') OR (v_main.origem_estoque IS NULL AND (v_volume IS NULL OR v_volume<=0 OR v_volume::text IN ('NaN','Infinity','-Infinity'))) THEN", "merge total validation")
    merge = one_replace(merge, "SET status='estornado',quantidade=0,volume_total=0,quantidade_reservada=0", "SET status='estornado',quantidade=0,volume_total=CASE WHEN origem_estoque='compra_produto_acabado_revenda' AND unidade_conteudo IN ('kg','g') THEN NULL ELSE 0 END,quantidade_conteudo=CASE WHEN origem_estoque IS NOT NULL THEN 0 ELSE quantidade_conteudo END,quantidade_reservada=0", "merge retire")
    merge = one_replace(merge, "SET quantidade=v_total,volume_total=v_volume WHERE id=v_main.id;", "SET quantidade=v_total,volume_total=v_volume,quantidade_conteudo=CASE WHEN v_main.conteudo_por_unidade IS NOT NULL THEN v_total*v_main.conteudo_por_unidade ELSE NULL END WHERE id=v_main.id;", "merge main update")
    merge = one_replace(merge, "volume_posterior=v_volume", "volume_posterior=coalesce(v_volume,0)", "merge null ledger")

    for label, body, error in (("confirm", confirm, "DELIVERY_CONFIRM_LINEAGE_DENIED"), ("send", send, "DELIVERY_SEND_LINEAGE_DENIED")):
        old = f""" IF s.id IS NULL OR l.id IS NULL OR pp.id IS NULL OR e.lote_id IS DISTINCT FROM l.id OR pp.ordem_servico_id IS DISTINCT FROM e.ordem_servico_id OR pp.ordem_servico_onfarm_id IS NOT NULL
 OR s.produto_id IS DISTINCT FROM l.produto_id OR e.produto_id IS DISTINCT FROM l.produto_id OR pp.produto_id IS DISTINCT FROM l.produto_id
 OR s.reservado_para_os_id IS DISTINCT FROM e.ordem_servico_id OR s.reservado_para_os_tipo IS DISTINCT FROM 'manual' OR s.reservado_para_cliente_id IS DISTINCT FROM e.cliente_id OR s.reservado_para_partner_order_id IS NOT NULL
 THEN RAISE EXCEPTION '{error}' USING ERRCODE='42501'; END IF;"""
        new = f""" IF s.id IS NULL OR l.id IS NULL OR e.lote_id IS DISTINCT FROM l.id
 OR s.produto_id IS DISTINCT FROM l.produto_id OR e.produto_id IS DISTINCT FROM l.produto_id
 OR (s.origem_estoque IS NULL AND (pp.id IS NULL OR pp.ordem_servico_id IS DISTINCT FROM e.ordem_servico_id OR pp.ordem_servico_onfarm_id IS NOT NULL OR pp.produto_id IS DISTINCT FROM l.produto_id))
 OR (s.origem_estoque IS NOT NULL AND platform_private.finished_product_delivery_valid_v1(s,e,l) IS NOT TRUE)
 OR s.reservado_para_os_id IS DISTINCT FROM e.ordem_servico_id OR s.reservado_para_os_tipo IS DISTINCT FROM 'manual' OR s.reservado_para_cliente_id IS DISTINCT FROM e.cliente_id OR s.reservado_para_partner_order_id IS NOT NULL
 THEN RAISE EXCEPTION '{error}' USING ERRCODE='42501'; END IF;"""
        changed = one_replace(body, old, new, label + " lineage")
        if label == "confirm": confirm = changed
        else: send = changed

    ddl = r"""
CREATE TABLE platform_private.finished_product_gate_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO platform_private.finished_product_gate_v1(singleton,enabled) VALUES(true,false);
REVOKE ALL ON platform_private.finished_product_gate_v1 FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.finished_product_gate_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_produto ADD COLUMN origem_estoque text,ADD COLUMN unidade_comercial text,ADD COLUMN conteudo_por_unidade numeric,ADD COLUMN unidade_conteudo text,ADD COLUMN quantidade_conteudo numeric,ADD COLUMN embalagem_id uuid,ADD COLUMN embalagem_versao integer;
ALTER TABLE public.entregas ADD COLUMN origem_estoque text,ADD COLUMN unidade_comercial text,ADD COLUMN conteudo_por_unidade numeric,ADD COLUMN unidade_conteudo text,ADD COLUMN quantidade_conteudo numeric,ADD COLUMN embalagem_id uuid,ADD COLUMN embalagem_versao integer;
ALTER TABLE public.estoque_produto ADD CONSTRAINT finished_product_unit_contract CHECK (
 (origem_estoque IS NULL AND unidade_comercial IS NULL AND conteudo_por_unidade IS NULL AND unidade_conteudo IS NULL AND quantidade_conteudo IS NULL AND embalagem_id IS NULL AND embalagem_versao IS NULL)
 OR ((origem_estoque='compra_produto_acabado_revenda' AND envase_id IS NULL
  AND unidade_comercial IS NOT NULL AND unidade_comercial='unidade'
  AND conteudo_por_unidade IS NOT NULL AND conteudo_por_unidade>0 AND conteudo_por_unidade::text NOT IN ('NaN','Infinity','-Infinity')
  AND unidade_conteudo IS NOT NULL AND unidade_conteudo IN ('kg','g','l','ml')
  AND quantidade IS NOT NULL AND quantidade=trunc(quantidade)
  AND (quantidade_reservada IS NULL OR quantidade_reservada=trunc(quantidade_reservada))
  AND quantidade_conteudo IS NOT NULL AND quantidade_conteudo=quantidade*conteudo_por_unidade
  AND embalagem_id IS NOT NULL AND embalagem_versao IS NOT NULL AND embalagem_versao>0
  AND ((unidade_conteudo IN ('kg','g') AND volume_total IS NULL)
    OR (unidade_conteudo='l' AND volume_total IS NOT NULL AND volume_total=quantidade_conteudo)
    OR (unidade_conteudo='ml' AND volume_total IS NOT NULL AND volume_total=quantidade_conteudo/1000))) IS TRUE)
);
-- A referência de embalagem é snapshot imutável; a composição B3 é dependência de revisão, não simulada por FK no catálogo líquido antigo.
CREATE FUNCTION platform_private.finished_product_stock_valid_v1(s public.estoque_produto) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (s.origem_estoque='compra_produto_acabado_revenda'
  AND s.unidade_comercial IS NOT NULL AND s.unidade_comercial='unidade'
  AND s.conteudo_por_unidade IS NOT NULL AND s.conteudo_por_unidade>0
  AND s.unidade_conteudo IS NOT NULL AND s.unidade_conteudo IN ('kg','g','l','ml')
  AND s.quantidade IS NOT NULL AND s.quantidade>0 AND s.quantidade=trunc(s.quantidade)
  AND s.quantidade_conteudo IS NOT NULL AND s.quantidade_conteudo=s.quantidade*s.conteudo_por_unidade
  AND s.embalagem_id IS NOT NULL AND s.embalagem_versao IS NOT NULL AND s.embalagem_versao>0 AND s.envase_id IS NULL
  AND EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE singleton AND enabled IS TRUE)
  AND EXISTS(SELECT 1 FROM public.lotes l WHERE l.id=s.lote_id AND l.produto_id=s.produto_id)
  AND ((s.unidade_conteudo IN ('kg','g') AND s.volume_total IS NULL)
    OR (s.unidade_conteudo='l' AND s.volume_total IS NOT NULL AND s.volume_total=s.quantidade_conteudo)
    OR (s.unidade_conteudo='ml' AND s.volume_total IS NOT NULL AND s.volume_total=s.quantidade_conteudo/1000))) IS TRUE;
$$;
REVOKE ALL ON FUNCTION platform_private.finished_product_stock_valid_v1(public.estoque_produto) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION platform_private.finished_product_delivery_valid_v1(s public.estoque_produto,e public.entregas,l public.lotes) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (platform_private.finished_product_stock_valid_v1(s) IS TRUE AND l.id IS NOT NULL AND l.programacao_id IS NULL
  AND e.origem_estoque=s.origem_estoque AND e.unidade_comercial IS NOT NULL AND e.unidade_comercial=s.unidade_comercial
  AND e.conteudo_por_unidade IS NOT NULL AND e.conteudo_por_unidade=s.conteudo_por_unidade
  AND e.unidade_conteudo IS NOT NULL AND e.unidade_conteudo=s.unidade_conteudo
  AND e.quantidade_conteudo IS NOT NULL AND e.quantidade_conteudo=s.quantidade_conteudo
  AND e.embalagem_id=s.embalagem_id AND e.embalagem_versao IS NOT NULL AND e.embalagem_versao=s.embalagem_versao
  AND e.quantidade_entregue=s.quantidade
  AND ((s.unidade_conteudo IN ('kg','g') AND e.volume_entregue_ml IS NULL)
    OR (s.unidade_conteudo='l' AND e.volume_entregue_ml IS NOT NULL AND e.volume_entregue_ml=round(s.quantidade_conteudo*1000,6))
    OR (s.unidade_conteudo='ml' AND e.volume_entregue_ml IS NOT NULL AND e.volume_entregue_ml=round(s.quantidade_conteudo,6)))) IS TRUE;
$$;
REVOKE ALL ON FUNCTION platform_private.finished_product_delivery_valid_v1(public.estoque_produto,public.entregas,public.lotes) FROM PUBLIC,anon,authenticated,service_role;
"""
    purchase = r"""
CREATE FUNCTION platform_private.finished_product_purchase_entry_v1(
 p_produto_id uuid,p_embalagem_id uuid,p_lote_fornecedor text,p_quantidade numeric,
 p_compra_referencia text,p_fornecedor_nome text,p_idempotency_key text,p_validade date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $purchase$
DECLARE
 v_uid uuid:=auth.uid(); v_org uuid; v_fp text;
 v_prev public.estoque_movimentacoes%ROWTYPE; v_mov public.estoque_movimentacoes%ROWTYPE;
 v_product public.produtos%ROWTYPE; v_sale public.product_sale_units%ROWTYPE;
 v_pack public.product_packagings%ROWTYPE; v_volume public.catalogo_volumes%ROWTYPE;
 v_lote uuid:=gen_random_uuid(); v_stock uuid:=gen_random_uuid();
 v_unit text; v_content numeric; v_version integer; v_total numeric; v_volume_total numeric; v_ctx jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE singleton AND enabled) THEN
  RAISE EXCEPTION 'FINISHED_PRODUCT_GATE_CLOSED' USING ERRCODE='42501';
 END IF;
 v_org:=platform_private.stock_motor_actor('entrada');
 IF p_produto_id IS NULL OR p_embalagem_id IS NULL OR nullif(btrim(coalesce(p_lote_fornecedor,'')),'') IS NULL
  OR nullif(btrim(coalesce(p_compra_referencia,'')),'') IS NULL OR nullif(btrim(coalesce(p_fornecedor_nome,'')),'') IS NULL THEN
  RAISE EXCEPTION 'FINISHED_PRODUCT_PURCHASE_PARAMS_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_quantidade IS NULL OR p_quantidade<=0 OR p_quantidade::text IN ('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'FINISHED_PRODUCT_QUANTITY_INVALID' USING ERRCODE='23514';
 END IF;
 IF p_quantidade<>trunc(p_quantidade) THEN
  RAISE EXCEPTION 'FINISHED_PRODUCT_WHOLE_PACK_REQUIRED' USING ERRCODE='23514';
 END IF;
 IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key))<8 THEN
  RAISE EXCEPTION 'FINISHED_PRODUCT_IDEMPOTENCY_REQUIRED' USING ERRCODE='23514';
 END IF;
 v_fp:=encode(extensions.digest(jsonb_build_object('contract','FINISHED_PRODUCT_PURCHASE_V1','product',p_produto_id,'packaging',p_embalagem_id,'supplier_lot',btrim(p_lote_fornecedor),'quantity',p_quantidade,'purchase',btrim(p_compra_referencia),'supplier',btrim(p_fornecedor_nome),'validity',p_validade)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtext('finished_product_purchase:'||p_idempotency_key));
 v_org:=platform_private.stock_motor_actor('entrada');
 IF NOT EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE singleton AND enabled) THEN
  RAISE EXCEPTION 'FINISHED_PRODUCT_GATE_CLOSED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_prev FROM public.estoque_movimentacoes WHERE idempotency_key=p_idempotency_key LIMIT 1;
  IF FOUND THEN
  IF v_prev.usuario_id IS DISTINCT FROM v_uid OR v_prev.request_fingerprint IS DISTINCT FROM v_fp
   OR v_prev.acao IS DISTINCT FROM 'entrada' OR v_prev.origem IS DISTINCT FROM 'finished_product_purchase_entry_v1'
   OR v_prev.metadata->>'produto_id' IS DISTINCT FROM p_produto_id::text
   OR v_prev.metadata->>'embalagem_id' IS DISTINCT FROM p_embalagem_id::text
   OR v_prev.metadata->>'unidade_conteudo' IS NULL OR v_prev.metadata->>'conteudo_por_unidade' IS NULL
   OR v_prev.metadata->>'quantidade_conteudo' IS NULL OR v_prev.metadata->>'embalagem_versao' IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.estoque_produto s JOIN public.lotes l ON l.id=s.lote_id WHERE s.id=v_prev.estoque_produto_id AND l.id=v_prev.lote_id AND l.organization_id=v_org AND s.origem_estoque='compra_produto_acabado_revenda') THEN
   RAISE EXCEPTION 'FINISHED_PRODUCT_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('ok',true,'replay',true,'lote_id',v_prev.lote_id,'estoque_produto_id',v_prev.estoque_produto_id,'movimentacao_id',v_prev.id,
   'origem_estoque','compra_produto_acabado_revenda','unidade_conteudo',v_prev.metadata->>'unidade_conteudo',
   'conteudo_por_unidade',(v_prev.metadata->>'conteudo_por_unidade')::numeric,
   'quantidade_conteudo',(v_prev.metadata->>'quantidade_conteudo')::numeric,
   'embalagem_versao',(v_prev.metadata->>'embalagem_versao')::integer);
 END IF;
 SELECT * INTO v_product FROM public.produtos WHERE id=p_produto_id FOR SHARE;
 IF NOT FOUND OR v_product.owner_organization_id IS DISTINCT FROM v_org OR v_product.ativo IS NOT TRUE
  OR v_product.familia_catalogo NOT IN ('quimico','fertilizante_adubo') THEN
  RAISE EXCEPTION 'FINISHED_PRODUCT_CATALOG_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_sale FROM public.product_sale_units WHERE product_id=p_produto_id AND owner_organization_id=v_org FOR SHARE;
 IF NOT FOUND OR v_sale.unidade_conteudo NOT IN ('kg','g','l','ml') THEN
  RAISE EXCEPTION 'FINISHED_PRODUCT_SALE_UNIT_REQUIRED' USING ERRCODE='23514';
 END IF;
 v_unit:=v_sale.unidade_conteudo;
 SELECT * INTO v_volume FROM public.catalogo_volumes WHERE id=p_embalagem_id AND produto_id=p_produto_id AND owner_organization_id=v_org AND ativo IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINISHED_PRODUCT_PACKAGING_DENIED' USING ERRCODE='42501'; END IF;
 IF v_unit IN ('kg','g') THEN
  SELECT * INTO v_pack FROM public.product_packagings
   WHERE id=p_embalagem_id AND product_id=p_produto_id AND owner_organization_id=v_org AND ativo IS TRUE
    AND valid_from<=now() AND (valid_to IS NULL OR valid_to>=now()) FOR SHARE;
  IF NOT FOUND OR v_volume.medida IS DISTINCT FROM 'embalagem' OR v_pack.peso_liquido_kg<=0 OR v_pack.peso_liquido_kg::text IN ('NaN','Infinity','-Infinity') THEN
   RAISE EXCEPTION 'FINISHED_PRODUCT_PACKAGING_CONTRACT_DENIED' USING ERRCODE='23514';
  END IF;
  v_content:=v_pack.peso_liquido_kg*CASE WHEN v_unit='g' THEN 1000 ELSE 1 END;
  v_version:=v_pack.version;
 ELSE
  IF v_volume.medida IS DISTINCT FROM 'volume' OR v_volume.volume_ml IS NULL OR v_volume.volume_ml<=0
   OR v_volume.volume_ml::text IN ('NaN','Infinity','-Infinity') OR EXISTS(SELECT 1 FROM public.product_packagings x WHERE x.id=p_embalagem_id) THEN
   RAISE EXCEPTION 'FINISHED_PRODUCT_PRESENTATION_CONTRACT_DENIED' USING ERRCODE='23514';
  END IF;
  v_content:=v_volume.volume_ml/CASE WHEN v_unit='l' THEN 1000 ELSE 1 END;
  v_version:=v_sale.version;
 END IF;
 v_org:=platform_private.stock_motor_actor('entrada');
 v_total:=p_quantidade*v_content;
 v_volume_total:=CASE WHEN v_unit IN ('kg','g') THEN NULL WHEN v_unit='l' THEN v_total ELSE v_total/1000 END;
 INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(pg_catalog.txid_current(),'finished_product_purchase_entry_v1',v_lote);
 INSERT INTO public.lotes(id,codigo_lote,produto_id,programacao_id,volume_produzido,status,organization_id,observacoes_tecnicas)
 VALUES(v_lote,btrim(p_lote_fornecedor),p_produto_id,NULL,NULL,'aprovado',v_org,
  jsonb_build_object('origem','compra_produto_acabado_revenda','compra_referencia',btrim(p_compra_referencia),'fornecedor',btrim(p_fornecedor_nome),'lote_fornecedor',btrim(p_lote_fornecedor),'embalagem_id',p_embalagem_id,'embalagem_versao',v_version)::text);
 DELETE FROM platform_private.authz_tickets WHERE txid=pg_catalog.txid_current() AND scope='finished_product_purchase_entry_v1' AND target=v_lote;
 v_ctx:=jsonb_build_object('acao','entrada','origem','finished_product_purchase_entry_v1','usuario_id',v_uid,'unidade','un',
  'idempotency_key',p_idempotency_key,'request_fingerprint',v_fp,'referencia_tipo','lote',
  'metadata',jsonb_build_object('stock_request_item',v_stock,'stock_request_actor',v_uid,'origem_estoque','compra_produto_acabado_revenda',
   'compra_referencia',btrim(p_compra_referencia),'fornecedor',btrim(p_fornecedor_nome),'lote_fornecedor',btrim(p_lote_fornecedor),'produto_id',p_produto_id,
   'embalagem_id',p_embalagem_id,'embalagem_versao',v_version,'unidade_conteudo',v_unit,'conteudo_por_unidade',v_content,'quantidade_conteudo',v_total));
 PERFORM platform_private.stock_motor_context_set(v_ctx);
 INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(pg_catalog.txid_current(),'finished_product_purchase_entry_v1',v_stock);
 INSERT INTO public.estoque_produto(id,lote_id,produto_id,quantidade,volume_total,validade,quantidade_reservada,status,origem_estoque,unidade_comercial,conteudo_por_unidade,unidade_conteudo,quantidade_conteudo,embalagem_id,embalagem_versao)
 VALUES(v_stock,v_lote,p_produto_id,p_quantidade,v_volume_total,p_validade,NULL,'disponivel','compra_produto_acabado_revenda','unidade',v_content,v_unit,v_total,p_embalagem_id,v_version);
 DELETE FROM platform_private.authz_tickets WHERE txid=pg_catalog.txid_current() AND scope='finished_product_purchase_entry_v1' AND target=v_stock;
 PERFORM platform_private.stock_motor_context_set(NULL); PERFORM public.fn_estoque_ctx_close();
 SELECT * INTO v_mov FROM public.estoque_movimentacoes WHERE idempotency_key=p_idempotency_key AND estoque_produto_id=v_stock;
 IF NOT FOUND OR v_mov.acao IS DISTINCT FROM 'entrada' OR v_mov.usuario_id IS DISTINCT FROM v_uid
  OR v_mov.request_fingerprint IS DISTINCT FROM v_fp OR v_mov.quantidade IS DISTINCT FROM p_quantidade
  OR v_mov.metadata->>'compra_referencia' IS DISTINCT FROM btrim(p_compra_referencia) THEN
  RAISE EXCEPTION 'FINISHED_PRODUCT_ENTRY_LEDGER_DENIED' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('ok',true,'replay',false,'lote_id',v_lote,'estoque_produto_id',v_stock,'movimentacao_id',v_mov.id,
  'origem_estoque','compra_produto_acabado_revenda','unidade_conteudo',v_unit,'conteudo_por_unidade',v_content,'quantidade_conteudo',v_total,'embalagem_versao',v_version);
EXCEPTION WHEN OTHERS THEN
 PERFORM platform_private.stock_motor_context_set(NULL); PERFORM public.fn_estoque_ctx_close(); RAISE;
END;$purchase$;
REVOKE ALL ON FUNCTION platform_private.finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.rpc_finished_product_purchase_capability_v1()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_available boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FINISHED_PRODUCT_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 BEGIN
  v_org:=platform_private.stock_motor_actor('entrada');
 EXCEPTION WHEN insufficient_privilege THEN
  RETURN jsonb_build_object('contract','FINISHED_PRODUCT_PURCHASE_V1','available',false,'reason','ACTOR_DENIED');
 END;
 v_available:=EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE singleton AND enabled IS TRUE);
 RETURN jsonb_build_object('contract','FINISHED_PRODUCT_PURCHASE_V1','available',v_available);
END $$;
REVOKE ALL ON FUNCTION public.rpc_finished_product_purchase_capability_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_finished_product_purchase_capability_v1() TO authenticated;

CREATE FUNCTION public.rpc_finished_product_purchase_entry_v1(
 p_produto_id uuid,p_embalagem_id uuid,p_lote_fornecedor text,p_quantidade numeric,
 p_compra_referencia text,p_fornecedor_nome text,p_idempotency_key text,p_validade date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $$
BEGIN
 RETURN platform_private.finished_product_purchase_entry_v1(p_produto_id,p_embalagem_id,p_lote_fornecedor,p_quantidade,p_compra_referencia,p_fornecedor_nome,p_idempotency_key,p_validade);
END $$;
REVOKE ALL ON FUNCTION public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date) TO authenticated;
"""
    bodies = [ddl, purchase, reservar, criar, merge, confirm, send, sync, lot_guard, lab_guard, entry_validate, entry_guard, entry_final]
    downstream_signatures = {
        "platform_private.delivery_confirm_apply_v1(uuid,timestamptz,text,jsonb)",
        "platform_private.delivery_send_apply_v1(uuid,timestamptz,text)",
    }
    foundation_entries = [x for x in BASE["functions"] if x["signature"] not in downstream_signatures]
    downstream_entries = [x for x in BASE["functions"] if x["signature"] in downstream_signatures]
    if len(foundation_entries) != 9 or len(downstream_entries) != 2:
        raise AssertionError("layer function count drift")

    def metadata_pre():
        blocks = []
        for entry in BASE.get("dependency_functions", []):
            blocks.append(function_pin(entry))
        for entry in BASE.get("dependency_triggers", []):
            blocks.append(trigger_pin(entry))
        for rel in BASE["relations"]:
            schema = rel.get("schema", "public")
            blocks.append(f"DO $$BEGIN IF (SELECT r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname={lit(schema)} AND c.relname={lit(rel['name'])}) IS DISTINCT FROM {lit(rel['owner'])} OR (SELECT coalesce(c.relacl::text,'') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname={lit(schema)} AND c.relname={lit(rel['name'])}) IS DISTINCT FROM {lit(rel['acl'])} THEN RAISE EXCEPTION 'FINISHED_PRE_RELATION_DRIFT {schema}.{rel['name']}';END IF;END$$;")
        for col in BASE.get("catalog_columns", []):
            blocks.append(f"DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name={lit(col['table'])} AND column_name={lit(col['column'])} AND data_type={lit(col['type'])} AND is_nullable={lit(col['nullable'])}) THEN RAISE EXCEPTION 'FINISHED_PRE_CATALOG_COLUMN_DRIFT {col['table']}.{col['column']}';END IF;END$$;")
        for con in BASE.get("catalog_constraints", []):
            blocks.append(f"DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname={lit(con['table'])} AND x.conname={lit(con['name'])} AND pg_get_constraintdef(x.oid)={lit(con['definition'])}) THEN RAISE EXCEPTION 'FINISHED_PRE_CATALOG_CONSTRAINT_DRIFT {con['table']}.{con['name']}';END IF;END$$;")
        return blocks

    absence_pre = "DO $$BEGIN IF to_regclass('platform_private.finished_product_gate_v1') IS NOT NULL OR to_regprocedure('platform_private.finished_product_stock_valid_v1(public.estoque_produto)') IS NOT NULL OR to_regprocedure('platform_private.finished_product_delivery_valid_v1(public.estoque_produto,public.entregas,public.lotes)') IS NOT NULL OR to_regprocedure('platform_private.finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)') IS NOT NULL OR to_regprocedure('public.rpc_finished_product_purchase_capability_v1()') IS NOT NULL OR to_regprocedure('public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)') IS NOT NULL THEN RAISE EXCEPTION 'FINISHED_PRE_OBJECT_ALREADY_EXISTS';END IF;END$$;"
    header = "-- Candidato INATIVO; composição local capturada; LIVE deve ser conferida pelo auditor."
    pre = [header]
    for entry in BASE["functions"]:
        pre.append(dependency_pin(entry) if entry["signature"] in downstream_signatures else function_pin(entry))
    pre += metadata_pre() + [absence_pre]
    foundation_pre = [header + " Camada de entrada: não pressupõe confirmação/envio instalados."]
    foundation_pre += [function_pin(x) for x in foundation_entries] + metadata_pre() + [absence_pre]

    candidate = "\n\n".join(bodies) + "\n"
    foundation_bodies = [ddl, purchase, reservar, criar, merge, sync, lot_guard, lab_guard, entry_validate, entry_guard, entry_final]
    downstream_bodies = [confirm, send]
    foundation_candidate = "\n\n".join(foundation_bodies) + "\n"
    downstream_candidate = "\n\n".join(downstream_bodies) + "\n"
    post_blocks = {}
    post_capture_path = HERE / "evidence/post-install-functions.json"
    post_capture = json.loads(post_capture_path.read_text())["functions"] if post_capture_path.exists() else []
    post_by_signature = {x["signature"]: x for x in post_capture}
    body_by_signature = {"public.reservar_estoque_item": reservar, "public.rpc_cockpit_criar_entrega_v1": criar, "platform_private.delivery_merge_split_20261030": merge, "platform_private.delivery_confirm_apply_v1": confirm, "platform_private.delivery_send_apply_v1": send, "public.fn_sync_os_classica_downstream": sync, "platform_private.guard_manual_lot_write_v1": lot_guard, "platform_private.trg_lab_lot_biological_only": lab_guard, "public.validate_estoque_entrada": entry_validate, "platform_private.envase_insert_guard_v1": entry_guard, "platform_private.envase_insert_final_v1": entry_final}
    for entry in BASE["functions"]:
        signature = entry["signature"]
        body = body_by_signature[signature.split("(", 1)[0]]
        if signature in post_by_signature:
            measured = post_by_signature[signature]
            if measured["owner"] != entry["owner"] or measured["acl"] != entry["acl"]:
                raise AssertionError("POST owner/ACL drift " + signature)
            post_blocks[signature] = function_pin(entry, measured["md5"])
        else:
            post_blocks[signature] = f"-- POST_RUNTIME_REQUIRED {signature} source_body_sha256={hashlib.sha256(body.encode()).hexdigest()}"
    for entry in BASE.get("dependency_functions", []):
        signature = entry["signature"]
        if signature in post_by_signature:
            measured = post_by_signature[signature]
            if measured["md5"] != entry["md5"] or measured["owner"] != entry["owner"] or measured["acl"] != entry["acl"]:
                raise AssertionError("POST dependency drift " + signature)
            post_blocks[signature] = function_pin(entry)
        else:
            post_blocks[signature] = f"-- POST_RUNTIME_REQUIRED_DEPENDENCY {signature}"
    for entry in BASE.get("dependency_triggers", []):
        post_blocks["trigger:" + entry["name"]] = trigger_pin(entry)
    new_signatures = ["platform_private.finished_product_stock_valid_v1(public.estoque_produto)", "platform_private.finished_product_delivery_valid_v1(public.estoque_produto,public.entregas,public.lotes)", "platform_private.finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)", "public.rpc_finished_product_purchase_capability_v1()", "public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)"]
    for signature in new_signatures:
        if signature in post_by_signature:
            post_blocks[signature] = function_pin(post_by_signature[signature])
        else:
            post_blocks[signature] = f"-- POST_RUNTIME_REQUIRED_NEW_OBJECT {signature}"

    post = [post_blocks[x["signature"]] for x in BASE["functions"]]
    post += [post_blocks[x["signature"]] for x in BASE.get("dependency_functions", [])]
    post += [post_blocks["trigger:" + x["name"]] for x in BASE.get("dependency_triggers", [])]
    post += [post_blocks[x] for x in new_signatures]
    foundation_post = [post_blocks[x["signature"]] for x in foundation_entries]
    foundation_post += [post_blocks[x["signature"]] for x in BASE.get("dependency_functions", [])]
    foundation_post += [post_blocks["trigger:" + x["name"]] for x in BASE.get("dependency_triggers", [])]
    foundation_post += [post_blocks[x] for x in new_signatures]
    downstream_post = [post_blocks[x["signature"]] for x in downstream_entries]
    gate_closed = "DO $$BEGIN IF EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE enabled IS TRUE) THEN RAISE EXCEPTION 'FINISHED_POST_GATE_OPEN';END IF;END$$;"
    downstream_pre = ["-- Camada downstream INATIVA: exige as dependências de confirmação/envio e o POST exato da entrada."]
    downstream_pre += [dependency_pin(x) for x in downstream_entries] + foundation_post + [gate_closed]

    (HERE / "candidate.sql.review").write_text(candidate)
    (HERE / "candidate-foundation.sql.review").write_text(foundation_candidate)
    (HERE / "candidate-downstream.sql.review").write_text(downstream_candidate)
    (HERE / "install.sql.review").write_text("\n\n".join(pre) + "\n\n" + candidate)
    (HERE / "install-foundation.sql.review").write_text("\n\n".join(foundation_pre) + "\n\n" + foundation_candidate)
    (HERE / "install-downstream.sql.review").write_text("\n\n".join(downstream_pre) + "\n\n" + downstream_candidate)
    (HERE / "postflight.sql.review").write_text("\n".join(post) + "\n" + gate_closed + "\n")
    (HERE / "postflight-foundation.sql.review").write_text("\n".join(foundation_post) + "\n" + gate_closed + "\n")
    (HERE / "postflight-downstream.sql.review").write_text("\n".join(downstream_post) + "\n" + gate_closed + "\n")
    (HERE / "rollback.sql.review").write_text("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;\nREVOKE ALL ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb),platform_private.finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date),public.rpc_finished_product_purchase_capability_v1(),public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date) FROM PUBLIC,anon,authenticated,service_role;\n-- Deny-only: preserva corpos, colunas, estoque, entregas e histórico; nenhum grant é restaurado.\n")
    manifest = {"status": "INACTIVE_NOT_APPROVED", "hosted": False, "operation_default": False, "changed_functions": [x["signature"] for x in BASE["functions"]], "new_objects": ["platform_private.finished_product_gate_v1", "platform_private.finished_product_stock_valid_v1", "platform_private.finished_product_delivery_valid_v1", "platform_private.finished_product_purchase_entry_v1", "public.rpc_finished_product_purchase_capability_v1", "public.rpc_finished_product_purchase_entry_v1"], "catalog_dependencies": ["public.produtos.owner_organization_id", "public.microrganismos.owner_organization_id", "public.product_sale_units", "public.product_packagings", "public.catalogo_volumes"], "dependency_functions": [x["signature"] for x in BASE.get("dependency_functions", [])], "dependency_triggers": [x["name"] for x in BASE.get("dependency_triggers", [])], "new_columns": ["origem_estoque", "unidade_comercial", "conteudo_por_unidade", "unidade_conteudo", "quantidade_conteudo", "embalagem_id", "embalagem_versao"], "new_grants": ["public.rpc_finished_product_purchase_capability_v1():authenticated", "public.rpc_finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date):authenticated"], "layers": {"foundation": {"changed_functions": [x["signature"] for x in foundation_entries], "requires_delivery_confirmation_or_send": False}, "downstream": {"changed_functions": [x["signature"] for x in downstream_entries], "requires_delivery_confirmation_or_send": True, "requires_foundation_postflight": True}}, "reported_live_state": {"delivery_confirm_apply_v1": "ABSENT", "delivery_send_apply_v1": "ABSENT", "other_six_bodies_owners_acls": "REPORTED_MATCH_REMAINING_PRE_PINS_RETAINED"}, "files": {}}
    for name in ["baseline.json", "candidate.sql.review", "candidate-foundation.sql.review", "candidate-downstream.sql.review", "install.sql.review", "install-foundation.sql.review", "install-downstream.sql.review", "postflight.sql.review", "postflight-foundation.sql.review", "postflight-downstream.sql.review", "rollback.sql.review"]:
        data = (HERE / name).read_bytes(); manifest["files"][name] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    (HERE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"candidate_sha256": manifest["files"]["candidate.sql.review"]["sha256"], "functions": len(functions), "enabled_by_default": False}))

if __name__ == "__main__":
    build()
