# H9-D — Auditoria de funções operacionais, relatórios e exposições de leitura

**Ambiente:** homologação `ikaauvsflpmamgxmkhoq` (exclusivo).
**Produção `navfzbwgwzruipouyfnk`:** não acessada, não consultada, não migrada.
**Ledger:** 664 (última `20261008000000`, exatamente uma vez).
**Status desta rodada (lote L2):** **H9-D CONTINUA — NO-GO para encerramento** (e NO-GO produção).
**Alteração no banco nesta rodada:** uma — forward `20261008000000` (escopo de identidade em guardas de papel e guarda de leitura interna em `fn_fiscal_company_crt` / `fn_microorganism_regulatory_facts`), reversível, aplicado só na homologação.

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
| AUTH_COMPROVADA (evidência específica por assinatura) | 153 |
| NAO_APLICAVEL (corpo lido, sem dado sensível) | 4 |
| EXPOSICAO_COMPROVADA_CORRIGIDA (H9-D1 + H9-D-L1 + 12 do H9-D-L2) | 14 |
| PENDENTE_EVIDENCIA (lotes H9-D-L3..L7) | 121 |

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
| Ledger | 664, `20261008000000` exatamente uma vez |
| SECDEF `public` executável por `authenticated` | 376 |
| SECDEF `public` executável por `anon` | 2 |
| Guarda e ACL de `fn_run_recurring_generation()` | presentes e inalteradas |
| Crons | jobids 1, 2, 5, 8, 9, 18 ativos, agendas inalteradas |
| Fixtures criadas nesta rodada | zero — as fixtures de cliente/fazenda/talhão/OS/aplicação/registro do teste cross-tenant foram criadas e revertidas na mesma transação (verificação final: 0 remanescentes) (`_f42_harness_fixtures` mantém 14 linhas de 2026-08-06, pré-existentes) |
| Advisors | segurança 391 / performance 510 — o forward só substitui corpos de funções existentes e cria um helper privado, sem novo objeto exposto |

## 6. Decisão

- **Novas vulnerabilidades comprovadas nesta rodada:** doze, corrigidas por `20261008000000` — BOLA em `get_cliente_id_for_user(uuid)` (identidade sem vínculo obtinha `cliente_id` de terceiro), oráculo de papel em nove guardas parametrizadas por UID e leitura interna sem guarda em `fn_fiscal_company_crt()` e `fn_microorganism_regulatory_facts(uuid)`.
- **Alteração no banco:** um forward reversível; ledger 663 → 664.
- **H9-D:** CONTINUA (L3 não iniciado, aguardando auditoria independente). Encerramento condicionado à evidência específica das 121
  assinaturas pendentes (lotes `H9-D-L3..L7`) e à reconciliação dos quatro
  helpers `private.h7n_*`.
- **Produção:** NO-GO.
- **H9-E:** não iniciada. O lote L3 aguarda auditoria independente deste L2.

## 7. Artefatos

- `h9d-inventario/dossie-l1.json` — dossiê determinístico das 30 assinaturas L1.
- `h9d-inventario/dossie-l2.json` — dossiê determinístico das 30 assinaturas L2, com fingerprints vivos (`definition_md5`, `definition_len`, `acl`, `proconfig`) colhidos após a correção.
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


## 8. Lote H9-D-L2 — resultado

As 30 assinaturas exigidas foram lidas integralmente no catálogo vivo, com ACL
`{postgres,authenticated,service_role}` e `search_path` fixo em todas.

**Exposições comprovadas e corrigidas (12).** Em transação revertida, uma
identidade `authenticated` sem papel e sem vínculo obteve: `cliente_id` de
terceiro (`get_cliente_id_for_user`), respostas verdadeiras de guardas de papel
sobre UID alheio (`can_view_catalog_internal`, `can_manage_catalog_tecnico`,
`can_view_technical_visit`, `can_manage_technical_visit`, `fn_fiscal_can_operate`,
`fn_fiscal_can_read_internal`, `fn_regulatory_can_read`, `fn_regulatory_can_prepare`,
`fn_regulatory_can_approve`), o CRT fiscal da empresa (`fn_fiscal_company_crt`) e o
dossiê regulatório completo (`fn_microorganism_regulatory_facts`).

