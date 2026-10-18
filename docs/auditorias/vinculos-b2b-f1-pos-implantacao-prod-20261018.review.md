# F1 — Pós-implantação em PRODUÇÃO — Relatório — 2026-10-18

Ref: `swzpzcwiasxmjutrmvkm` (produção). Migration aplicada pelo auditor externo: `cultivofarm_f1_partner_users_additive_production_20261018`, baseada em `docs/auditorias/vinculos-b2b-f1-migracao-20261018.sql`.
**Este agente executou somente verificação read-only. Nenhum DDL/DML por este agente. Nada publicado.**

## 1. Evidências pós-implantação (read-only, confirmadas por este agente em 2026-10-18)

| Verificação | Resultado |
|---|---|
| Vínculos em `partner_users` | **2 preservados** (nenhum perdido) |
| `tenant_id IS NULL` | **1** — parceiro sintético AUDIT-CF cujo `partner_accounts.commercial_owner_organization_id` é NULL (esperado pelo preflight P1) |
| Divergências tenant (vínculo ≠ owner do parceiro) | **0** |
| Vínculos revogados (`revoked_at NOT NULL`) | **0** |
| `version` | min 1, max 2 (backfill + trigger `a20_partner_users_bump_version` atuando) |
| Triggers em `partner_users` | **5**: `a00_cf_user_gate`, `a00_cf_user_no_truncate`, `a10_partner_users_derive_tenant`, `a20_partner_users_bump_version`, `z90_cf_touch_profile` |
| Constraints | `revocation_coherence_chk`, `validity_window_chk`, `version_positive_chk`, `papel_check`, **`partner_users_user_id_key` (UNIQUE(user_id)) preservada** |
| Índices novos | `idx_partner_users_tenant_id`, `idx_partner_users_active` (auditados pelo auditor externo) |

**Status: PASS — F1 esquema em produção.** Aditiva, dados preservados, guards e unicidade atuais intactos. Homolog já havia validado T1–T6 (6/6, transacional, 0 linhas persistidas).

## 2. Rollback (documentado, não executado)

A migration F1 é reversível: `DROP TRIGGER a10_partner_users_derive_tenant`, `DROP TRIGGER a20_partner_users_bump_version`, `DROP FUNCTION` das duas funções criadas, `ALTER TABLE partner_users DROP COLUMN` das 6 colunas aditivas (`valid_from`, `revoked_at`, `revoked_by`, `revoke_reason`, `tenant_id`, `version`), `DROP INDEX` dos 2 índices. Sem CASCADE; os 3 triggers cf da PRÉ-F1.2-equivalente e os dados originais não são tocados. Rollback só deve ser executado pelo auditor externo com ata, e **não** é necessário — não há regressão conhecida.

## 3. Impactos

- Nenhum acesso existente foi removido ou alterado; helpers `get_user_partner_id()`/`get_partner_papel()` seguem com semântica anterior (LIMIT 1).
- Nenhuma carteira, pedido, proposta, comissão ou documento foi transferido.
- `tenant_id` derivado por trigger em INSERT/UPDATE futuros; o vínculo legado sem tenant permanece NULL por decisão (não atribuir tenant sem prova).

## 4. Pendências (inalteradas)

- **P1:** 1 vínculo com parceiro sem tenant (AUDIT-CF, sintético) — regularização proposta no plano F2, seção de vínculo legado.
- **A2:** guards de aplicação fora do schema cf não verificados em homolog.
- **Paridade:** homolog 279 vs produção 286 tabelas; bootstrap de identidades em homolog pendente (C0–C2 do relatório PRÉ-F1.3).
- **RLS A/B com sessões reais:** não realizado; pré-requisito de F2.

## 5. Status

- **F1 esquema: PASS** (produção e homolog).
- **F2: NO-GO** até autorização expressa + testes A/B + regularização P1 decidida. Nenhuma estrutura paralela criada.
