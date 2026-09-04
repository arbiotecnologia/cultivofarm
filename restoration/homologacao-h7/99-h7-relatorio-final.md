# H7 — Relatório Final (fase H7P: reconciliação e prontidão pré-produção)

- Ambiente exclusivo: **staging `ikaauvsflpmamgxmkhoq`**.
- Produção `navfzbwgwzruipouyfnk`: **não consultada, não alterada, não promovida**.
- Nenhum documento fiscal emitido. `tpAmb=2` (homologação), emissão de produção desligada.
- H7L, H7N e H7O preservadas integralmente; nenhuma migration reaplicada, renumerada ou alterada.
- Ledger antes e depois da H7P: **654 versões** (H7P não aplicou DDL).

## 1. Gate de binding

O binding do frontend havia sido regenerado para o projeto Cloud acidental
(`yzszlzjpovmcteuxjznj`) e o `types.ts` reduzido a 2.052 linhas.

- Restaurados do baseline autorizado `6c08a8f8`: `.env`, `src/integrations/supabase/client.ts`,
  `src/integrations/supabase/types.ts` (21.850 linhas).
- `check-frontend-binding.sh` → **OK** antes de qualquer acesso ao banco e novamente ao final.

## 2. Objetivo 1 — Reconciliação das migrations repo-only

Repositório: 713 arquivos `NNNNNNNNNNNNNN_*.sql`. Ledger: 654 versões.
Diferença real recalculada nesta rodada: **59 migrations repo-only** (não assumida).

Método (sem heurística textual isolada):

1. `comm` entre versões do repositório e `supabase_migrations.schema_migrations`.
2. Extração dos objetos declarados por arquivo (funções, tabelas, views, triggers,
   policies, índices) e confronto com `pg_proc`, `pg_class`, `pg_trigger`,
   `pg_policies`, `pg_constraint`.
3. Comparação de **definições normalizadas** de funções (`prosrc` sem comentários e
   com espaços colapsados) contra o corpo declarado no arquivo.
4. Regra "última definição vence": quando o arquivo divergia, verificou-se se a
   definição vigente vem de arquivo posterior do próprio repositório ou de script
   `restoration/` já aplicado.

### Resultado

| Classificação | Qtde |
| --- | --- |
| Refletida semanticamente no catálogo | 36 |
| Superseded — banco à frente do arquivo | 3 |
| Conflitante — backend estranho (Cloud sandbox) | 20 |
| Realmente pendente | **0** |

Detalhamento das três `SUPERSEDED_DB_A_FRENTE` (banco correto, arquivo antigo):

- `20260831000000_os_e2e_fase5_idempotencia` → `_rpc_avancar_esteira_laboratorio_internal`:
  banco usa `ORDER BY created_at DESC, seq DESC` (canonizado em
  `20260901000000_cq_ordem_canonica`); arquivo antigo usa `id DESC`.
- `20260831020000_envase_cq_trigger_determinismo` → `fn_validate_envase_cq`:
  banco eliminou `ctid DESC` em favor de `seq DESC` (mesma canonização).
- `20260919010000_h7_fiscal_preflight_marker_v1` → `rpc_fiscal_preflight_v1`:
  banco contém a versão enriquecida aplicada por
  `restoration/homologacao-h7/93-h7k-preflight-apply.sql` (blockers
  `FISCAL_FIELD_REQUIRED` por seção).

Reaplicar qualquer um dos três **regrediria** o banco. Classificados como não aplicáveis.

As 20 migrations `20260812134101`–`20260812135640` são "SCHEMA RESTORATION" geradas
contra o backend Cloud acidental. Recriam um schema-stub incompatível
(`CREATE TYPE app_role` com 3 valores contra os 9 do staging, RPCs vazias como
`rpc_cockpit_criar_visita_v1 RETURN gen_random_uuid()`). Aplicá-las ao staging seria
conflitante e destrutivo. **Quarentena permanente.**

### Conclusão do Objetivo 1

Nenhum DDL necessário. Nenhuma linha artificial inserida em `schema_migrations`.
Nenhum `db push`. Nenhuma migration antiga aplicada fora de ordem.

Mecanismo determinístico criado (item 8):

- `restoration/homologacao-h7/h7p-repo-only-manifest.json` — 59 entradas com
  versão, arquivo, `sha256`, classificação e `apply_to_staging:false`.
- `restoration/homologacao-h7/h7p-guard-repo-only.sh` — gate fail-closed: valida
  binding, integridade `sha256` de cada arquivo e **falha se qualquer uma das 59
  versões aparecer no ledger** (sinal de aplicação em lote acidental).
  Execução: `OK — 59 migrations repo-only íntegras e bloqueadas`.
