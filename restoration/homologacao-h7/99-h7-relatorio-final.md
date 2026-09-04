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
| `multiple_permissive_policies` | 146 | WARN | Dívida preexistente |
| `duplicate_index` | 28 | WARN | Dívida preexistente |
| `unindexed_foreign_keys` | 172 | INFO | Dívida preexistente |
| `unused_index` | 219 | INFO | Dívida preexistente |
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

---

## 10. Gate H7Q — resolução dos bloqueios externos (2026-09-05, staging `ikaauvsflpmamgxmkhoq`)

Rodada executada a partir de `c083faeb`. Nenhum DDL, nenhuma migration, nenhum secret,
nenhum PFX lido, nenhum documento fiscal emitido. Produção `navfzbwgwzruipouyfnk`:
**não consultada, não alterada, não promovida**.

### 10.1 Binding
Gate `check-frontend-binding.sh` acusou drift no início (`.env` regenerado para o Cloud
`yzszl…`). `.env` e `types.ts` (21.850 linhas) restaurados do baseline `6c08a8f8`;
`client.ts` já consistente. Gate reexecutado: **OK — staging `ikaauvsflpmamgxmkhoq`**.
Toda operação de banco só ocorreu após esse PASS.

### 10.2 B1 — leaked-password protection — **BLOQUEADO (externo)**
Não existe no ambiente nenhum runner/token de administração vinculado ao staging
(`SUPABASE_ACCESS_TOKEN`/PAT ausente); as ferramentas de configuração de auth
disponíveis estão vinculadas ao projeto Cloud `yzszl…`, **não** ao staging autorizado.
Habilitar por SQL é impossível: a opção pertence à configuração do GoTrue, não ao banco.
Nenhum SQL foi inventado. Instrução operacional exata (executar por humano com acesso
ao projeto de homologação):
1. Abrir o projeto `ikaauvsflpmamgxmkhoq` → Authentication → Policies/Passwords.
2. Ativar “Leaked password protection” (HaveIBeenPwned) e salvar.
3. Testar com uma senha comprovadamente vazada em conta descartável de homologação;
   esperado: cadastro/alteração recusado. Não registrar a credencial em log ou documento.
4. Reexecutar o Advisor de segurança: o achado `auth_leaked_password_protection`
   deve desaparecer (Security passaria a 392 achados).

### 10.3 B2 — Edge Functions — **RESOLVIDO EM HOMOLOGAÇÃO (com ressalva de republicação)**
Inventário: **38 diretórios** em `supabase/functions/` = 37 funções + `_shared`.
Verificação de runtime contra o staging (somente OPTIONS/GET, sem efeito colateral):
**37/37 publicadas e respondendo**, nenhuma ausente (0 × HTTP 404) —
34 × 200, 3 × 204 (`fiscal-preflight`, `fiscal-cnpj-lookup`,
`communication-provider-settings`) e 1 × 405 por contrato
(`whatsapp-status-webhook`, sem preflight).
Diagnóstico canônico `GET /functions/v1/fiscal-binding-diagnostics`:

```
project_ref=ikaauvsflpmamgxmkhoq  marker_project_ref=ikaauvsflpmamgxmkhoq
environment=STAGING  production_emission_allowed=false  binding_ok=true
```

Nomes de secrets consumidos foram inventariados por leitura estática de
`Deno.env.get(...)` (apenas **nomes**, nunca valores): `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FISCAL_CERTIFICATE_MASTER_KEY`,
`FISCAL_TEST_CERTIFICATE_MASTER_KEY`, `INTERNAL_FUNCTION_SECRET`,
`ALERTAS_CRON_SECRET`, `ALERTAS_SLA_SECRET`, `ALERTAS_NOTIFICACOES_SECRET`,
`ALERTAS_RESUMO_SECRET`, `SMTP_*`, `VAPID_*`, `LOVABLE_API_KEY`,
`GOOGLE_MAIL_API_KEY`, `APP_URL`, `SITE_URL`, `DENO_DEPLOYMENT_ID`.
Nenhum secret foi criado, rotacionado ou lido; o PFX não foi acessado; nenhuma
NF-e/NFS-e foi emitida.
**Ressalva:** *republicar* qualquer função exige runner vinculado a
`ikaauvsflpmamgxmkhoq` (`supabase functions deploy <nome> --project-ref ikaauvsflpmamgxmkhoq`),
indisponível nesta sessão. Enquanto não houver esse runner, alterações de código de
Edge Function permanecem **não implantáveis** — o conjunto atualmente publicado está
validado e íntegro.

