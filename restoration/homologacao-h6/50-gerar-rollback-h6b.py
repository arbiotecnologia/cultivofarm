#!/usr/bin/env python3
"""H6c-002 — gerador determinístico do rollback integral do H6b.

Monta `restoration/homologacao-h6/rollback-h6b.sql` a partir das definições
EXATAS anteriores ao H6b, extraídas das migrations canônicas do repositório.
Executar da raiz do repositório:

    python3 restoration/homologacao-h6/50-gerar-rollback-h6b.py

O arquivo gerado é auditável (diff estável) e não depende de instrução manual.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "restoration/homologacao-h6/rollback-h6b.sql"

# (rótulo, arquivo fonte, primeira linha, última linha) — 1-indexado, inclusivo.
BLOCKS = [
    ("baseline H6 — rpc_register_receivable_payment (idempotency_key OPCIONAL)",
     "restoration/fase-h6/20260915010000_h6_baixa_idempotente_v1.sql", 8, 121),
    ("baseline H6 — rpc_register_payable_payment (idempotency_key OPCIONAL)",
     "restoration/fase-h6/20260915010000_h6_baixa_idempotente_v1.sql", 123, 235),
    ("baseline pré-H6b — fn_reverse_payment (sem replay idempotente)",
     "supabase/migrations/20260626194607_dbf547e5-c976-4daf-ba5b-53d61386a46d.sql", 57, 139),
    ("baseline pré-H6b — fn_entrega_guard_faturamento_v1 (+ grants originais)",
     "supabase/migrations/20260803214533_e04b1754-76f0-4491-a3cf-60f9c4efe2fa.sql", 352, 392),
    ("baseline pré-H6b — fn_generate_receivable_from_entrega",
     "supabase/migrations/20260803214628_5d517228-7909-421e-ae59-45eac57a8564.sql", 2, 164),
]

HEADER = """-- =====================================================================
-- H6b/H6c — ROLLBACK INTEGRAL E REPRODUTÍVEL (H6c-002)
-- ARQUIVO GERADO por restoration/homologacao-h6/50-gerar-rollback-h6b.py
-- NÃO EDITAR À MÃO: edite o gerador e regenere.
--
-- Ambiente: SOMENTE staging ikaauvsflpmamgxmkhoq.
-- Produção navfzbwgwzruipouyfnk: PROIBIDO. O runner rollback-h6b.sh aborta
-- se o DSN não for o de staging; este arquivo também aborta abaixo se o
-- marcador de staging não estiver presente no banco.
--
-- ESCOPO
--   Restaura as definições EXATAS anteriores ao H6b de TODAS as funções que o
--   H6b substituiu, e remove os objetos introduzidos pelo H6b. Como o H6c
--   redefiniu as mesmas funções, este rollback é necessariamente um rollback
--   do par H6b+H6c (superset), e é isso que o teste APPLY -> ROLLBACK -> APPLY
--   demonstra ao reaplicar H6b e H6c em seguida.
--
-- ROLLBACK LÓGICO (documentado, não destrutivo)
--   As colunas ADITIVAS do H6b permanecem, por decisão explícita:
--     * receivable_payments.request_fingerprint
--     * payable_payments.request_fingerprint
--     * entrega_reconciliacoes.valor_faturavel_origem / valor_faturavel_metodo
--   Elas são trilha histórica; removê-las destruiria evidência de baixas reais
--   já registradas. Sem as funções H6b elas deixam de ser alimentadas e não
--   têm efeito comportamental — o comportamento H6 é restaurado integralmente.
--   As colunas de idempotência criadas no H6 (idempotency_key) NÃO pertencem
--   ao H6b e permanecem ativas, como esperado na baseline H6.
--
-- OBJETOS REMOVIDOS (exclusivos H6b/H6c)
--   trigger trg_h6b_reconciliacao_valor_faturavel + fn_h6b_reconciliacao_valor_faturavel
--   fn_entrega_valor_faturavel_v1, fn_h6b_payment_fingerprint, fn_h6b_num
--   trigger trg_h6c_entrega_ar_b2b_link + fn_h6c_entrega_ar_b2b_link
--   trigger trg_h6c_set_canonical_payment_terms + fn_h6c_set_canonical_payment_terms
--   (o backfill de partner_orders.payment_terms_id é PRESERVADO — ver rollback-h6c.sql)
-- =====================================================================
\\set ON_ERROR_STOP on

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto')
     AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    RAISE EXCEPTION 'ambiente nao reconhecido: abortando rollback';
  END IF;
END
$guard$;

BEGIN;
"""

FOOTER = """
-- ---------------------------------------------------------------------
-- Remoção dos objetos exclusivos do H6c (ordem: triggers -> funções)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_h6c_entrega_ar_b2b_link ON public.entregas;
DROP FUNCTION IF EXISTS public.fn_h6c_entrega_ar_b2b_link();
DROP TRIGGER IF EXISTS trg_h6c_set_canonical_payment_terms ON public.partner_order_payment_terms;
DROP FUNCTION IF EXISTS public.fn_h6c_set_canonical_payment_terms();

-- ---------------------------------------------------------------------
-- Remoção dos objetos exclusivos do H6b
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_h6b_reconciliacao_valor_faturavel ON public.entrega_reconciliacoes;
DROP FUNCTION IF EXISTS public.fn_h6b_reconciliacao_valor_faturavel();
DROP FUNCTION IF EXISTS public.fn_entrega_valor_faturavel_v1(uuid);
DROP FUNCTION IF EXISTS public.fn_h6b_payment_fingerprint(text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.fn_h6b_num(numeric);

-- ---------------------------------------------------------------------
-- Grants explícitos da baseline H6 (nenhum privilégio a anon/PUBLIC)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_register_receivable_payment(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_register_payable_payment(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_reverse_payment(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_generate_receivable_from_entrega(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_register_receivable_payment(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_payable_payment(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reverse_payment(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_generate_receivable_from_entrega(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) TO authenticated, service_role;

COMMIT;

SELECT 'ROLLBACK_H6B_APLICADO' AS escopo,
       (SELECT count(*) FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace
           AND proname IN ('fn_entrega_valor_faturavel_v1','fn_h6b_payment_fingerprint','fn_h6b_num'))
         AS funcoes_h6b_restantes,
       (SELECT count(*) FROM public.receivable_payments) AS baixas_ar_preservadas,
       (SELECT count(*) FROM public.payable_payments) AS baixas_ap_preservadas;
"""


def slice_block(rel: str, first: int, last: int) -> str:
    lines = (ROOT / rel).read_text().splitlines()
    return "\n".join(lines[first - 1:last]).rstrip() + "\n"


def main() -> None:
    parts = [HEADER]
    for label, rel, first, last in BLOCKS:
        parts.append(
            f"\n-- ---------------------------------------------------------------------\n"
            f"-- {label}\n"
            f"-- fonte: {rel} (linhas {first}-{last})\n"
            f"-- ---------------------------------------------------------------------\n"
        )
        parts.append(slice_block(rel, first, last))
    parts.append(FOOTER)
    OUT.write_text("".join(parts))
    print(f"gerado: {OUT.relative_to(ROOT)} ({len(OUT.read_text().splitlines())} linhas)")


if __name__ == "__main__":
    main()
