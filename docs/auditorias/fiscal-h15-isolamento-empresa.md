# H15 — gate de isolamento fiscal por empresa

## Estado desta rodada

**H15 APLICADA E AUDITADA — sincronizada no repositório em 19/09/2026.** Migration aplicada no canônico `swzpzcwiasxmjutrmvkm` (ledger vivo: `20260919015635_h15_fiscal_company_isolation`, `20260919015811_h15_fiscal_helper_acl_tightening`, `20260919015944_h15_emitter_readiness_insert_guard`).

Ensaio adversarial transacional executado dentro da transação de aplicação e revertido integralmente: encerrou com a exceção controlada **P1500 H15_ADVERSARIAL_PASS_ROLLBACK**, que é o resultado de sucesso — nenhuma fixture (organização, perfil, papel ou nota do ensaio) persistiu.

Pós-aplicação confirmado por leitura viva do banco:
- 0 notas fiscais, 0 certificados, 0 séries; 1 organização ativa; 1 emitente; `production_enabled=0`; marcador canônico = 1.
- Colunas `company_fiscal_settings.organization_id` e `fiscal_invoices.company_settings_id` NOT NULL com FK RESTRICT e índices confirmados.
- Candidato contendo 12 helpers, 17 triggers e 30 ALTER POLICY aplicado conforme definido.

Correções pós-auditoria registradas (duas, sincronizadas no repositório):
1. Separação de identidade organizacional de papel: `h15_actor_organization()` retorna a organização do perfil ativo via `auth.uid()` sem filtrar papel; `h15_require_staff()` verifica explicitamente os papéis fiscais aceitos (administrador, gestor, financeiro).
2. `h15_related_integrity` corrigido para relações com pai principal anulável: `fiscal_sefaz_transmissions` deriva a empresa do primeiro vínculo não nulo (invoice → xml_run → evento) e exige ao menos um; `fiscal_idempotency_keys` preserva operações técnicas sem nota e valida quando houver invoice. Endurecimento adicional de ACL dos helpers (`20260919015811`) e guard de prontidão do emitente (`20260919015944`) aplicados no mesmo pós-auditoria.

Sincronização do repositório (19/09/2026): `supabase/migrations/20260919015635_h15_fiscal_company_isolation.sql` copiado byte a byte do candidato (md5 `8aab69210e16cfa7b130fa946c40e834`, sem alteração de conteúdo); as demais duas migrations reproduzem o estado vivo do banco. Nenhuma execução remota de SQL ocorreu na sincronização; produção de emissão, Edge Functions, secrets e tipos permanecem inalterados e bloqueados.

## Histórico — estado anterior a esta rodada

**NÃO APLICADA — implementação incompleta; correções pontuais autorizadas pelo usuário, sem necessidade de nova aprovação de escopo.**

Destino confirmado por `supabase/config.toml` e leitura do marcador vivo: `swzpzcwiasxmjutrmvkm`. Banco real de produção do SaaS; `environment_label=STAGING` refere-se à emissão fiscal. `production_emission_allowed=false`.

Nenhuma migration foi submetida, nenhum dado alterado e nenhuma ferramenta de deploy acionada nesta rodada. Publicação automática da plataforma não foi consultada: não se afirma ausência global de deploy. Edge Functions, config.toml, secrets, cliente e tipos não foram editados.

## Baseline vivo — 18/09/2026

| Verificação | Resultado |
|---|---|
| Organizações / ativas | 1 / 1 |
| Emitentes / ativos em HOMOLOGATION sem produção | 1 / 1 |
| Notas / certificados / séries | 0 / 0 / 0 |
| Administradores ativos com organização | 1 |
| Emitentes com CNPJ ausente ou comprimento numérico diferente de 14 | 0 |
| organization_id em company_fiscal_settings | Ausente |
| company_settings_id em fiscal_invoices | Ausente |
| Índice ativo | ux_company_fiscal_settings_active_singleton: UNIQUE ((true)) WHERE is_active=true |
| Certificado → emitente | company_settings_id, FK ON DELETE RESTRICT |
| Série → emitente | company_id, FK ON DELETE RESTRICT |

