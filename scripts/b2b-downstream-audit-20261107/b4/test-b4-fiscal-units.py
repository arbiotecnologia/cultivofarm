#!/usr/bin/env python3
"""Regressão B4 isolada: quantidade fiscal × unidade × snapshot de embalagem.

Somente PostgreSQL descartável, fixtures fictícias e documentos privados locais.
Não emite NF, não transmite, não cobra e não prova JWT/RLS/Storage/hosted.
"""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import time
from decimal import Decimal

H = pathlib.Path(__file__).resolve().parent
ROOT = H.parents[2]
OUT = H / "review-458b6012" / "fiscal-units-grams-1f4073"
PACK = ROOT / "scripts/b2b-solid-packaging-order-20261106"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


T = load("b4_shared_for_fiscal_units", H / "test-b4-b3.py")
B3 = T.B3
B3.SP.PORT = "55490"
G = B3.g
G_PRODUCT = B3.u(400)
CHECKS = []


def check(name, ok, detail=""):
    row = {"name": name, "ok": bool(ok)}
    if not ok:
        row["detail"] = str(detail)[:1600]
    CHECKS.append(row)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + row["detail"]), flush=True)


T.check = check


def document(doc_id, order, item):
    B3.psql(
        f"INSERT INTO platform_private.b2b_authorized_documents VALUES("
        f"'{doc_id}','{B3.A}','{B3.P}','{order}','NFE','2026-10-01','{doc_id}',"
        f"'{'a' * 64}','{T.js([item])}'::jsonb,'AUTHORIZED')"
    )


def allocate(doc_id):
    return T.allocate(B3.UADM, doc_id)


def item(item_id, quantity, commercial_unit=None, taxable_quantity=None, taxable_unit=None):
    value = {"item_id": item_id, "quantity": quantity}
    if commercial_unit is not None:
        value["commercial_unit"] = commercial_unit
    if taxable_quantity is not None:
        value["taxable_quantity"] = taxable_quantity
    if taxable_unit is not None:
        value["taxable_unit"] = taxable_unit
    return value


def install_real_pack_writers():
    """Mesmos corpos LIVE byte a byte usados pelo harness canônico de embalagens."""
    B3.psql("ALTER TABLE public.catalogo_volumes ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;")
    B3.psql("""CREATE TABLE IF NOT EXISTS platform_private.solid_pack_admin_receipts(
        idempotency_key text NOT NULL PRIMARY KEY, actor_id uuid NOT NULL, organization_id uuid NOT NULL,
        action text NOT NULL, request_fp text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    DROP FUNCTION IF EXISTS public.solid_pack_price_set_v1(uuid,bigint,date,uuid,text);""")
    for name in ("platform_private.has_role", "platform_private.solid_mass_price_ok", "platform_private.recorte_a_actor_fresh",
                 "platform_private.solid_pack_admin_org", "platform_private.solid_pack_receipt", "platform_private.solid_pack_decimal_text",
                 "platform_private.solid_pack_weight_label", "platform_private.solid_pack_presentation_set_active",
                 "platform_private.solid_pack_presentation_insert", "platform_private.solid_pack_presentation_new_version",
                 "platform_private.catalogo_volumes_owner_consistent", "platform_private.solid_pack_presentation_guard",
                 "public.solid_pack_price_set_v1", "public.solid_pack_offer_save_v1"):
        B3.psql(B3.RX._cap("solid-pack", name))
    B3.psql("""REVOKE ALL ON FUNCTION public.solid_pack_price_set_v1(uuid,bigint,date,uuid,text),
        public.solid_pack_offer_save_v1(uuid,uuid,text,text,numeric,integer,text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.solid_pack_price_set_v1(uuid,bigint,date,uuid,text),
        public.solid_pack_offer_save_v1(uuid,uuid,text,text,numeric,integer,text) TO authenticated;
    CREATE TRIGGER a00_catalogo_volumes_owner_consistent BEFORE INSERT OR UPDATE ON public.catalogo_volumes
        FOR EACH ROW EXECUTE FUNCTION platform_private.catalogo_volumes_owner_consistent();
    CREATE TRIGGER a01_catalogo_volumes_presentation_guard BEFORE INSERT OR DELETE OR UPDATE ON public.catalogo_volumes
        FOR EACH ROW EXECUTE FUNCTION platform_private.solid_pack_presentation_guard();""")