O forward `20261008000000_h9dl2_authz_uid_scope_and_internal_reads_v1.sql`
introduz `public.fn_authz_uid_scope_ok(uuid)` (self, administrador ou sessão
interna sem JWT) e a aplica antes de qualquer leitura nas nove guardas
parametrizadas e em `get_cliente_id_for_user`; `fn_fiscal_company_crt` e
`fn_microorganism_regulatory_facts` passam a exigir staff fiscal/regulatório.
Assinaturas, tipo de retorno, ACL e `search_path` foram preservados.

**Prova depois:** todas as chamadas de ataque retornam `NULL`/`false`; caminhos
legítimos preservados — administrador, financeiro e técnico continuam lendo
CRT, dossiê regulatório e catálogo interno; o produtor continua resolvendo o
próprio `cliente_id` (usado nas policies de Storage); a sessão interna sem JWT
(cron/service_role) mantém acesso completo. O helper novo não é executável por
`authenticated`/`anon`, mantendo o universo SECDEF em **376/2**.

**Ensaio de reversibilidade:** rollback + reaplicação em transação descartada
resultou em **0 divergências** de `md5(pg_get_functiondef)` no schema `public`.

**AUTH_COMPROVADA (17).** Helpers de escopo (`can_user_access_*`,
`can_user_manage_*`, `fn_onfarm_scope_*`), Storage regulatório e as três RPCs
B2B: provados com fixtures de um segundo cliente criadas e revertidas na mesma
transação — técnico e produtor vinculados ao cliente A receberam `false` para
todos os recursos do cliente B, e as RPCs B2B abortaram com `access denied`
antes de qualquer leitura. A leitura ampla que resta em `can_user_access_aplicacao`
e a escrita em `can_user_manage_aplicacao` são exclusivas de papéis internos da
AR Bio (staff operacional), que não são multi-tenant por desenho.

**PENDENTE_EVIDENCIA (1).** `fn_catalogo_preco_canonico(uuid,uuid,text,numeric)`
devolve o preço canônico (150.000000) para qualquer `authenticated`, inclusive
sem papel. Não há falha de tenant, mas também não há guarda: a decisão é de
visibilidade comercial e depende do responsável de negócio. Como a função é
consumida por `h7n_catalogo_ficha_microrganismos`, `h7n_catalogo_ficha_produtos`
e pelos resolvedores de preço B2B, nenhuma correção foi aplicada nesta rodada.
Segue para o lote `H9-D-L3`.


## 9. Lote H9-D-L3 — resultado

Ambiente: homologação `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk`
não foi acessada em nenhum momento. Ledger antes **664** (`20261008000000`),
depois **665** (`20261009000000`). Universo SECDEF `authenticated`/`anon`:
**376/2** antes, **375/2** depois (o preço canônico deixou de ser executável por
`authenticated`).

As 30 assinaturas exigidas foram lidas integralmente (`pg_get_functiondef`) no
catálogo vivo, com ACL, `proconfig`, retorno, objetos tocados, cadeia transitiva
e callsites registrados em `h9d-inventario/dossie-l3.json`, com fingerprint
reproduzível (`md5`/`length` da definição viva).

### 9.1 Exposições comprovadas e corrigidas (6)

Provas dinâmicas em transação revertida, com sessão `authenticated` de um
usuário sem papel e sem vínculo:

| Assinatura | Antes | Depois |
| --- | --- | --- |
| `get_cliente_ids_for_user(uuid)` | devolvia `{b05e3c22-…}` para o uid de um produtor alheio | `{}` |
| `has_active_user_cliente_access(uuid,uuid,text[])` | `true` para uid de terceiro | `false` |
| `is_financial_staff(uuid)` | `true` para uid de financeiro alheio | `false` |
| `is_delivery_staff(uuid)` | `true` para uid de administrador alheio | `false` |
| `pode_acessar_recomendacao(uuid,uuid)` | `true` para uid de técnico alheio (fixture transacional) | `false` |
| `fn_catalogo_preco_canonico(uuid,uuid,text,numeric)` | produtor lia **0 linhas** em `catalogo_volumes` e ainda assim obtinha `150.000000/litro` e `15.00/ha` para produto arbitrário | `ERROR: permission denied for function` |

