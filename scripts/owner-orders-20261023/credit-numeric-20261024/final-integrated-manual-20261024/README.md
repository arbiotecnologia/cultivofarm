# Pacote FINAL integrado + correção manual de parcelas — INATIVO, somente revisão

## Recomendação única para o estado composto
Promover somente este pacote: origem reconciliada, wrapper row-before-receipt **e** a correção manual de parcelas iniciais já LIVE (commit e99d634) convivem na mesma transação, com PRE e POST completos. Os candidatos históricos (final-integrated-20261024 e anteriores) **não devem ser promovidos**: seu ramo AR sobrescreveria a correção manual implantada. Nenhum histórico foi sobrescrito.

## Base reconciliada
Reutiliza a captura canônica somente leitura de 24/10 01:53–01:54 UTC em `../final-integrated-20261024/capture/` (78 funções, 44 triggers) e sobrepõe os três corpos LIVE da correção manual, conferidos contra `scripts/financial-installments-initial-20261024/post-hashes.json`:
- RPC `rpc_create_financial_title(text,jsonb)` LIVE `0778b876b300e08d53f1cf7790394fc5` (fonte contém linhas CRLF; leitura byte-exata obrigatória).
- AR `fn_generate_receivable_installments()` LIVE `fba70619b461c468a8c645ce1c3a8ed8`.
- AP `fn_generate_payable_installments()` LIVE `f4b15f02171e321e5ca0370255ccbff1`.
- Tabela privada `platform_private.financial_initial_installments`: PRE/POST exigem existência, RLS ativa e zero privilégios de dados para anon/authenticated/service_role.

O corpo AR composto é `future-composed-function.sql.review` **verbatim** (ramo manual de contexto privado + ramo contratual B2B), comprovado em assemble.py como byte-exato igual a corpo LIVE manual + ramo B2B. Hash normalizado PostgreSQL capturado em descartável: `f632f15c9f46cb9889082fc533a27ea1` (difere do composto histórico `de469bfc...` e do LIVE manual puro `fba70619...`). Os outros seis corpos compostos são **byte-exatos** ao pacote final-integrated revisado (hashes inalterados: wrapper `31eeb54e...`, create `a2916799...`, snapshot guard `da7a558c...`, child guard `f9fcfca4...`, approve `7cf8b7a2...`, impl `1bdac7fa...`).

## Caminhos para revisão independente
1. `origin/preflight.sql`: estrutural READ ONLY sobre a base LIVE atual (já inclui os três corpos manuais e a tabela privada).
2. `origin/preflight-accounting.sql`: diagnóstico READ ONLY preservado; A DRAFT continua bloqueado com 42501/C2_ACCOUNTING_PREREQUISITE_BLOCKED.
   O `candidate.sql.review` agora executa o **mesmo gate contábil do owner A como primeiro comando da própria transação**, antes de qualquer guard/DDL. Trava somente as linhas de `company_fiscal_settings` do owner A com `FOR SHARE` até o COMMIT (bloqueia UPDATE/DELETE/desativação/troca de atestado); o índice parcial único `ux_company_fiscal_settings_active_organization` (verificado no gate) faz conflitar qualquer nova linha ativa de A. Outras empresas não são travadas. O gate nunca valida nem grava configuração.
3. `origin/candidate.sql.review`: sete corpos compostos, PRE/POST completos em uma transação.
4. `origin/postflight.sql`: POST integral READ ONLY.
5. `origin/containment.sql.review` = `origin/rollback.sql.review`: contenção deny-only (não reversão de código), preserva correção manual, wrapper corrigido, snapshots e histórico; exige drenagem de escritores.
6. `origin/assemble.py`: geração local; falha fechada se o future-composed não for exatamente LIVE manual + ramo B2B.

## Uma suíte focal
`python3 origin/test-local.py` (ou via Vitest `src/test/saas/c2-final-integrated-manual-postgres.test.ts`).
Rodada final: **127/127 PASS** (115 anteriores + 12 do gate contábil na transação) em PostgreSQL descartável, Auth sintética.
- Manual via corpo composto: R$1/3 → .34/.33/.33 inserido de primeira (AR e AP), datas customizadas preservadas, tenant propagado, .99/3, .01/3 negado sem efeitos, mutação posterior de parcela negada (H6), payload cross-tenant negado, tabela de contexto privada inacessível a authenticated e vazia após sucesso/falha.
- Cadeia B2B: deadlock 40P01 reproduzido no estado baseline e resolvido pelo wrapper; aprovação/cobrança atômicas com um título, três parcelas e um vínculo; A/B isolados; negações exatas; na_entrega sem título e cobrança pré-entrega negada; idempotência/hash/preço; contenção com falha POST deliberada preserva catálogo.
- Atomicidade de comandos completos (candidate/postflight/containment) com checkpoints em um único txid.

## Limites honestos
Auth sintética e réplica parcial; não certifica JWT/RLS hosted, contabilidade real nem pós-entrega na_entrega. Gate contábil A DRAFT segue bloqueante. Sem SQL hosted mutante, publicação, mudança de sessões/dados ou abertura do writer.

## Gate contábil na transação (revisão 08b381e7)
Testes descartáveis executam o candidate COMPLETO diretamente (UUID do owner A mapeado para A sintético): ausente, DRAFT+atestado NULL, VALIDATED+atestado NULL, CNPJ NULL e somente inativo → `C2_ACCOUNTING_PREREQUISITE_BLOCKED`, catálogo idêntico e coluna `c2_external_origin_snapshot` inexistente. B validado não satisfaz A. Com gate aberto: mudança de atestado e desativação de A falham por lock timeout, segunda linha ativa de A conflita no índice único, linha de B atualiza sem espera. Fixture validada: candidate passa, falha POST deliberada preserva catálogo e os 115 checks anteriores seguem PASS. Nenhuma validação hosted foi feita ou inferida; produção A DRAFT continua bloqueando também o próprio candidate.
