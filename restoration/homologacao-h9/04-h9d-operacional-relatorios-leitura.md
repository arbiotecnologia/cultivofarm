# H9-D — Auditoria de funções operacionais, relatórios e exposições de leitura

**Ambiente:** homologação `ikaauvsflpmamgxmkhoq` (exclusivo).
**Produção `navfzbwgwzruipouyfnk`:** não acessada, não consultada, não migrada.
**Ledger:** 663 (última `20261007000000`, exatamente uma vez).
**Status desta rodada (lote L1):** **H9-D CONTINUA — NO-GO para encerramento** (e NO-GO produção).
**Alteração no banco nesta rodada:** uma — forward `20261007000000` (correção de IDOR/BOLA em `create_technical_visit_secure`).

## 1. Metodologia (v2 — endurecida)

1. **Regex e posição de statement são apenas TRIAGEM** e **nunca promovem** uma
   assinatura. A presença de uma função em qualquer readset/dossiê de triagem
   deixou de gerar classificação conclusiva automaticamente.
2. **AUTH_COMPROVADA / NAO_APLICAVEL** exigem decisão manual registrada,
   **chaveada pela assinatura canônica completa** (nome + tipos de argumento),
   nunca pelo nome — para eliminar colisão entre sobrecargas.
3. **Evidência vaga é proibida.** Frases como "delegação a função guardada" ou
   "guarda de identidade/papel precede o primeiro acesso sensível" foram
   rejeitadas pelo gerador e pelas assinaturas afetadas voltaram a
   `PENDENTE_EVIDENCIA`.
4. Cada assinatura conclusiva registra: guarda textual, cadeia transitiva de
   helpers, comportamento com `auth.uid()` NULL, escopo tenant/BOLA/IDOR,
   presença de SQL dinâmico e callsites reais no repositório.

## 2. Escopo e aritmética

| Conjunto | Qtd |
| --- | --- |
| Universo bruto SECDEF executável por `authenticated` | 376 |
| Fora do escopo profundo — herdadas da H9-C (`03-h9c-secdef-authenticated.md`) | 84 |
| **Escopo profundo H9-D** | **292** |

Classificação do escopo profundo (soma = 292):

| Classificação | Qtd |
| --- | --- |
| AUTH_COMPROVADA (evidência específica por assinatura) | 136 |
| NAO_APLICAVEL (corpo lido, sem dado sensível) | 4 |
| EXPOSICAO_COMPROVADA_CORRIGIDA (H9-D1 + H9-D-L1) | 2 |
| PENDENTE_EVIDENCIA (lotes H9-D-L2..L6) | 150 |

Variação em relação à rodada anterior: **46 assinaturas** classificadas com a
evidência vaga "delegação a função guardada" foram **rebaixadas** para
`PENDENTE_EVIDENCIA`, e as **30 assinaturas do lote H9-D-L1** foram promovidas a
`AUTH_COMPROVADA` com dossiê integral (153 − 46 + 30 = 137).

Os quatro helpers `private.h7n_*` (`catalogo_ficha_microrganismos`,
`catalogo_ficha_produtos`, `esteira_laboratorio`, `fluxo_visita_tecnica`)
continuam fora das 292 e pendentes de reconciliação formal do universo.

## 3. Lote H9-D-L1 — 30 assinaturas auditadas em profundidade

Dossiê determinístico: `h9d-inventario/dossie-l1.json` (assinatura canônica,
`body_md5`, `body_len`, ACL, `search_path`, guarda textual, cadeia transitiva,
fail-closed, tenant/BOLA/IDOR, SQL dinâmico e callsites).

Padrões comprovados:

- **Bloco financeiro (16 assinaturas: `fn_fin_*`, `get_financial_*`,
  `get_report_*`, `fn_financial_inconsistencies`, `fn_mark_entrega_not_billable`,
  `fn_revert_recurring_generation`)** — todas abrem com
  `IF NOT public.is_financial_staff(auth.uid()) THEN RAISE`. A cadeia
  `is_financial_staff → has_role → public.user_roles` é `SECURITY DEFINER` com
  `search_path` fixo e retorna falso para `auth.uid()` NULL: **fail-closed**.
  Nenhuma delas monta SQL dinâmico; `get_financial_report_data` despacha por
  `CASE` sobre lista fechada de tipos de relatório e ainda registra o acesso via
  `log_report_view`. PII (telefone/e-mail de cobrança em
  `get_report_delinquency`) só é alcançável por staff financeiro.