O forward `20261009000000_h9dl3_authz_uid_scope_and_internal_price_v1.sql`
reaproveita `public.fn_authz_uid_scope_ok(uuid)` (criado na L2: self,
administrador ou sessão interna sem JWT) nas cinco funções de identidade/papel e
revoga `EXECUTE` de `PUBLIC`/`anon`/`authenticated` no preço canônico,
preservando `service_role`. Assinaturas, parâmetros, defaults, retorno,
linguagem, volatilidade e `search_path` (inclusive `public, pg_temp` em
`is_financial_staff`) foram preservados; nenhum fluxo paralelo foi criado.

**Caminhos legítimos preservados (prova depois):** usuário financeiro continua
`true` em `is_financial_staff(auth.uid())`; produtor resolve o próprio
`cliente_id`; técnico mantém `has_active_user_cliente_access` do próprio
vínculo; aplicador mantém `is_delivery_staff(self)`; administrador continua
consultando terceiros; sessão interna sem JWT (`auth.uid() IS NULL`, cron e
`service_role`) mantém acesso completo; as fichas `vw_catalogo_ficha_*`
continuam devolvendo 8 produtos com preço, sem alteração de regra comercial.

**Reversibilidade:** `rollback` + reaplicação em transação descartada devolveu o
`EXECUTE` a `authenticated` e voltou a revogá-lo, com
`md5(pg_get_functiondef)` idêntico ao estado aplicado.

### 9.2 Decisão de contrato do preço canônico

A pendência comercial deixada na L2 foi resolvida sem inventar regra de negócio:
o que era ambíguo (quem pode ver preço) permanece definido pelas views
`vw_catalogo_ficha_produtos` / `vw_catalogo_ficha_microrganismos`
(`security_invoker`), cuja regra — perfil técnico aprovado e `b2b_enabled` para
parceiros, ou papel interno via `can_view_catalog_internal` — não foi tocada. O
que era inequivocamente inseguro (consultar o preço de **qualquer** produto por
chamada direta, contornando a RLS de `catalogo_volumes`) foi removido. Todos os
consumidores legítimos executam em contexto de owner e seguem funcionando.

### 9.3 AUTH_COMPROVADA (24)

Todas com prova dinâmica de fail-closed para ator `authenticated` sem papel:

- Financeiro (`get_report_payables`, `get_report_receivables`,
  `get_report_nfe_pending`, `get_report_monthly_financial`,
  `get_top_financial_rankings`, `log_report_export`): `P0001 Acesso negado` via
  `is_financial_staff(auth.uid())`, agora também com escopo de identidade.
- Comunicação administrativa (`rpc_activate_communication_template`,
  `rpc_archive_communication_template`, `rpc_admin_communication_health_snapshot`,
  `rpc_admin_communication_outbox_metrics`,
  `rpc_admin_list_communication_dead_letter`): `42501 apenas administrador` via
  `_comunicacao_require_admin()`.
- Operação e entrega (`rpc_anexar_comprovante_entrega`,
  `rpc_atualizar_checklist_entrega`, `rpc_assign_visit_technician`,
  `rpc_avancar_esteira_laboratorio`, `publish_planning_to_lab`,
  `return_catalog_profile_to_review`): guarda com `auth.uid()` antes de qualquer
  escrita.
- B2B e identidade (`rpc_b2b_capacity_kpis`, `rpc_b2b_executive_alerts`,
  `rpc_b2b_credit_exposure`, `get_user_partner_id`,
  `get_my_available_portal_contexts`, `log_my_access_denied_secure`): sem
  parâmetro de ator ou com o parceiro conferido contra o vínculo do chamador.
- `lab_request_replanning(uuid,text)`: guarda anterior às escritas.

### 9.4 Riscos funcionais pré-existentes (registrados na rodada 6; corrigidos na rodada 7)

1. `lab_request_replanning` testa `has_role(v_uid,'laboratorio')`, e
   `laboratorio` não existe no enum `app_role`: a guarda aborta com `22P02`
   para qualquer chamador. É fail-closed, porém a função está inoperante também
   para o staff legítimo.
2. A família de relatórios financeiros referencia colunas inexistentes no schema
   vivo (`accounts_receivable_installments.amount`,
   `accounts_receivable.cliente_id`); a autorização funciona, mas o corpo falha
   depois dela. As colunas reais são `original_amount`/`net_amount` e
   `customer_id`.

