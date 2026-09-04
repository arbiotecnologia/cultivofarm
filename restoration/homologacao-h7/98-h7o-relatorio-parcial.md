# H7O — Relatório DEFINITIVO (rodadas 1–3) — staging `ikaauvsflpmamgxmkhoq`

> Rodada 1 (auditoria read-only) e rodada 2 (implementação) estão preservadas abaixo como histórico.
> A rodada 3 (validação final e decisão de gate) está na seção 10, ao final do documento.

Data: 2026-09-04 (UTC). Produção `navfzbwgwzruipouyfnk` **não consultada, não alterada, não promovida**.
Nenhum DDL/DML foi executado no staging nesta rodada: apenas leituras de catálogo, ledger e corpos de função.

## 1. Estado de partida verificado
- Drift detectado em HEAD (`fad37927`): `.env` apontava para o sandbox `yzszl…` e `types.ts` tinha 2.052 linhas. Ambos restaurados do commit `ddee31ab` (21.850 linhas). `check-frontend-binding.sh` e `guard-staging.sh`: OK (`tpAmb=2`, produção fiscal desabilitada).
- `h7n-postcheck.sh`: PASS integral (ledger H7N 5/5 com MD5, views 5/5 `security_invoker`, wrappers 4/4, RPCs 13/13, allowlist 504 sem drift, fiscal `HOMOLOGATION|2|false|false|false|DRAFT|NOT_READY`).
- As cinco migrations H7N (`20260904130615`…`20260904131341`) permanecem intactas e não foram reaplicadas.

## 2. Objetivo 10 — migration `20260903182144_h7l_security_advisor_hardening` recuperada
- Extraída byte a byte do ledger (`encode(convert_to(statements[1],'UTF8'),'base64')`), 4.156 bytes, MD5 `dc2ee1f7db4a0e2768a6adf29ac6310b` (idêntico ao `md5(statements[1])` do ledger).
- Versionada em `supabase/migrations/20260903182144_h7l_security_advisor_hardening.sql`. Não reaplicada. Conteúdo: guard de staging, `security_invoker` + grants em 3 views `v_fiscal_nfe_*`, `search_path` em 34 funções fiscais, revogação de 2 trigger functions.

## 3. Objetivos 1–2 — classificação individual das 397 assinaturas SECURITY DEFINER
Artefatos em `restoration/homologacao-h7/h7o-inventario/`:
- `00-secdef-inventory.sql` (catálogo read-only: ACL, `pg_depend`, callers, cron, guardas, DML, MD5) → `secdef_catalog.tsv` (397 assinaturas; 395 só `authenticated`, 2 também `anon`; 0 EXECUTE PUBLIC; 0 sem `search_path`).
- `01-repo-refs.py` → `repo_refs.tsv` (referências fortes/fracas no frontend, Edge Functions, testes, harnesses, migrations; inclui mapas de RPC dinâmicos).
- `02-classify.py` + `03-refine-guards.py` → `secdef_classification.tsv` e `call_graph.tsv` (guarda própria ou **delegada a helper nomeado** — 43 helpers de autorização confirmados: `_visita_lock_and_check`, `fn_cockpit_assert_operador`, `fn_entrega_assert_confirmador`, `fn_cc_can_prepare`, `fn_fiscal_can_read_internal`, `is_financial_staff`, …).

| Categoria | Qtde |
|---|---|
| RPC autenticada com guarda (própria ou delegada) | 249 |
| Estrutural (policy/view/constraint/cron/Edge Function) | 82 |
| Candidata à revogação (sem consumidor direto; callers só SECURITY DEFINER ou nenhum) | 54 |
| RPC autenticada **sem guarda** (leitura de corpo concluída) | 10 |
| Pública necessária (anon, QR/token) | 2 |

Risco após leitura manual: 2 ALTO (DML sem guarda), 11 MÉDIO, 384 BAIXO.