- **Bloco B2B/parceiro (`get_b2b_*`, `get_partner_catalog_*`)** — escopo derivado
  de `auth.uid()` via `get_user_partner_id()`; o técnico fica preso a
  `partner_technician_clients.technician_user_id = auth.uid()` e parâmetros
  externos (`p_partner_id`, `p_technician_user_id`) não ampliam o escopo. CPF/CNPJ
  sempre mascarado. `get_partner_catalog_secure` exige
  `partner_id = p_partner_id` (sem IDOR de preço) e bloqueia o técnico de termos
  financeiros.
- **Bloco operacional/técnico (`create_technical_visit_secure`,
  `finish_technical_visit_secure`, `check_cliente_dependencies`,
  `get_production_planning_detail`, `approve_*_profile_with_audit`)** — guarda de
  papel interno ou vínculo ativo em `user_clientes`, com coerência
  fazenda→cliente, talhão→fazenda e solicitação→cliente; finalização exige
  propriedade do registro.
- **`fn_generate_recurring_title`** — mantém a mesma semântica da H9-D1:
  `auth.uid()` NULL apenas para a sessão interna do cron; qualquer sessão
  autenticada precisa ser staff financeiro.

**Observação registrada (não é exposição):** `create_technical_visit_secure`
resolve a idempotência por `p_client_uuid` antes da checagem de vínculo,
retornando apenas o `id` de um registro já criado com aquele UUID fornecido pelo
próprio chamador. Não há leitura de dado do registro nem enumeração viável.


## 3.1 Retificação H9-D-L1 — IDOR/BOLA comprovado e corrigido

