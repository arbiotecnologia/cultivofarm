# Fase Fiscal 3.9 — Entrypoint server-side de pré-checagem (relatório A–T)

**Data:** 2026-07-21
**Escopo:** materializar `supabase/functions/fiscal-preflight/index.ts`
reutilizando o módulo fail-closed 3.8. **Sem** provedor, secrets, migrations,
UI, deploy manual ou início de outra fase.

---

## A. Objetivo e não-objetivo

- **Objetivo:** expor uma superfície HTTP autenticada que colhe evidências
  RLS-aware das 5 views de prontidão fiscal e entrega ao avaliador puro da 3.8,
  devolvendo sempre `PRECHECK_ONLY / canTransmit=false`.
- **Não-objetivo:** emitir, transmitir, cancelar, inutilizar ou consultar
  qualquer provedor externo. Nenhum caminho promove emissão.

## B. Arquivos criados

- `supabase/functions/fiscal-preflight/index.ts` (entrypoint HTTP).
- `src/test/fiscal/fase3_9.static.test.ts` (**45 asserts** cobrindo A–I do §7).

## C. Arquivos ajustados (mínimo estritamente necessário)

- `src/test/fiscal/fase3_8.static.test.ts` — a asserção "não materializar
  entrypoint" da fase anterior foi substituída por asserção **positiva**:
  se o entrypoint existir, ele **não pode** conter `SUPABASE_SERVICE_ROLE_KEY`,
  `service_role` (fora de comentário) nem provedor fiscal. Preserva a
  invariante da 3.8 em regime co-existente.

## D. Contrato HTTP

- Método: `POST` + `OPTIONS`. Qualquer outro → `405 method_not_allowed`.
- Body opcional, `≤4 KiB`, formato `{version?: "fiscal-preflight/1.0.0"}`.
  Versão divergente → `400 unsupported_contract_version`.
- Resposta 200 sempre com `canTransmit:false as const`,
  `provider:"NONE" as const`, `production:false as const`,
  `operation:"PREFLIGHT" as const`, `correlation_id`, `timestamp`, `gates[]`,
  `audit:{event:"PRECHECK_EXECUTED",persisted:false}`, `metadata` mascarada.

## E. Autenticação e RLS

- Exige `Authorization: Bearer <jwt>`; ausência → `401`.
- `createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {global:{headers:{Authorization}}})`
  — RLS do usuário preservada. `auth.getUser()` valida o JWT.
- **Nenhuma referência** a `SUPABASE_SERVICE_ROLE_KEY` / `service_role`
  (verificado por asserção estática em 3.8 e 3.9).

## F. Autorização canônica

- Iteração sobre `PREFLIGHT_ALLOWED_ROLES` (`administrador`, `gestor`,
  `financeiro`) chamando `rpc("has_role", {_user_id, _role})`.
- **Role do body é ignorada** — asserção estática garante ausência de
  `body.role`, `input.role`, `"role": (body|input|req)`.
- Bloqueio → `403 forbidden` sanitizado.

## G. CORS seguro

- Sem `Access-Control-Allow-Origin: *`.
- Allowlist via env `FISCAL_ALLOWED_ORIGINS` (CSV). Default vazio → nega
  qualquer `Origin` de browser (`403 origin_not_allowed`).
- Server-to-server sem `Origin` é aceito **somente** após o JWT válido.
- `OPTIONS` retorna `204` sem body; cabeçalhos incluem `Vary: Origin`,
  `Access-Control-Allow-Methods: POST, OPTIONS` e `Max-Age: 600`.

## H. Leituras (RLS-aware, agregadas)

Únicas 5 views consultadas, com `select("*", { count: "exact", head: true })`:

1. `v_fiscal_company_readiness` — pronto ⇔ count > 0.
2. `v_product_fiscal_readiness` — pronto ⇔ count > 0.
3. `v_service_fiscal_readiness` — pronto ⇔ count > 0.
4. `v_customer_fiscal_readiness` — pronto ⇔ count > 0.
5. `v_fiscal_document_reconciliation_pending` — pronto ⇔ count = 0.