### 3.1 As 10 sem guarda — decisão por leitura do corpo
| Função | Consumidores comprovados | Decisão proposta (próxima rodada) |
|---|---|---|
| `fn_generate_recurring_title(uuid,date,bool)` — DML (gera títulos) | `Recorrencias.tsx:440` (manual) e cron `recurring-financial-daily` via `fn_run_recurring_generation` | **Guardar**: permitir sessão interna (sem JWT) / service_role / `is_financial_staff(auth.uid())`; senão `42501`. Preserva cron e tela. |
| `recalc_partner_risk_score(uuid)` — DML (upsert score) | `useB2BFinanceiro.ts:385` e trigger `tg_recalc_risk_on_ar_change` | **Guardar**: `pg_trigger_depth()>0` ou sessão interna ou `is_financial_staff`; senão `42501`. |
| `check_cliente/fazenda/talhao_dependencies` — só contagens | `src/lib/cadastros.ts:72-84` | **Guardar** com `is_operational_staff(auth.uid()) OR can_user_access_cliente(auth.uid(), cliente)`; senão `42501`. |
| `rpc_validar_integridade_esteira(text,uuid)` — leitura de flags por OS | `useEsteiraLaboratorio.ts:727` (a sobrecarga de 3 args, INVOKER, é a usada internamente) | **Guardar** com `is_operational_staff(auth.uid())`; senão `42501`. |
| `rpc_cockpit_confirmar_entrega_v1`, `rpc_entrega_confirmar_v1` | wrappers puros de `fn_entrega_confirmar_engine_v1` → `fn_entrega_assert_confirmador` | Reclassificar como guarda delegada (2 níveis). Sem alteração. |
| `fn_catalogo_preco_canonico`, `fn_cockpit_is_hml_environment` | views de catálogo / botão de fixtures HML | Leitura não sensível por design. Sem alteração; documentar. |

### 3.2 As 54 candidatas — evidência
Busca textual ampla (`src`, `supabase/functions`, `e2e`, `tests`, `scripts`, excluindo migrations/docs/types) = **0 ocorrências** para todas as 54. Nenhuma tem dependência em policy/view/trigger/cron.
- **Grupo A (helpers/engines chamados só por SECURITY DEFINER)** — revogação de EXECUTE `authenticated` segura (mesmo padrão H7N), pendente de confirmação de que harnesses não as invocam diretamente como `authenticated`: `_assert_visita_editavel`, `_comunicacao_require_admin`, `_rpc_avancar_esteira_laboratorio_internal`, `can_checkin_technical_visit`, `can_user_access_cliente(uuid,uuid)`, `can_view_bi_operacional`, `fn_cockpit_assert_operador`, `fn_entrega_assert_confirmador`, `fn_entrega_confirmar_engine_v1`, `fn_estoque_pode_operar`, `generate_production_orders_from_partner`, `is_operational_staff`, `is_visit_org_manager`, `is_valid_b2b_partner_user`, `get_b2b_user_role_for_partner`, `log_report_view`, `rpc_gerar_alertas_operacionais`, `rpc_recalcular_prioridade_alerta`, `rpc_regulatory_sod_override`.
- **Grupo B (RPCs guardadas sem nenhum consumidor — código morto ou exercitado só por harness fiscal/regulatório)**: manter sem alteração nesta fase (guardas presentes; remoção é decisão de produto). Exceção a reavaliar: `rpc_substituir_etiqueta_produto` (DML, guarda fraca `uid_check`, sem consumidor) → candidata a revogação fail-closed.

## 4. Objetivo 11 — views protegidas em migrations posteriores a H7N
- `20260908000000_h3_base_tecnica_catalogo_v1.sql` (CREATE OR REPLACE) e `20260909000000_h3b_preco_canonico_fichas_v1.sql` (DROP/CREATE) recriam `vw_catalogo_ficha_produtos` e `vw_catalogo_ficha_microrganismos` **sem** `security_invoker`. As outras 3 views não são tocadas.
- Ambas são repo-only (não estão no ledger) mas seu conteúdo já está aplicado no staging (ex.: `fn_catalogo_preco_canonico` existe); a reconstrução em ordem de repositório perderia `security_invoker`.
- Correção planejada: migration nova numerada **após** `20260929000000` (última do repo) que reafirma `ALTER VIEW … SET (security_invoker = true)` nas 5 views de forma idempotente + teste estático que exige reafirmação após qualquer CREATE/DROP de view protegida.

