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
CURRENT = json.loads((DELIVERY / "capture/current.json").read_text())


def extract(text, qualified):
    m = None
    if qualified == "platform_private.envase_insert_guard_v1":
        m = re.search(r"CREATE (?:OR REPLACE )?FUNCTION " + re.escape(qualified) + r"\b.*?END\s*\$entry\$;", text, re.S)
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


def build():
    functions = {x["signature"]: x for x in BASE["functions"]}
    if len(functions) != 7 or BASE["existing_candidate_columns"]:
        raise AssertionError("baseline incompleta ou colunas já presentes")
    reservar = captured("public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)")
    criar = captured("public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)")
    merge = extract((DELIVERY / "candidate.sql.review").read_text(), "platform_private.delivery_merge_split_20261030")
    confirm = extract((CONF / "candidate.sql.review").read_text(), "platform_private.delivery_confirm_apply_v1")
    send = extract((CONF / "send/candidate.sql.review").read_text(), "platform_private.delivery_send_apply_v1")
    sync = captured("public.fn_sync_os_classica_downstream()")
    entry_guard = extract((ROOT / "scripts/stock-envase-recovery-20261027/isolated/candidate.sql.review").read_text(), "platform_private.envase_insert_guard_v1")
    entry_guard = one_replace(entry_guard, "    AND NEW.validade IS NOT DISTINCT FROM parent.validade AND NEW.volume_total=NEW.quantidade*parent.volume_total/parent.quantidade", "    AND NEW.validade IS NOT DISTINCT FROM parent.validade\n    AND ((parent.origem_estoque IS NULL AND NEW.volume_total=NEW.quantidade*parent.volume_total/parent.quantidade) OR (parent.origem_estoque='produto_acabado' AND platform_private.finished_product_stock_valid_v1(parent) AND NEW.origem_estoque=parent.origem_estoque AND NEW.unidade_comercial=parent.unidade_comercial AND NEW.conteudo_por_unidade=parent.conteudo_por_unidade AND NEW.unidade_conteudo=parent.unidade_conteudo AND NEW.quantidade_conteudo=NEW.quantidade*parent.conteudo_por_unidade AND NEW.embalagem_id=parent.embalagem_id AND NEW.embalagem_versao=parent.embalagem_versao AND NEW.volume_total IS NOT DISTINCT FROM (NEW.quantidade*parent.volume_total/parent.quantidade)))", "entry guard finished split")
    sync = one_replace(sync, "     AND (NEW.produto_id IS NOT NULL OR NEW.microrganismo_id IS NOT NULL) THEN", "     AND (NEW.produto_id IS NOT NULL OR NEW.microrganismo_id IS NOT NULL)\n     AND NOT EXISTS(SELECT 1 FROM public.entregas d JOIN public.estoque_produto s ON s.id=d.estoque_produto_id WHERE d.ordem_servico_id=NEW.id AND d.produto_id=NEW.produto_id AND d.status::text<>'cancelada' AND s.origem_estoque='produto_acabado') THEN", "sync finished product")

    reservar = one_replace(reservar, "  v_volume_reservado := CASE", """  IF v_item.origem_estoque IS NOT NULL AND NOT platform_private.finished_product_stock_valid_v1(v_item) THEN
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
    IF NOT platform_private.finished_product_stock_valid_v1(v_est) THEN
      RAISE EXCEPTION 'FINISHED_PRODUCT_STOCK_CONTRACT_DENIED' USING ERRCODE='23514';
    END IF;
  ELSIF v_est.volume_total IS NULL OR v_est.volume_total <= 0 OR v_est.volume_total::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_VOLUME_ESTOQUE_INVALIDO';
  END IF;"""
    criar = one_replace(criar, old_volume, new_volume, "criar volume")
    criar = one_replace(criar, "    data_saida, motorista, veiculo\n  ) VALUES (", "    data_saida, motorista, veiculo,\n    origem_estoque,unidade_comercial,conteudo_por_unidade,unidade_conteudo,quantidade_conteudo,embalagem_id,embalagem_versao\n  ) VALUES (", "entrega insert columns")
    criar = one_replace(criar, "    nullif(p_dados->>'veiculo','')\n  ) RETURNING id INTO v_id;", "    nullif(p_dados->>'veiculo',''),\n    v_est.origem_estoque,v_est.unidade_comercial,v_est.conteudo_por_unidade,v_est.unidade_conteudo,CASE WHEN v_est.origem_estoque='produto_acabado' THEN p_quantidade*v_est.conteudo_por_unidade ELSE NULL END,v_est.embalagem_id,v_est.embalagem_versao\n  ) RETURNING id INTO v_id;", "entrega insert values")
    criar = one_replace(criar, "    volume_entregue_ml = round((v_est.volume_total / v_est.quantidade) * p_quantidade * 1000, 6),", "    volume_entregue_ml = CASE WHEN v_est.origem_estoque='produto_acabado' AND v_est.unidade_conteudo IN ('kg','g') THEN NULL ELSE round((v_est.volume_total / v_est.quantidade) * p_quantidade * 1000, 6) END,", "entrega no weight ml")

    merge = one_replace(merge, " OR v_s.volume_total IS NULL OR v_s.volume_total<=0 OR v_s.volume_total::text IN ('NaN','Infinity','-Infinity')", " OR (v_s.origem_estoque IS NULL AND (v_s.volume_total IS NULL OR v_s.volume_total<=0 OR v_s.volume_total::text IN ('NaN','Infinity','-Infinity'))) OR (v_s.origem_estoque IS NOT NULL AND NOT platform_private.finished_product_stock_valid_v1(v_s))", "merge source balance")
    merge = one_replace(merge, "v_main.validade IS DISTINCT FROM v_s.validade", "v_main.validade IS DISTINCT FROM v_s.validade OR v_main.origem_estoque IS DISTINCT FROM v_s.origem_estoque OR v_main.unidade_comercial IS DISTINCT FROM v_s.unidade_comercial OR v_main.conteudo_por_unidade IS DISTINCT FROM v_s.conteudo_por_unidade OR v_main.unidade_conteudo IS DISTINCT FROM v_s.unidade_conteudo OR v_main.embalagem_id IS DISTINCT FROM v_s.embalagem_id OR v_main.embalagem_versao IS DISTINCT FROM v_s.embalagem_versao", "merge metadata")
    merge = one_replace(merge, " OR v_main.volume_total IS NULL OR v_main.volume_total<=0 OR v_main.volume_total::text IN ('NaN','Infinity','-Infinity')", " OR (v_main.origem_estoque IS NULL AND (v_main.volume_total IS NULL OR v_main.volume_total<=0 OR v_main.volume_total::text IN ('NaN','Infinity','-Infinity')))", "merge main balance")
    merge = one_replace(merge, "v_total:=v_main.quantidade+v_s.quantidade; v_volume:=v_main.volume_total+v_s.volume_total;", "v_total:=v_main.quantidade+v_s.quantidade; v_volume:=CASE WHEN v_main.volume_total IS NULL AND v_s.volume_total IS NULL THEN NULL ELSE coalesce(v_main.volume_total,0)+coalesce(v_s.volume_total,0) END;", "merge volume sum")
    merge = one_replace(merge, " IF v_total IS NULL OR v_volume IS NULL OR v_total<=0 OR v_volume<=0 OR v_total::text IN ('NaN','Infinity','-Infinity') OR v_volume::text IN ('NaN','Infinity','-Infinity') THEN", " IF v_total IS NULL OR v_total<=0 OR v_total::text IN ('NaN','Infinity','-Infinity') OR (v_main.origem_estoque IS NULL AND (v_volume IS NULL OR v_volume<=0 OR v_volume::text IN ('NaN','Infinity','-Infinity'))) THEN", "merge total validation")
    merge = one_replace(merge, "SET status='estornado',quantidade=0,volume_total=0,quantidade_reservada=0", "SET status='estornado',quantidade=0,volume_total=CASE WHEN origem_estoque='produto_acabado' AND unidade_conteudo IN ('kg','g') THEN NULL ELSE 0 END,quantidade_conteudo=CASE WHEN origem_estoque IS NOT NULL THEN 0 ELSE quantidade_conteudo END,quantidade_reservada=0", "merge retire")
    merge = one_replace(merge, "SET quantidade=v_total,volume_total=v_volume WHERE id=v_main.id;", "SET quantidade=v_total,volume_total=v_volume,quantidade_conteudo=CASE WHEN v_main.conteudo_por_unidade IS NOT NULL THEN v_total*v_main.conteudo_por_unidade ELSE NULL END WHERE id=v_main.id;", "merge main update")
    merge = one_replace(merge, "volume_posterior=v_volume", "volume_posterior IS NOT DISTINCT FROM v_volume", "merge null ledger")

    for label, body, error in (("confirm", confirm, "DELIVERY_CONFIRM_LINEAGE_DENIED"), ("send", send, "DELIVERY_SEND_LINEAGE_DENIED")):
        old = f""" IF s.id IS NULL OR l.id IS NULL OR pp.id IS NULL OR e.lote_id IS DISTINCT FROM l.id OR pp.ordem_servico_id IS DISTINCT FROM e.ordem_servico_id OR pp.ordem_servico_onfarm_id IS NOT NULL
 OR s.produto_id IS DISTINCT FROM l.produto_id OR e.produto_id IS DISTINCT FROM l.produto_id OR pp.produto_id IS DISTINCT FROM l.produto_id
 OR s.reservado_para_os_id IS DISTINCT FROM e.ordem_servico_id OR s.reservado_para_os_tipo IS DISTINCT FROM 'manual' OR s.reservado_para_cliente_id IS DISTINCT FROM e.cliente_id OR s.reservado_para_partner_order_id IS NOT NULL
 THEN RAISE EXCEPTION '{error}' USING ERRCODE='42501'; END IF;"""
        new = f""" IF s.id IS NULL OR l.id IS NULL OR e.lote_id IS DISTINCT FROM l.id
 OR s.produto_id IS DISTINCT FROM l.produto_id OR e.produto_id IS DISTINCT FROM l.produto_id
 OR (s.origem_estoque IS NULL AND (pp.id IS NULL OR pp.ordem_servico_id IS DISTINCT FROM e.ordem_servico_id OR pp.ordem_servico_onfarm_id IS NOT NULL OR pp.produto_id IS DISTINCT FROM l.produto_id))
 OR (s.origem_estoque IS NOT NULL AND NOT platform_private.finished_product_delivery_valid_v1(s,e,l))
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
 OR (origem_estoque='produto_acabado' AND envase_id IS NULL AND unidade_comercial='unidade' AND conteudo_por_unidade>0 AND conteudo_por_unidade::text NOT IN ('NaN','Infinity','-Infinity') AND unidade_conteudo IN ('kg','g','l','ml') AND quantidade=trunc(quantidade) AND (quantidade_reservada IS NULL OR quantidade_reservada=trunc(quantidade_reservada)) AND quantidade_conteudo=quantidade*conteudo_por_unidade AND embalagem_id IS NOT NULL AND embalagem_versao>0 AND ((unidade_conteudo IN ('kg','g') AND volume_total IS NULL) OR (unidade_conteudo='l' AND volume_total=quantidade_conteudo) OR (unidade_conteudo='ml' AND volume_total=quantidade_conteudo/1000)))
);
-- A referência de embalagem é snapshot imutável; a composição B3 é dependência de revisão, não simulada por FK no catálogo líquido antigo.
CREATE FUNCTION platform_private.finished_product_stock_valid_v1(s public.estoque_produto) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.origem_estoque='produto_acabado' AND s.unidade_comercial='unidade' AND s.conteudo_por_unidade>0 AND s.unidade_conteudo IN ('kg','g','l','ml') AND s.quantidade>0 AND s.quantidade=trunc(s.quantidade) AND s.quantidade_conteudo=s.quantidade*s.conteudo_por_unidade AND s.embalagem_id IS NOT NULL AND s.embalagem_versao>0 AND s.envase_id IS NULL
 AND EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE singleton AND enabled)
 AND EXISTS(SELECT 1 FROM public.lotes l WHERE l.id=s.lote_id AND l.produto_id=s.produto_id)
 AND ((s.unidade_conteudo IN ('kg','g') AND s.volume_total IS NULL) OR (s.unidade_conteudo='l' AND s.volume_total=s.quantidade_conteudo) OR (s.unidade_conteudo='ml' AND s.volume_total=s.quantidade_conteudo/1000));
$$;
REVOKE ALL ON FUNCTION platform_private.finished_product_stock_valid_v1(public.estoque_produto) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION platform_private.finished_product_delivery_valid_v1(s public.estoque_produto,e public.entregas,l public.lotes) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT platform_private.finished_product_stock_valid_v1(s) AND l.programacao_id IS NULL AND e.origem_estoque=s.origem_estoque AND e.unidade_comercial=s.unidade_comercial AND e.conteudo_por_unidade=s.conteudo_por_unidade AND e.unidade_conteudo=s.unidade_conteudo AND e.quantidade_conteudo=s.quantidade_conteudo AND e.embalagem_id=s.embalagem_id AND e.embalagem_versao=s.embalagem_versao AND e.quantidade_entregue=s.quantidade AND ((s.unidade_conteudo IN ('kg','g') AND e.volume_entregue_ml IS NULL) OR (s.unidade_conteudo='l' AND e.volume_entregue_ml=round(s.quantidade_conteudo*1000,6)) OR (s.unidade_conteudo='ml' AND e.volume_entregue_ml=round(s.quantidade_conteudo,6)));
$$;
REVOKE ALL ON FUNCTION platform_private.finished_product_delivery_valid_v1(public.estoque_produto,public.entregas,public.lotes) FROM PUBLIC,anon,authenticated,service_role;
"""
    bodies = [ddl, reservar, criar, merge, confirm, send, sync, entry_guard]
    pre = ["-- Candidato INATIVO; composição local capturada; LIVE deve ser conferida pelo auditor."]
    for entry in BASE["functions"]:
        pre.append(function_pin(entry))
    for rel in BASE["relations"]:
        pre.append(f"DO $$BEGIN IF (SELECT r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public' AND c.relname={lit(rel['name'])}) IS DISTINCT FROM {lit(rel['owner'])} OR (SELECT coalesce(c.relacl::text,'') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname={lit(rel['name'])}) IS DISTINCT FROM {lit(rel['acl'])} THEN RAISE EXCEPTION 'FINISHED_PRE_RELATION_DRIFT {rel['name']}';END IF;END$$;")
    candidate = "\n\n".join(bodies) + "\n"
    post = []
    for entry in BASE["functions"]:
        body = {"public.reservar_estoque_item": reservar, "public.rpc_cockpit_criar_entrega_v1": criar, "platform_private.delivery_merge_split_20261030": merge, "platform_private.delivery_confirm_apply_v1": confirm, "platform_private.delivery_send_apply_v1": send, "public.fn_sync_os_classica_downstream": sync, "platform_private.envase_insert_guard_v1": entry_guard}[entry["signature"].split("(", 1)[0]]
        expected = hashlib.md5(body.encode()).hexdigest()
        # pg_get_functiondef normaliza; POST é medido no PG descartável, não estimado aqui.
        post.append(f"-- POST_RUNTIME_REQUIRED {entry['signature']} source_body_sha256={hashlib.sha256(body.encode()).hexdigest()}")
    (HERE / "candidate.sql.review").write_text(candidate)
    (HERE / "install.sql.review").write_text("\n\n".join(pre) + "\n\n" + candidate)
    (HERE / "postflight.sql.review").write_text("\n".join(post) + "\nDO $$BEGIN IF EXISTS(SELECT 1 FROM platform_private.finished_product_gate_v1 WHERE enabled) THEN RAISE EXCEPTION 'FINISHED_POST_GATE_OPEN';END IF;END$$;\n")
    (HERE / "rollback.sql.review").write_text("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;\nREVOKE ALL ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb) FROM PUBLIC,anon,authenticated;\n-- Deny-only: preserva corpos, colunas, estoque, entregas e histórico; nenhum grant é restaurado.\n")
    manifest = {"status": "INACTIVE_NOT_APPROVED", "hosted": False, "operation_default": False, "changed_functions": [x["signature"] for x in BASE["functions"]], "new_objects": ["platform_private.finished_product_gate_v1", "platform_private.finished_product_stock_valid_v1", "platform_private.finished_product_delivery_valid_v1"], "new_columns": ["origem_estoque", "unidade_comercial", "conteudo_por_unidade", "unidade_conteudo", "quantidade_conteudo", "embalagem_id", "embalagem_versao"], "new_grants": [], "files": {}}
    for name in ["baseline.json", "candidate.sql.review", "install.sql.review", "postflight.sql.review", "rollback.sql.review"]:
        data = (HERE / name).read_bytes(); manifest["files"][name] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    (HERE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"candidate_sha256": manifest["files"]["candidate.sql.review"]["sha256"], "functions": len(functions), "enabled_by_default": False}))

if __name__ == "__main__":
    build()