### 10.4 B3 — cadastro fiscal do emitente — **BLOQUEADO (depende de dado real/contador)**
`company_fiscal_settings`: 1 registro ativo. Presentes: razão social, nome fantasia,
CNPJ, IE, regime (`LUCRO_PRESUMIDO`), CRT `3`, CNAE, endereço/UF/IBGE, série NF-e `1`,
numeração inicial `1`, `fiscal_environment=HOMOLOGATION`, código de ambiente `2`.
Ausente/vazio: `municipal_registration` (irrelevante enquanto `nfse_enabled=false`).
Estado: `configuration_status=DRAFT`, `nfe_readiness_status=NOT_READY`,
`production_enabled=false`, `nfe_enabled=false`, `nfse_enabled=false`.
Pendências reais do motor de prontidão (nenhum dado inventado):

| Código | Severidade | O que falta |
| --- | --- | --- |
| `EMITTER_ACCREDITATION_MISSING` | BLOCK | Registro do credenciamento do emitente na SEFAZ da UF |
| `EMITTER_ACCOUNTING_NOT_VALIDATED` | BLOCK | Validação contábil formal do cadastro (contador responsável) |
| `EMITTER_IE_DV_NOT_IMPLEMENTED` | WARN | Validação de DV da IE por UF não implementada |

Certificado A1 conferido **apenas por metadados**: `status=AVAILABLE`,
`environment=HOMOLOGATION`, validade 2026-06-17 → 2027-06-17. Senha, PFX e material
criptográfico não foram lidos nem exibidos.

### 10.5 Gates reexecutados nesta rodada
| Gate | Resultado |
| --- | --- |
| `check-frontend-binding.sh` | PASS (após restauração) |
| `h7p-guard-repo-only.sh` | PASS — nenhuma das 59 repo-only no ledger |
| `h7o-postcheck.sh` | PASS integral (H7N preservada, 4 H7O com MD5 esperado, 8/8 guardas 42501, 19/19 revogações, rate-limit privado, 5 views invoker, allowlist 485 sem drift) |
| Harness por perfis H7O / H7N | 300/300 e 136/136 PASS (transacionais, com ROLLBACK) |
| Ledger | 654 — inalterado |
| SECURITY DEFINER | 648 em `public`, 0 sem `search_path`, 2 anon por design |
| RLS sem policy | 7 tabelas fail-closed (intencional) |
| Views protegidas | 5/5 `security_invoker` |
| `pg_cron` | 6 jobs ativos |
| Fiscal | `HOMOLOGATION | tpAmb=2 | production=false | nfe=false | nfse=false | DRAFT | NOT_READY` |
| Typecheck (`tsgo --noEmit`) | 0 erro |
| Build (`npm run build`) | OK |
| Vitest | **3.337 PASS / 0 FAIL / 4 skip** (212 arquivos) |
| `fiscal-secrets-scan.sh` / `fiscal-integration-scan.sh` | PASS |
| Advisor oficial | Ferramenta vinculada ao Cloud `yzszl…`; **não executável contra o staging** nesta sessão. Vale a verificação independente registrada na seção anterior: Security 393 (0 ERROR) e Performance 1001 (0 ERROR). Nenhuma correção ampla de performance nesta fase. |

Nenhuma falha H7 nova foi encontrada; portanto nenhuma correção foi necessária e não há
rollback pendente (rodada sem DDL).

### 10.6 Decisão H7Q
| Bloqueio | Estado após H7Q |
| --- | --- |
| B1 — leaked-password protection | ⛔ bloqueio externo (sem runner/console autorizado) |
| B2 — Edge Functions | ✅ publicadas e validadas em staging; republicação depende de runner |
| B3 — emitente fiscal READY | ⛔ depende de credenciamento SEFAZ e validação contábil |
| B4 — autorização humana de promoção | ⛔ pendente |

**H7 declarada tecnicamente concluída com bloqueios externos (B1, B3, B4).
GO para staging / NO-GO para produção. Não elegível para promoção.**
