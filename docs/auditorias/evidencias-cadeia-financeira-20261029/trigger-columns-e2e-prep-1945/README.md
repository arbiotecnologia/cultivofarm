# Rodada 1945 — colunas do gatilho de crédito + preparação E2E real (OFFLINE)
Base: b8f136e0. Nada aplicado hosted, sem deploy, sem cobrança, fiscal pendente.

## Lacuna do gatilho (DDL real capturado)
- Captura LIVE: `trg_partner_orders_credit_guard BEFORE INSERT OR UPDATE OF status, total`.
- RED (DDL capturado instalado e conferido): alteração isolada de `final_amount_with_interest` acima do limite mantém `aprovado`; alteração isolada de `credit_approved_by` é gravada com config inativa ou limite 0; alteração de valor após inativar config mantém `aprovado`.
- Candidato `credit-guard-trigger-columns.sql.review`: mesma função/nome/momento, colunas `status, total, final_amount_with_interest, credit_approved_by`. GREEN: os quatro casos retidos; excesso configurado legítimo chega a `aprovado`; redução legítima após aprovação mantém `aprovado`. Rollback restaura o DDL capturado (conferido).
- PG total 338/0 (`pg-run.txt`, `results.json`); P0 37/0 (10.300/7.550 preservados); Vitest 7/7.

## Defesa já existente em LIVE (capturada)
- `fn_b2b_guard_credit_approval_fields` (md5 conferido) recusa alteração de `credit_approved_by/at` fora de `approve_b2b_credit` — teste PASS. Ela depende do GUC `arbio.b2b_credit_approval`; GUC não autoriza por regra do projeto e a impossibilidade de um cliente defini-lo via PostgREST NÃO foi provada aqui.

## Inventário (`inventory.json`)
- 22 de 1.267 funções capturadas escrevem `partner_orders`; nenhuma usa SQL dinâmico sobre a tabela. Só `approve_b2b_credit` grava `credit_approved_by` (junto com status). `final_amount_with_interest` só é gravado com `total`/status (`create_partner_order_secure`, `respond_b2b_order_quote_secure`) — o trigger capturado já dispara nesses.
- Frontend: nenhum `update/insert` direto em `partner_orders`. Edge `fase-e-runtime-harness` usa service role apenas em fixtures (`payment_terms_id`, delete).
- Caminho isolado restante = UPDATE direto na tabela. ACL capturada concede UPDATE a `authenticated` e `anon`; a captura de políticas está incompleta (entrada nula). Logo NÃO É PROVÁVEL offline se um usuário real consegue esse UPDATE; exige JWT/RLS real.
- Não provado: `approve_b2b_credit`/`approve_partner_order` não instalados no harness (dependências); funções fora da captura; importadores externos.

## Preparação E2E real
`scripts/e2e-arbio-fsf-real-20261029/`: `preflight.sh` (somente leitura, `preflight.txt` PASS), `ROTEIRO.md`, `checklist.json` (18 itens; nada executado), `evidencia-template.json`. Parte 1 = até o bloqueio fiscal; Parte 2 (financeiro completo) = NÃO VALIDÁVEL enquanto gate fiscal/contábil pendente.