## 5. Objetivo 6 — rate-limit de `rpc_validar_comprovante_entrega` (projeto)
- Função atual: SECURITY DEFINER, `search_path=public`, EXECUTE `anon`; token `uuid` com `gen_random_uuid()` (imprevisível); retorno mínimo e mensagem genérica; **sem** limite nem auditoria.
- Estrutura existente: `communication_provider_settings_rate_limit(user_id uuid NOT NULL, action, window_start, count)` + `rpc_service_check_rate_limit` (restrita a service_role/postgres, chave por usuário) — não serve a chamadas anônimas sem distorcer a semântica de `user_id`.
- Proposta: tabela em schema `private` (já existente, não exposto à Data API; ACL `authenticated=U, service_role=U`), chave `(scope, bucket_key, window_start)`, contadores por token (hash), por origem (hash sha256 de `x-forwarded-for`/`cf-connecting-ip` + sal diário, sem IP em claro) e teto global; verificação **antes** da consulta ao token (resposta `valido=false, rate_limited=true, retry_after_seconds` sem revelar validade); poda via função + job `pg_cron` (padrão `prune-old-audit-logs`); rollback com `DROP` + restauração do corpo atual (capturado por `pg_get_functiondef`).

## 6. Objetivo 7 — as 7 tabelas com RLS sem policy (evidência de catálogo)
| Tabela | Grants | Linhas | Leitura |
|---|---|---|---|
| `_f42_harness_fixtures` | postgres, service_role | 14 | fail-closed deliberado (fixtures de harness) |
| `_fiscal_staging_marker` | postgres, service_role | 1 | fail-closed deliberado (marcador lido só por SECURITY DEFINER) |
| `commercial_payment_plans` | postgres, service_role | 18 | acesso só via RPCs `rpc_admin_*_commercial_plans` (SECURITY DEFINER) — fail-closed correto |
| `communication_provider_settings` | **anon/authenticated com ALL** (grant sem policy = negado por RLS) | 1 | fail-closed efetivo; grants excedentes a `anon`/`authenticated` são candidatos a revogação (sem impacto: RLS já nega) |
| `communication_provider_settings_rate_limit` | postgres, service_role | 2 | fail-closed deliberado (uso via `rpc_service_check_rate_limit`) |
| `comunicacao_inapp_dispatch` | postgres, service_role | 0 | fail-closed deliberado (worker service_role) |
| `fiscal_certificate_material` | postgres, service_role | 1 | fail-closed obrigatório (cofre A1; Edge Function com service_role) |
Conclusão preliminar: nenhuma precisa de policy; todas são deliberadamente fail-closed. Confirmar consumidores frontend antes de fechar.

## 7. Objetivo 8 — extensões
`btree_gist 1.7` em `public` (relocável) e `pg_net 0.20.4` em `public` (não relocável). Sem mover/recriar/atualizar nesta fase; dependências (constraints EXCLUDE com gist, chamadas `net.http_post` em triggers/funções) a inventariar antes de qualquer decisão.

## 8. Comparação repo ↔ `schema_migrations`
- Ledger: 650 versões, máx. `20260904131341`. Repo: 709 arquivos (após versionar H7L). 59 versões repo-only, das quais 27 nomeadas entre `20260905000000` e `20260929000000` (fases H3–H7a) cujo conteúdo foi aplicado ao staging sem registro no ledger — reconciliação permanece item P2 do roadmap.
- Numeração das migrations H7O: `20260930000000_h7o_*` (posterior ao ledger e a todos os arquivos do repo), seguindo a convenção das fases H.

## 9. Pendências desta rodada (próxima execução)
Objetivos 3–9, 11–14: migrations H7O (guardas das 6 funções, 42501 em `rpc_b2b_aging`/`rpc_b2b_partner_profitability`, revogações do Grupo A, rate-limit, reafirmação das views), rollbacks, gate determinístico de binding (pre-commit/CI), Advisor antes/depois, harness por perfil ampliado, typecheck/build/Vitest/scan, ensaio rollback→reapply, validação fiscal read-only e atualização de `docs/auditorias/homologacao-h7-fiscal.md`, `97-h7n-p0p1-auditoria.md` e roadmap.


---

## 10. Rodada 3 — Validação final e decisão do gate H7O

Data: 2026-09-04 (UTC). Commit avaliado: `a0fcea0b6a6a1b40566ae656e508d049986c74db`.
Produção `navfzbwgwzruipouyfnk`: **não consultada, não alterada, não publicada, não promovida**.

### 10.1 Migrations H7O no ledger (não reaplicadas, não renumeradas)