As políticas staff de empresa/notas e dependentes verificam papéis globais. `fi_producer_read` é separada e verifica cliente vinculado por accounts_receivable/entregas. Nada foi alterado nela.

## Gate impeditivo: RLS e triggers não isolam leituras SECURITY DEFINER

A auditoria encontrou caminhos públicos existentes com EXECUTE para authenticated que contornariam uma correção limitada a RLS e triggers:

| Função viva | Evidência |
|---|---|
| rpc_fiscal_company_settings_init() | Administrador global; retorna o primeiro emitente ativo sem organização. Retorno acontece antes de qualquer INSERT, portanto trigger não resolve. |
| rpc_fiscal_company_rtc_get() | SECURITY DEFINER; retorna configuração do emitente mais recentemente atualizado, sem filtro organizacional. |
| fn_fiscal_emitter_pendencies(uuid) | SECURITY DEFINER; lê emitente por ID sem validar empresa do chamador. |
| rpc_fiscal_tax_preview_v1(uuid,jsonb) | SECURITY DEFINER; papel global, lê nota por ID e emitente ativo global. Preview não escreve; trigger não protege esse retorno. |
| rpc_fiscal_xml_status_v1(uuid) | SECURITY DEFINER; papel global e consulta runs por invoice ID, sem escopo organizacional. |
| rpc_fiscal_sefaz_transmission_status_v1(uuid) | SECURITY DEFINER; papel global; parâmetro nulo lista as últimas transmissões globalmente. |
| rpc_fiscal_draft_save(uuid,jsonb,jsonb,integer) | Papel global; seleciona UF do emitente ativo mais recente; INSERT não fornece vínculo com emitente. |

Também existem consumidores SECURITY DEFINER fora do prefixo fiscal (`fn_financial_inconsistencies`, `rpc_upsert_fiscal_invoice_manual`) que referenciam notas e precisam entrar na análise de alcance, sem mudanças automáticas em massa.

**Consequência:** aplicar apenas os vínculos e as políticas solicitadas deixaria vazamento por leitura pública. Triggers poderiam impedir escrita divergente, mas não seriam prova de isolamento de consultas. O estado com um único emitente não elimina esse problema para um staff de outra organização.

Não foi feita reescrita em massa, wrapper paralelo, revogação indiscriminada de RPCs ou alteração de papel global para contornar a limitação de escopo. O usuário autorizou correções pontuais nesses caminhos; a pendência é técnica, não de autorização. Segundo emitente continua não homologado.

### Continuação da auditoria — 19/09/2026

- Inventário local exportado em `restoration/fiscal-h15/inventory.json`: 54 definers com referência textual direta às tabelas selecionadas, incluindo funções técnicas e triggers. Esse número não equivale ao inventário transitivo completo e não substitui a revisão de chamadas indiretas, views e SQL dinâmico.
- Políticas originais preservadas em `restoration/fiscal-h15/baseline-policies.json`; inclui `fi_producer_read`, sem alteração.
- Consultas reproduzíveis somente leitura em `restoration/fiscal-h15/01-preflight.sql`; ainda não constituem ensaio nem migration.
- Outros caminhos examinados: prontidão, elegibilidade, comprovante de entrega, reservas, cálculo, revisão contábil e registro de XML. Guard de papel global não comprova isolamento organizacional em nenhum desses caminhos.
- Consulta viva das views diretamente dependentes confirmou `security_invoker=true` nas cinco retornadas: certificado, empresa, reconciliação, prontidão NF-e e estado de evento SEFAZ. Execução dessas views dentro de um definer continua exigindo escopo explícito.
- O índice singleton global existe em `pg_indexes`; sua ausência na lista de constraints não significa ausência de unicidade.
- `rpc_fiscal_certificate_register_a1` possui guard baseado em claim de papel, mas isso não substitui auditoria de ACL efetiva nem deve ser tratado como prova de ausência de exposição.
- Nenhuma migration H15 foi criada/submetida nesta continuação; nenhum ensaio transacional ou teste adversarial H15 foi executado. Não há evidência de aplicação automática H15. Não foi feita auditoria global de deploys automáticos.

