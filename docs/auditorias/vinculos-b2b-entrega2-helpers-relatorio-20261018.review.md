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
multi-vínculo. **31 policies** referenciam os 3 helpers no total (evidência live
externa 2026-10-18 via `pg_policy` com `pg_get_expr` sobre qual/check); destas,
**28 policies** dependem de `get_user_partner_id`:
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

- **Fase A — `get_user_partner_id()` (rev 2.2, pós-revisão externa):** fail-closed
  em DUAS etapas, uniforme com a Fase C: (1) conta TODOS os vínculos NÃO
  revogados — 0 ou 2+ ⇒ NULL, antes de qualquer elegibilidade; (2) só então exige
  que o vínculo único seja elegível (parceiro ativo/não deletado, owner NOT NULL,
  tenant_id = owner). Na rev 2.1 a contagem era só de elegíveis: com 2 não
  revogados (1 elegível + 1 inelegível) o escalar autorizava e o portal negava —
  divergência corrigida. `LEFT JOIN` garante que vínculo com parceiro inexistente
  continue contado (fail-closed). Um vínculo ativo + históricos revogados
  continua resolvendo (revogados não entram na contagem).
- **Fase B — `get_partner_papel(uuid)` (rev 2.2):** mesma regra em duas etapas
  para o alvo parametrizado.
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

**Rollback (rev 2.3):** `docs/auditorias/vinculos-b2b-entrega2-helpers-rollback-20261018.sql`
— restaura os 3 corpos baseline exatos. A guarda anti-drift usa **hashes md5
exatos de `pg_get_functiondef`** dos 3 corpos candidatos, **fixos e commitados**
(seção `BEGIN/END HASH GUARD`):
`get_user_partner_id` = `b334c3a454ebc4233d3b9e0d0a700d78`,
`get_partner_papel` = `f84f898ead03dfd646ece50d16baf909`,
`b2b_commercial_context` = `a31d198c9a9fc9a5e7c397ab36fe0fa4`.
**Correção da revisão externa ffca65827:** o runner de teste NÃO regrava mais
esses hashes — ele os verifica contra constantes fixas e FALHA se divergirem.
Geração de hashes existe apenas como modo explícito separado
(`--generate-hashes`, só imprime; nunca usado pelo teste).
Prova no laboratório: o **arquivo de rollback inteiro** é executado contra um
drift que **preserva os antigos marcadores textuais** (predicado tautológico
adicionado, marcadores intactos) e é rejeitado atomicamente — após a falha, os
corpos permanecem os da candidata (nada revertido), comprovado por hash.

## 3. Testes locais (PostgreSQL descartável, paridade de colunas live)

`scripts/tests/entrega2-helpers-local.sql` + `.py` + Vitest
`src/test/saas/entrega2-helpers-postgres.test.ts` (rev 2.3, pós-revisão
ffca65827):

- **Arquivos INTEIROS, sem duplicação e sem regravação:** o runner extrai os
  corpos BASELINE do arquivo de rollback, instala-os no PostgreSQL descartável
  e prova por hash que são os corpos de produção
  (`77822b0e…`/`c892ee1d…`/`02158d42…`). Em seguida executa o **arquivo
  candidato inteiro** (pre-guards de hash, corpos e pós-condições intactos) e
  verifica os hashes instalados contra **constantes fixas commitadas**
  (`b334c3a4…`/`f84f898e…`/`a31d198c…`) — divergência = FALHA; o teste nunca
  reaprova nem regrava golden hashes (geração só via `--generate-hashes`,
  modo explícito que apenas imprime).
- **Rollback inteiro testado:** 5a executa o arquivo de rollback intacto sobre
  a instalação exata — aceito, baseline restaurado e hashes baseline
  comprovados; 5b reaplica a candidata, introduz drift com marcadores
  preservados e executa o rollback inteiro — rejeitado atomicamente, e os
  corpos permanecem os da candidata (nada revertido), comprovado por hash.
- **Matriz M1–M15 (todas PASS), os TRÊS corpos afirmados por cenário** com
  roles/entitlements válidos nos fixtures: M1 elegível/`commercial_owner`; M2
  `legacy_partner_tenant` real (org do ator ≠ owner comercial, owner
  preservado); M3 contextual cliente (ramo `parceiro_b2b` do corpo real da
  Entrega 1 autoriza cliente na carteira válida); M4 owner NULL → NULL nos
  três; M5 tenant NULL → NULL nos três; M6 tenant mismatch → NULL nos três;
  M7/M7b parceiro inativo e deletado → NULL nos três; M8 dois elegíveis →
  NULL nos três; **M9 um elegível + um inelegível NÃO revogado → NULL nos
  três** (divergência da rev 2.1 eliminada); M10 um ativo + um revogado
  (histórico) → resolve nos três; M11 revogação dinâmica fecha escalar, papel,
  portal e acesso contextual ao cliente, restauração reabre; M12 alvo terceiro
  (callers internos) elegível/revogado; **M13 zero vínculos → NULL nos três**;
  **M14 ator NULL / alvo NULL → NULL**; **M15 cliente NÃO associado → false**
  (negativo contextual).