| Versão | MD5 repo == ledger |
|---|---|
| `20260930000000_h7o_p1_guardas_42501_v1` | `e6592d1a6126a71cb1163d3c8f48ed4b` |
| `20260930010000_h7o_p2_revogacoes_helpers_v1` | `95f5c1a1023299095d7a12bd0e8bdb5a` |
| `20260930020000_h7o_p3_rate_limit_validacao_publica_v1` | `ec0bedda1966b91615a2cade100ecd5b` |
| `20260930030000_h7o_p4_reafirmar_security_invoker_views_v1` | `34c45a123a9fc880faed50889e250680` |

Ledger do staging: **654 versões, máximo `20260930030000`**. H7L (`20260903182144`, MD5 `dc2ee1f7db4a0e2768a6adf29ac6310b`) e as 5 migrations H7N (`20260904130615`…`20260904131341`) intactas.

### 10.2 `h7o-postcheck.sh` — PASS integral

Correção aplicada no script: o cálculo do diff de allowlist abortava sob `set -euo pipefail` (diff retorna 1 quando há diferenças) e a normalização de assinaturas por `sed` era frágil — substituída por normalização determinística em Python.

- 8 guardas `42501` presentes; `rpc_b2b_aging` e `rpc_b2b_partner_profitability` em PL/pgSQL com `42501`.
- 19 revogações efetivas; `communication_provider_settings` sem grants `anon`/`authenticated`.
- Rate-limit privado ativo (3 tabelas `private` com RLS e sem grants; RPC pública com verificação antes da leitura do token; job `pg_cron` de poda).
- 5 views protegidas com `security_invoker=true`.
- **Allowlist sem drift: 485 funções expostas. Diff H7N→H7O = exatamente 19 assinaturas removidas, 0 adicionadas (504 → 485).**
- Fiscal: `HOMOLOGATION|2|false|false|false|DRAFT|NOT_READY`; `fiscal_invoices|fiscal_events|fiscal_sefaz_transmissions = 0|0|1`.
- Extensões intocadas (`btree_gist@public`, `pg_net@public`), sem fixação de versão.
- Saída final: `H7O POSTCHECK: PASS`.

### 10.3 Teste estático de ordem de migrations (objetivo 2)

Novo: `src/test/security/protected-views-migration-order.static.test.ts`. Percorre `supabase/migrations` em ordem cronológica, reconstrói o estado (`absent` / `invoker` / `unsafe`) das 5 views protegidas e exige que qualquer `CREATE`/`DROP+CREATE` seja seguido de reafirmação de `security_invoker` — inclusive reafirmação **dinâmica** (`DO`/`EXECUTE format('ALTER VIEW … SET (security_invoker = true)')`, padrão de H7N P0 e H7O P4).
Resultado: **6/6 PASS**. Verificação negativa: uma migration temporária com `DROP VIEW` + `CREATE VIEW` de `vw_esteira_laboratorio` fez o teste falhar com mensagem acionável, comprovando que o gate não é vacuoso (arquivo temporário removido em seguida).

### 10.4 Gate de binding integrado à suíte (objetivo 3)

Novo: `src/test/config/binding-gate.integration.test.ts`, que executa `restoration/homologacao-h7/check-frontend-binding.sh` (estático, sem acesso a banco) dentro do Vitest e ainda assegura que a saída **não** contém JWT, chaves `sb_*`, DSN nem `service_role`.
Resultado: PASS — `H7d BINDING GATE: OK — staging ikaauvsflpmamgxmkhoq (.env, client.ts, config.toml, types.ts consistentes)`.

Drift no início da rodada: `.env` apontava para o sandbox (`yzszl…`) e `types.ts` tinha 2.052 linhas; ambos restaurados byte a byte do baseline autorizado (`6c08a8f8`, `types.ts` com 21.850 linhas) junto de `client.ts`. Nenhum valor secreto foi impresso.

### 10.5 Suítes executadas (objetivo 4)

| Verificação | Resultado |
|---|---|
| Typecheck (`tsgo --noEmit -p tsconfig.app.json`) | 0 erro |
| Build (`npm run build`) | OK (PWA gerado, 20 entradas de precache) |
| Vitest completo | **3.326 PASS / 0 FAIL / 4 skip**, 211 arquivos + 1 skip |
| `scripts/fiscal-secrets-scan.sh` | OK — nenhum valor secreto real |
| `scripts/fiscal-integration-scan.sh` | OK — nenhum indicador de emissão fiscal em runtime |

Nenhuma falha atribuível à H7O; nenhuma falha preexistente remanescente.

### 10.6 Ensaio rollback→reapply (transação descartada)

