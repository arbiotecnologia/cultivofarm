# Implantação independente — crédito numérico

**Executada pelo auditor/proprietário, não pelo Lovable.** Registro baseado no relato recebido em 24/10/2026 às 00:41 UTC; nenhuma consulta/operação hospedada foi executada pelo agente nesta rodada.

- Release: `c2_credit_percentage_numeric_capacity_only`, SUCCESS.
- Alvo: `public.fn_b2b_credit_exposure(uuid,numeric,uuid)`.
- Única substituição: `v_pct numeric(6,2)` → `v_pct numeric`; restante do corpo byte-exato.
- PRE integral de corpo/owner/ACL e writer false; POST na mesma transação e POST externo PASS, segundo auditor.
- MD5 atual `pg_get_functiondef`: `213ac31f3a30816ead75365b0d1fed18`.
- Owner `postgres`; ACL `{postgres=X/postgres,service_role=X/postgres}` preservada.
- RPC readonly fixture A /180 antes-depois: `NO_LIMIT_DEFINED` e percentual numérico zero preservados; representação lexical `0.00` → `0` esperada para JSON numeric.
- Oito casos aritméticos DO readonly independentes PASS: inclui 18000%, limite 0.01/projeção 999999999999.99 e precedência de vencidos.
- Auditor declara nenhum dado, limite, writer, pedido ou fiscal alterado. Writer continua false; requisito contábil permanece pendente.

## Não reaplicar

`../credit-numeric-20261024/{preflight.sql,candidate.sql.review,rollback.sql.review}` são artefatos históricos de revisão/teste; candidate antigo não deve ser reaplicado. Rollback aritmético reintroduziria overflow e não é autorizado por este registro.

## Revisão de origem coordenada

Usar para revisão somente `../credit-numeric-20261024/origin-rebase/{preflight.sql,candidate.sql.review,postflight.sql,rollback.sql.review}`: dependência exige o hash atual e owner/ACL intactos. Os quatro arquivos diferem dos homônimos históricos em `../internal-origin-composition-20261023/` somente pelo hash da função de crédito. Nenhum corpo de crédito é escrito pela composição/contenção; novo hash permanece após rollback de origem.

Esta implantação aritmética não libera a composição nem seu writer, não valida contabilidade e não certifica JWT/concorrência/pós-entrega. Baselines históricos e pacote original permanecem preservados, nunca reaplicar seus guards de hash antigo contra produção atual.