# HML — Financeiro B2B (vrlcdwmlytukrjezrrnf)

Estado: **só captura**. Nada aqui instala. Produção (`swzpzcwiasxmjutrmvkm`) não é tocada.

## Passo 1 — auditor executa (somente leitura)
`hml/01-capture.sql.readonly` em transação `READ ONLY` + `ROLLBACK`. Devolver as saídas C0..C8 sem editar.
Validado em PostgreSQL descartável (código 0); não lê linhas de negócio, Auth, segredos ou Vault.

| Saída | Para quê |
|---|---|
| C0 | impressão digital do banco (o ref é confirmado pelo operador no conector) |
| C1 | md5 HML × pino de produção para as 40 funções do pacote, cadeia de crédito, writer de edição, guards (`c2_order_actor_scope`, `assert_b2b_partner_scope`, `is_valid_b2b_partner_user`) e funções do candidato (devem estar `absent`) |
| C2 | corpo completo só das divergentes/sem pino |
| C3 | dependências diretas reais no HML |
| C4/C5 | colunas, NOT NULL, defaults, constraints, RLS e ACL das 24 tabelas |
| C6/C7 | políticas e gatilhos (md5 da função) |
| C8 | valores de `app_role` e se o papel financeiro já existe |

## O que já se sabe e o que falta para adaptar sem afrouxar gates
- `fn_b2b_credit_exposure` HML `213ac31f…` ≠ produção `7d841856…`, e `platform_private.b2b_credit_balances` **não existe** no HML. A extração de 02b é gerada do corpo de produção: **não é instalável no HML** e o PRE de produção abortará lá (correto; não afrouxar).
- Decisão necessária com C1/C2/C3: (a) o HML tem uma cadeia de crédito anterior (B4 não instalado) → gerar `hml/build_hml.py` que extrai o núcleo do corpo HML (`213ac31f…`) com pinos HML, mesmo padrão (wrapper conserva o gate, núcleo sem EXECUTE); ou (b) o auditor primeiro alinha HML à cadeia de produção com pacote próprio revisado. Não transplantar corpos de produção sem esse alinhamento.
- Precisa vir no C1: md5 HML de `b2b_integration_actor`, `b2b_order_residual`, `b2b_proven_money_row_internal`, `b2b_receivable_partner_scope`, `b2b_allocation_money_row`, `b2b_legacy_money_row`, `b2b_debtor_partner`, `is_financial_staff`, `fn_authz_uid_scope_ok`, `user_admin_change_access_type_core`, `tenant_admin_user_access_exec_v1`, `rpc_portal_partner_financial`, `b2b_own_obligations*`, `rpc_partner_message_counters`.
- Precisa vir no C4/C5: `partner_users` (CHECK de `papel`, `version`, `tenant_id`, revogação), existência de `b2b_document_allocations`, `b2b_authorized_documents`, `b4_order_condition_snapshots`, `price_schedule_snapshots`.
- Bloqueio concreto atual: sem essas saídas, o pacote HML não pode ser gerado; nada é instalado.

## Passos seguintes (depois das saídas)
2. `hml/build_hml.py` gera `02a/02b/02c-hml.sql.review` + rollback com pinos HML; difere de produção só nos pinos/corpos-base.
3. Bateria descartável sobre os corpos HML capturados.
4. Pacote QA hosted (fixtures sintéticos por writers canônicos, JWT/PostgREST A/B mesma empresa e C outra empresa, Financeiro/Técnico/Gestor, transições/revogação, roteiro navegador desktop/celular, limpeza por IDs registrados).
