# Reconciliação do cadastro — 08/11/2026 03:10 UTC

## Baseline aplicada externamente, não novo candidato

O auditor relatou aplicação de `partner_registration_defer_financial_settings_20261107`. O agente validou `supabase/config.toml` com o ref canônico `swzpzcwiasxmjutrmvkm` antes de duas consultas SELECT somente de metadados. A captura integral em `canonical-readonly.json` preserva os corpos retornados por `pg_get_functiondef`, com MD5 recalculado e igual ao servidor:

| Função | Baseline atual | Owner / ACL |
|---|---|---|
| public.tg_create_default_pfs() | 76bd832ba608662d84f1641f8a3b8226 | postgres / postgres+service_role EXECUTE |
| platform_private.c2p1_settings_fence() | f87cc2894dc551d242c2586f17e2cdd4 | postgres / postgres EXECUTE |

Ambas SECURITY DEFINER, `search_path=''`, PostgreSQL 17.6. Os gatilhos de cadastro AFTER INSERT e fence BEFORE INSERT/DELETE/UPDATE continuam habilitados (`O`). Hash anterior do cadastro `756e5d24883fa387054b4385a232cfcf` é relato do auditor, não nova recaptura do estado anterior. Histórico em `contracts-c2-20261022/integral/hosted-capture.json` e demais réplicas permaneceu intacto. Este JSON não é instalador, migration ou autorização para restaurar a versão antiga.

## Evidências distintas

- **Auditor / componente PG17:** 10 testes com gatilho/fence exatos e helpers de fixture explícitos; reproduziu falha antes, cadastro sem financeiro depois, escrita direta negada e configuração existente preservada. Artefatos exatos dessas dez execuções não foram fornecidos nesta chamada; não foram reexecutadas ou certificadas pelo agente.
- **Auditor / UI real:** administrador criou parceiro sintético ARBio; zero settings, zero orders, zero receivables. Não houve novo cadastro pelo agente nem consulta aos dados dessa fixture; não é E2E financeiro.
- **Agente / consumidores locais:** 45/45 testes Vitest, três arquivos, exit 0. Dois casos acrescentados na suíte integrada demonstram leitura NULL, abrir/reabrir sem RPC/escrita automática, salvamento impedido sem método escolhido e criação somente após ação explícita pelo RPC CAS com `p_expected=NULL`. Os demais preservam configuração existente, CAS, negações de contexto/papel/empresa e resposta tardia. SDK sintético; não prova JWT/RLS ou permissão real de cadastro.
- **Prévia:** sinal de compilação `build OK` às 03:12:37 UTC. Não houve execução manual de build/typecheck; não alegar resultado independente de typecheck.

## Impacto na fila

Cadastro deixa de fabricar configuração financeira; isso não concede crédito, risco baixo, elegibilidade, contabilidade, origem fiscal ou cobrança. A consulta existente usa `maybeSingle()` e mantém NULL; o diálogo reutiliza o fluxo canônico de configuração explícita, sem novo writer ou recursos duplicados. As hipóteses de consumidores financeiros do antigo `cancel-settings-deferred.py` permanecem experimentos locais inativos: esta migração de cadastro não instala seus endurecimentos nem comprova sua presença em produção.

Cinco títulos teste4 preservados, sem leitura de linhas, alteração, reclassificação ou origem inventada. Não criar configuração automática ou credenciais. Nenhuma migration, hosted write, publicação, envio, fiscal ou cobrança pelo agente. B4/estoque/entregas continuam NÃO APROVADOS; composição integral continua bloqueada por `order-e2e/` ausente e gates/revisão independente. Não somar os dez testes relatados aos 45 locais nem chamar de E2E.