Ambos exigem decisão funcional e ficam registrados para a fase seguinte.

### 9.5 Aritmética do escopo profundo após a L3 (soma 292)

**177 AUTH_COMPROVADA**, **4 NAO_APLICAVEL**, **20
EXPOSICAO_COMPROVADA_CORRIGIDA**, **91 PENDENTE_EVIDENCIA** (lotes
`H9-D-L4..L7`).

**Decisão: H9-D CONTINUA (NO-GO para encerramento) / NO-GO produção.** H9-E e o
lote L4 não foram iniciados.


## 10. Rodada 7 — retificação funcional e de escopo ativo do L3 (`20261010000000`)

Ambiente: homologação `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não
foi acessada. Ledger **665 → 666** (aplicação única). H9-E e o lote L4 não foram
iniciados.

### 10.1 Defeitos reproduzidos ANTES da correção (transação revertida)

| Assinatura | Erro observado |
| --- | --- |
| `get_report_monthly_financial(date,date,uuid,text)` | `42703 column i.amount does not exist` |
| `get_report_payables(jsonb)` | `42703 column i.amount does not exist` |
| `get_report_receivables(jsonb)` | `42703 column i.amount does not exist` |
| `get_report_nfe_pending(jsonb)` | `42703 column ar.cliente_id does not exist` |
| `lab_request_replanning(uuid,text)` | `22P02 invalid input value for enum app_role: "laboratorio"` |
| `get_cliente_ids_for_user(uuid)` | devolveu **5 de 5** vínculos: inativo, revogado, futuro, expirado e ativo |
| `get_cliente_id_for_user(uuid)` / `pode_acessar_recomendacao(uuid,uuid)` | aceitavam vínculo sem filtro de vigência |

Fixtures criadas apenas dentro da transação (`TESTE_L3R_*`); contagem final de
remanescentes: **0**.

### 10.2 Correção aplicada

- **Relatórios**: colunas vivas `original_amount`, `received_amount`,
  `paid_amount`, `discount_amount` e `accounts_receivable.customer_id`. Saldo
  pela fórmula canônica já usada por `fn_fin_aging` e `fn_fin_dashboard_kpis`:
  `original_amount - COALESCE(recebido/pago,0) - COALESCE(discount_amount,0)`.
  Assinaturas, retornos, filtros, ordenação e a guarda `is_financial_staff`
  foram preservados.
- **Laboratório**: removido o valor inexistente `laboratorio`; escopo mantido
  exatamente em `administrador|producao|gestor`, idêntico a
  `publish_planning_to_lab`. Nenhum papel novo foi incluído.
- **Escopo de vínculo**: `get_cliente_ids_for_user`, `get_cliente_id_for_user` e
  `pode_acessar_recomendacao` passam a exigir `is_active = true`,
  `revoked_at IS NULL` e janela de vigência corrente. O fallback
  `profiles.cliente_id` só sobrevive quando existir vínculo ativo equivalente
  (compatibilidade verificada: os 4 perfis com `cliente_id` têm vínculo ativo).
- `fn_authz_uid_scope_ok` e o escopo self/admin das rodadas 5 e 6 foram
  preservados; nenhum `GRANT` novo, sem `PUBLIC`/`anon`, `search_path` fixo.

### 10.3 Provas DEPOIS da correção

- Administrador e `financeiro`: `get_report_monthly_financial` retorna JSON
  (`received = 15450.00`), `get_report_payables` 30 linhas,
  `get_report_receivables` 56 linhas, `get_report_nfe_pending` 0 linhas.
- `cliente_produtor`: `Acesso negado` nos quatro relatórios (antes de qualquer
  leitura) e `forbidden` em `lab_request_replanning`.
- `lab_request_replanning` como administrador alcança a regra de negócio
  (`order_not_found`), não mais o erro de enum.
- Escopo: apenas o vínculo ativo é devolvido; BOLA cross-uid devolve `{}` e
  `NULL`; escopo legítimo do produtor preservado.
- Catálogo pós-L3 confirmado: `vw_catalogo_ficha_produtos` (8) e
  `vw_catalogo_ficha_microrganismos` (25) legíveis; chamada direta a
  `fn_catalogo_preco_canonico` segue `permission denied`.

### 10.4 Ensaio de reversão

Rollback aplicado → os cinco erros originais voltaram exatamente; forward
reaplicado → **0 divergências** de `md5(pg_get_functiondef)` nas oito
assinaturas. Ledger permanece 666 (registro único).

### 10.5 Estado final

Ledger **666** (última `20261010000000`), SECDEF `authenticated` **375** /
`anon` **2**, crons 1/2/5/8/9/18 ativos, zero fixtures remanescentes.
Classificações do escopo profundo **inalteradas** (177 / 4 / 20 / 91): os
defeitos desta rodada são funcionais ou endurecimento de escopo já classificado,
sem novas exposições.

### 10.6 Risco funcional remanescente (não corrigido)

- `get_report_customer_statement(uuid,date,date)` também referencia `i.amount`,
  porém está fora das quatro funções autorizadas nesta rodada; fica registrado
  para autorização específica.
- ~~`received_amount` diverge da soma de `receivable_payments` em 10 de 58
  parcelas~~ — **retificado na rodada 8**: a comparação usada aqui somava apenas
  `is_reversal = false` e ignorava o par de estorno. Pela soma líquida correta,
  há **0 divergências reais** (58/58 reconciliam). Ver item 11.5.

**Decisão: H9-D CONTINUA (NO-GO para encerramento) / NO-GO produção.**

---

## 11. Rodada 8 — Retificação 2 do H9-D-L3 (extrato do cliente e integridade financeira)

Homologação `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não foi acessada.
Forward `20261011000000_h9dl3r2_customer_statement_live_columns_v1.sql` (rollback exato ao lado).