Asserção estática garante que **nenhum outro `.from(...)`** existe no arquivo.
Nenhuma leitura de certificados, tokens, provider payload/snapshot ou
`fiscal_events` — verificado por regex.

## I. Gates externos (jamais promovidos pelo cliente)

Entram no avaliador com `false` literal, forçados server-side:

- `rlsRuntimeCertified`, `typesCertified`, `backfillCertified`, `sqlMaskCertified`.

Também fixos: `emissionEnabled:false`, `runtimeMode:"DISABLED"`,
`provider:"NONE"`, `requestedProduction:false`. Isso garante que mesmo com as
5 views verdes, o status máximo continua `BLOCKED` até fases futuras
promoverem esses gates via **infra**, nunca via request.

## J. Zero-write e zero-provider (estático)

Asserções em `fase3_9.static.test.ts` proíbem:

- `.insert/.update/.delete/.upsert/functions.invoke` no arquivo.
- RPCs além de `has_role` (única permitida).
- URLs HTTP externas além do próprio SDK (`https://esm.sh/@supabase/supabase-js`).
- Identificadores `sefaz|focusnfe|webmania|nfe.io|envia_nfe|transmit|
  cancelar_nfe|inutilizar|consultar_nfe|certificad|pfx|.p12|webhook|
  access_token|fiscal_events|idempotency|audit_log`.

## K. Proteções operacionais

- `withTimeout(...,3000ms,label)` isola cada `has_role` e cada view; falha
  individual devolve `{ok:false, unknown:true}` — nunca promove gate.
- `Promise.all` sobre as 5 views em paralelo, ainda com timeout por leitura.
- Payload máx. 4 KiB; content-length também é checado.
- Máscara recursiva do 3.8 aplicada em **toda** resposta (via `json(...)`)
  redigindo `cnpj|cpf|token|access_key|xml|password|senha|certificate|jwt|
  authorization|chave|secret|pfx|p12`.
- Sem geração de `randomUUID`; `correlation_id` é um handle não sensível
  (`pf_<base36>_<base36>`) só para tracing local.

## L. Server-only (nenhum import em `src/**`)

Asserção varre `src/**` (excluindo `src/**/test/**`) por linhas
`import ... from "…fiscal-preflight…"` ou `require("…fiscal-preflight…")`.
Resultado: **zero offenders**.

## M. Preservação das fases 3.1–3.8

- Todas as flags 3.1–3.7 continuam `false` no `FEATURE_FLAGS` (asserção 3.9-I).
- Módulo puro `supabase/functions/_shared/fiscal/preflight.ts` **intocado**
  (verificado: `evaluatePreflight` continua produzindo `canTransmit=false`).
- Suite 3.8 (81 asserts) permanece verde após ajuste **cirúrgico** de uma
  única asserção (co-existência co-declarada).

## N. Secrets e infraestrutura

- **Nenhum** secret foi solicitado, criado, atualizado ou lido.
- `SUPABASE_URL` e `SUPABASE_ANON_KEY` são variáveis padrão já providas pelo
  runtime Supabase para toda edge function — não são "novos secrets".
- `FISCAL_ALLOWED_ORIGINS` é referenciada apenas por nome no código;
  **não** foi provisionada. Sem valor, o comportamento é fail-closed (nega
  browsers).

## O. Deploy

- O código foi apenas criado. Auto-deploy da plataforma Lovable materializa
  o Function no ambiente de dev ao commitar; **nenhuma UI foi conectada**,
  `supabase.functions.invoke("fiscal-preflight", ...)` não aparece em
  nenhum arquivo do `src/**`.
- Produção `navfzbwgwzruipouyfnk`: **não tocada**. Sem migrations, sem SQL,
  sem writes.

## P. Validações executadas

