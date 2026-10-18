# Entrega 2 — Auditoria read-only e candidata de helpers escalares B2B (2026-10-18)

**Escopo:** auditoria read-only em produção (ref `swzpzcwiasxmjutrmvkm`) dos helpers
escalares, contexto do portal e overload `(uuid)`, com candidata SQL funcional por
fases, rollback e testes locais. **Nenhum DDL/DML hosted, nenhuma publicação.**

## 1. Achados (corpos live verificados por este agente)

### 1.1 `public.get_user_partner_id()` — md5 `77822b0ef57e42bfe9cd7075265402aa`
```sql
SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid() LIMIT 1;
```
Sem `revoked_at`, sem validação de parceiro/owner/tenant, `LIMIT 1` arbitrário em
multi-vínculo. **28 policies** dependem dele (verificadas via `pg_policy`):
commercial_campaigns (3), partner_catalog_access_logs, partner_clients,
partner_engagement_metrics, partner_order_idempotency, partner_order_items,
partner_order_message_attachments (2), partner_order_messages (2),
partner_order_templates (4), partner_orders, partner_product_prices,
partner_simulation_items, partner_simulations (3), partner_technician_clients (3),
partner_user_clients (3), production_planning (RESTRICTIVE tenant guard).
**Impacto:** usuário com vínculo revogado continua enxergando pedidos, simulações,
mensagens, templates, carteiras e preços do parceiro.

### 1.2 `public.get_partner_papel(uuid)` — md5 `c892ee1df845b69950344953757ab472`
Mesma falha para o papel do vínculo (alvo parametrizado; usado por callers internos).

### 1.3 `platform_private.b2b_commercial_context()` — md5 `02158d4204dea67308558f649113ba6d`
Exige owner NOT NULL e parceiro ativo (correto), mas a contagem e a seleção do
vínculo **não filtram `revoked_at`** — vínculo revogado ainda produz contexto
comercial. Usado por 2 policies de contas a receber (ar/ari_partner_select_own_b2b)
e pelo portal B2B.

### 1.4 Overload `public.can_user_access_cliente(uuid)` — md5 `4c2eaf7ab10e204e7ad57d41cb418554`
Ramos B2B resolvem `v_partner_id := get_user_partner_id()` e consultam
`partner_technician_clients`/`partner_clients` sem validar revogação nem parceiro.
**Herda automaticamente o endurecimento da Fase A** (helper fail-closed →
`v_partner_id` NULL → EXISTS false); nenhuma alteração própria necessária nesta
entrega. Ramos internos e técnicos já endurecidos anteriormente, intocados.

## 2. Candidata (3 fases, um arquivo transacional)

`docs/auditorias/vinculos-b2b-entrega2-helpers-candidato-20261018.sql`:

- **Fase A — `get_user_partner_id()`:** elegibilidade completa (revoked_at IS NULL,
  parceiro ativo/não deletado, owner NOT NULL, tenant_id = owner) e fail-closed em
  0 ou 2+ vínculos via `CASE WHEN count(*) = 1 THEN (array_agg(...))[1] END`
  (nunca `LIMIT 1` aleatório; `min(uuid)` não existe em PostgreSQL — corrigido
  durante os testes locais).
- **Fase B — `get_partner_papel(uuid)`:** mesma regra para o alvo parametrizado.
- **Fase C — `b2b_commercial_context()` (rev 2.1, pós-revisão externa):**
  adiciona `pu.revoked_at IS NULL` à contagem e à seleção do vínculo **e fecha a
  lacuna de coerência de tenant apontada pela revisão externa**: o `SELECT` do
  vínculo passa a trazer `pu.tenant_id` e, imediatamente após o guarda de owner,
  exige `link.tenant_id IS NOT NULL AND link.tenant_id = owner`. Antes, um
  vínculo com tenant alterado continuava autorizando o portal enquanto os
  escalares já negariam — divergência de regra entre portal e helpers.
  Semântica `legacy_partner_tenant` preservada: owner é o owner **comercial** do
  parceiro e pode divergir da `organization_id` do ator; exige-se
  `tenant_id = owner comercial`, nunca `tenant_id = org do ator`. Contagem 0/2+
  considera todos os vínculos não revogados (fail-closed).
- Guards de hash anti-drift dos 3 corpos baseline; pós-condições read-only;
  assinaturas, ACL, SECURITY DEFINER e search_path preservados.

**Rollback:** `docs/auditorias/vinculos-b2b-entrega2-helpers-rollback-20261018.sql`
— restaura os 3 corpos baseline exatos com anti-drift e verificação de hash.

## 3. Testes locais (PostgreSQL descartável, paridade de colunas live)

`scripts/tests/entrega2-helpers-local.sql` + `.py` + Vitest
`src/test/saas/entrega2-helpers-postgres.test.ts`:

- **Fase 1 (baseline):** brechas reproduzidas — revogado, owner NULL e parceiro
  inativo ainda resolvem parceiro/papel.
- **Fase 3 (candidata):** elegível preservado; revogado, owner NULL, parceiro
  inativo, tenant divergente, multi-vínculo (2+) e sem vínculo → todos NULL
  (fail-closed).
- **Fase 4:** revogação dinâmica fecha imediatamente; restauração reabre.
- Iterações de correção durante o teste: `HAVING` sem `GROUP BY` (inválido) →
  `CASE WHEN count(*)=1`; `min(uuid)` inexistente → `array_agg(...)[1]`.
- **Vitest 1/1 passou.**

## 4. Impacto e compatibilidade

- As 30 policies dependentes passam a negar acesso a vínculos revogados/inelegíveis
  — esse é o objetivo. O único vínculo ativo em produção é elegível (owner
  presente, tenant coerente, não revogado): **nenhum acesso legítimo cortado hoje**.
- Overload `(uuid)` herda o endurecimento sem alteração própria.
- Não reabre RPCs fechadas, não altera containment PUC, não toca policies.

## 5. Status

- **PASS:** preparação e validação local (candidata funcional, rollback exato,
  evidência de brecha e de correção).
- **NO-GO instalação:** backup/restauração de produção não comprovados; provas
  JWT/RLS A/B reais pendentes (sessões externas indisponíveis neste ambiente).
  Instalação exige preflight, backup comprovado e autorização específica.