## Contratos de escrita a preservar na implementação

- company_snapshot usa cnpj, legalName, crt, ie, uf, municipalityIbge, series e environment.
- H12 materializa snapshot no cálculo; draft legado pode inserir snapshot vazio ou fornecido no payload.
- company_cnpj e snapshot.cnpj precisam ser validados independentemente contra o emitente vinculado, sem aceitar ausência como prova de coerência de snapshot preenchido.
- created_by é obrigatório; usar profiles.user_id (não profiles.id) para vínculo com identidade autenticada.
- Proteção de vínculos secundários deve cobrir referências de notas/itens, XML/certificado/reserva, transmissão/XML/evento e documento protocolado/transmissão/XML.
- Não alterar políticas no-write/append-only nem conceder bypass novo. Service_role técnico não dispensa verificação de integridade.

## Verificações executadas

Comando: `bun run test -- src/test/config src/test/fiscal src/test/security`.

Captura: `set -o pipefail`, saída em `/tmp/h15-existing-tests.log`; status capturado imediatamente após o processo, antes de tail.

Resultado: **exit 0; 147 arquivos aprovados, 1 arquivo pulado; 2.145 testes aprovados e 4 pulados preexistentes**. Nenhum teste foi alterado. Esta suíte comprova regressão atual, não comprova H15 nem RLS multiempresa.

Sinal automático observado antes da entrega: build OK em 18/09/2026 18:22:49 UTC. Não foi executado build/typecheck manual. Não há evidência separada de typecheck nesta rodada.

As consultas usaram catálogos `information_schema.columns`, `pg_policies`, `pg_indexes`, `pg_constraint`, `pg_trigger`, `pg_proc` e `pg_get_functiondef`, além de contagens e marcador. Não foram exibidos documentos pessoais, tokens ou segredos. Duas consultas diagnósticas falharam: coluna environment inexistente (corrigida para environment_label) e EXECUTE de has_role indisponível para o leitor (substituído por contagem via join com user_roles).

## Pendências explícitas

1. Implementar as correções pontuais autorizadas, completando também o inventário transitivo das leituras SECURITY DEFINER.
2. Preparar migration H15 autocontida e rollback; validar e aplicar somente após os guards técnicos. Não é necessária nova aprovação de escopo.
3. Testes SQL comportamentais de isolamento, adversariais e concorrência, além de pós-check de schema/RLS/ACL e advisors security/performance. Não executados porque não houve alteração.
4. Revalidar contagens e marcador sob locks na futura migration; o baseline não substitui o guard transacional.

Não iniciado certificado, emissão, E2E fiscal ou próxima fase. **H15 incompleta, isolamento não certificado.**
## Implementação candidata — 19/09/2026 01:46 UTC

**Não aplicada. Não certificada para execução em produção.** O versionamento 20261038000000 está livre no ledger consultado. O SQL completo está em `restoration/fiscal-h15/20261038000000_h15_fiscal_company_isolation.sql`, fora de migrations até submissão pelo canal autorizado.

Implementados no candidato: locks e guard canônico/contagens/drift; vínculo organizacional NOT NULL do emitente; vínculo NOT NULL RESTRICT da nota; índices; 39 contratos classificados (reescrita integral de definições ou revogação técnica), 30 políticas conjuntivas preservando `fi_producer_read`; triggers de integridade, imutabilidade e vínculos secundários. Incluído bloqueio de alteração da organização por sessão pública, inclusive administrador: o guard existente de profiles permitia essa troca e invalidaria a fronteira organizacional.

Arquivos novos: SQL candidato; `function-changes.json`; `ROLLBACK.md`; `02-adversarial.sql`; `src/test/config/fiscalH15Isolation.test.ts`.