| Gate                          | Resultado |
| ----------------------------- | --------- |
| `verify-fiscal-types`         | ✅ 9 tabelas, 5 views, 2 RPCs |
| `fiscal-secrets-scan.sh`      | ✅ OK — nenhum secret real |
| `fiscal-integration-scan.sh`  | ✅ OK — sem indicadores de emissão em runtime |
| ESLint (arquivos novos)       | ✅ sem warnings |
| `tsgo --noEmit` (typecheck)   | ✅ clean |
| `vitest src/test/fiscal/`     | ✅ **564 pass** / 3 skip (20 files) |
| `vitest` (suíte inteira)      | ✅ **913 pass** / 3 skip (61 files) |
| `bun run build`               | ✅ built in 22.93s |

## Q. Cobertura vs. §7 do brief

| Item do brief                                       | Coberto por                                       |
| --------------------------------------------------- | ------------------------------------------------- |
| JWT ausente/inválido                                | 3.9-(C) "exige Bearer" + branch `unauthorized`    |
| Perfis permitidos/bloqueados                        | 3.9-(D) `PREFLIGHT_ALLOWED_ROLES` + `forbidden`   |
| Role do body ignorada                               | 3.9-(D) assert `body.role|input.role|"role":req`  |
| Service role ausente (prova estática)               | 3.9-(C) + 3.8-(J) sem `SERVICE_ROLE`              |
| CORS allowlist e default deny                       | 3.9-(B) `FISCAL_ALLOWED_ORIGINS` / `origin_not_allowed` |
| Métodos bloqueados                                  | 3.9-(A) `method_not_allowed` + regex             |
| RLS preservada via Authorization                    | 3.9-(C) `global.headers.Authorization`            |
| 5 views + falha parcial                             | 3.9-(E) + `withTimeout`+`unknown:true`            |
| Gates externos jamais aprovados pelo cliente        | 3.9-(F) evidences externas = `false` literal      |
| Resposta PRECHECK_ONLY / canTransmit=false          | 3.9-(F) `as const` literais                       |
| Zero escrita / provedor / cert / token / webhook    | 3.9-(G) regex exaustiva                           |
| Sem frontend import                                 | 3.9-(H) walk em `src/**`                          |
| Scanners / regressão 3.1–3.8                        | 3.9-(I) + full suite 913/913                      |

## R. Riscos residuais e mitigação

- **Auto-deploy Lovable:** a plataforma pode implantar a função ao commit.
  Mitigação: não há UI/consumidor no `src/**` (asserção H), a função é
  fail-closed e requer JWT + role privilegiada, `FISCAL_ALLOWED_ORIGINS`
  vazia bloqueia browsers, e resposta é sempre `PRECHECK_ONLY`.
- **`has_role` timeouts:** cada tentativa isolada em 3s; falha simplesmente
  não promove o role — fail-closed.
- **View indisponível:** cada leitura retorna `unknown:true` e `ok:false` —
  gate correspondente permanece bloqueado.
- **Header `Vary: Origin`:** protege caches intermediários; ausência causaria
  poisoning cross-origin. Presente por padrão.

## S. Pendências deliberadas (não fazem parte da 3.9)

- Aplicar `FISCAL_ALLOWED_ORIGINS` com hosts reais → fase futura de
  homologação de UI, exige revisão de segurança.
- Consumir o endpoint no `src/**` → fora do escopo desta fase.
- Persistir `audit_log`/`idempotency` → fora do escopo; contratos já existem
  no módulo 3.8.
- Promover gates externos (`rlsRuntimeCertified`, `typesCertified`,
  `backfillCertified`, `sqlMaskCertified`) → depende de certificação por
  infraestrutura, jamais por request.

## T. Conclusão

Fase 3.9 **APTA**. Entrypoint HTTP existe, é autenticado, RLS-aware,
fail-closed, sem provedor, sem writes, sem service_role, sem UI conectada e
com 913/913 testes verdes. **Parado.** Nenhuma outra fase iniciada.