`public.create_technical_visit_secure(uuid,uuid,uuid,uuid,timestamptz,tipo_visita,urgencia_consultor,text,uuid)`
foi **reclassificada** de `AUTH_COMPROVADA` para `EXPOSICAO_COMPROVADA_CORRIGIDA`.
A observação registrada na rodada anterior ("não há leitura de dado do registro
nem enumeração viável") estava **errada**: o `id` retornado é dado alheio.

**Antes (catálogo vivo, prova `h9d-inventario/prova-idor-antes.log`)** — a busca
idempotente por `p_client_uuid` ocorria no passo 2, antes de qualquer
autorização de cliente:

- T1: `request.jwt.claim.sub` arbitrário, `p_cliente_id`/`p_fazenda_id`
  inexistentes, `client_uuid` de registro de terceiro →
  `registro_id = 3cc8d79b-8e32-40db-b194-463134fc220a`, `is_new = false`
  (**idor_oracle_confirmed = true**).
- T5: ator com vínculo legítimo no cliente, porém `client_uuid` criado por outro
  ator → devolvia o `id` alheio.

**Depois (`20261007000000`, prova `h9d-inventario/prova-idor-depois.log`)**:

| Teste | Resultado |
| --- | --- |
| T1 — identidade arbitrária + `client_uuid` alheio | `42501 no_active_binding_or_insufficient_access` |
| T2 — criação sem vínculo | `42501 no_active_binding_or_insufficient_access` |
| T3 — criação legítima | `is_new = true` |
| T4 — retry legítimo do mesmo ator/cliente | mesmo `id`, `is_new = false` |
| T5 — `client_uuid` de outro ator | `42501 request_rejected` (genérico, sem vazar `id`) |

Ordem imposta pela correção: autenticação → resolução de admin → autorização
ativa (`user_clientes`, `execute`/`manage`, janela de validade) → idempotência
escopada a `cliente_id = p_cliente_id` **e** `created_by = auth.uid()` (admin
escopado ao cliente) → validações → insert → auditoria. Assinatura, defaults,
retorno, validações, insert e log foram preservados; `search_path = public`
fixo; ACL final `{postgres, authenticated, service_role}`, sem `PUBLIC`/`anon`.
Fixtures somente em transação revertida; zero remanescentes.

Forward: `h9d-forwards/20261007000000_h9dl1_authz_before_idempotency_visit_v1.sql`.
Rollback: `h9d-rollbacks/20261007000000_h9dl1_authz_before_idempotency_visit_v1_rollback.sql`
(restaura a definição anterior byte a byte, com a mesma ACL).

## 3.2 Fingerprints reproduzíveis do dossiê L1

Os campos `body_md5`/`body_len` foram substituídos por campos reproduzíveis
diretamente do catálogo vivo — `definition_md5`, `definition_len`, `acl` e
`proconfig` — nas 30 assinaturas, gerados por:

```sql
SELECT p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')' AS sig,
       md5(pg_get_functiondef(p.oid))              AS definition_md5,
       length(pg_get_functiondef(p.oid))::text     AS definition_len,
       coalesce(p.proacl::text,'')                 AS acl,
       coalesce(p.proconfig::text,'')              AS proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';
```

O gate Vitest passou a exigir esse formato e a igualdade exata com a lista
explícita das 30 assinaturas canônicas do L1 (não apenas `total = 30`).

## 3.3 Correção da evidência de `fn_generate_recurring_title`

A cadeia anterior afirmava simultaneamente "fail-closed" e permissão de
`auth.uid()` NULL. Evidência retificada: a guarda é **condicional** — NULL é
permitido por desenho apenas no caminho interno (pg_cron/`service_role`, sessão
sem JWT, que não passa pelo PostgREST). Chamadas por `authenticated` sempre
chegam com claim `sub`, portanto nunca com UID NULL, e ficam obrigadas a ser
staff financeiro. Não é fail-closed genérico; o risco residual é a execução
direta como `postgres`/`service_role`, restrita por ACL.

## 4. Exposição comprovada e corrigida (H9-D1) — preservada

`public.fn_run_recurring_generation()` permanece com a guarda
`is_financial_staff(auth.uid())` (`42501`) aplicada por
`20261006000000_h9d1_authz_recurring_generation_v1.sql`, ACL inalterada
(`postgres`, `authenticated`, `service_role`) e execução interna do cron
preservada. Verificado nesta rodada em leitura.

## 5. Revalidação de estado (somente leitura)

| Item | Resultado |
| --- | --- |
| Ledger | 663, `20261007000000` exatamente uma vez |
| SECDEF `public` executável por `authenticated` | 376 |
| SECDEF `public` executável por `anon` | 2 |
| Guarda e ACL de `fn_run_recurring_generation()` | presentes e inalteradas |
| Crons | jobids 1, 2, 5, 8, 9, 18 ativos, agendas inalteradas |
| Fixtures criadas nesta rodada | zero (`_f42_harness_fixtures` mantém 14 linhas de 2026-08-06, pré-existentes) |
| Advisors | inalterados (segurança 391 / performance 510) — nenhum DDL foi executado |

## 6. Decisão

- **Nova vulnerabilidade comprovada nesta rodada:** uma (IDOR/BOLA em `create_technical_visit_secure`), corrigida por `20261007000000`.
- **Alteração no banco:** um forward reversível; ledger 662 → 663.
- **H9-D:** CONTINUA (L2 não iniciado, aguardando auditoria independente). Encerramento condicionado à evidência específica das 150
  assinaturas pendentes (lotes `H9-D-L2..L6`) e à reconciliação dos quatro
  helpers `private.h7n_*`.
- **Produção:** NO-GO.
- **H9-E:** não iniciada. O lote L2 aguarda auditoria independente deste L1.

## 7. Artefatos

- `h9d-inventario/dossie-l1.json` — dossiê determinístico das 30 assinaturas L1.
- `h9d-inventario/decisoes-h9d.json` — decisões manuais por assinatura canônica.
- `h9d-inventario/secdef-authenticated-inventory-h9d.tsv` — 376 linhas.
- `h9d-inventario/classificacao-h9d.tsv` — visão reduzida.
- `h9d-inventario/resumo-h9d.json` — aritmética 376 = 84 + 292.
- `h9d-inventario/gerar-inventario-h9d.py` — gerador v2 (chave por assinatura,
  rejeita evidência vaga, não promove por presença em readset).
- `src/test/security/h9d-inventario.static.test.ts` — gate estático do
  inventário e do lote L1 (30 assinaturas, unicidade, ausência de colisão por
  sobrecarga, evidência específica obrigatória).

- `h9d-inventario/prova-idor-create-technical-visit.sql` — script de prova
  (transacional, com savepoints e rollback total).
- `h9d-inventario/prova-idor-antes.log` / `prova-idor-depois.log` — evidência
  antes/depois.
- `h9d-forwards/20261007000000_h9dl1_authz_before_idempotency_visit_v1.sql` e o
  rollback correspondente.