Validação executada: parser PostgreSQL aceitou 169 statements; parser PL/pgSQL aceitou funções não-trigger (serialização JSON do parser falha em RETURNS trigger, portanto estes exigem compilação real). Sete testes de contrato passaram; regressões: 2.152 aprovados, 4 skips preexistentes, exit 0. Build automático OK às 01:45:30 UTC. Esses resultados NÃO provam isolamento remoto.

Gates ainda abertos antes de submeter: compilar SQL completo contra schema vivo em transação revertida; executar matriz positiva/negativa e leitura do produtor; fechar cobertura transitiva/SQL dinâmico; revisar contratos de perfis administrativos auxiliares e ACLs técnicas; verificar audit_log e associações por mesma nota, não apenas mesmo emitente. O ensaio SQL preparado cobre duas identidades existentes, tabela, RPCs, imutabilidade e snapshot, mas não foi executado e não cobre ainda toda a matriz. Nenhuma escrita remota nem autoaplicação H15 ocorreu por este agente. Produção não habilitada; Edge Functions/config/secrets/types inalterados.

## Diagnóstico xsd-selftest — fiscal-xml-engine (19/09/2026 02:09 UTC)

**Código preparado, runtime ainda não comprovado.** Implementado no repositório, sem deploy e sem SQL remoto, um diagnóstico seguro e somente leitura do bundle XSD:

- `POST { "action": "xsd-selftest" }` aceito em `supabase/functions/fiscal-xml-engine/index.ts` após CORS, método, presença do Bearer, gate de projeto canônico e parse do body — antes das exigências de claims de usuário e perfil fiscal. Body parseado uma única vez; `generate` e `download` permanecem inalterados depois dos gates de identidade.
- O selftest valida um XML mínimo deliberadamente inválido (raiz `xsdSelfTestProbe`) via `validateAgainstOfficialXsd`, obrigando o carregamento dos 5 XSDs oficiais. Sucesso só quando o validador executa com `valid=false` e ao menos um erro; caso contrário (ou erro de assets), responde 500 com apenas `{ok:false,error:"XSD_BUNDLE_UNAVAILABLE"}`.
- Sucesso responde 200 somente com `ok, validator, package, schema, loadedFiles:5` — sem conteúdo XSD, caminhos locais, XML, JWT, secrets ou erros crus. A ação não lê nem escreve banco, Storage, certificado, assinatura ou transporte.
- `verify_jwt=true` e `static_files` do bundle permanecem em `supabase/config.toml`, não alterado.
- Testes: `src/test/fiscal/xmlEngineXsdSelftest.test.ts` (ordem dos gates, parse único, chamada real ao validador, fail-closed, metadados mínimos, ausência de acesso a banco/Storage, config.toml preservado).
- Pendência: executar o selftest contra o deploy real do canônico para comprovar o runtime; nenhuma Edge Function foi publicada nesta rodada.

## Correção XSD compilada — fiscal-xml-engine (19/09/2026 02:56 UTC)

**Evidência de runtime (v6).** Chamada POST `{"action":"xsd-selftest"}` com origem
oficial e chave pública válida retornou **HTTP 500 `{"ok":false,"error":"XSD_BUNDLE_UNAVAILABLE"}`**.
A API `get_edge_function` lista apenas os `.ts` do artefato implantado e omite os
5 `.xsd` e o `manifest.json`, apesar de `static_files` em `supabase/config.toml`:
o canal de deploy atual **não empacota arquivos estáticos**.

**Correção preparada (sem deploy, sem SQL, sem alteração de banco/certificado/transporte/secrets).**

- `scripts/generate-xsd-bundle.mjs` — gerador determinístico; confere cada arquivo
  contra `xsd/manifest.json` (SHA-256 + bytes) antes de emitir o módulo.
- `supabase/functions/fiscal-xml-engine/xsdBundle.ts` — **gerado**; exporta
  `XSD_BUNDLE` (readonly nome→conteúdo), `XSD_BUNDLE_ORDER`, `XSD_BUNDLE_SHA256`,
  `XSD_BUNDLE_PACKAGE_SHA256` e `XSD_BUNDLE_FILE_COUNT = 5`.