- `src/test/security/h7p-repo-only-migrations.static.test.ts` — 7 testes estáticos
  no Vitest (manifesto completo, nenhuma aplicável, sem drift de conteúdo,
  20 em quarentena, vocabulário fechado, versões únicas, contagem repo ≤ 713).

## 3. Objetivo 2 — Bloqueios residuais

### 3.1 SECURITY DEFINER

- Total em `public`: **648** funções `SECURITY DEFINER`.
- **0** sem `search_path` fixo.
- Executáveis por `anon`: exatamente **2**, ambas por design contratual:
  - `rpc_validar_comprovante_entrega(uuid)` — protegida pelo rate-limit privado H7O-P3
    (HMAC de token/origem, limites por token/origem/global, poda por `pg_cron`).
  - `rpc_validar_rastreio_produto(uuid)` — consulta pública por token opaco de rastreio.
- Harness por perfil H7O: **300 PASS / 0 FAIL**; harness H7N: **136 PASS / 0 FAIL**.
- Nenhuma exposição insegura comprovada; **nenhuma revogação em massa executada**.

### 3.2 Extensões `btree_gist` e `pg_net` em `public`

Decisão mantida: **não mover**, sem fixar versão.

- `btree_gist` sustenta a constraint de exclusão `cpr_no_overlap` em
  `commercial_price_rules`; mover a extensão exige `DROP`/recriação da constraint,
  com janela de inconsistência em regra de preço vigente.
- `pg_net` é referenciada por chamadas `net.http_post` em funções de outbox e alertas;
  mover quebraria a resolução do schema.
- Compensação: nenhuma das duas expõe superfície de dados de aplicação; ambas
  permanecem sem `GRANT` adicional a `anon`. Item registrado como WARN aceito.

### 3.3 Leaked-password protection

Não alterável pelo mecanismo disponível nesta sessão (configuração de Auth do projeto
de staging não é acessível pelas ferramentas ligadas a este workspace, que apontam
para outro projeto). **Bloqueio externo.** Instrução exata de habilitação:
Auth → Policies → *Password protection* → ativar "Check against HaveIBeenPwned"
no projeto `ikaauvsflpmamgxmkhoq`; teste posterior: tentar cadastrar senha
notoriamente vazada e confirmar rejeição com `weak_password`. Nenhum SQL inventado.

### 3.4 Edge Functions — bloqueio de publicação

38 diretórios em `supabase/functions`, incluindo os gates fiscais
(`fiscal-preflight`, `fiscal-xml-engine`, `fiscal-event-sign`,
`fiscal-sefaz-transport`, `fiscal-certificate-upload/revoke`,
`fiscal-binding-diagnostics`, `fiscal-cnpj-lookup`).

Estado: **não publicáveis por esta sessão**. As ferramentas de deploy disponíveis
estão vinculadas ao projeto Cloud do workspace, não ao staging autorizado; publicar
por elas violaria o escopo. Nada foi publicado, em staging ou produção, e nenhum
secret ou certificado foi tocado.

Ação de desbloqueio: executar o deploy pelo runner autorizado do staging
(`supabase functions deploy <nome> --project-ref ikaauvsflpmamgxmkhoq`) com os secrets
já existentes (`FISCAL_CERTIFICATE_MASTER_KEY`, `FISCAL_CORS_ALLOWLIST`,
`INTERNAL_FUNCTION_SECRET`), seguido de `fiscal-binding-diagnostics` (GET) esperando
`binding_ok=true`, `environment=STAGING`, `production_emission_allowed=false`.

### 3.5 Dependências que mantêm a promoção não elegível

- Emitente fiscal em `company_fiscal_settings`: `configuration_status=DRAFT`,
  readiness `NOT_READY` — depende de **dado real do usuário** (CNPJ definitivo,
  razão social, IE, regime, endereço, série/numeração autorizada).
- `fiscal_invoices=0`, `fiscal_events=0`, `fiscal_sefaz_transmissions=1` (homologação).
- Certificado A1: registro `status=AVAILABLE`, `environment=HOMOLOGATION`, verificado
  **somente por metadados**; senha, PFX e material criptográfico não foram lidos,
  exibidos nem exportados. `fiscal_certificate_material` permanece fail-closed (RLS
  ligada, sem policy, sem grant de aplicação).
