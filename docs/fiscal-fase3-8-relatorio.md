# Fase Fiscal 3.8 — Relatório A–T

**Classificação:** APTO como barreira fail-closed. Nada foi implantado. Nenhum
segredo, migration ou acesso à instância `navfzbwgwzruipouyfnk` foi tocado.

## A. Escopo entregue
Módulo puro server-only + testes estáticos/funcionais. Nenhuma Edge Function
foi materializada. Nenhuma UI/rota nova. Nenhuma alteração em `supabase/config.toml`.

## B. Arquivos criados
- `supabase/functions/_shared/fiscal/preflight.ts` — módulo puro, sem I/O.
- `supabase/functions/_shared/fiscal/README.md` — decisão de entrypoint.
- `src/test/fiscal/fase3_8.static.test.ts` — 81 asserts.
- `docs/fiscal-fase3-8-relatorio.md` — este relatório.

## C. Decisão sobre entrypoint
Padrão seguro existente comprovado em `supabase/functions/list-portal-users`
(`getClaims` via cliente anônimo + `has_role` via cliente admin). Ainda assim,
o entrypoint `fiscal-preflight` **não foi materializado** nesta fase para
respeitar literalmente a diretriz "sem deploy" (o ambiente Lovable Cloud
auto-implanta qualquer `supabase/functions/<nome>/index.ts`). O README documenta
o bloqueio e o padrão que uma fase futura deve reutilizar.

## D. Contratos
`FiscalOperation = 'PREFLIGHT'` (union de literal único); `FiscalRuntimeMode =
'DISABLED' | 'HOMOLOGATION'`; `FiscalProvider = 'NONE'`; `GateCode` tipado com
15 códigos; `PreflightInput`/`PreflightResult` com `canTransmit: false`
como **literal type**, `audit.persisted: false` como literal.

## E. Defaults
`FISCAL_DEFAULTS = { runtimeMode: 'DISABLED', provider: 'NONE',
emissionEnabled: false }`. `FISCAL_ENV_VAR_NAMES` declara apenas os nomes
documentais `FISCAL_RUNTIME_MODE`, `FISCAL_PROVIDER`,
`FISCAL_EMISSION_ENABLED` — nenhum valor, nenhuma leitura em runtime, nenhum
fallback para produção.

## F. Gates avaliados
`OPERATION_NOT_SUPPORTED`, `EMISSION_FLAG_DISABLED`, `RUNTIME_MODE_INVALID`,
`PROVIDER_NOT_NONE`, `PRODUCTION_REQUESTED`, `RLS_RUNTIME_NOT_CERTIFIED`,
`TYPES_NOT_CERTIFIED`, `BACKFILL_NOT_CERTIFIED`, `SQL_MASK_NOT_CERTIFIED`,
`COMPANY_NOT_READY`, `PRODUCTS_NOT_READY`, `SERVICES_NOT_READY`,
`CUSTOMERS_NOT_READY`, `RECONCILIATION_NOT_READY`.

## G. Comportamento fail-closed
`isTrue(v)` só aceita literal `true`. Ausência, `null`, `undefined`, string
`"true"`, número `1` são todos tratados como não pronto. `runtimeMode` e
`provider` que não coincidam com o conjunto canônico ficam `UNKNOWN`. Mesmo
com todos os gates verdes, o status máximo é `PRECHECK_ONLY` e
`canTransmit=false`.

## H. Autenticação
Contrato exportado: `PREFLIGHT_ALLOWED_ROLES = ['administrador', 'gestor',
'financeiro']` e helper `isRoleAllowedForPreflight`. O padrão previsto para
um futuro entrypoint é validar JWT via `getClaims` do cliente anônimo com
`Authorization` do usuário e checar papel via `has_role` no cliente admin,
**sem responder ao usuário com service_role**.

## I. Roles
Somente `administrador`, `gestor`, `financeiro` retornam `true`. Todos os
demais papéis do sistema retornam `false`. `null`/`undefined` = `false`.