### 11.1 Defeito comprovado ANTES

`public.get_report_customer_statement(uuid,date,date)` chamada por administrador falhava com
`42703 column "valor_total" does not exist`. O corpo referenciava três objetos inexistentes:
`entregas.valor_total`, `entregas.data_entrega` e `accounts_receivable_installments.amount`.
O defeito derrubava também `get_report_accountability(jsonb)`, que delega ao extrato, e portanto
as telas "Extrato Financeiro por Cliente" e "Prestação de Contas".

Schema vivo: `entregas` tem `receivable_id`, `cliente_id`, `data_saida`, `entregue_em`, `status`
e `quantidade_entregue`, sem qualquer coluna monetária; as parcelas usam `original_amount`,
`received_amount`, `discount_amount`, `interest_amount`, `penalty_amount` e `net_amount`.

### 11.2 Decisão sobre `delivered` (documentada, sem fluxo paralelo)

Não existe valor monetário em `entregas`. `fn_entrega_valor_faturavel_v1` é a função canônica por
entrega, mas depende de `os_faturamento_base.valor_total_faturavel`, que hoje não tem nenhuma
linha com valor preenchido nem entrega vinculada — e o uso linha a linha violaria a proibição de
N+1. A única fonte monetária inequívoca é o vínculo `entregas.receivable_id → accounts_receivable`.

`delivered` passa a ser a **soma de `accounts_receivable.total_amount` dos títulos DISTINTOS
vinculados a entregas confirmadas** do cliente no período (data = `COALESCE(entregue_em::date,
data_saida)`), excluindo títulos cancelados. Entregas sem vínculo financeiro **não recebem
estimativa**: são declaradas em `delivered_unlinked_count`, e `delivered_basis` explicita a base
do cálculo. Dupla contagem é impossível também por estrutura: `entregas.receivable_id` é UNIQUE
(`uq_entregas_receivable_id`); ainda assim a consulta usa `DISTINCT` defensivo.

### 11.3 Correção aplicada

Assinatura, retorno `jsonb`, chaves antigas (`customer_id`, `period`, `delivered`, `billed`,
`received`, `open_balance`), guarda `is_financial_staff(auth.uid())` antes de qualquer leitura,
ACL `postgres|authenticated|service_role` sem `PUBLIC`/`anon` e `search_path` fixo foram
preservados. Saldo em aberto usa a fórmula canônica das funções já corrigidas na rodada 7:
`original_amount - COALESCE(received_amount,0) - COALESCE(discount_amount,0)`. Datas nulas ou
invertidas passam a falhar com `22023 Período inválido`. Sem `SELECT *`, sem subconsulta N+1.
Chaves novas, apenas aditivas: `delivered_basis`, `delivered_deliveries_count`,
`delivered_unlinked_count` e `received_net_of_reversals`.