- 7 tabelas com RLS sem policy permanecem **intencionalmente fail-closed**:
  `_f42_harness_fixtures`, `_fiscal_staging_marker`, `commercial_payment_plans`,
  `communication_provider_settings`, `communication_provider_settings_rate_limit`,
  `comunicacao_inapp_dispatch`, `fiscal_certificate_material`.

## 4. Objetivo 3 — Gate final

### Advisor — duas leituras distintas

**(a) Durante a execução da H7P no Lovable** o diagnóstico foi feito por **consultas
diretas ao catálogo** do staging (antes → depois):

| Verificação de catálogo | Antes | Depois |
| --- | --- | --- |
| Tabelas expostas com RLS desligada | 0 | 0 |
| Views sem `security_invoker` | 1 | 1 |
| SECURITY DEFINER sem `search_path` | 0 | 0 |
| SECURITY DEFINER executável por `anon` | 2 | 2 |
| Extensões em `public` | `pg_net`, `btree_gist` | `pg_net`, `btree_gist` |
| RLS sem policy (fail-closed) | 7 | 7 |
| FKs sem índice (perf, WARN) | 172 | 172 |
| Índices sem uso (perf, INFO) | 219 | 219 |

**(b) Verificação independente pós-entrega, com o Advisor oficial** do Supabase no
staging `ikaauvsflpmamgxmkhoq` — **0 ERROR** em ambas as dimensões:

| Security — 393 achados | Qtd. | Severidade | Tratamento |
| --- | --- | --- | --- |
| `authenticated_security_definer_function_executable` | 378 | WARN | Risco aceito — todas com `search_path` fixo e guarda própria/delegada ou uso estrutural; revogação em massa quebraria consumidores (H7O já revogou as 19 comprovadamente ociosas) |
| `rls_enabled_no_policy` | 10 | WARN/INFO | **Fail-closed intencional** (inclui as 3 tabelas privadas de rate-limit, sem grant `anon`/`authenticated`) |
| `extension_in_public` | 2 | WARN | Risco aceito — `btree_gist` sustenta a constraint de exclusão `cpr_no_overlap`; `pg_net` sustenta `net.http_post`. Mover recriaria constraints/quebraria envios |
| `anon_security_definer_function_executable` | 2 | WARN | Por design — `rpc_validar_comprovante_entrega` (rate-limit + HMAC anti-enumeração da H7O) e `rpc_validar_rastreio_produto` (rastreio por token) |
| `auth_leaked_password_protection` | 1 | WARN | **Bloqueio externo B1** — não alterável pelo mecanismo autorizado nesta fase |
| **ERROR** | **0** | — | — |

| Performance — 1001 achados | Qtd. | Severidade | Tratamento |
| --- | --- | --- | --- |
| `auth_rls_initplan` | 436 | WARN | Dívida preexistente; reescrita ampla de policies fora do escopo do gate |
| `unindexed_foreign_keys` | 172 | WARN | Dívida preexistente |
| `multiple_permissive_policies` | 146 | WARN | Dívida preexistente |
| `unused_index` | 219 | INFO | Dívida preexistente |
| `duplicate_index` | 28 | INFO | Dívida preexistente |
| **ERROR** | **0** | — | — |

Nenhum achado de performance é causado pela H7 e **nenhuma correção ampla de
performance foi feita nesta fase**, por decisão explícita de escopo: exigiria DDL
extenso sobre policies e índices, com risco desproporcional ao gate.

- Catálogo confirmado de forma independente: **24 views públicas, 23 com
  `security_invoker=true/on`**. A única sem a opção é `_src_vw_esteira_laboratorio`,
  view interna com **0 grants** para `anon`/`authenticated` — sem exposição. As 5 views
  protegidas pela H7O seguem `security_invoker=true`.
- Demais confirmações independentes coincidem com as desta fase: ledger **654**; as
  quatro migrations H7O presentes; **648** SECURITY DEFINER em `public`, 0 sem
  `search_path` fixo, 2 executáveis por `anon`; 3 tabelas privadas de rate-limit com RLS
  e 0 grants `anon`/`authenticated`; **6** cron jobs ativos; fiscal
  `HOMOLOGATION` / `tpAmb=2` / `production_enabled=false` / `DRAFT` / `NOT_READY`;
  `invoices=0`, `events=0`, `transmissions=1`.


### Execuções