- `supabase/functions/fiscal-xml-engine/xsdValidate.ts` — carrega os 5 XSDs do
  módulo compilado; sem `Deno.readTextFile`, sem `import.meta.url`, sem rede.
  Ordem de preload, schema final `nfe_v4.00.xsd`, cache, sanitização de mensagens
  e API pública preservados; fail-closed com `XSD_BUNDLE_MISSING_FILE` /
  `XSD_BUNDLE_MISMATCH`.
- `supabase/functions/fiscal-xml-engine/xsd/` e `static_files` **mantidos** como
  fonte de auditoria; `verify_jwt = true` inalterado.
- `src/test/fiscal/xmlEngineXsdBundle.test.ts` — 14 testes: equivalência byte a
  byte de cada string embutida com o arquivo fonte e com o SHA-256 do manifesto,
  5 nomes exatos e ordem, ausência de disco/rede, fail-closed e API preservada.
  `xmlEngineXsdSelftest.test.ts` (12 testes) segue provando o fail-closed do
  `xsd-selftest` e a preservação de `verify_jwt`/`static_files`.

**Estado:** correção compilada preparada, **runtime ainda não comprovado** —
a comprovação depende de redeploy autorizado da função e nova chamada
`xsd-selftest` (esperado HTTP 200 com `loadedFiles: 5`). Nenhuma função foi
publicada nesta etapa.

## Correção de memória do validador XSD — fiscal-xml-engine (19/09/2026 03:03 UTC)

**Evidência de runtime (v8).** O artefato implantado já contém `xsdBundle.ts`
(o bundle compilado eliminou a ausência de arquivos), mas `xsd-selftest`
continuou respondendo **HTTP 500 `XSD_BUNDLE_UNAVAILABLE`**. A falha passou a
ser da execução do `xmllint-wasm`, cujo teto de memória default é 32 MiB —
insuficiente para o conjunto NF-e (~438 KB de XSD, `leiauteNFe_v4.00` ~350 KB).

**Correção preparada (sem deploy, sem SQL, sem alteração de config/secrets/certificado/transporte).**

- `xsdValidate.ts` — `validateXML` agora recebe `initialMemoryPages = 1024`
  (64 MiB) e `maxMemoryPages = 2048` (128 MiB), exportados como constantes.
- `xsdValidate.ts` — nova `inspectOfficialXsdBundle()`, somente leitura:
  executa apenas `loadBundle` e devolve `{ok, fileCount, schema}`, sem conteúdo.
- `index.ts` — o `xsd-selftest` passa a rodar a inspeção antes do validador e
  devolve apenas diagnóstico enum sanitizado junto do erro fixo:
  `XSD_BUNDLE_CHECK_FAILED` (inspeção) ou `XSD_VALIDATOR_MEMORY_OR_WASM_FAILED`
  (validador). Nenhuma mensagem, stack ou conteúdo cru é devolvido; o sucesso
  mantém exatamente `ok/validator/package/schema/loadedFiles: 5`.
- Testes: `xmlEngineXsdBundle.test.ts` (18) cobre inspeção 5/`nfe_v4.00.xsd` e
  os limites de memória dentro de 128 MiB; `xmlEngineXsdSelftest.test.ts` (14)
  cobre a ordem inspeção→validação e a sanitização do erro.

**Estado:** correção de memória e diagnóstico preparada, **runtime ainda
pendente** — comprovação só após redeploy autorizado e nova chamada
`xsd-selftest` (esperado HTTP 200 com `loadedFiles: 5`). Nada foi publicado.

## Troca do adaptador normativo XSD — fiscal-xml-engine (19/09/2026 13:5x UTC)

**Causa raiz comprovada no runtime:** `xmllint-wasm` instancia um Worker de
thread do Node por chamada; o isolamento da Supabase Edge Function não suporta
isso e o selftest respondia `XSD_VALIDATOR_MEMORY_OR_WASM_FAILED`. Elevar
memória não resolveu.