- **Fidelidade Entrega 1:** `md5(pg_get_functiondef)` do corpo embutido =
  `4e0c374caa04bb9bf9fac9cc4e6723f1`, idêntico ao de produção.
- **Iterações de correção durante os testes:** regex de extração `[a-z_]+`
  excluía `b2b_commercial_context` (dígitos) → `[a-z0-9_]+`; iterações
  anteriores: `HAVING` sem `GROUP BY` → `CASE WHEN count(*)=1`; `min(uuid)`
  inexistente → `array_agg(...)[1]`; rev 2.3: removida a regravação de hashes
  do rollback pelo runner (apontada pela revisão ffca65827).
- **Execução confiável:** Vitest via `execFileSync` sem shell/pipes — exit
  code não-zero lança exceção (nenhum `| tail` sem pipefail mascarando erro).
  **Vitest 1/1 passou (exit 0).**

### 3.1 Evidência `valid_from` (auditoria sem inventar regra)

- `partner_users.valid_from` existe no schema live, mas **nenhuma função de
  acesso o aplica a vínculos B2B**: os três helpers baseline não o referenciam;
  o corpo instalado da Entrega 1 usa `valid_from`/`valid_until` apenas no ramo
  `user_clientes` (usuários internos), não nos ramos B2B. Busca live em
  `pg_proc` por `valid_from` + `partner_users` retornou apenas
  `can_user_access_cliente` (ramo interno), `rpc_b2b_list_selectable_payment_plans`,
  `tenant_admin_user_links` e `user_edit_f2_version` — nenhum contrato existente
  exige `valid_from` em `partner_users`.
- **Decisão:** a candidata NÃO adiciona filtro de `valid_from` — seria regra
  nova sem contrato comprovado. Registrado como observação para recorte futuro
  (definir semântica de vigência de vínculo B2B antes de qualquer enforce).

## 4. Impacto e compatibilidade

- As 31 policies dependentes (evidência live 2026-10-18 via `pg_policy` com
  `pg_get_expr` sobre qual/check) passam a negar acesso a vínculos
  revogados/inelegíveis — esse é o objetivo. O único vínculo em produção é
  elegível (1 vínculo total, owner presente, tenant coerente, não revogado;
  PUC=0, PTC=0, `valid_from` futuro=0): **nenhum acesso legítimo cortado hoje**.
- Overload `(uuid)` herda o endurecimento sem alteração própria.
- Não reabre RPCs fechadas, não altera containment PUC, não toca policies.
- **Uniformidade limitada à cardinalidade/elegibilidade do vínculo:** com a
  rev 2.2, o contexto do portal e os helpers escalares aplicam a mesma contagem
  (todos os não revogados, fail-closed em 0/2+) e a mesma elegibilidade do
  vínculo (parceiro ativo/não deletado, owner NOT NULL, tenant_id = owner).
  **NÃO se afirma equivalência global portal/escalares:** o portal mantém gates
  adicionais próprios (ator pronto via `platform_actor_access_ready`, exatamente
  1 role, entitlement `catalogo_precos`, organização ativa, visibilidade fase 1)
  que os escalares não avaliam — um usuário pode resolver o escalar e ainda
  assim não obter contexto do portal por esses gates. PUC permanece com policy
  RESTRICTIVE `false` (intocado).
- **Token/provisioning:** o contexto alimenta apenas leitura de contexto
  comercial B2B; nenhum fluxo de provisioning/emissão de token depende de
  vínculo com tenant divergente do owner (produção: 1 vínculo total elegível,
  PUC=0, PTC=0, ownerless=0 — evidência externa 2026-10-18). Nenhum acesso
  legítimo cortado hoje; vínculos futuros com tenant incoerente serão negados
  até regularização explícita.
- **Rollback (rev 2.3):** guarda anti-drift por hashes md5 fixos commitados
  (ver seção 2) — arquivo inteiro testado no laboratório; drift com marcadores
  preservados é rejeitado atomicamente e os corpos candidatos permanecem
  intactos após a falha.
- **Contas de teste:** o usuário autorizou contas de teste por perfil/tenant e
  confirmou sessão real externa do admin AR Bio (arbiotecnologia@gmail.com) com
  seis testes existentes. Nenhuma conta foi criada nem alterada neste recorte;
  nenhuma escrita hosted.

## 5. Status

- **PASS:** preparação e validação local rev 2.3 (candidata e rollback
  executados como arquivos inteiros sobre baseline fiel a produção, hashes
  fixos commitados verificados sem regravação, matriz M1–M15 com os três
  corpos afirmados por cenário, fidelidade do corpo da Entrega 1 por hash de
  produção).
- **Autorização e backup:** o usuário autorizou a continuação do projeto e
  assume a responsabilidade pelo backup de produção (registrado em 2026-10-18);
  não será solicitada nova autorização de backup. Isso NÃO equivale à
  homologação: testes locais em PostgreSQL descartável não certificam JWT/RLS
  real.
- **NO-GO instalação:** provas JWT/RLS A/B reais pendentes (sessões externas
  indisponíveis neste ambiente). Instalação exige preflight e autorização
  específica de aplicação.
