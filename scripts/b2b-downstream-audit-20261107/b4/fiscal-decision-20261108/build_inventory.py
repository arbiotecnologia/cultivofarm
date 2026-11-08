#!/usr/bin/env python3
"""Inventário determinístico da decisão fiscal; apenas capturas locais, sem rede."""
import hashlib
import json
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[3]
CURRENT = ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json"
MONEY = ROOT / "scripts/financial-installments-initial-20261024/receivable-semantics-live-20261028.json"
B4 = H.parent / "b4-candidate.sql.review"
GENERATOR = H.parent / "generate-b4-review.py"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_functions():
    rows = {}
    for source in (CURRENT, MONEY):
        for function in json.loads(source.read_text()).get("functions", []):
            body = function.get("body", "")
            rows[function["signature"]] = {
                "signature": function["signature"],
                "body_md5": hashlib.md5(body.encode()).hexdigest(),
                "owner": function.get("owner"),
                "acl": function.get("acl"),
                "source": str(source.relative_to(ROOT)),
            }
    return rows


def build():
    functions = load_functions()
    selected = [
        "public.generate_b2b_receivable_secure(p_partner_order_id uuid)",
        "public.generate_b2b_receivable_secure_impl(p_partner_order_id uuid)",
        "public.tg_auto_b2b_receivable()",
        "public.fn_generate_receivable_from_entrega(_entrega_id uuid, _payload jsonb)",
        "public.rpc_create_financial_title(p_kind text, p_payload jsonb)",
        "public.fn_generate_recurring_title(_template_id uuid, _reference_date date, _is_manual boolean)",
        "public.fn_generate_receivable_installments()",
        "public.rpc_fiscal_invoice_apply_authorization_v1(_invoice_id uuid, _access_key text, _protocol text, _dh_recbto timestamp with time zone, _c_stat text, _x_motivo text, _transmission_id uuid)",
        "public.rpc_fiscal_sefaz_transmit_record_v1(_transmission_id uuid, _state text, _patch jsonb)",
        "public.rpc_upsert_fiscal_invoice_manual(p_receivable_id uuid, p_payload jsonb)",
        "public.rpc_cancel_accounts_receivable(p_id uuid, p_reason text)",
        "public.rpc_cancel_financial_installment(p_installment_id uuid, p_kind text, p_reason text)",
        "public.cancel_b2b_receivable_secure(p_partner_order_id uuid, p_motivo text)",
    ]
    missing = [name for name in selected if name not in functions]
    if missing:
        raise RuntimeError("Funções ausentes nas capturas: " + repr(missing))
    roles = {
        selected[0]: ("WRAPPER_B2B_ATUAL", "Candidato B4 mantém wrapper negado até atestação válida"),
        selected[1]: ("GERADOR_B2B_ANTIGO", "Candidato B4 substitui por B2B_AUTHORIZED_FISCAL_DOCUMENT_REQUIRED"),
        selected[2]: ("GATILHO_AUTOMATICO_ATUAL", "Candidato B4 neutraliza aprovação/produção/entrega; não cria novo motor"),
        selected[3]: ("GERADOR_POR_ENTREGA_A2_INATIVO", "Não reabrir; delivery_no_downstream permanece"),
        selected[4]: ("EXCECAO_MANUAL_GENERICA", "Reutilizar somente após contrato de justificativa/origem/antiduplicidade"),
        selected[5]: ("RECORRENCIA_GENERICA", "Fora do evento B2B/NF; revisar escopo antes de qualquer bloqueio global"),
        selected[6]: ("GERADOR_PARCELAS_CANONICO", "Reutilizado pelo título com b2b_title_permits"),
        selected[7]: ("FECHAMENTO_DA_AUTORIZACAO_NFE", "Ponto de integração futuro; hoje não chama alocador nem cria recebível"),
        selected[8]: ("RETORNO_SEFAZ_HOMOLOGACAO", "H13 preserva retorno e sinaliza fechamento pendente"),
        selected[9]: ("REGISTRO_FISCAL_MANUAL_ATUAL", "Direção inversa: liga NF a título já existente"),
        selected[10]: ("CANCELAMENTO_GENERICO", "Reutilizar histórico/motivo/pagamento; integrar à alocação B4"),
        selected[11]: ("CANCELAMENTO_PARCELA_GENERICO", "Reutilizar histórico/motivo/pagamento; integrar à alocação B4"),
        selected[12]: ("CANCELAMENTO_B2B_FECHADO", "Já nega B2B_FINANCIAL_CONTRACT_UNAVAILABLE"),
    }
    capture = json.loads(CURRENT.read_text())
    wanted_tables = [
        "fiscal_invoices", "fiscal_invoice_items", "fiscal_events", "fiscal_idempotency_keys",
        "fiscal_sefaz_transmissions", "company_fiscal_settings", "partner_orders",
        "partner_order_items", "partner_order_payment_schedule", "partner_order_financial_links",
        "accounts_receivable", "accounts_receivable_installments", "receivable_payments",
        "financial_receipts", "financial_audit_log", "financial_categories", "payment_methods",
    ]
    tables = []
    for table in wanted_tables:
        columns = [c["name"] for c in capture.get("columns", []) if c.get("table") == table]
        tables.append({"table": "public." + table, "captured_columns": columns, "source": str(CURRENT.relative_to(ROOT))})
    return {
        "decision": "APPROVED_2026-11-08_SINGLE_RECEIVABLE_ENGINE_AFTER_VALID_FISCAL_CONFIRMATION",
        "status": "INACTIVE_BLOCKED_COMPONENT_EVIDENCE_ONLY_NOT_APPROVED",
        "canonical_ref": "swzpzcwiasxmjutrmvkm",
        "hosted": "NOT_RUN",
        "sources": {str(path.relative_to(ROOT)): sha(path) for path in (CURRENT, MONEY, B4, GENERATOR)},
        "reused_functions": [{**functions[name], "current_role": roles[name][0], "decision_use": roles[name][1]} for name in selected],
        "reused_tables": tables,
        "candidate_private_structures": [
            "platform_private.b2b_authorized_documents", "platform_private.b2b_document_allocations",
            "platform_private.b2b_allocation_reversals", "platform_private.b2b_title_permits",
            "platform_private.b2b_cancellation_attestations", "public.accounts_receivable.b2b_document_id",
        ],
        "gaps": [
            {"id": "G1", "name": "PONTE_FISCAL_AUSENTE", "detail": "rpc_fiscal_invoice_apply_authorization_v1 fecha a NF, mas não cria documento B4 nem chama b2b_allocate_document."},
            {"id": "G2", "name": "ATOR_DO_CALLBACK_NAO_RESOLVIDO", "detail": "O retorno SEFAZ é service-only e o alocador B4 exige ator interno do tenant; não se pode inventar auth.uid nem permitir bypass."},
            {"id": "G3", "name": "ESTADOS_PENDENTE_REJEITADO_NAO_INTEGRADOS", "detail": "Falta teste da ponte real para PENDING/REJECTED/AUTHORIZED e recuperação de FISCAL_AUTHORIZATION_CLOSE_PENDING."},
            {"id": "G4", "name": "EXCECAO_MANUAL_INCOMPLETA", "detail": "rpc_create_financial_title exige staff/tenant/valores, mas não impõe justificativa e origem explícitas nem antiduplicidade por operação faturada."},
            {"id": "G5", "name": "DIRECAO_DO_REGISTRO_MANUAL", "detail": "rpc_upsert_fiscal_invoice_manual parte de receivable_id; a decisão exige NF válida antes do título, exceto exceção auditada."},
            {"id": "G6", "name": "HOMOLOGACAO_REAL_PENDENTE", "detail": "Faltam JWT/RLS/Storage/browser, concorrência do callback real e reteste FSF/ARBio; nenhum provedor foi acionado."},
        ],
        "prohibited_effects": ["boleto/Pix", "mensagens", "pagamento automático", "NF/cobrança real", "provedores fiscais/bancários"],
        "legacy_preservation": "Cinco títulos MANUAL teste4 e todos os snapshots/históricos permanecem intocados e sem backfill.",
    }


def main():
    (H / "inventory.json").write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": "INACTIVE_BLOCKED", "gaps": len(build()["gaps"])}))


if __name__ == "__main__":
    main()