**Correção aplicada no repositório (sem deploy, sem SQL):**

- `supabase/functions/fiscal-xml-engine/xsdValidate.ts` — adaptador substituído
  por Apache Xerces-C++ WASM (`xerces-wasm@2.0.1`), síncrono e no MESMO
  processo: sem worker threads, subprocessos, FFI, rede em runtime ou serviço
  externo. Contrato público preservado (`validateAgainstOfficialXsd`,
  `inspectOfficialXsdBundle`, `XSD_FILE_COUNT`, `XSD_PACKAGE`, `XSD_VALIDATOR`).
- `supabase/functions/fiscal-xml-engine/xercesWasm.ts` (gerado) — binário WASM
  (2.181.054 bytes, SHA-256 `775d89b1…5019`) embutido em base64; nenhuma
  dependência de `static_files`, disco ou rede. Gerador reprodutível:
  `scripts/generate-xerces-wasm.mjs` (aborta em divergência de hash).
- `supabase/functions/fiscal-xml-engine/xsdBundleIntegrity.ts` (novo) — gate
  fail-closed por presença, ordem e SHA-256 dos 5 XSDs, executado ANTES da
  compilação. Necessário porque o compilador do Xerces tolera include ausente
  (compilaria gramática parcial). Sem qualquer fallback heurístico.
- Entry/imports: `nfe_v4.00.xsd` → `leiauteNFe_v4.00.xsd` → `tiposBasico`,
  `DFeTiposBasicos`, `xmldsig-core-schema`. Bundle XSD, hashes e ordem
  inalterados.
- `verify_jwt=true`, CORS/Origin, Bearer e gate de projeto canônico intactos;
  selftest continua sem banco, Storage, certificado, assinatura ou transporte.

**Provas locais:** validação normativa real executada em Node e em Deno
(`inspect → {ok:true, fileCount:5}`; XML inválido rejeitado com
`XSD_INVALID:xsdSelfTestProbe`; NF-e incompleta reprovada pelo modelo de
conteúdo do leiaute). Suítes fiscais/config/segurança: 2.201 aprovados, 4
pulados; typecheck e build OK.

**Estado:** correção preparada e provada localmente. Prova remota concluída
em seguida — ver seção abaixo.

### Endurecimento pós-Xerces — sanitização total das issues do validador

- `supabase/functions/fiscal-xml-engine/xsdSanitize.ts` (novo, módulo puro) —
  `toIssue` nunca devolve texto cru do Xerces: `message` é sempre a constante
  genérica `"documento incompatível com o schema XSD oficial"`; o código
  `XSD_INVALID:<nome>` carrega no máximo um nome de elemento/atributo validado
  por allowlist NCName (`^[A-Za-z_][A-Za-z0-9_.-]{0,63}$`, prefixo de
  namespace descartado, 64 chars máx.). Nenhum valor fiscal, trecho de XML,
  path, stack ou mensagem original é exposto. Módulo sem dependências de
  runtime para poder ser testado em Vitest.
- `supabase/functions/fiscal-xml-engine/xsdValidate.ts` — usa/reexporta a
  sanitização de `xsdSanitize.ts` (removido o recorte `raw.slice(0, 400)`).
- `supabase/functions/fiscal-xml-engine/index.ts` — somente comentários do
  selftest atualizados (Xerces/WASM em processo, diagnóstico de execução
  genérico); JSON/contrato intactos.
- Testes (`src/test/fiscal/xmlEngineXercesRuntime.test.ts`) — diagnósticos
  hostis injetados com valor fiscal fictício, trecho de XML, path, stack e
  namespace: nada vaza em issue, código ou selftest; allowlist de nome
  cobre namespace, vazio, espaços e excesso de tamanho.
- Prova Deno end-to-end pós-refatoração: issues retornam apenas
  `{"line":1,"code":"XSD_INVALID:xsdSelfTestProbe","message":"documento
  incompatível com o schema XSD oficial"}`.