## J. CORS
Não aplicável nesta fase (sem entrypoint). Documento define que, se e quando
for criado, deve reutilizar o cabeçalho seguro do padrão existente
(`Access-Control-Allow-Origin: *` restrito ao conjunto de headers já em uso,
sem widening).

## K. Nenhuma escrita
Nenhum `.insert`, `.update`, `.delete`, `.upsert`, `.rpc`, `.from`,
`functions.invoke` no módulo — coberto por 7 asserts estáticos.

## L. Nenhum provedor
Nenhum identificador de provedor, URL externa, `fetch`, `createClient`,
`esm.sh`, `npm:`, `Deno.env`, `process.env` — todos cobertos por assert
estático.

## M. Nenhuma emissão
`fiscalEmissionEnabled` permanece `false` (verificado no teste). Nenhum
símbolo `EMIT`, `CANCEL`, `VOID`, `QUERY_PROVIDER` exportado; operações não
suportadas retornam `operation: 'UNSUPPORTED'` + `status: 'BLOCKED'`.

## N. Idempotência / auditoria
Somente contrato: `idempotencyKey` é aceito na entrada e mascarado; nunca
gerado. `audit.event = 'PRECHECK_EXECUTED'` e `audit.persisted = false` como
literal — impossível persistir por acidente.

## O. Mascaramento
`maskRecursive` cobre chaves sensíveis (cnpj, cpf, access_key, chave, xml,
token, secret, password, senha, certificate, certificado, pfx, p12,
authorization, jwt), limita strings a 256 chars, corta profundidade em 6,
corta objetos em 64 chaves e arrays em 32 itens. Aplicado obrigatoriamente
sobre `metadata` retornado.

## P. Testes
81/81 verdes em `src/test/fiscal/fase3_8.static.test.ts`. Cobrem: contratos,
defaults, fail-closed por gate, produção sempre bloqueada, provider != NONE
rejeitado, operação != PREFLIGHT rejeitada, `canTransmit=false` sempre,
máscara recursiva (chaves/comprimento/profundidade), estático (sem
fetch/SDK/provider/Deno.env/DB), server-only (nenhum import em `src/**`),
contrato de roles, preservação das fases 3.1–3.7.

## Q. Typecheck / build / scanners
- `bun run typecheck` — OK.
- `bun run build` — OK.
- `bun run scripts/verify-fiscal-types.ts` — OK (9 tabelas, 5 views, 2 RPCs).
- `bash scripts/fiscal-secrets-scan.sh` — OK.
- `bash scripts/fiscal-integration-scan.sh` — OK.
- Vitest completo: **868 passed / 3 skipped**, incluindo os 81 novos.

## R. Riscos residuais
- Nenhum risco de exfiltração (módulo puro, zero I/O).
- Risco baixo de importação acidental no frontend — barrado por teste
  estático que quebra CI se alguém adicionar o import.
- Enquanto o entrypoint não existir, nenhuma pré-checagem pode ser
  executada em runtime — apenas testes unitários exercitam a avaliação.

## S. Gates externos permanecem pendentes
Todos os gates externos herdados da Fase 3.7 continuam `pendente`. Esta
fase não aprova nenhum deles. Nada aqui é evidência de homologação
efetiva junto a autoridade fiscal ou provedor.

## T. Próxima decisão necessária
Autorização humana explícita para uma das duas trilhas, em fase separada:
1. **Materializar o entrypoint** `supabase/functions/fiscal-preflight/index.ts`
   reutilizando o padrão de `list-portal-users`, ainda em modo `PRECHECK_ONLY`,
   sem provedor, sem emissão, com deploy consciente.
2. **Manter apenas o módulo puro** e aguardar as certificações externas
   (RLS runtime, backfill, types, máscara SQL, gates da Prontidão) antes de
   sequer permitir invocação server-side.

Nenhuma outra fase foi iniciada.
