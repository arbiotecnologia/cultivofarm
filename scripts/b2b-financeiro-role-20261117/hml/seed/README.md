# Massa fictícia QA do Financeiro B2B — somente HML `vrlcdwmlytukrjezrrnf`

Autorização do usuário: criar dados fictícios de teste e eliminá-los todos depois. Nada aqui roda em produção.
Sem NF, sem cobrança, sem envios. Nenhum gatilho é desativado.

## Ordem (root executa)
0. `04-seed-plan-hml.sql.review` (postgres): cria SÓ o plano novo `qa_fin_20261117` (não há RPC canônica de criação de
   plano) e o manifesto. Planos existentes, inclusive os QA `78000000…0001`/`7e570000…00b1`, não são alterados.
1. `TARGET=hml ANON_KEY=… PLATFORM_SUPERADMIN_JWT=… python3 seed_saas.py` — rascunho → validação → publicação ('PUBLICAR')
   da versão QA com `pedidos_b2b`+`contas_receber`, depois `start_trial` nos dois tenants QA, tudo pelas RPCs canônicas.
2. `05-seed-hml.sql.review` no SQL editor do HML (postgres). Saída `QA_TITLES_JSON` → salvar como `TITLES_JSON`;
   conferir `QA_SEED_RESTORED` (md5 do bloqueio homolog) contra a captura.
3. `qa/provision_fixtures.py` e `qa/jwt_suite.py` com `TITLES_JSON`; depois navegador desktop/mobile e CSV.
4. Remover contas Auth `qa-fin-*` pela Admin API/painel (o SQL não toca `auth.*`).
5. `06-cleanup-hml.sql.review` (postgres) → deve terminar em `QA_CLEAN_PASS`.
6. `07-verify-clean-hml.sql.readonly` → `schema_removido=t` e todas as contagens 0.

## Exceção temporária (única)
- Seed: só `platform_private.homolog_validation_block_receivable_insert()`; cleanup: só gatilhos de DELETE das tabelas que
  contêm linhas QA. Liberação exige `session_user=postgres` + ticket da própria `txid` + linha manifestada (id pré-registrado
  com descrição `QA-FIN-` ou hash exato da linha). Os corpos são restaurados pelo texto original e conferidos (md5 + definição)
  antes do `COMMIT`; qualquer falha reverte tudo. Outras sessões nunca veem o corpo alterado.
- Limpeza descobre referências em `public`/`platform_private` (uuid, uuid[], text, jsonb; 3 níveis), recusa tabelas
  protegidas (tenants, planos, versões, funcionalidades, categorias, métodos, configuração), fixtures proibidas e volume > 5000,
  e exige zero referências restantes.

## Limites honestos
- `test_seed_pg.py` (16/16) usa esquema sintético mínimo: prova a mecânica, NÃO que os gatilhos reais do HML aceitem o seed.
  Se outra guarda real (ex.: gate SaaS, cerca fiscal de títulos, condição de pagamento) recusar, o seed aborta sem efeito e a
  mensagem deve voltar para revisão — nunca contornar.
- Crédito: o seed grava limite fictício; o crédito HML é o legado (`213ac31f…`) e não equivale ao de produção.
- Categoria RECEITA ativa existente é apenas referenciada; sem ela o seed para.
- Parceiros A/B/C e usuários FIN A/B/C, Gestor A e Técnico A são os IDs já criados pelo root (fixos em 05/06/07);
  nada é recriado. A limpeza apaga parceiros, vínculos e perfis desses IDs; contas Auth saem pela Admin API.
