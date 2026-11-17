# 02d — cadeia de crédito de PRODUÇÃO no HML `vrlcdwmlytukrjezrrnf` (revisão; nada aplicado)

Objetivo: o Financeiro B2B ler crédito no HML pela MESMA fórmula de produção, com JWT real e massa fictícia.

## O que instala (gerado por `build_credit_hml.py`; não editar os .sql)
- Helpers LIVE de produção alcançados pelo leitor (md5 de `pg_get_functiondef` pinados de `../../pins.json`):
  `b2b_credit_config_block`, `b2b_debtor_partner`, `b2b_receivable_partner_scope`, `b2b_allocation_money_row`,
  `b2b_legacy_money_row`, `b2b_proven_money_row_internal`, `b2b_order_residual`. Se já existir no HML com corpo diferente: aborta.
- Núcleos `b2b_credit_balances_core`/`b2b_credit_exposure_core` idênticos aos do 02b de produção (md5 conferido no teste).
- `b2b_finance_capability_core`/`b2b_finance_credit_core` passam ao corpo de produção (CAS: só se estiverem no estado 02b HML).
- Tabelas B4 privadas com a estrutura exata de produção (assinatura de colunas pinada), VAZIAS, RLS ON, sem GRANT;
  view `b4_order_condition_snapshots` como em produção.
- NÃO cria `b2b_integration_actor`/`b2b_credit_balances` públicos, não toca `fn_b2b_credit_exposure` legado do HML (`213ac31f…`).

## Costuras declaradas
- FKs para `holiday_calendars` e `b2b_condition_versions` (ausentes no HML) e gatilhos de imutabilidade B4 omitidos;
  tabelas ficam vazias e só postgres escreve. Escrita fiscal/B4 continua fechada.
- Títulos do seed usam a origem "legada provada" (`../seed/_legacy_origin.sql`): termos, cronograma, snapshot selado e auditoria
  INSERT fictícios marcados QA. Provam leitura/fórmula/isolamento; NÃO provam a proveniência do writer canônico.

## Ordem (root)
1. `SET app.expected_ref='vrlcdwmlytukrjezrrnf';` + `01d-pre-credit-hml.sql.readonly` → `PRE_02D_PASS`.
2. Migração incremental: mesmo SET + `02d-install-credit-hml.sql.review` → `INSTALL_02D_OK`.
3. `03d-post-credit-hml.sql.readonly` → `POST_02D_PASS` por parceiro QA com snapshot do núcleo (após o seed 05).
4. `CREDIT_02D=installed TARGET=hml python3 ../qa/jwt_suite.py` — exige limite/exposição/disponível exatos por parceiro.
5. Desfazer: `04d-rollback-credit-hml.sql.review` (só remove o que o ledger registrou; tabelas com linhas recusam).

## Evidência local
`test_credit_hml_pg.py` (36 PASS): PRE recusa ref/tabela/helper divergentes; antes do 02d crédito fechado; depois A=10000/1000/9000,
B e C isolados, revogado/gestor negados, núcleos sem EXECUTE do cliente, sem prova do writer → `B2B_LEGACY_WRITER_UNPROVEN`,
rollback volta ao fechado e reinstala. Auth sintética: não prova JWT/RLS hospedados.