### 11.4 Provas DEPOIS (transação revertida)

- Administrador e `financeiro`, cliente real: JSON válido e reconciliável —
  `billed 7000.00`, `delivered 3000.00`, `received 1500.00`,
  `received_net_of_reversals 1200.00`, `open_balance 5800.00`, `delivered_unlinked_count 2`.
- Sem privilégio: `Acesso negado` **antes** de qualquer leitura.
- Cliente inexistente: zeros sem erro. `get_report_accountability` com `customer_id` nulo: zeros.
- Período invertido: `22023 Período inválido`.
- Múltiplas entregas para o mesmo título: impossível de inserir —
  `duplicate key value violates unique constraint "uq_entregas_receivable_id"`; fixtures revertidas.
- Rollback → `42703` reproduzido; reaplicação → fingerprint idêntico
  `317e63c67b98aca17d82bafe036d8c88 | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | {search_path=public}`.

### 11.5 Integridade financeira — 0 divergências reais (58/58 reconciliam)

Diagnóstico completo em `h9d-inventario/relatorio-integridade-received-amount.md`.

**Não há corrupção de dado e não há divergência real.** A reconciliação correta é contra a soma
**líquida** de `receivable_payments` (originais + estornos): `received_amount` coincide em
**58/58** parcelas (`div_liquido = 0`). A contagem de 10/58 era artefato de somar apenas
`is_reversal = false`, ignorando o par de estorno. As dez parcelas `OVERDUE` têm
`received_amount = 0.00`, pagamento original `+300.00` e estorno `-300.00`; os **10** estornos
existentes têm **todos** `reversed_payment_id` preenchido (`estornos_sem_par = 0`).

Contrato auditado: `fn_reverse_payment(uuid,text,text)` exige sessão e `is_financial_staff`, motivo
com no mínimo 5 caracteres, trava por advisory lock, recusa estornar um estorno ou parcela
`CANCELED`, é idempotente por `reversed_payment_id` (replay devolve o mesmo id; motivo divergente
levanta `FIN_IDEMPOTENCY_CONFLICT`) e insere uma linha espelho **append-only** com
`amount_received`, desconto, juros e multa negados. O gatilho `trg_recalc_ar_inst` →
`fn_recalc_receivable_installment()` soma todas as linhas, inclusive estornos, e por isso a coluna
denormalizada é, por contrato, **líquida e correta**.

**Nenhum valor financeiro foi alterado** — não há saneamento a executar.

Risco residual — de **relatório**, não de dado: as funções de regime caixa somam apenas
`is_reversal = false` e por isso superestimam o recebido em `3000.00` no conjunto atual
(`fn_financial_inconsistencies` adota a mesma convenção). O contrato foi preservado e a diferença
ficou observável em `received_net_of_reversals`; a uniformização do regime caixa fica proposta
como próximo passo, fora do escopo autorizado.

### 11.6 Estado final da rodada 8

Ledger **667** (última `20261011000000`, registro único), SECDEF `authenticated` **375** /
`anon` **2**, crons 1/2/5/8/9/18 ativos, zero fixtures. Classificações do escopo profundo
**inalteradas** (177 / 4 / 20 / 91): o defeito era funcional, não uma nova exposição.

## 12. Rodada 9 — retificação 3 do H9-D-L3 (relatório de entregas e regime caixa líquido)

Forward `20261012000000_h9dl3r3_deliveries_report_and_net_cash_v1`, aplicado **somente em
homologação** (`ikaauvsflpmamgxmkhoq`), ledger **667 → 668**. Migração puramente de definição de
função e ACL: **nenhum dado financeiro foi alterado**.

### 12.1 Provas antes

- `get_report_deliveries_billing_status('2000-01-01','2100-01-01')` como administrador:
  `ERROR: column e.data_entrega does not exist` (42703). `entregas` não possui `data_entrega` nem
  coluna monetária; possui `data_saida`, `entregue_em` e `receivable_id`.
- `get_report_monthly_financial`: `received = 15450.00`, enquanto a soma líquida de
  `receivable_payments` no mesmo período é `12450.00` — superestimativa de exatamente `3000.00`
  (10 estornos pareados).

### 12.2 Correções