def admin_writer(sql):
    claims = json.dumps({"role": "authenticated", "sub": B3.UADM, "exp": int(time.time()) + 3600})
    prefix = (f"SET ROLE authenticated;\nSELECT set_config('request.jwt.claim.sub','{B3.UADM}',false) \\g /dev/null\n"
              f"SELECT set_config('request.jwt.claims','{claims}',false) \\g /dev/null\n")
    return B3.out(B3.psql(prefix + sql, check=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["before", "after"], required=True)
    parser.add_argument("--candidate", help="candidato explícito para repetir a mesma matriz antes/depois")
    args = parser.parse_args()
    candidate = pathlib.Path(args.candidate) if args.candidate else H / "b4-candidate.sql.review"
    candidate_sha = hashlib.sha256(candidate.read_bytes()).hexdigest()
    tmp = B3.boot()
    work = pathlib.Path(tempfile.mkdtemp(prefix="b4-fiscal-units-", dir="/tmp"))
    work.chmod(0o777)
    result_code = 1
    sequence = 0
    canonical_fixture = {"status": "NOT_RUN"}

    try:
        check("boot B3 com gatilhos reais", all(c["ok"] for c in B3.CHECKS), B3.CHECKS)
        T.install_b3(work)
        B3.psql("""CREATE TABLE IF NOT EXISTS public.entregas(id uuid PRIMARY KEY,partner_order_id uuid);
        CREATE TABLE IF NOT EXISTS public.fiscal_invoices(id uuid);
        CREATE FUNCTION platform_private.c2_order_partner_recipients(uuid) RETURNS SETOF uuid LANGUAGE sql AS $$SELECT NULL::uuid WHERE FALSE$$;""")
        for name in ["approve_b2b_payment_terms_secure", "approve_partner_order", "fn_b2b_order_priceable",
                     "fn_b2b_order_billing_eligibility", "is_financial_staff", "fn_authz_uid_scope_ok",
                     "generate_b2b_receivable_secure", "generate_b2b_receivable_secure_impl", "tg_auto_b2b_receivable",
                     "fn_generate_receivable_from_entrega", "rpc_fiscal_invoice_apply_authorization_v1"]:
            B3.psql(T.captured_function(name)["body"] + ";")
        B3.psql("""REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure(uuid) FROM PUBLIC,anon;
        GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) TO authenticated,service_role;
        REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC,anon,authenticated;
        GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO service_role;
        REVOKE ALL ON FUNCTION public.fn_generate_receivable_from_entrega(uuid,jsonb) FROM PUBLIC,anon;
        GRANT EXECUTE ON FUNCTION public.fn_generate_receivable_from_entrega(uuid,jsonb) TO authenticated,service_role;
        REVOKE ALL ON FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamp with time zone,text,text,uuid) FROM PUBLIC,anon,authenticated;
        GRANT EXECUTE ON FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamp with time zone,text,text,uuid) TO service_role;
        ALTER TABLE public.partner_order_payment_schedule ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();""")
        B3.psql(f"""ALTER TABLE public.partner_accounts ADD COLUMN IF NOT EXISTS client_id uuid;
        CREATE TABLE IF NOT EXISTS public.clientes(id uuid PRIMARY KEY,organization_id uuid);
        INSERT INTO public.clientes(id,organization_id) VALUES('{T.CUSTOMER}','{B3.A}') ON CONFLICT (id) DO NOTHING;
        UPDATE public.partner_accounts SET client_id='{T.CUSTOMER}' WHERE id='{B3.P}'""")
        data, error = B3.publish(B3.UFIN, B3.P3, "boleto", B3.M_BOL, 30, 3, "1.8", 0)
        check("condição B3 fictícia publicada", data is not None, error)
        B3.assign(B3.UADM, B3.P, B3.P3, "boleto", 1)
        data, error = B3.activation(B3.UADM, "pilot", [B3.P], 0)
        check("piloto B3 restrito ao parceiro fictício", data is not None, error)
        B3.psql(f"""INSERT INTO public.company_fiscal_settings
        (organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj,configuration_version)
        VALUES('{B3.A}',true,'VALIDATED',now(),'AR Bio TESTE LOCAL','00000000000191',7)""")
        T.finance_schema()
        component = T.runfile(candidate)
        check("componente B4 executado somente no PG descartável", component.returncode == 0, component.stderr[-1200:])
        B3.psql("CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies() RETURNS void LANGUAGE sql AS $$SELECT$$;")
        check("stub operacional restrito ao harness", "CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies" not in (H / "02-install.sql.review").read_text())

        install_real_pack_writers()
        B3.psql(f"""INSERT INTO public.produtos VALUES
        ('{G_PRODUCT}','Fertilizante 500 g TESTE','G500-TESTE',true,true,'{B3.A}',NULL,NULL,NULL,NULL,false);
        INSERT INTO public.product_sale_units(product_id,owner_organization_id,unidade_conteudo,forma_fisica,version)
        VALUES ('{G_PRODUCT}','{B3.A}','g','solido',1),('{B3.SP.LIQ}','{B3.A}','ml','liquido',1);""")
        offer, offer_error = admin_writer(
            f"SELECT public.solid_pack_offer_save_v1('{G_PRODUCT}',NULL,'SC500G','Fertilizante 500 g TESTE',0.500,NULL,'TESTE-B4-G-OFFER-0001')::text;")
        check("writer REAL cria apresentação de 500 g recebendo 0,500 kg", offer is not None and offer.get("packaging_id"), offer_error or offer)
        packaging_id = offer and offer.get("packaging_id")
        if not packaging_id:
            raise RuntimeError("fixture de 500 g não criada pelo writer real")
        presentation = T.sql_json(f"""SELECT jsonb_build_object('kg',k.peso_liquido_kg,'unit',s.unidade_conteudo,'label',v.rotulo)
        FROM public.product_packagings k JOIN public.product_sale_units s ON s.product_id=k.product_id
        JOIN public.catalogo_volumes v ON v.id=k.id WHERE k.id='{packaging_id}'""")
        check("writer REAL grava 0,500 kg e rótulo dimensional de 500 g",
              presentation and Decimal(str(presentation["kg"])) == Decimal("0.500") and presentation["unit"] == "g" and presentation["label"].endswith("500 g"), presentation)
        price, price_error = admin_writer(
            f"SELECT public.solid_pack_price_set_v1('{packaging_id}',9000,current_date,NULL,'TESTE-B4-G-PRICE-00001')::text;")
        check("writer REAL define preço da embalagem sem preço por peso", price is not None and price.get("preco_centavos") == 9000, price_error or price)
        liquid_pack, liquid_pack_error = admin_writer(
            f"SELECT public.solid_pack_offer_save_v1('{B3.SP.LIQ}',NULL,'LIQPACK','Pack líquido proibido TESTE',1,NULL,'TESTE-B4-LIQ-PACK-0001')::text;")
        check("writer REAL nega whole-pack para produto líquido", liquid_pack is None and "PACK_PRODUCT_NOT_SOLID" in (liquid_pack_error or ""), liquid_pack_error or liquid_pack)
        gram_line = {"item_id": G_PRODUCT, "item_tipo": "produto", "packaging_id": packaging_id, "quantidade": 2}

        def make_order(lines):
            nonlocal sequence
            sequence += 1
            data, error = B3.sim(B3.UB, B3.P3, lines, T.BOL)
            order_hash = data and data["cart_hash"]
            data, error = B3.create(B3.UB, B3.P3, lines, order_hash, f"TESTE-B4-UNIT-{sequence}", T.BOL)
            order_id = data and data["id"]
            check(f"fixture {sequence}: pedido fictício criado", order_id is not None, error)
            item_id = B3.psql(f"SELECT id FROM public.partner_order_items WHERE order_id='{order_id}' ORDER BY id LIMIT 1").stdout.strip()
            T.approve_order(order_id)
            return order_id, item_id

        scenarios = []

        def scenario(name, lines, fiscal_item, expected_error=None, expected_qty=None, expected_normalized=None, expected_unit=None):
            scenarios.append({"name": name, "lines": lines, "fiscal_item": fiscal_item, "expected_error": expected_error,
                              "expected_qty": expected_qty, "expected_normalized": expected_normalized, "expected_unit": expected_unit})

        snapshot_order, snapshot_item = make_order([B3.S(2)])
        snapshot = T.sql_json(f"SELECT jsonb_build_object('quantity',quantidade,'unit',unidade_medida,'content',packaging_peso_liquido_kg_snapshot,'content_unit',packaging_unidade_conteudo_snapshot,'volume',volume_ml) FROM public.partner_order_items WHERE id='{snapshot_item}'")
        check("fixture canônica: 2 embalagens inteiras de 25 kg, quantidade comercial 2 UN", snapshot == {"quantity": 2, "unit": "unidade", "content": 25, "content_unit": "kg", "volume": None}, snapshot)
        gram_order, gram_item = make_order([gram_line])
        gram_snapshot = T.sql_json(f"""SELECT jsonb_build_object('quantity',i.quantidade,'unit',i.unidade_medida,
        'content_kg',i.packaging_peso_liquido_kg_snapshot,'display_unit',i.packaging_unidade_conteudo_snapshot,
        'volume',i.volume_ml,'unit_price',i.preco_unitario_final_snapshot,'order_net',o.net_amount_after_discount,
        'order_interest',o.financial_interest_amount,'order_final',o.final_amount_with_interest)
        FROM public.partner_order_items i JOIN public.partner_orders o ON o.id=i.order_id WHERE i.id='{gram_item}'""")
        gram_ok = (gram_snapshot and Decimal(str(gram_snapshot["quantity"])) == 2
                   and Decimal(str(gram_snapshot["content_kg"])) == Decimal("0.500")
                   and gram_snapshot["display_unit"] == "g" and gram_snapshot["volume"] is None
                   and Decimal(str(gram_snapshot["unit_price"])) == Decimal("90")
                   and Decimal(str(gram_snapshot["order_net"])) == Decimal("180")
                   and Decimal(str(gram_snapshot["order_final"])) == Decimal(str(gram_snapshot["order_net"])) + Decimal(str(gram_snapshot["order_interest"])))
        check("pedido REAL de 2 UN congela 0,500 kg, preço comercial R$180 e juros B3 separados", gram_ok, gram_snapshot)
        freight_kg = Decimal(str(gram_snapshot["quantity"])) * Decimal(str(gram_snapshot["content_kg"]))
        check("frete dimensional do pedido de 500 g permanece 1 kg", freight_kg == Decimal("1.000"), freight_kg)
        liquid_order, liquid_item = make_order([B3.L(2)])
        liquid_snapshot = T.sql_json(f"SELECT jsonb_build_object('packaging',packaging_id_snapshot,'volume',volume_ml,'volume_snapshot',volume_ml_snapshot) FROM public.partner_order_items WHERE id='{liquid_item}'")
        check("líquido sem pack conserva volume_ml=1000 e conversão dimensional própria",
              liquid_snapshot == {"packaging": None, "volume": 1000, "volume_snapshot": 1000}, liquid_snapshot)
        canonical_fixture = {
            "status": "OBSERVED_IN_DISPOSABLE_PG",
            "real_writers": ["public.solid_pack_offer_save_v1", "public.solid_pack_price_set_v1",
                             "public.create_partner_order_condition_secure"],
            "packaging_id": packaging_id,
            "presentation": presentation,
            "order_snapshot": gram_snapshot,
            "freight_kg": str(freight_kg),
            "liquid_without_pack": liquid_snapshot,
            "liquid_pack_denial": liquid_pack_error,
        }
        scenario("500 g: NF parcial 1 UN = 500 g", [gram_line], (1, "UN", 500, "G"), expected_qty=1, expected_normalized=Decimal("0.5"), expected_unit="kg")
        scenario("500 g: NF parcial 1 UN = 0,5 kg", [gram_line], (1, "UN", 0.5, "KG"), expected_qty=1, expected_normalized=Decimal("0.5"), expected_unit="kg")
        scenario("500 g: 500 g comerciais = 1 embalagem", [gram_line], (500, "G", 0.5, "KG"), expected_qty=1, expected_normalized=Decimal("0.5"), expected_unit="kg")
        scenario("500 g: 1 UN com 0,5 g tributáveis deve negar", [gram_line], (1, "UN", 0.5, "G"), expected_error="FISCAL_QUANTITY_UNIT_DIVERGENCE")
        scenario("1 UN = 25 kg em NF parcial", [B3.S(2)], (1, "UN", 25, "KG"), expected_qty=1, expected_normalized=25, expected_unit="kg")
        scenario("0,5 UN é fração de embalagem inteira", [B3.S(2)], (0.5, "UN", 12.5, "KG"), expected_error="FISCAL_WHOLE_PACKAGE_FRACTION")
        scenario("12,5 kg também é fração de embalagem inteira", [B3.S(2)], (12.5, "KG", 12500, "G"), expected_error="FISCAL_WHOLE_PACKAGE_FRACTION")
        scenario("25 kg = 1 embalagem; 25.000 g tributáveis são equivalentes", [B3.S(2)], (25, "KG", 25000, "G"), expected_qty=1, expected_normalized=25, expected_unit="kg")
        scenario("50 kg = 2 embalagens, nunca 50 embalagens", [B3.S(2)], (50, "KG", 50, "KG"), expected_qty=2, expected_normalized=50, expected_unit="kg")
        scenario("50.000 g = 2 embalagens, nunca 50.000 embalagens", [B3.S(2)], (50000, "G", 50, "KG"), expected_qty=2, expected_normalized=50, expected_unit="kg")
        scenario("50 UN com apenas 50 kg tributáveis é divergente", [B3.S(2)], (50, "UN", 50, "KG"), expected_error="FISCAL_QUANTITY_UNIT_DIVERGENCE")
        scenario("1 UN com 50 kg tributáveis é divergente", [B3.S(2)], (1, "UN", 50, "KG"), expected_error="FISCAL_QUANTITY_UNIT_DIVERGENCE")
        scenario("peso não converte em litros", [B3.S(2)], (25, "L", 25, "L"), expected_error="FISCAL_UNIT_MISMATCH")
        scenario("unidade tributável em litros diverge do conteúdo em kg", [B3.S(2)], (1, "UN", 25, "L"), expected_error="FISCAL_UNIT_MISMATCH")
        scenario("quantidade sem código de unidade falha fechado", [B3.S(2)], (1, None, None, None), expected_error="FISCAL_UNIT_CONTRACT_REQUIRED")
        scenario("1 L = 1 unidade líquida; 1.000 ml tributáveis", [B3.L(2)], (1, "L", 1000, "ML"), expected_qty=1, expected_normalized=1000, expected_unit="ml")
        scenario("1.000 ml = 1 unidade líquida; 1 L tributável", [B3.L(2)], (1000, "ML", 1, "L"), expected_qty=1, expected_normalized=1000, expected_unit="ml")
        scenario("500 ml podem ser meia unidade líquida não wholepack", [B3.L(2)], (500, "ML", 0.5, "L"), expected_qty=Decimal("0.5"), expected_normalized=500, expected_unit="ml")
        scenario("kg não converte em volume líquido", [B3.L(2)], (25, "KG", 25, "KG"), expected_error="FISCAL_UNIT_MISMATCH")

        # Nenhum título existe enquanto os pedidos são criados: a exposição de um
        # cenário não pode interferir na fixture do seguinte.
        for position, current in enumerate(scenarios, start=1):
            order_id, item_id = make_order(current["lines"])
            current.update(order_id=order_id, item_id=item_id, doc_id=B3.u(600 + position))
        split_order, split_item = make_order([B3.S(2)])

        for current in scenarios:
            name = current["name"]
            order_id, item_id, doc_id = current["order_id"], current["item_id"], current["doc_id"]
            payload = item(item_id, *current["fiscal_item"])
            document(doc_id, order_id, payload)
            before = B3.psql(f"SELECT (SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}')+(SELECT count(*) FROM platform_private.b2b_document_allocations WHERE order_id='{order_id}')").stdout.strip()
            data, error = allocate(doc_id)
            if current["expected_error"]:
                T.deny(name, (data, error), current["expected_error"])
                after = B3.psql(f"SELECT (SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}')+(SELECT count(*) FROM platform_private.b2b_document_allocations WHERE order_id='{order_id}')").stdout.strip()
                check(name + ": nenhum título/alocação", before == after == "0", f"before={before}, after={after}")
                continue
            check(name, data is not None and data.get("success") and not data.get("replayed"), error or data)
            if data is None:
                continue
            money = T.sql_json(f"SELECT item_money->0 FROM platform_private.b2b_document_allocations WHERE document_id='{doc_id}'")
            actual_qty = money.get("order_quantity")
            actual_normalized = money.get("normalized_quantity")
            check(name + ": quantidade de pedido normalizada", actual_qty is not None and Decimal(str(actual_qty)) == Decimal(str(current["expected_qty"])), money)
            check(name + ": conteúdo fiscal normalizado sem alterar preço", actual_normalized is not None and Decimal(str(actual_normalized)) == Decimal(str(current["expected_normalized"])) and money.get("normalized_unit") == current["expected_unit"], money)
            check(name + ": payload fiscal original preservado", T.sql_json(f"SELECT items->0 FROM platform_private.b2b_document_allocations WHERE document_id='{doc_id}'") == payload, payload)

        split_a, split_b, split_c = B3.u(700), B3.u(701), B3.u(702)
        document(split_a, split_order, item(split_item, 25, "KG", 25000, "G"))
        document(split_b, split_order, item(split_item, 1, "UN", 25, "KG"))
        first, first_error = allocate(split_a)
        second, second_error = allocate(split_b)
        check("duas NFs de 25 kg consomem exatamente duas embalagens", first is not None and first.get("success") and second is not None and second.get("success"), first_error or second_error or [first, second])
        totals = T.sql_json(f"SELECT jsonb_build_object('documents',count(*),'quantity',coalesce(sum((item_money->0->>'quantity')::numeric),0),'principal',coalesce(sum((item_money->0->>'principal')::numeric),0)) FROM platform_private.b2b_document_allocations WHERE order_id='{split_order}'")
        check("saldo anterior usa quantidade normalizada, não 25 kg brutos", totals == {"documents": 2, "quantity": 2, "principal": 360}, totals)
        replay, replay_error = allocate(split_a)
        check("replay da NF de 25 kg preserva o mesmo título", replay is not None and replay.get("replayed") and replay.get("receivable_id") == (first or {}).get("receivable_id"), replay_error or replay)
        document(split_c, split_order, item(split_item, 1, "UN", 25, "KG"))
        T.deny("terceira embalagem além das duas vendidas é negada", allocate(split_c), "FISCAL_QUANTITY_OVERALLOCATED")
        final_count = B3.psql(f"SELECT (SELECT count(*)::text FROM public.accounts_receivable WHERE origin_id='{split_order}')||(SELECT count(*)::text FROM platform_private.b2b_document_allocations WHERE order_id='{split_order}')").stdout.strip()
        check("replay e excesso não duplicam título nem alocação", final_count == "22", final_count)

        result_code = 0 if all(c["ok"] for c in CHECKS) else 1
    except Exception as exc:
        check("execução sem exceção de harness", False, repr(exc))
        result_code = 1
    finally:
        subprocess.run(B3.SP.su() + ["pg_ctl", "-D", str(tmp / "d"), "-m", "fast", "stop"], capture_output=True)
        evidence = {
            "kind": "DISPOSABLE_B4_FISCAL_UNIT_NORMALIZATION_NOT_HOSTED_E2E",
            "phase": args.phase,
            "candidate_sha256": candidate_sha,
            "status": "PASS" if result_code == 0 else "REGRESSION_FAIL",
            "contract": "B4_FISCAL_ITEM_NORMALIZATION_V1_CANDIDATE_INACTIVE",
            "passed": sum(c["ok"] for c in CHECKS),
            "total": len(CHECKS),
            "checks": CHECKS,
            "hosted": "NOT_RUN",
            "real_documents_or_charges": False,
            "synthetic_seams": [
                "Auth/GUC e roles locais", "documento AUTHORIZED privado fictício sem emissão/rede",
                "adaptador de dependências stub somente no harness", "schema financeiro reduzido",
                "nenhuma prova JWT/RLS/PostgREST/Storage/produção",
            ],
        }
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / f"evidence-{args.phase}.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    return result_code


if __name__ == "__main__":
    sys.exit(main())