## Prova remota do xsd-selftest — fiscal-xml-engine (19/09/2026, 14:11 UTC)

**Runtime comprovado no Supabase canônico `swzpzcwiasxmjutrmvkm`.** Registro
apenas documental — nenhum deploy, SQL ou alteração de código/config nesta
rodada. Histórico das falhas v6 (`XSD_BUNDLE_UNAVAILABLE` por ausência de
static_files), v8 (`XSD_BUNDLE_UNAVAILABLE` com bundle presente) e do ciclo
`xmllint-wasm`→`XSD_VALIDATOR_MEMORY_OR_WASM_FAILED` permanece válido acima;
todas foram resolvidas pela pilha Xerces-C++ WASM em processo.

**Execução:**

- `fiscal-xml-engine` versão 13, estado ACTIVE, `verify_jwt=true`.
- Artefato implantado: `ezbr_sha256`
  `eff4efd1fe45bbce8e3f6c68a70c32cc6109470b3386e9bf31af64b2d3ebf82b`.
- `POST {"action":"xsd-selftest"}` com Origin oficial e chave pública válida:
  **HTTP 200**.
- Resposta exata (não sensível):
  `{"ok":true,"validator":"xerces-wasm@2.0.1 (Apache Xerces-C++, XSD 1.0, in-process WASM)","package":"PL_010e_v1.02","schema":"nfe_v4.00.xsd","loadedFiles":5}`.

**Pós-check do banco (somente leitura):** `fiscal_invoices=0`,
`fiscal_certificates=0`, `fiscal_document_series=0`,
`fiscal_protocoled_documents=0`, `production_enabled_count=0`,
`canonical_safe_marker=1`. Nenhum documento, certificado ou transmissão foi
criado; a produção fiscal continua bloqueada. O selftest confirmou-se sem
leitura/escrita de banco, Storage, certificado, assinatura ou transporte.

**Estado final:** validação XSD normativa comprovada no runtime remoto.
Cadeia completa fechada: bundle compilado íntegro (5 XSDs, hashes) →
integridade fail-closed → Xerces-C++ WASM em processo → selftest HTTP 200
com `loadedFiles: 5` no canônico.

---

## H16 — índices de FK fiscais e initplan de RLS (19/09/2026)

**H16 APLICADA E AUDITADA no canônico `swzpzcwiasxmjutrmvkm`** (ledger vivo:
`20260919141609_h16_fiscal_fk_indexes_and_rls_initplan`). Repositório
sincronizado com a migration idêntica em
`supabase/migrations/20260919141609_h16_fiscal_fk_indexes_and_rls_initplan.sql`,
sem qualquer execução remota de SQL por este agente. Migration aditiva e
reversível; nenhuma mutação de dados.

- **16/16 índices covering de FK fiscais confirmados** (financial_documents,
  fiscal_events, fiscal_idempotency_keys, fiscal_invoices,
  fiscal_protocoled_documents, fiscal_sefaz_transmissions, fiscal_xml_runs).
- **Performance Advisor:** deixou de apontar as 16 FKs-alvo e o
  `auth_rls_initplan` da policy `fiscal_protocoled_documents_read`. A policy
  foi recriada com semântica preservada, agora com `(select auth.uid())`
  como initplan conjuntivo com `h15_invoice_access(fiscal_invoice_id)`.
- **`unused_index` imediato é esperado:** as tabelas fiscais estão vazias;
  não deve motivar remoção dos índices.
- **Pós-check (somente leitura):** `invoices=0`, `transmissions=0`,
  `protocoled=0`, `production_enabled=0`; produção fiscal continua bloqueada.
- **`fiscal_certificate_material` sem policy é deny-by-default deliberado.**
  Os helpers H15 autenticados restantes são dependências de RLS das políticas
  organizacionais; **não revogar em massa**.
- **Advisors gerais** fora do módulo fiscal permanecem fora desta fase.