`h7o-rollbacks/rehearse-rollback-reapply.sh`: 7 checks PRE (estado revertido) e 7 checks POST (estado reaplicado) **todos PASS**, com fingerprint de catálogo idêntico antes e depois (`SNAPSHOT_BEFORE = SNAPSHOT_AFTER = 9102cfe8a58e5c7e3fd843cf0131a90d`). `ROLLBACK` ao final: nada persistido.

### 10.7 Advisor após H7O (splinter oficial, prefixo sha256 `d8d558baad3e0383`)

Evidência em `restoration/homologacao-h7/h7o-inventario/advisor_splinter_after.txt`.

- **0 ERROR** (nenhum `security_definer_view`).
- SECURITY: 392 achados — 378 `authenticated_security_definer_function_executable` (era 397 antes das revogações), 10 `rls_enabled_no_policy` (tabelas fail-closed por design, incluindo as 3 novas tabelas privadas de rate-limit), 2 `extension_in_public` (decisão P2, não alteradas), 2 `anon_security_definer_function_executable` (`rpc_validar_comprovante_entrega` e `rpc_validar_rastreio_produto`, públicas por design QR/token, agora com rate-limit e resposta anti-enumeração).
- PERFORMANCE: 1.002 achados informativos (initplan de RLS, índices não usados/duplicados, FKs sem índice) — fora do escopo de segurança desta fase.

### 10.8 Invariantes fiscais (somente leitura)

Ambiente `HOMOLOGATION`, `tpAmb=2`, emissão de produção desabilitada, prontidão `DRAFT|NOT_READY`, 0 notas e 0 eventos fiscais. Nenhuma Edge Function foi publicada nesta rodada.

### 10.9 Riscos residuais

1. 378 funções SECURITY DEFINER continuam executáveis por `authenticated` — todas com guarda própria ou delegada comprovada na rodada 1; redução adicional é decisão de produto (Grupo B / código morto).
2. 59 migrations repo-only ainda não reconciliadas com o ledger do staging (item P2 do roadmap); a reconstrução por ordem de arquivo agora é protegida pelo teste estático das views.
3. `btree_gist` e `pg_net` permanecem em `public` (mover exigiria recriação de constraints EXCLUDE e de chamadas `net.http_post`).
4. `auth_leaked_password_protection` continua desligado — decisão de política, não técnica.
5. Drift recorrente de `.env`/`types.ts` gerado pela plataforma: mitigado por dois gates na suíte, mas exige restauração manual quando ocorre.
6. Publicação das Edge Functions no staging autorizado permanece bloqueada pela ferramenta de deploy (pendência herdada de H7e), sem impacto no gate H7O.

### 10.10 Decisão do gate

**H7O: APROVADO no staging `ikaauvsflpmamgxmkhoq`.** Todos os objetivos executáveis foram implementados, aplicados transacionalmente com registro correto no ledger, verificados por postcheck determinístico, harness por perfil, Advisor, ensaio de rollback e suítes completas. Produção permanece proibida e intocada; a promoção para produção continua **NÃO ELEGÍVEL** (dependências contábeis/cadastrais e itens P2 em aberto).

### 10.11 Arquivos desta rodada