| Função | Correção |
| --- | --- |
| `get_report_deliveries_billing_status(date,date)` | `delivery_date = COALESCE(entregue_em::date, data_saida)`; `total_value` vem **apenas** de `accounts_receivable.total_amount` do título vinculado, validando `ar.customer_id = e.cliente_id` e `ar.status <> 'CANCELED'`; sem título válido ⇒ `0` e `billed = false` (nunca estimativa); uma linha por entrega; validação de período `22023`; assinatura e colunas de retorno preservadas. |
| `get_report_monthly_financial(date,date,uuid,text)` | `received`, `paid`, `net_cash` e `by_category` passam a **incluir** as linhas negativas de estorno (regime caixa líquido). Chaves anteriores preservadas; adicionados `cash_basis`, `received_gross`, `paid_gross` e `received_gross` por categoria. |
| `get_report_customer_statement(uuid,date,date)` | `received` passa a ser **líquido**; `received_gross` e `received_net_of_reversals` explícitos; `delivered` passa a exigir `ar.customer_id = _customer_id`, impedindo contaminação por vínculo inconsistente. |
| `fn_financial_inconsistencies()` | **Não alterada** — ver 12.4. |

### 12.3 Provas depois (todas em transação revertida)

- Entregas: administrador e financeiro executam; **42** linhas, **16** faturadas, total `24000.00`.
- Mensal: `received = 12450.00` (líquido), `received_gross = 15450.00`, `paid = 13000.00`,
  `net_cash = -550.00`, `by_category` somando exatamente `12450.00`. Não há estornos em
  `payable_payments` (0 linhas), logo AP bruto = AP líquido.
- Extrato: `received = received_net_of_reversals` e `received_gross` preservado à parte.
- Fixtures sintéticas (revertidas): entrega com título válido ⇒ `1000.00 / billed=true`; título
  **cancelado** ⇒ `0 / false`; entrega **sem título** ⇒ `0 / false`; título de **outro cliente** ⇒
  `0 / false` e `delivered = 0` para esse cliente. Ponteiro órfão é estruturalmente impossível
  (`entregas_receivable_id_fkey`); dupla contagem por título é impossível
  (`uq_entregas_receivable_id`).
- Negativos: `tecnico_agronomo` recebe `Acesso negado` antes de qualquer leitura; período invertido
  ⇒ `22023`; período vazio ⇒ 0 linhas sem erro.
- Rollback → reaplicação: definições e ACL das três assinaturas idênticas. Fingerprint canônico reproduzível
  `md5(string_agg(pg_get_functiondef(oid)||proacl, '|' ORDER BY proname))` = `22ad484f0edc6233c2eecdbdd4da1334`
  (o valor `a33ec88a…` citado no ensaio veio de expressão ad hoc da sessão e não é reproduzível). Zero fixtures remanescentes.

### 12.4 Retificação sobre `fn_financial_inconsistencies`

A afirmação de que a função "soma apenas `is_reversal = false`" está **retificada**: o filtro aparece
somente na regra `AR_CANCELED_WITH_PAYMENT` e, na mesma condição, originais com linha de estorno são
excluídos por `NOT EXISTS (... rp2.reversed_payment_id = rp.id)`. Sem defeito comprovado, a função
**não foi tocada**.

### 12.5 Estado final

Ledger **668** (última `20261012000000`), SECDEF `authenticated` **375** / `anon` **2**, crons
1/2/5/8/9/18 ativos, zero fixtures, produção não acessada. Classificações do escopo profundo
**inalteradas** (177 / 4 / 20 / 91): eram defeitos funcionais e de semântica de relatório, não novas
exposições.

### 12.6 Risco remanescente

- `get_report_accountability(jsonb)` herda o extrato corrigido, mas sua composição própria não foi
  reauditada nesta rodada.
- Uniformização do regime caixa em relatórios fora desta rodada (por exemplo `get_financial_cashflow`
  e `get_financial_dre_summary`) permanece não verificada.

**Decisão: H9-D CONTINUA (NO-GO para encerramento) / NO-GO produção.** L4 e H9-E não iniciados.

### 13.7 Adendo de auditoria independente (reprova no UUID indicado)

