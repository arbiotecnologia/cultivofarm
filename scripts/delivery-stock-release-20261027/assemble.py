"""Offline composition of three INACTIVE review candidates into one transaction.
Fails closed if any expected source fragment is missing or appears a different number of times.
Never connects to a database."""
import hashlib
from pathlib import Path
H=Path(__file__).resolve().parent;S=H.parent
stock=(S/'stock-envase-recovery-20261027/candidate.sql.review').read_text()
bill=(S/'delivery-billing-scope-20261027/candidate.sql.review').read_text()
deliv=(S/'os-delivery-reopening-20261027/candidate-hardening.sql.review').read_text()
def rep(t,a,b,n):
 c=t.count(a)
 if c!=n:raise SystemExit(f'FAIL-CLOSED fragment count {c}!={n}: {a[:70]!r}')
 return t.replace(a,b)
# R1: single exclusive gate mode across delivery/stock/billing (removes SHARE->UPDATE upgrade deadlock).
deliv=rep(deliv,'PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR SHARE;','PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;',3)
# R6: same advisory key as the billing candidate (hashtext vs hashtextextended never conflicted).
deliv=rep(deliv,"PERFORM pg_advisory_xact_lock(hashtext('entrega_faturar:' || p_entrega_id::text));","PERFORM pg_advisory_xact_lock(hashtextextended('entrega_faturar:' || p_entrega_id::text, 0));",1)
# Fail closed on unowned preexisting expedition; legitimate delivery replay returns earlier.
deliv=rep(deliv,"    IF v_est.id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_ESTOQUE_NAO_ENCONTRADO'; END IF;",
"""    IF v_est.id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_ESTOQUE_NAO_ENCONTRADO'; END IF;
    IF v_est.status::text = 'expedido' THEN
      RAISE EXCEPTION 'ENTREGA_EXPEDICAO_PREEXISTENTE_REVIEW_REQUIRED' USING ERRCODE='PT409';
    END IF;""",1)
deliv=rep(deliv,'  v_finalizada boolean := false; v_avanco jsonb;',
 '  v_finalizada boolean := false; v_avanco jsonb; v_stock_result jsonb;',1)
# R3: confirmation only for full reservation; partial delivery rejected before any write.
deliv=rep(deliv,"""      IF v_ent.qtd > coalesce(v_est.quantidade, 0) THEN
        RAISE EXCEPTION 'COCKPIT_ENTREGA_QUANTIDADE_EXCEDE_RESERVA';
      END IF;""","""      IF v_ent.qtd > coalesce(v_est.quantidade, 0) THEN
        RAISE EXCEPTION 'COCKPIT_ENTREGA_QUANTIDADE_EXCEDE_RESERVA';
      END IF;
      IF v_est.status::text <> 'reservado' OR v_ent.qtd IS DISTINCT FROM v_est.quantidade_reservada THEN
        RAISE EXCEPTION 'ENTREGA_RESERVA_PARCIAL_NAO_SUPORTADA: confirme apenas a reserva integral do lote.' USING ERRCODE='PT409';
      END IF;""",1)
# R2: stock expedition through the canonical motor (no direct estoque_produto/movimentacoes write).
deliv=rep(deliv,"""    UPDATE public.estoque_produto
       SET status = 'expedido'::public.status_estoque, expedido_por = v_uid,
           expedido_em = now(), updated_at = now()
     WHERE id = v_est.id AND status <> 'expedido'::public.status_estoque;

    IF FOUND THEN
      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
      VALUES (v_est.id, 'expedicao', v_ent.qtd, 'reservado', 'expedido',
              v_os_id, v_origem, v_uid, v_est.lote_id, 'Baixa por confirmação de entrega');
    END IF;""","""    IF v_est.status::text <> 'expedido' THEN
      v_stock_result := public.rpc_estoque_operar_v1('expedicao', v_est.id, v_ent.qtd,
        'entrega-confirm-expedicao:' || p_entrega_id::text,
        jsonb_build_object('origem','fn_entrega_confirmar_engine_v1','referencia_tipo','entrega',
          'referencia_id', p_entrega_id, 'os_id', v_os_id, 'os_tipo', v_origem,
          'observacao','Baixa por confirmação de entrega'));
      IF v_stock_result->>'ok' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'ENTREGA_ESTOQUE_SEM_CONFIRMACAO' USING ERRCODE='PT409';
      END IF;
PERFORM platform_private.delivery_recovery_scope_v1(NULL,NULL,p_entrega_id,'confirm');
    END IF;""",1)
# Child negative/NULL envelopes never authorize a cancellation success.
deliv=rep(deliv,"""      );
      SELECT * INTO v_item FROM public.estoque_produto WHERE id = v_entrega.estoque_produto_id FOR UPDATE;""",
"""      );
      IF v_estorno->>'ok' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'ENTREGA_ESTORNO_NAO_CONFIRMADO' USING ERRCODE='PT409';
      END IF;
      PERFORM platform_private.delivery_recovery_scope_v1(NULL,NULL,p_entrega_id,'cancel');
      SELECT * INTO v_item FROM public.estoque_produto WHERE id = v_entrega.estoque_produto_id FOR UPDATE;""",1)
deliv=rep(deliv,"""      );
    ELSIF v_item.status::text NOT IN ('disponivel', 'estornado') THEN""",
"""      );
      IF v_reserva->>'success' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'ENTREGA_RESERVA_NAO_CANCELADA' USING ERRCODE='PT409';
      END IF;
      PERFORM platform_private.delivery_recovery_scope_v1(NULL,NULL,p_entrega_id,'cancel');
    ELSIF v_item.status::text NOT IN ('disponivel', 'estornado') THEN""",1)
assert 'FOR SHARE' not in deliv and "hashtext('entrega_faturar" not in deliv
for t,name in((stock,'stock'),(bill,'billing')):
 if 'FOR SHARE' in t:raise SystemExit('FAIL-CLOSED share gate in '+name)
def body(t):
 return '\n'.join(l for l in t.splitlines() if l.strip() not in('BEGIN;','COMMIT;') and not l.startswith('SET LOCAL'))
out=["-- INACTIVE composed review candidate (stock/envase + billing + delivery). NOT a migration.",
"-- Order: gate cf_user_guards_v1 FOR UPDATE -> reauth -> advisory -> reauth -> delivery row -> stock motor (re-enters held gate) -> billing.",
"BEGIN;","SET LOCAL lock_timeout='3s';","SET LOCAL statement_timeout='15s';",
"DO $$ BEGIN RAISE EXCEPTION 'HISTORICAL_BILLING_COMPOSITION_A2_REBASE_REQUIRED' USING ERRCODE='42501'; END $$;",
"-- part 1: stock/envase",body(stock),"-- part 2: billing",body(bill),"-- part 3: delivery (transformed)",deliv,
"-- Client EXECUTE is NOT granted here; see release.sql.review.","COMMIT;"]
(H/'composed-delivery.sql.review').write_text(deliv)
(H/'candidate.sql.review').write_text('\n'.join(out)+'\n')
print('OK',hashlib.sha256((H/'candidate.sql.review').read_bytes()).hexdigest())