Novos: `src/test/security/protected-views-migration-order.static.test.ts`, `src/test/config/binding-gate.integration.test.ts`, `restoration/homologacao-h7/h7o-inventario/advisor_splinter_after.txt`.
Atualizados: `restoration/homologacao-h7/h7o-postcheck.sh` (diff de allowlist), este relatório, `docs/auditorias/homologacao-h7-fiscal.md`, `roadmap.md`, e restauração de binding em `.env`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`.
Não alterados: migrations H7L/H7N/H7O, código de aplicação, Edge Functions, cofre A1, secrets, configuração fiscal, dados.


---

## 11. Rodada 4 — Correção de falso positivo apontada em revisão independente

Revisão sobre o commit `382bbcf0f5350fcbdd9c19a4d200a5f9d5e4eb7a`. Escopo: **somente código/testes**. Nenhuma migration foi criada, alterada ou reaplicada; nenhum DDL/DML no staging (apenas leituras do postcheck). Produção `navfzbwgwzruipouyfnk` não consultada, não alterada, não promovida.

### 11.1 Defeito confirmado

Em `src/test/security/protected-views-migration-order.static.test.ts`, a reafirmação dinâmica era inferida pelo **arquivo inteiro** (`arquivo contém o nome da view` + `arquivo contém security_invoker = true`). Num arquivo misto — duas views protegidas, uma reafirmada dinamicamente e a outra recriada com `DROP`+`CREATE` sem reafirmação — ambas eram marcadas como `invoker`. Falso positivo confirmado e corrigido.

Um segundo defeito foi encontrado durante a correção: a detecção **literal** de `security_invoker = true` usava janela `[\s\S]{0,400}`, que atravessava o `;` final do `CREATE` e casava com um bloco `DO` seguinte. A janela passou a ser `[^;]{0,400}`, restrita ao mesmo comando.

### 11.2 Correção aplicada

- Novo `dollarBlocks()`: segmenta o SQL em blocos dollar-quoted (`$tag$ … $tag$`).
- Novo `dynamicEventsFor(sql, view)`: uma reafirmação dinâmica só é atribuída a uma view quando **o mesmo bloco** que executa `ALTER VIEW … SET (security_invoker = <valor>)` via `EXECUTE`/`format` contém o nome daquela view como literal (item de array/lista ou nome qualificado). Reafirmação para `false` é tratada simetricamente como insegura.
- Máquina de estados extraída em funções puras exportadas (`eventsFor`, `applyEvents`, `finalStatesFor`), permitindo testes unitários determinísticos sem tocar em arquivos de migration.

### 11.3 Testes negativos

1. **Negativo simples (preservado e reexecutado)**: `DROP VIEW` + `CREATE VIEW` de `vw_esteira_laboratorio` sem reafirmação → estado `unsafe`, enquanto a outra view do baseline permanece `invoker`.
2. **Caso misto (novo, determinístico)**: mesmo SQL cita duas views protegidas; `vw_esteira_laboratorio` é reafirmada dinamicamente por um bloco `DO … FOREACH … EXECUTE format(...)` cuja lista contém apenas ela; `vw_catalogo_ficha_produtos` sofre `DROP`+`CREATE` sem reafirmação. O gate aprova a primeira (`invoker`) e **reprova especificamente a segunda** (`unsafe`, apontando o arquivo `999_misto.sql`).
3. **Escopo da lista**: view citada apenas em comentário, fora da lista do loop, não recebe nenhum evento de reafirmação.
4. **P4 real**: as cinco views protegidas recebem reafirmação dinâmica comprovada por evento (não por presença de texto no arquivo).

### 11.4 Resultados exatos desta rodada

| Verificação | Resultado |
|---|---|
| Teste estático corrigido | **10/10 PASS** |
| Suíte `src/test/config` + `src/test/security` | **20/20 PASS** (3 arquivos) |
| Typecheck (`tsgo --noEmit -p tsconfig.app.json`) | 0 erro |
| Build (`npm run build`) | OK |
| Vitest completo | **3.330 PASS / 0 FAIL / 4 skip** (211 arquivos + 1 skip) |
| `fiscal-secrets-scan.sh` | OK — nenhum valor secreto real |
| `fiscal-integration-scan.sh` | OK — nenhum indicador de emissão fiscal em runtime |
| `check-frontend-binding.sh` | OK — staging `ikaauvsflpmamgxmkhoq` |
| `h7o-postcheck.sh` (somente leitura) | **H7O POSTCHECK: PASS** — allowlist 485 sem drift, diff H7N→H7O = 19 removidas / 0 adicionadas, 5/5 views `security_invoker`, rate-limit privado ativo, fiscal `HOMOLOGATION\|2\|false\|false\|false\|DRAFT\|NOT_READY`, extensões intocadas |

Durante a rodada a plataforma voltou a regenerar `.env` e `types.ts` apontando para o sandbox (`types.ts` com 2.052 linhas), o que quebrou typecheck e o gate de binding; ambos foram restaurados do baseline autorizado `6c08a8f8` (21.850 linhas) e revalidados. Isso confirma o risco residual 5 da seção 10.9 e demonstra que os dois gates da suíte detectam o desvio.

### 11.5 Arquivos desta rodada

Alterados: `src/test/security/protected-views-migration-order.static.test.ts` (parser por view + 4 testes negativos), este relatório, e restauração de binding em `.env`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`.
Não alterados: migrations (H7L/H7N/H7O), banco, configuração fiscal, Edge Functions, secrets, produção.

**Decisão do gate H7O: mantida APROVADA** — o falso positivo era do teste, não do estado do banco; as cinco views continuam com `security_invoker = true` comprovado no staging.
