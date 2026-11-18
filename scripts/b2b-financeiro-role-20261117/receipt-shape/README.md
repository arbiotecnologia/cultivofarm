# Incidente de cadastro Financeiro — 18/11/2026

**REVIEW ONLY; nenhuma aplicação hosted, implantação Edge ou publicação neste ajuste.**

## Causa e gap reconhecido
Root constatou às 01:07:07Z violação de `c2_receipt_roles_shape` antes de Auth; informou zero Auth/profiles/receipts e nenhuma compensação necessária.
O pacote anterior alterou scope/provisioner/finish, mas omitiu o CHECK do recibo; a fixture simplificada também o omitia. QA hospedado criava aplicador e transitava para Financeiro: suas 72 provas reais de leitura/isolamento não cobriam criação direta do Financeiro.

## Delta exclusivo de constraint
- Preserva literalmente a expressão antiga (inclusive NULL, limite 1–3, proibição de elemento NULL, subset legado e duplicatas legadas) e acrescenta somente `OR external_roles = ARRAY['parceiro_b2b_financeiro']::public.app_role[]`.
- Sem alteração de dados, funções, ACL, RLS, papéis ou regras de isolamento.
- PRE/instalação aceitam apenas definição LIVE pinada, definição legada reparseada ou candidato exato validado; drift, constraint ausente/não validada e ref ausente/divergente abortam.
- A reinterpretação pelo parser PostgreSQL achata o AND aninhado da captura LIVE. Os dois textos legados exatos estão identificados em `pins.json`; não há normalização genérica ou aceitação de predicados desconhecidos. Rollback restaura a expressão legada com representação reparseada equivalente.
- Lock exclusivo com timeout 3s, rechecagem após lock, validação integral antes do COMMIT; reexecução idempotente.
- Rollback recusa se existir qualquer recibo Financeiro, inclusive completed/aborted: não exclui nem altera histórico para restaurar o CHECK antigo.

## Arquivos e ordem (root)
1. Comprovar pelo canal administrativo o ref `swzpzcwiasxmjutrmvkm`; `SET app.expected_ref='swzpzcwiasxmjutrmvkm'` é somente pin adicional, não prova do destino.
2. `01-pre.sql.readonly` → `PRE_RECEIPT_PASS` + definição/hash.
3. Revisar/aplicar `02-install.sql.review` como migração incremental, sem repetir 02a/02b/02c.
4. `03-post.sql.readonly` → `POST_RECEIPT_PASS`.
5. Contenção, se necessária e sem recibos Financeiro: `04-rollback.sql.review` e `05-post-rollback.sql.readonly`.
6. Root valida adicionalmente criação direta canônica Financeiro → AuthAdmin → finish, role singleton, vínculo próprio, primeira senha e leitura/revogação, sem enviar convites nem criar massa de negócios em produção pelo agente.

## Captura e varredura somente leitura
`captured/catalog.json`: 20 colunas/defaults do recibo, 5 constraints reais do recibo, constraints de profiles/user_roles/partner_users; 26 bindings reais ativos e seus corpos; 10 corpos/ACL/md5 de claim/scopes/provisioner/finish/Auth trigger. Ref canônico conferido no config antes das consultas.
`captured/transitive-audit.json`: varredura dos CHECKs que mencionam app_role/external_role e de todas as funções public/platform_private cujo corpo referencia o recibo. Único CHECK com essa semântica encontrado: o incidente; os quatro constraints restantes do recibo são UNIQUE/PK. Scope/provisioner/finish array suportam Financeiro exclusivo; overloads escalares legados continuam restritos e não são o caminho da Edge atual.

**Achado transitivo adicional:** `b2b_complete_provisioning_compensation` LIVE ainda mapeia vínculo para gestor/tecnico, sem financeiro (dois CASE). Na presença de um vínculo Financeiro parcial, recusa com `b2b_compensation_pending`, preservando dados, mas não conclui compensação. Não afetou a tentativa reportada (falhou antes de Auth) nem o positivo local. Este delta NÃO altera compensação; root deve revisar esse achado antes de certificar recuperação completa de falhas pós-vínculo. Não ampliar exclusão nem trocar papéis como workaround.

## Prova local e limites
`python3 test_pg.py`: 71/71 em PostgreSQL 17.12 descartável. Falha antiga reproduzida, zero recibos/Auth parciais, positivo claim→INSERT Auth sintético→handle_new_user real→finish/provisioner reais→role singleton/vínculo/recibo completed, replay; combinações indevidas, vazio/NULL no array, legado e rollback/drift.
Todos os 26 gatilhos/bindings capturados ficam ativos; corpos de provisionamento carregados verbatim e 10 md5 conferidos. Nenhum trigger desativado.
**Costuras:** tabela Auth reduzida, INSERT em vez de AuthAdmin HTTP, claims SQL em vez de JWT password real, schema public mínimo, entitlements fixture-backed e has_ticket false em ramo não alcançado; admin sintético inicial inserido antes da instalação dos gatilhos. Não prova AuthAdmin hospedado, HTTP/Edge, Storage, RLS completa nem criação real em produção. Captura de constraints é real; reprodução de PK/FK das tabelas public ainda mínima, enquanto estrutura/constraints do recibo são capturadas completas.
Evidência versionada: `evidence-local.json`; hashes SQL em `SHA256SUMS`.