A auditoria independente apontou o mesmo defeito: `SELECT *` do registro antes de
`_assert_visita_editavel`, com sucesso silencioso para UUID inexistente e `42501 sem_permissao` para o
diagnóstico real `b906cbf7-c7b1-4736-98c2-a5f281238068`. O apontamento está **integralmente coberto**
pelo forward `20261013000000_h9dl4_authz_visit_domain_gate_v1` (rollback simétrico incluído).

Reprova executada no catálogo vivo, em transação revertida, identidade `authenticated` sem papel de
domínio:

| caso | antes | depois |
| --- | --- | --- |
| diagnóstico real `b906cbf7-…` | `42501 sem_permissao` | `42501 sem_permissao` |
| diagnóstico inexistente | sucesso silencioso (`void`) | `42501 sem_permissao` |
| recomendação inexistente | sucesso silencioso (`void`) | `42501 sem_permissao` |
| sem JWT, diagnóstico real | sucesso silencioso (`void`) | `42501 sem_permissao` |

As quatro respostas passam a ser indistinguíveis, eliminando o oráculo. O corpo vivo confirma que a
primeira instrução executável é `IF v_uid IS NULL THEN RAISE 'sem_permissao'` seguida do gate de
capacidade, **antes** de qualquer leitura do recurso; `_assert_visita_editavel`, a edição legítima e a
auditoria permanecem intactas. `rpc_delete_recomendacao_visita` recebeu a mesma correção mesmo sem
recomendação real disponível para prova positiva, por o defeito ser estruturalmente idêntico e
determinístico.

## H9-D-L4 — Retificação do adendo (20261014000000, ledger 670)

Ambiente: homologação `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não foi acessada.

### Defeito remanescente comprovado
O forward `20261013000000` (gate de capacidade antes da leitura) fechou apenas usuários **sem** papel.
Entre usuários de domínio o oráculo de existência persistia:

- identidade real `2767fb15-7f00-41d5-8360-622d6dea8de6` (tecnico_agronomo);
- `rpc_delete_diagnostico_visita('00000000-…-0000000000ff')` → `void`;
- `rpc_delete_diagnostico_visita('b906cbf7-c7b1-4736-98c2-a5f281238068')` → `ERROR 42501 sem_permissao`
  (CONTEXT: `_assert_visita_editavel` linha 18).

Prova executada em `BEGIN … ROLLBACK`; nenhum dado alterado.

### Correção (`20261014000000_h9dl4r_authz_scoped_delete_no_oracle_v1`)
Resolução e autorização passam a ocorrer em **uma única consulta escopada ao chamador**
(`JOIN registros_consultor` com `can_manage_technical_visit` / `created_by` /
`consultor_responsavel` / `is_active_visit_participant`). Se nada é resolvido no escopo,
a função retorna `void` — comportamento idêntico para UUID inexistente e para recurso alheio.
Não há mais `SELECT *` antes da autorização. `visita_nao_editavel` permanece apenas para recurso
já autorizado (não revela existência a terceiros). Delete legítimo e auditoria preservados;
assinaturas, retornos, ACL (`postgres/authenticated/service_role`, sem PUBLIC/anon) e
`search_path=public` inalterados.

### Provas DEPOIS (todas em transação revertida, zero fixtures)
| identidade | UUID inexistente | UUID real alheio/próprio |
|---|---|---|
| sem papel `2a1ea60a-…790431` | `42501 sem_permissao` | `42501 sem_permissao` |
| domínio alheio `2767fb15-…6dea8de6` (tecnico_agronomo) | `void` | `void` (indistinguível) |
| dono/administrador `b5c2ebd4-…c49f1b583a` | `void` | delete legítimo executado (`restantes = 0`) |

Após o `ROLLBACK`, `visita_diagnosticos` mantém a linha original (1). `registros_consultor_recomendacoes`
não possui linhas reais; o mesmo padrão foi aplicado e provado com UUID inexistente.

### Reversibilidade e ledger
Ensaio rollback → reaplicação na mesma sessão:
`forward = 91eba8cac7995ddec016c09b36db20d2`, `rollback = 193e96fa580d4507034278fe97c9040b`,
`reaplicação = 91eba8cac7995ddec016c09b36db20d2` (idêntico). Ledger 669 → 670, `20261014000000`
registrada uma única vez.

Decisão: **H9-D CONTINUA**; produção **NO-GO**. L5/H9-E não iniciados.
