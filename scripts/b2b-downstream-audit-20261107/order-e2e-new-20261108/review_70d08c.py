#!/usr/bin/env python3
"""Regressões da revisão independente 70d08c; somente PostgreSQL descartável.

Cada caso exige o comportamento seguro. Na composição ANTES, os casos de
quantidade e de revogação durante o lock devem falhar; nenhum resultado antigo
é promovido a aprovação ou prova JWT/RLS/Storage/hosted.
"""
import json
import os
import time
import traceback
import uuid


class Review:
    def __init__(self, B, Q, A, choice, replay):
        self.B = B
        self.Q = Q
        self.A = A
        self.choice = choice
        self.replay = replay
        self.results = []
        self.sequence = 0
        self.explicit_reauth = os.environ.get("REVIEW70_EXPECT_REAUTH") == "1"

    def key(self, label):
        self.sequence += 1
        return f"r70-{self.sequence:02d}-{label}"

    def run(self):
        cases = [
            ("two_items_only_one_os_and_delivery", self.two_items_only_one_os_and_delivery),
            ("quantity_three_delivery_one_remainder_unreserved", self.quantity_three_delivery_one_remainder_unreserved),
            ("cancelled_partial_does_not_complete", self.cancelled_partial_does_not_complete),
            ("overdelivery_cannot_complete_or_rewrite_snapshots", self.overdelivery_cannot_complete_or_rewrite_snapshots),
            ("last_two_deliveries_concurrent", self.last_two_deliveries_concurrent),
        ]
        for kind in ("role", "profile", "tenant", "gate"):
            cases.append((f"create_wait_revocation_{kind}", lambda kind=kind: self.create_wait_revocation(kind)))
        for kind in ("role", "profile", "tenant", "gate"):
            cases.append((f"replay_wait_revocation_{kind}", lambda kind=kind: self.replay_wait_revocation(kind)))
        for name, fn in cases:
            try:
                detail = fn()
                self.results.append({"name": name, "status": "PASS", "detail": detail or "secure behavior observed"})
                print("REVIEW70 PASS", name, flush=True)
            except Exception as exc:
                self.results.append({"name": name, "status": "FAIL", "error": str(exc), "traceback": traceback.format_exc()})
                print("REVIEW70 FAIL", name, str(exc), flush=True)
        return self.results

    def make_order(self, specs, label):
        Q = self.Q
        simulated, error = Q.sim(Q.UB, Q.P3, specs, self.choice)
        assert simulated is not None, (label, error)
        journal, error = Q.call(Q.UB, f"public.recover_partner_order_attempt_v1('{Q.P}',NULL,NULL,false,NULL)")
        assert journal is not None, (label, error)
        if journal["state"] == "committed":
            journal, error = Q.call(
                Q.UB,
                f"public.recover_partner_order_attempt_v1('{Q.P}','{journal['key']}',{journal['generation']},true,'{journal['order_id']}')",
            )
            assert journal is not None, (label, error)
        assert journal["state"] == "reserved", (label, journal)
        created, error = Q.create(Q.UB, Q.P3, specs, simulated["cart_hash"], journal["key"], self.choice)
        assert created is not None, (label, error)
        order_id = created["id"]
        approved = Q.as_user(Q.UADM, f"SELECT public.approve_partner_order('{order_id}',NULL,NULL);")
        assert approved.returncode == 0, (label, approved.stdout, approved.stderr)
        accepted = json.loads(Q.psql(f"SELECT to_jsonb(o)::text FROM public.partner_orders o WHERE id='{order_id}'").stdout.strip())
        assert accepted["status"] == "aprovado" and accepted["ready_for_production"] is False, accepted
        if accepted['requires_financial_approval']:
            observed = self.B.last(f"SELECT updated_at FROM public.partner_orders WHERE id='{order_id}';")
            first_item = self.B.last(f"SELECT id FROM public.partner_order_items WHERE order_id='{order_id}' ORDER BY id LIMIT 1;")
            denied = self.B.run_raw(self.os_create_sql(order_id, first_item, observed, self.key('missing-terms')))
            assert denied.returncode != 0 and 'B2B_RESALE_ORDER_CONFLICT' in denied.stderr, (label, denied.stdout, denied.stderr)
            terms = Q.as_user(Q.UFIN, f"SELECT public.approve_b2b_payment_terms_secure('{order_id}','REVIEW70 CANONICAL TERMS');")
            assert terms.returncode == 0, (label, terms.stdout, terms.stderr)
            after = json.loads(self.B.last(f"SELECT to_jsonb(po) FROM public.partner_orders po WHERE id='{order_id}';"))
            assert after['internal_economic_snapshot'] == accepted['internal_economic_snapshot'], label
            accepted = after
        items = json.loads(self.B.last(f"SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at,i.id),'[]'::jsonb)::text FROM public.partner_order_items i WHERE i.order_id='{order_id}';"))
        assert len(items) == len(specs), (label, len(items), len(specs))
        return {"id": order_id, "accepted": accepted, "items": items, "journal": journal, "label": label}

    def os_create_sql(self, order_id, item_id, expected, key):
        uid = self.Q.UADM
        return (
            f"RESET ROLE;SET ROLE authenticated;SET request.jwt.claim.sub='{uid}';SET request.jwt.claims='{{\"sub\":\"{uid}\",\"role\":\"authenticated\",\"iat\":1,\"exp\":4102444800}}';"
            f"SELECT public.rpc_b2b_resale_os_create_v1('{order_id}','{item_id}','{expected}'::timestamptz,'{key}');"
        )

    def create_os(self, order, item, label):
        result = json.loads(self.B.last(self.os_create_sql(order["id"], item["id"], order["accepted"]["updated_at"], self.key(label))))
        assert result["ok"] is True and result["replay"] is False, result
        return result["os_id"]

    def purchase(self, item, quantity, label):
        received = json.loads(self.B.last(self.A.purchase({"product": item["product_id"], "packaging": item["packaging_id_snapshot"]}, quantity, self.key(label), actor=self.Q.UADM)))
        assert received["ok"] is True and received["replay"] is False, received
        return received["estoque_produto_id"]

    def reserve(self, order, os_id, stock_id, quantity, label):
        items = json.dumps([{"item_id": stock_id, "quantidade": quantity}])
        data = json.dumps({"partner_id": self.Q.P, "partner_order_id": order["id"]})
        result = json.loads(self.B.last(self.B.T.actor(self.Q.UADM) + f"SELECT public.rpc_estoque_reservar_v1('{os_id}','b2b','{items}'::jsonb,'{self.key(label)}','{data}'::jsonb);"))
        return result["itens"][0]

    def group(self, os_id, stock_id, quantity, label):
        observed_os = self.B.last(f"SELECT updated_at FROM public.ordens_servico WHERE id='{os_id}';")
        observed_stock = self.B.last(f"SELECT updated_at FROM public.estoque_produto WHERE id='{stock_id}';")
        items = json.dumps([{"item_id": stock_id, "quantidade": quantity, "observed_updated_at": observed_stock}])
        result = json.loads(self.B.last(self.B.T.actor(self.Q.UADM) + f"SELECT public.rpc_cockpit_criar_entrega_v1('{os_id}','b2b','{items}'::jsonb,'{self.key(label)}','{{}}'::jsonb,'{observed_os}'::timestamptz);"))
        assert result["success"] is True and result["replay"] is False, result
        return result["itens"][0]["entrega_id"]

    def send(self, delivery_id, label):
        observed = self.B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery_id}';")
        result = json.loads(self.B.last(self.B.T.actor(self.Q.UADM) + f"SELECT public.rpc_entrega_enviar_manual_v1('{delivery_id}','{observed}','{self.key(label)}');"))
        assert result["success"] is True and result["status"] == "em_rota", result

    def proof(self, delivery_id, label):
        generated = json.loads(self.B.last(self.B.T.actor(self.Q.UADM) + f"SELECT public.rpc_entrega_formulario_gerar_v1('{delivery_id}','{self.key(label)}');"))
        assert generated["success"] is True, generated
        path = f"entregas/{delivery_id}/comprovantes/{uuid.uuid4()}.pdf"
        self.B.sql(f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{path}','{self.Q.UADM}','{self.Q.UADM}');")
        payload = json.dumps({"arquivo_path": path, "arquivo_nome": "local.pdf", "arquivo_mime": "application/pdf", "recebedor_nome": "LOCAL REVISAO 70"})
        attached = json.loads(self.B.last(self.B.T.actor(self.Q.UADM) + f"SELECT public.rpc_entrega_comprovante_anexar_v1('{delivery_id}','{self.key(label)}','{payload}'::jsonb);"))
        assert attached["success"] is True, attached

    def confirm_sql(self, delivery_id, label):
        observed = self.B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery_id}';")
        return self.B.T.actor(self.Q.UADM) + f"SELECT public.rpc_entrega_confirmar_manual_v1('{delivery_id}','{observed}','{self.key(label)}','{{\"nome\":\"LOCAL REVISAO 70\"}}'::jsonb);"

    def confirm(self, delivery_id, label):
        result = self.B.run_raw(self.confirm_sql(delivery_id, label))
        assert result.returncode == 0, (result.stdout, result.stderr)
        return json.loads(result.stdout.strip().splitlines()[-1])

    def cancel(self, delivery_id, label):
        observed = self.B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery_id}';")
        result = json.loads(self.B.last(self.B.T.actor(self.Q.UADM) + f"SELECT public.rpc_entrega_cancelar_v1('{delivery_id}','LOCAL {label}','{observed}'::timestamptz);"))
        assert result["success"] is True, result

    def status(self, order_id):
        return self.B.last(f"SELECT status::text FROM public.partner_orders WHERE id='{order_id}';")

    def snapshots(self, order_id):
        return json.loads(self.B.last(f"""SELECT jsonb_build_object(
          'economic',(SELECT internal_economic_snapshot FROM public.partner_orders WHERE id='{order_id}'),
          'condition_count',(SELECT count(*) FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{order_id}'),
          'quote_count',(SELECT count(*) FROM platform_private.b2b_order_condition_quote_snapshots WHERE order_id='{order_id}')
        )::text;"""))

    def deny_premature_completion(self, order, delivery_id, before_snapshots, label):
        result = self.B.run_raw(self.confirm_sql(delivery_id, label))
        status = self.status(order["id"])
        delivery_status = self.B.last(f"SELECT status::text FROM public.entregas WHERE id='{delivery_id}';")
        if result.returncode == 0 or status != "aprovado":
            raise AssertionError(f"premature completion accepted: order={status}, delivery={delivery_status}, stdout={result.stdout[-800:]}, stderr={result.stderr[-800:]}")
        if not any(token in result.stderr for token in ("DELIVERY_B2B_TRANSITION_CLOSED", "B2B_INTERNAL_DOWNSTREAM_UNVERIFIED", "B2B_RESALE_OVERDELIVERY")):
            raise AssertionError("unexpected confirmation error: " + result.stderr[-1600:])
        assert delivery_status == "em_rota", delivery_status
        assert self.snapshots(order["id"]) == before_snapshots, "denied transition changed economic snapshots"
        return result.stderr[-800:]

    def prepare_sent_delivery(self, order, item, quantity, label, reserve_first=True):
        os_id = self.create_os(order, item, label + "-os")
        stock = self.purchase(item, quantity, label + "-purchase")
        delivery_stock = self.reserve(order, os_id, stock, quantity, label + "-reserve") if reserve_first else stock
        delivery = self.group(os_id, delivery_stock, quantity, label + "-group")
        self.send(delivery, label + "-send")
        self.proof(delivery, label + "-proof")
        return {"os": os_id, "stock": stock, "delivery_stock": delivery_stock, "delivery": delivery}

    def assert_partial_success(self, order, delivery, before, label):
        sql = self.confirm_sql(delivery, label)
        result = self.B.run_raw(sql)
        assert result.returncode == 0, ("PARTIAL_MUST_SUCCEED", result.stdout, result.stderr)
        ack = json.loads(result.stdout.strip().splitlines()[-1])
        assert ack["success"] is True and ack["replay"] is False, ack
        assert self.status(order["id"]) == "aprovado"
        state = self.persisted(delivery)
        assert state["delivery"] == "entregue" and state["proof"] == "confirmado", state
        assert state["stock"] == "expedido" and state["expedition"] == 1 and state["receipt"] == 1, state
        replay = self.B.run_raw(sql)
        assert replay.returncode == 0, replay.stderr
        assert json.loads(replay.stdout.strip().splitlines()[-1])["replay"] is True
        assert self.persisted(delivery) == state, "replay duplicated persistence"
        assert self.snapshots(order["id"]) == before
        return {"confirmation_success": True, "persisted": state, "replay_no_delta": True, "order_status": "aprovado"}

    def persisted(self, delivery):
        return json.loads(self.B.last(f"""SELECT jsonb_build_object(
          'delivery',e.status,'proof',c.status,'stock',s.status,
          'quantity',e.quantidade_entregue,
          'expedition',(SELECT count(*) FROM public.estoque_movimentacoes m WHERE m.referencia_id=e.id AND m.acao='expedicao'),
          'receipt',(SELECT count(*) FROM platform_private.delivery_requests_20261030 r WHERE r.action='confirm' AND r.result->>'entrega_id'=e.id::text),
          'receivables',(SELECT count(*) FROM public.accounts_receivable))::text
          FROM public.entregas e JOIN public.entrega_comprovantes c ON c.id=e.comprovante_id
          JOIN public.estoque_produto s ON s.id=e.estoque_produto_id WHERE e.id='{delivery}';"""))

    def two_items_only_one_os_and_delivery(self):
        second_packaging = {"item_id": self.Q.SP.SOL, "item_tipo": "produto", "packaging_id": self.Q.SP.PK40, "quantidade": 1}
        order = self.make_order([self.Q.S(1), second_packaging], "two-items")
        first, second = order["items"]
        before = self.snapshots(order["id"])
        flow = self.prepare_sent_delivery(order, first, 1, "two-items-first")
        partial = self.assert_partial_success(order, flow["delivery"], before, "two-items-partial")
        assert self.B.last(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{order['id']}';") == '1'
        second_flow = self.prepare_sent_delivery(order, second, 1, "two-items-second")
        assert self.confirm(second_flow["delivery"], "two-items-second-confirm")["success"] is True
        assert self.status(order["id"]) == "entregue"
        assert self.snapshots(order["id"]) == before
        return {"partial": partial, "completed_only_after_both_items": True}

    def quantity_three_delivery_one_remainder_unreserved(self):
        order = self.make_order([self.Q.S(3)], "qty-three")
        item = order["items"][0]
        before = self.snapshots(order["id"])
        os_id = self.create_os(order, item, "qty-three-os")
        stock = self.purchase(item, 3, "qty-three-purchase")
        first_stock = self.reserve(order, os_id, stock, 1, "qty-three-first-reserve")
        first = self.group(os_id, first_stock, 1, "qty-three-first-group")
        self.send(first, "qty-three-first-send")
        self.proof(first, "qty-three-first-proof")
        partial = self.assert_partial_success(order, first, before, "qty-three-partial")
        assert self.B.last(f"SELECT quantidade=2 AND status='disponivel' AND reservado_para_os_id IS NULL FROM public.estoque_produto WHERE id='{stock}';") == "t"
        assert self.B.last(f"SELECT status::text FROM public.ordens_servico WHERE id='{os_id}';") == 'pronto_entrega'
        second = self.group(os_id, stock, 2, "qty-three-remainder-group")
        self.send(second, "qty-three-remainder-send")
        self.proof(second, "qty-three-remainder-proof")
        assert self.confirm(second, "qty-three-remainder-confirm")["success"] is True
        assert self.status(order["id"]) == "entregue"
        assert self.snapshots(order["id"]) == before
        assert self.B.last(f"SELECT count(*) FROM public.production_timeline_events WHERE partner_order_id='{order['id']}' AND event_type='entrega_realizada';") == '1'
        return {"partial": partial, "delivered_quantities": [1, 2], "remainder_initially_unreserved": True}

    def cancelled_partial_does_not_complete(self):
        order = self.make_order([self.Q.S(2)], "cancel-partial")
        item = order["items"][0]
        before = self.snapshots(order["id"])
        os_id = self.create_os(order, item, "cancel-partial-os")
        stock = self.purchase(item, 2, "cancel-partial-purchase")
        first_stock = self.reserve(order, os_id, stock, 1, "cancel-partial-first-reserve")
        first = self.group(os_id, first_stock, 1, "cancel-partial-first-group")
        second = self.group(os_id, stock, 1, "cancel-partial-second-group")
        self.cancel(second, "cancel-partial-second")
        self.send(first, "cancel-partial-first-send")
        self.proof(first, "cancel-partial-first-proof")
        partial = self.assert_partial_success(order, first, before, "cancel-partial-confirm")
        replacement = self.group(os_id, stock, 1, "cancel-partial-replacement-group")
        self.send(replacement, "cancel-partial-replacement-send")
        self.proof(replacement, "cancel-partial-replacement-proof")
        assert self.confirm(replacement, "cancel-partial-replacement-confirm")["success"] is True
        assert self.status(order["id"]) == "entregue"
        assert self.B.last(f"SELECT status::text FROM public.entregas WHERE id='{second}';") == "cancelada"
        assert self.snapshots(order["id"]) == before
        return {"partial": partial, "cancelled_delivery_excluded": True, "replacement_required_and_confirmed": True}

    def overdelivery_cannot_complete_or_rewrite_snapshots(self):
        order = self.make_order([self.Q.S(2)], "overdelivery")
        item = order["items"][0]
        before = self.snapshots(order["id"])
        flow = self.prepare_sent_delivery(order, item, 3, "overdelivery")
        denial = self.deny_premature_completion(order, flow["delivery"], before, "overdelivery-confirm")
        self.cancel(flow["delivery"], "overdelivery-cancel")
        assert self.status(order["id"]) == "aprovado"
        assert self.snapshots(order["id"]) == before
        return {"initial_denial": denial, "ordered": 2, "attempted": 3, "confirmed_overdelivery": False}

    def last_two_deliveries_concurrent(self):
        second_packaging = {"item_id": self.Q.SP.SOL, "item_tipo": "produto", "packaging_id": self.Q.SP.PK40, "quantidade": 1}
        order = self.make_order([self.Q.S(1), second_packaging], "concurrent-last")
        before = self.snapshots(order["id"])
        flows = [self.prepare_sent_delivery(order, item, 1, f"concurrent-last-{index}") for index, item in enumerate(order["items"])]
        commands = [self.confirm_sql(flow["delivery"], f"concurrent-last-confirm-{index}") for index, flow in enumerate(flows)]
        holder = self.B.T.session(f"BEGIN;SELECT 1 FROM public.partner_orders WHERE id='{order['id']}' FOR UPDATE;")
        time.sleep(0.15)
        workers = [self.B.T.session(command) for command in commands]
        self.B.T.wait()
        self.B.T.finish(holder, "COMMIT;")
        responses = [self.B.T.finish(worker) for worker in workers]
        for out, err in responses:
            assert not err, (out, err)
            assert json.loads(out.strip().splitlines()[-1])["success"] is True, out
        assert self.status(order["id"]) == "entregue"
        states = [self.persisted(flow["delivery"]) for flow in flows]
        for state in states:
            assert state["delivery"] == "entregue" and state["proof"] == "confirmado"
            assert state["expedition"] == 1 and state["receipt"] == 1
        for command, state, flow in zip(commands, states, flows):
            replay = self.B.run_raw(command)
            assert replay.returncode == 0, replay.stderr
            assert json.loads(replay.stdout.strip().splitlines()[-1])["replay"] is True
            assert self.persisted(flow["delivery"]) == state
        assert self.B.last(f"SELECT count(*) FROM public.production_timeline_events WHERE partner_order_id='{order['id']}' AND event_type='entrega_realizada';") == '1'
        assert self.snapshots(order["id"]) == before
        return {"distinct_connections_and_OS": True, "actual_lock_wait": True, "both_success": True, "terminal_event_count": 1, "states": states, "replays_no_delta": True}

    def mutations(self, kind):
        Q = self.Q
        if kind == "role":
            return (
                f"DELETE FROM public.user_roles WHERE user_id='{Q.UADM}' AND role='administrador';",
                f"INSERT INTO public.user_roles(user_id,role) VALUES('{Q.UADM}','administrador') ON CONFLICT DO NOTHING;",
            )
        if kind == "profile":
            return (f"UPDATE public.profiles SET ativo=false WHERE user_id='{Q.UADM}';", f"UPDATE public.profiles SET ativo=true WHERE user_id='{Q.UADM}';")
        if kind == "tenant":
            return (f"UPDATE public.profiles SET organization_id='{Q.F}' WHERE user_id='{Q.UADM}';", f"UPDATE public.profiles SET organization_id='{Q.A}' WHERE user_id='{Q.UADM}';")
        if kind == "gate":
            return ("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;", "UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true WHERE singleton;")
        raise AssertionError(kind)

    def effects(self, order_id):
        return json.loads(self.B.last(f"""SELECT jsonb_build_object(
          'os',(SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{order_id}'),
          'tickets',(SELECT count(*) FROM platform_private.authz_tickets WHERE scope='b2b_resale_os_create_v1'),
          'ledger',(SELECT count(*) FROM public.estoque_movimentacoes),
          'lab_events',(SELECT count(*) FROM public.laboratorio_esteira_eventos),
          'receipts',(SELECT count(*) FROM platform_private.b2b_resale_os_requests_v1 WHERE order_id='{order_id}')
        )::text;"""))

    def create_wait_revocation(self, kind):
        order = self.make_order([self.Q.S(1)], "wait-" + kind)
        item = order["items"][0]
        key = self.key("wait-" + kind)
        before = self.effects(order["id"])
        mutate, restore = self.mutations(kind)
        holder = self.B.T.session(f"BEGIN;SELECT 1 FROM public.partner_orders WHERE id='{order['id']}' FOR UPDATE;")
        time.sleep(0.15)
        worker = self.B.T.session(self.os_create_sql(order["id"], item["id"], order["accepted"]["updated_at"], key))
        self.B.T.wait()
        self.B.T.finish(holder, mutate + "COMMIT;")
        out, err = self.B.T.finish(worker)
        self.B.sql(restore)
        expected = "B2B_RESALE_GATE_CLOSED" if kind == "gate" else "B2B_RESALE_SCOPE_CHANGED"
        expected_options = (expected, "ESTQ_FEATURE_REQUIRED") if kind == "tenant" else (expected,)
        after = self.effects(order["id"])
        if not err or after != before:
            raise AssertionError(f"revocation during row lock was not contained: kind={kind}, stdout={out[-800:]}, stderr={err[-800:]}, before={before}, after={after}")
        explicit = any(token in err for token in expected_options)
        if self.explicit_reauth and not explicit:
            raise AssertionError(f"final reauthorization did not produce its own denial: kind={kind}, expected={expected_options}, stderr={err[-1200:]}")
        return {"actual_row_wait": True, "error": err[-500:], "zero_os_ticket_ledger_event_receipt_delta": True, "explicit_candidate_reauth": explicit}

    def replay_wait_revocation(self, kind):
        mutate, restore = self.mutations(kind)
        replay = self.replay
        before_count = self.B.last(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_item_id='{replay['item_id']}';")
        holder = self.B.T.session(f"BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('b2b_resale_os_request:{replay['key']}',0));")
        time.sleep(0.15)
        worker = self.B.T.session(self.os_create_sql(replay["order_id"], replay["item_id"], replay["expected"], replay["key"]))
        self.B.T.wait()
        self.B.T.finish(holder, mutate + "COMMIT;")
        out, err = self.B.T.finish(worker)
        self.B.sql(restore)
        expected = "B2B_RESALE_GATE_CLOSED" if kind == "gate" else "B2B_RESALE_SCOPE_CHANGED"
        if not err:
            raise AssertionError(f"replay returned after revocation: kind={kind}, stdout={out[-800:]}")
        assert self.B.last(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_item_id='{replay['item_id']}';") == before_count
        return {"actual_advisory_wait": True, "receipt_not_returned": True, "error": err[-500:], "explicit_candidate_reauth": expected in err}


def run(B, Q, A, choice, replay):
    return Review(B, Q, A, choice, replay).run()
