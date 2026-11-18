# Massa fictícia QA do Financeiro B2B — somente HML `vrlcdwmlytukrjezrrnf`

Autorização do usuário: criar dados fictícios de teste e eliminá-los todos depois. Nada aqui roda em produção.
Sem NF, sem cobrança, sem envios. Nenhum gatilho é desativado.

## Ordem (root; nada é reprovisionado)
1. `04-register-saas-hml.sql.review` — registra as 2 assinaturas e 4 overrides já criados (IDs fixos).
2. `05-seed-hml.sql.review` — títulos sentinela A/B/C + origem legada fictícia; salvar `QA_TITLES_JSON` e rodar
   `qa/merge_seed_manifest.py <manifest> <titles.json>` (limites 5000/7000/9000).
3. Crédito: pacote `../credit` (01d → 02d → 03d). Depois `jwt_suite.py` (`CREDIT_02D=installed`), navegador desktop/mobile, CSV,
   revogação (`QA_FIN_REVOKED`).
4. `06a-cleanup-dryrun-hml.sql.rollback` — lista tabela/ID/hash/vínculo de cada linha, recusas e `QA_CLEAN_DIGEST`; termina em ROLLBACK.
5. Revisar a lista; então `SET app.qa_cleanup_digest='<digest>';` + `06-cleanup-hml.sql.review` na MESMA sessão → `QA_CLEAN_PASS`.
6. Contas Auth: painel Supabase do HML → Authentication → Users → buscar cada um dos 5 UUIDs → Delete user (mecanismo oficial;
   a Admin API `DELETE /auth/v1/admin/users/{id}` exige service_role e fica a critério do root). Nenhum outro usuário é tocado.
7. `04d-rollback-credit-hml.sql.review` se o 02d não for mantido; `07-verify-clean-hml.sql.readonly` → tudo 0.

## Correção pós-falha b797 (C11, 2026-11-18)
- Falha real: `auth_required` em `b2b_internal_order_snapshot_guard` (INSERT de pedido por postgres, sem ator). Não se injeta JWT/claim,
  ator, ticket nem atestado fiscal: o pedido QA fica sem `internal_origin_snapshot`, com status `aprovado` (exigido pelo vínculo
  financeiro real), sem itens/produção/NF.
- `captured/c11-triggers.sql` = 38 corpos reais do root; `c11-pins.json` = md5(prosrc). O 05 recusa antes de escrever se qualquer
  corpo divergir ou se houver gatilho não capturado nas tabelas tocadas; reconfere os 38 md5 após restaurar.
- `test_seed_pg.py` (21/21) executa os 38 corpos reais + `fn_b2b_credit_exposure` legado real; ligações de gatilho e helpers
  não-gatilho (tickets/permissões = false) são aproximações — aceite real só no HML.

## Correção pós-falha 818 (C12, 2026-11-18)
- Causa: no HML o bloqueio de títulos é `FOR EACH STATEMENT` (`a00_homolog_validation_no_receivable`); o relax só tratava ROW.
- Agora: o corpo relaxado só libera STATEMENT com postgres + ticket da txid + licença `stmt_permit` (tabela/op/id/parceiro/tenant) ainda
  não usada; uma cerca temporária POR LINHA (`zzz_qa_fin_row_fence`, criada e removida na mesma transação) aceita UMA linha igual à
  licença (id pré-manifestado, descrição QA-FIN-, partner/org exatos) e a consome. Licença não usada ou restante aborta.
- `created_by` (NOT NULL, FK auth.users) = usuário QA do mesmo tenant (Gestor A / FIN C), fictício.
- Teste (24/24) usa as ligações reais C12 literais e colunas/defaults/checks/FKs capturados; prova que outra id, parceiro, descrição,
  multilinha e outras sessões (postgres/qa_other) seguem negadas.

## Exceção temporária
- Seed: `homolog_validation_block_receivable_insert`, `b2b_internal_order_snapshot_guard`, `tg_partner_orders_require_items` e
  `c2p1_settings_fence`, somente para linhas manifestadas desta txid; cleanup: só gatilhos de DELETE das tabelas que
  contêm linhas QA. Liberação exige `session_user=postgres` + ticket da própria `txid` + linha manifestada (id pré-registrado
  com descrição `QA-FIN-` ou hash exato da linha). Os corpos são restaurados pelo texto original e conferidos (md5 + definição)
  antes do `COMMIT`; qualquer falha reverte tudo. Outras sessões nunca veem o corpo alterado.
- Limpeza: escopo só por colunas uuid/uuid[] ligadas aos 5 usuários, 3 parceiros, 2 assinaturas, 4 overrides e manifesto
  (id próprio nunca autojustifica). Recusa sem exceção: tabelas `saas_*`/catálogo/comercial/fiscal/organizações/categorias/métodos,
  linhas de outro tenant, linha de negócio ligada a usuário QA só por coluna de ator, fixtures proibidas, referência só textual,
  volume > 2000. Execução exige o digest do dry-run e zero referências restantes.

## Limites honestos
- `test_seed_pg.py` usa corpos reais com colunas/ligações aproximadas: NÃO prova que o HML aceite o seed.
  Se outra guarda real (ex.: gate SaaS, cerca fiscal de títulos, condição de pagamento) recusar, o seed aborta sem efeito e a
  mensagem deve voltar para revisão — nunca contornar.
- Crédito: o seed grava limite fictício; o crédito HML é o legado (`213ac31f…`) e não equivale ao de produção.
- Categoria RECEITA ativa existente é apenas referenciada; sem ela o seed para.
- Parceiros A/B/C e usuários FIN A/B/C, Gestor A e Técnico A são os IDs já criados pelo root (fixos em 05/06/07);
  nada é recriado. A limpeza apaga parceiros, vínculos e perfis desses IDs; contas Auth saem pela Admin API.
