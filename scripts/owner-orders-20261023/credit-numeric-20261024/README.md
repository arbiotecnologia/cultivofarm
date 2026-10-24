# Correção aritmética separada — revisão inativa

**Estado 24/10 00:41 UTC:** recorte aritmético implantado independentemente pelo auditor como `c2_credit_percentage_numeric_capacity_only`, não pelo Lovable; POST externo hash novo/owner/ACL PASS e 8 casos readonly PASS conforme relato. Registro em `../applied/c2_credit_percentage_numeric_capacity_only.md`. **Não reaplicar o candidato aritmético antigo.** A composição/rebase continua inativa e NO-GO; baselines históricos permanecem intactos.

Alvo: `public.fn_b2b_credit_exposure(uuid,numeric,uuid)`; fonte capturada do ref canônico `swzpzcwiasxmjutrmvkm`. A confirmação readonly de overflow em produção foi informada pelo proprietário; nesta rodada não houve acesso hospedado.

**Única alteração:** `v_pct numeric(6,2)` → `v_pct numeric`. O restante de `pg_get_functiondef` é byte-exato, incluindo ROUND2, assinatura/defaults, STABLE/DEFINER/search_path, reason codes, precedência, limites e decisões. Owner postgres e ACL `{postgres=X/postgres,service_role=X/postgres}` permanecem intactos; não há GRANT, ticket novo, dado, writer ou validação fiscal.

- Baseline MD5: `3bcc92e68f80b86bc01db7b5e94ee4c6`
- Novo MD5 normalizado comprovado em PostgreSQL: `213ac31f3a30816ead75365b0d1fed18`

## Arquivos e ordem para revisão independente

Todos abaixo relativos a `scripts/owner-orders-20261023/credit-numeric-20261024/`:

1. `baseline/function.{sql,json}` e `expected.json`: fonte imutável/metadata e hashes.
2. `preflight.sql`: READ ONLY, baseline/body/owner/ACL exatos.
3. `candidate.sql.review`: artefato histórico/teste da transação com PRE embutido → única declaração alterada → POST embutido. Recorte equivalente implantado pelo auditor; **não reaplicar**.
4. `postflight.sql`: verificação READ ONLY externa do novo hash/owner/ACL.
5. `rollback.sql.review`: transação guardada pelo novo hash/owner/ACL; restaura apenas typmod anterior e verifica baseline. Reintroduz o overflow conhecido; não é contenção de pedidos.
6. `postflight-rollback.sql`: READ ONLY do baseline restaurado.
7. `test-local.py`, `credit-checks.py`: matriz e cadeia capturada em PostgreSQL descartável.
8. `origin-rebase/{preflight.sql,candidate.sql.review,postflight.sql,rollback.sql.review}`: variante separada **do pacote de origem**, não do candidato aritmético: cada arquivo difere do homônimo em `../internal-origin-composition-20261023/` **somente uma ocorrência do hash da dependência crédito**; comparação byte-exata automatizada no teste. O pacote original não é substituído. O rollback de origem continua contenção create/approve/generate e preserva o crédito corrigido, nunca restaura seu corpo antigo.

**Ordem obrigatória do rebase:** primeiro instalar independentemente a correção aritmética com seu PRE/candidate/POST; somente depois o PRE da variante de origem pode passar. A variante mantém integralmente os outros comandos de composição (funções/triggers/coluna), não é SQL aritmético nem autorização de implantação conjunta. Se o crédito continua no baseline, usar apenas o pacote original de origem; o PRE rebase deve falhar. Não executar as duas variantes. A revisão independente levantou ambiguidade dessa comparação/ordem, esclarecida aqui e coberta pelo teste byte-exato; os gates da origem continuam NO-GO.

Antes de qualquer execução hospedada, o operador deve comprovar externamente o ref exato; nenhum SQL assume conseguir comprovar a identidade Supabase via catálogo PostgreSQL. Drenagem/quiescência continua obrigatória para eventual contenção de origem, que não cancela invocações em andamento. A instalação aritmética pode ser revisada/implantada independentemente: não habilita pedido, fiscal nem contabilidade. Implantação somente pelo proprietário após revisão; writer permanece false em produção segundo relato, sem tentativa de reabertura aqui.

## Resultado e limites honestos

123 checks locais PASS; `src/test/saas/c2-credit-numeric-postgres.test.ts` automatiza a cadeia. Usamos corpos reais capturados, 44 triggers e políticas capturadas sobre replica parcial e Auth sintética; **não certifica JWT/PostgREST/RLS hospedado**.

- Limite 1/exposição 180 agora resulta 18000% e BLOCK ou APPROVAL conforme a ação existente, sem erro 22003 do percentual.
- Limite 0.01/exposição 999999999999.99 resulta 9999999999999900%; demais typmods numeric(14,2) continuam limitando valores.
- Sem limite, dentro/igual/acima, ROUND2, vencidos/preferência/tolerância, pendente/exclusão, replay, conflito e falha tardia de create são exercitados.
- `approval_required` permanece pendente e aprovação comercial é negada por `credit_pending`; o teste não burla aprovação de crédito. Outro pedido criado normalmente sob limite autorizado confirma na_entrega sem título e cobrança prematura negada integralmente.
- NULL, negativo, parceiro inexistente/NULL e NaN preservam resultados anteriores do calculador interno. Isso **não valida esses valores como entradas comerciais**; zero/quantidade negativa continuam negados pelo create. Infinity/-Infinity e magnitude além numeric(14,2) continuam 22003.
- Idempotência sequencial comprovada; concorrência de mesma chave não certificada. Entrega/cobrança pós-entrega e sucesso downstream interno continuam não certificados/fechados. Pré-requisito contábil humano permanece pendente; nenhuma configuração real foi alterada.