| Item | Resultado |
| --- | --- |
| `check-frontend-binding.sh` (início e fim) | OK |
| `h7p-guard-repo-only.sh` | OK — 59 bloqueadas, 0 no ledger |
| `h7o-postcheck.sh` | **PASS** (todos os itens P1–P4, allowlist 485 sem drift, 19 removidas / 0 adicionadas) |
| Harness perfis H7O | 300 PASS / 0 FAIL |
| Harness perfis H7N | 136 PASS / 0 FAIL |
| Teste das 5 views (estático + catálogo) | 5/5 `security_invoker` |
| Rate-limit / anti-enumeração | tabelas e funções `private` sem grant de app; pepper HMAC ≥32 bytes; 3 políticas ativas; índice de poda presente |
| `pg_cron` | 6 jobs ativos, incluindo a poda do rate-limit |
| Rollback → reapply (P4) | executado e reconvergido: 5/5 views `security_invoker` após o ciclo |
| `tsgo --noEmit` | 0 erros |
| `npm run build` | OK |
| Vitest completo | **3.337 passed / 0 failed / 4 skipped** (213 arquivos) |
| `fiscal-secrets-scan.sh` | OK — nenhum segredo real |
| `fiscal-integration-scan.sh` | OK — nenhum indicador de emissão em runtime |

Nenhuma falha causada por H7. Nenhuma falha preexistente ativa na suíte
(4 skips preexistentes, dependentes de ambiente externo).

Observação de método: no ensaio de reversão do P4, o script forward contém `COMMIT`
próprio, de modo que o ciclo rollback→reapply **não permaneceu descartável**; ele foi
executado por inteiro e o estado final foi reverificado (`P4 views security_invoker: 5/5`,
postcheck integral PASS). Nenhum outro objeto foi tocado.

## 5. Arquivos criados/alterados nesta fase

- `restoration/homologacao-h7/h7p-repo-only-manifest.json` (novo)
- `restoration/homologacao-h7/h7p-guard-repo-only.sh` (novo)
- `src/test/security/h7p-repo-only-migrations.static.test.ts` (novo)
- `restoration/homologacao-h7/99-h7-relatorio-final.md` (novo)
- `docs/auditorias/homologacao-h7-fiscal.md` (atualizado)
- `roadmap.md` (atualizado)
- `.env`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`
  (restaurados ao baseline autorizado)

Nenhuma migration criada, aplicada, alterada ou removida. Nenhuma Edge Function
publicada. Nenhum secret criado, lido ou rotacionado.

## 6. Riscos residuais

1. **Regeneração automática do binding.** A plataforma já reescreveu `.env` e
   `types.ts` para o projeto Cloud acidental várias vezes. Mitigação: gate de binding
   + testes estáticos; risco operacional permanece até o vínculo ser corrigido na raiz.
2. **Migrations repo-only.** Mitigadas pelo manifesto + gate + teste, mas um runner
   externo que ignore o gate ainda poderia aplicá-las.
3. **Performance.** 172 FKs sem índice e 219 índices sem uso — dívida preexistente.
4. **Extensões em `public`.** WARN aceito e justificado.

## 7. Bloqueios externos (exigem dado, decisão ou acesso indisponível)

- B1 — Leaked-password protection no staging (configuração de Auth).
- B2 — Publicação das Edge Functions no staging pelo runner autorizado.
- B3 — Dados fiscais reais do emitente (`configuration_status=DRAFT` → `READY`).
- B4 — Autorização humana explícita para qualquer promoção a produção.

## 8. Checklist de promoção

| # | Item | Estado |
| --- | --- | --- |
| 1 | Ledger staging reconciliado, sem pendência de DDL | ✅ |
| 2 | H7L/H7N/H7O preservadas e verificadas | ✅ |
| 3 | Guardas 42501, revogações e allowlist sem drift | ✅ |
| 4 | Rate-limit anti-enumeração ativo | ✅ |
| 5 | 5 views protegidas em `security_invoker` | ✅ |
| 6 | Typecheck, build, Vitest, scans | ✅ |
| 7 | Fiscal em homologação, emissão desligada | ✅ |
| 8 | Leaked-password protection | ⛔ B1 |
| 9 | Edge Functions publicadas em staging e validadas | ⛔ B2 |
| 10 | Emitente fiscal READY com dados reais | ⛔ B3 |
| 11 | Autorização humana de promoção | ⛔ B4 |

## 9. Decisão do gate H7

**GO para o staging / NO-GO para promoção a produção.**

A auditoria H7 está tecnicamente concluída no escopo executável: todo trabalho seguro
e reversível foi realizado, verificado e documentado, e o ledger permanece em 654
versões sem DDL novo. Os itens remanescentes (B1–B4) são exclusivamente bloqueios
externos que dependem de configuração de plataforma, runner de deploy autorizado,
dado fiscal real e decisão humana. Promoção **não elegível** até B1–B4 serem resolvidos
e o gate reexecutado.
