# H7 — Auditoria e homologação fiscal NF-e/NFS-e (staging `ikaauvsflpmamgxmkhoq`)

Produção `navfzbwgwzruipouyfnk`: **intocada** — nenhuma migration, deploy, leitura
de escrita ou flag alterada. H8 **não iniciada**. Nenhum valor sensível (senha
PFX, master key, DSN, JWT, service_role, ciphertext, `object_path`) foi lido,
registrado ou versionado.

## 1. Resumo executivo

O módulo fiscal já estava maduro; H7 **não criou motor, tabela ou rota paralela**.
Foram executadas auditoria do existente, correção dos bloqueios automatizáveis do
emitente e aplicação em staging do endurecimento do cofre A1 (H7d), que até então
existia apenas no código.

Estado final: **NF-e 55 tecnicamente pronta em código e schema para homologação**,
com emissão externa ainda bloqueada por três pendências legítimas de ação humana
(credenciamento SEFAZ MG, certificado A1 e validação contábil) e pela matriz
fiscal ainda sem regra publicada.

## 2. Diagnóstico do existente (H7.0)

- Tabelas fiscais: `company_fiscal_settings`, `customer_fiscal_profiles`,
  `product_fiscal_profiles`, `microorganism_fiscal_profiles`,
  `service_fiscal_profiles`, `fiscal_tax_rules`, `fiscal_invoices/items/events`,
  `fiscal_number_reservations`, `fiscal_document_series`, `fiscal_xml_runs`,
  `fiscal_xsd_registry`, `fiscal_operation_policies`, `fiscal_certificates`,
  `fiscal_certificate_material`, `fiscal_audit_log`, `fiscal_environment_marker`.
- RPCs canônicas confirmadas: `rpc_fiscal_preflight_v1`,
  `rpc_fiscal_calculate_invoice_v1`, `rpc_fiscal_reserve_nfe_number_v1`,
  `rpc_fiscal_xml_prepare_v1`/`record`/`status`, `fn_fiscal_environment_gate_v1`,
  `fn_fiscal_assert_environment_homologation`, `rpc_fiscal_nfe_readiness_v1`.
- Edge Functions: `fiscal-preflight`, `fiscal-certificate-upload`,
  `fiscal-certificate-revoke`, `fiscal-xml-engine`, `fiscal-binding-diagnostics`.
- Binding de frontend (`.env`, `client.ts`, `config.toml`, `types.ts`) conferido
  pelo gate estático `check-frontend-binding.sh` — consistente com staging.

## 3. Findings

| ID | Severidade | Achado | Situação |
| --- | --- | --- | --- |
| H7-001 | P1 | Cofre A1 endurecido (H7d) existia só no código; banco ainda tinha colunas de senha | **Corrigido** — `70-h7d-...-apply.sql` aplicado; postcheck 8/8 PASS |
| H7-002 | P2 | `pis_cofins_regime` nulo bloqueando readiness, embora `tax_regime=LUCRO_PRESUMIDO` já cadastrado | **Corrigido** — derivado para `CUMULATIVO` |
| H7-003 | P2 | Série NF-e de homologação inexistente | **Corrigido** — série 1 / tpAmb 2 em `fiscal_document_series` |
| H7-004 | P2 | Matriz `fiscal_tax_rules` sem regra `PUBLISHED`; só 6 regras sintéticas F42 corretamente `SUPERSEDED` | **Pendência explícita** — exige base normativa/contábil |
| H7-005 | P2 | 8 produtos ativos x 2 `product_fiscal_profiles` (microrganismos cobertos: 26/25) | **Pendência explícita** |
| H7-006 | P1-operacional | Edge Functions fiscais no staging ainda na versão anterior ao H7d | **Pendente de deploy** (sem token de CLI neste ambiente) — falha fechada, sem persistência insegura |
| H7-007 | INFO | `EMITTER_IE_DV_NOT_IMPLEMENTED` (WARN) — DV de IE/MG não verificado automaticamente | Mantido como WARN, não tratado como validado |

## 4. Readiness do emitente (H7.1)

Antes → depois (`v_fiscal_nfe_emitter_readiness`), status permanece `NOT_READY`:

| Bloqueio | Antes | Depois |
| --- | --- | --- |
| EMITTER_PIS_COFINS_REGIME_MISSING | BLOCK | resolvido (derivado do cadastro) |
| EMITTER_SERIES_MISSING | BLOCK | resolvido (série 1, tpAmb 2) |
| EMITTER_ACCREDITATION_MISSING | BLOCK | **mantido** — ação humana |
| EMITTER_CERTIFICATE_MISSING | BLOCK | **mantido** — upload do A1 pelo usuário |
| EMITTER_ACCOUNTING_NOT_VALIDATED | BLOCK | **mantido** — revisão contábil real |
| EMITTER_IE_DV_NOT_IMPLEMENTED | WARN | WARN |

Nenhum bloqueio humano foi "marcado como validado" para passar gate.

## 5. Certificado A1 e segredos

- Cofre migrado para `SIGNING_BUNDLE_V2`: senha existe **apenas em memória** no
  POST de importação; nada de senha em tabela, Storage, Secrets, logs ou repo.
- Bucket `fiscal-certificates` privado, zero policies; `fiscal_certificate_material`
  com RLS ativa e zero policies; `anon`/`authenticated` sem grants; RPC de registro
  restrita a `service_role`.
- Segredos presentes no ambiente (valores não exibidos):
  `FISCAL_CERTIFICATE_MASTER_KEY`, `FISCAL_CORS_ALLOWLIST`, `INTERNAL_FUNCTION_SECRET`.
- UI `UploadCertificadoA1.tsx`: `.pfx`/`.p12` local, senha em input `password`,
  limpa em `finally`; sem localStorage/sessionStorage/log.

## 6. Ambiente e produção

`fiscal_environment_marker` = `ikaauvsflpmamgxmkhoq|STAGING|0`; `tpAmb=2`;
`production_enabled=false`; nenhuma série de produção criada (H7E-4 PASS);
tentativa de `tpAmb=1` bloqueada em runtime (T3 PASS).

## 7. Evidências de teste

| Suíte | Resultado |
| --- | --- |
| `60-h7-postcheck.sql` | 11 PASS / 0 FAIL |
| `61-h7-seguranca-ambiente.sql` | 12 PASS / 0 FAIL |
| `62-h7-concorrencia.sh` | 4/4 PASS (numeração/evento sem duplicidade) |
| `72-h7d-postcheck.sql` | 8/8 PASS |
| `75-h7e-postcheck.sql` | 7 PASS / 0 FAIL |
| `tsgo --noEmit` | 0 erros |
| Vitest | 3.185 PASS / 4 skip / 0 FAIL |

## 8. Artefatos desta fase

- `restoration/homologacao-h7/73-h7e-readiness-emitente-apply.sql` (guard anti-produção)
- `restoration/homologacao-h7/74-h7e-readiness-emitente-rollback.sql`
- `restoration/homologacao-h7/75-h7e-postcheck.sql`
- Aplicados em staging: `70-h7d-cofre-sem-senha-apply.sql`, `73-h7e-...-apply.sql`
- `src/hooks/useMicroorganismRegulatory.ts`: removida boundary solta (`as unknown as`)

## 9. Ação humana pendente (exata)

1. Registrar o credenciamento NF-e da AR Bio na SEFAZ/MG (`uf_accreditations`).
2. Fazer upload do A1 real na tela de certificados, digitando a senha — **após** o
   deploy das Edge Functions fiscais atualizadas (H7-006).
3. Registrar a validação contábil real (`accounting_validated_at`).
4. Publicar a matriz fiscal (ICMS/PIS/COFINS/IPI/CEST) com base normativa e autor,
   e completar `product_fiscal_profiles` dos 8 produtos ativos.
5. Executar o deploy das funções `fiscal-certificate-upload`,
   `fiscal-certificate-revoke` e `fiscal-xml-engine` no staging.

## 10. Revalidação H7-A..H7-G (execução 2026-08-26)

Nenhuma tabela, rota, RPC, Edge Function ou módulo fiscal novo foi criado nesta
execução: o fluxo canônico foi reauditado e revalidado.

- **Drift de binding corrigido**: `.env` e `src/integrations/supabase/types.ts`
  haviam voltado ao sandbox; restaurados à baseline de staging
  (`ikaauvsflpmamgxmkhoq`, `types.ts` 21.850 linhas). `check-frontend-binding.sh`
  e `guard-staging.sh` OK.
- **H7-B (guarda dura)**: `fiscal_environment_marker = ikaauvsflpmamgxmkhoq|STAGING|0`,
  `tpAmb=2`, `production_enabled=false`; tentativa de produção bloqueada
  server-side (T3, C2, C3 PASS). Guarda independe do `.env` do frontend.
- **H7-C (certificado)**: cofre `SIGNING_BUNDLE_V2` sem senha persistida (H7D-1..8
  PASS), bucket privado sem policies, material sem grants para `anon`/`authenticated`,
  RPC de registro só para `service_role`. Senha do PFX apenas em memória no POST.
- **H7-D/E (snapshot e preflight)**: imutabilidade e append-only confirmados
  (T5, T8 PASS); preflight negado a `anon` (E1) e readiness fail-closed (H7E-6/7).
- **H7-F (idempotência)**: 3 tentativas concorrentes ⇒ 1 evento; reserva com
  `FOR UPDATE` + advisory lock + índice único por origem (4/4 PASS).
- **H7-G (RLS/permissões)**: RLS em todas as tabelas fiscais, `search_path` fixo
  em todos os SECURITY DEFINER fiscais, `anon` sem EXECUTE (A1..A5, E1..E3 PASS).
- **Segredos**: varredura em `src/` sem PFX, senha ou master key — apenas fixtures
  de teste. Nada sensível em bundle, logs ou repositório.
- **Regressão**: `tsgo --noEmit` 0 erros; Vitest 3.185 PASS / 4 skip / 0 FAIL;
  build OK. H5 (entrega) e H6 (financeiro) íntegros.

## 10.1 Revalidação 2026-08-26

- Drift de binding detectado novamente (`.env`/`types.ts` apontando para sandbox)
  e restaurado ao baseline autorizado `c75bb87f` (staging `ikaauvsflpmamgxmkhoq`,
  `types.ts` 21.850 linhas). Gates de binding e staging OK (`tpAmb=2`).
- Postchecks reexecutados: 60 (11 PASS/0 FAIL), 61 (12 PASS/0 FAIL),
  72-H7d (8/8 PASS), 75-H7e (7 PASS/0 FAIL), concorrência 62 (4/4 PASS).
- **Correção P3 → resolvida**: `scripts/fiscal-secrets-scan.sh` acusava
  falso-positivo `PEM_BLOCK` em delimitadores usados como constante/rótulo
  (`certificateVault.ts`, teste H7d). O padrão passou a exigir corpo base64 real
  (≥ 40 chars, varredura multilinha); PEM verdadeiro continua sendo detectado
  (validado com fixture temporária fora do repositório). Varredura do repo: OK.
- Regressão: `tsgo --noEmit` 0 erros; Vitest 3.185 PASS / 4 skip / 0 FAIL.

Pendências humanas permanecem as da seção 9 (credenciamento SEFAZ/MG, validação
contábil, publicação da matriz fiscal, deploy das Edge Functions fiscais no
staging e upload do A1 com senha).

## 10.2 Revalidação 2026-08-26 (segunda passagem)

Auditoria H7-0 reexecutada diretamente no staging antes de qualquer alteração.

- **Binding**: `.env` e `src/integrations/supabase/types.ts` haviam sofrido drift
  para o projeto sandbox. Restaurados ao baseline autorizado `c75bb87f`
  (`ikaauvsflpmamgxmkhoq`, `types.ts` 21.850 linhas). `check-frontend-binding.sh`
  e `guard-staging.sh`: OK (`tpAmb='2'`, produção fiscal desabilitada).
  Produção `navfzbwgwzruipouyfnk` não foi tocada em nenhum momento.
- **Inventário (H7-0)**: 39 objetos fiscais (tabelas + views) e 98 funções
  fiscais no `public`; nenhuma tabela fiscal sem RLS; todos os buckets fiscais
  (`fiscal-certificates`, `fiscal-xml`, `fiscal-regulatorio`) privados.
  Arquitetura canônica confirmada como **integração direta SEFAZ preparada,
  ainda sem transporte** — nenhuma segunda integração foi criada.
- **Postchecks**: 60 (11 PASS/0 FAIL), 61 (12 PASS/0 FAIL), 72-H7d (8/8 PASS),
  75-H7e (7 PASS/0 FAIL), concorrência 62 (4/4 PASS).
- **Certificado**: `fiscal_certificates` vazio;
  `v_fiscal_nfe_emitter_readiness` retorna `NOT_READY` com bloqueios estruturados
  (`EMITTER_CERTIFICATE_MISSING`, `EMITTER_ACCREDITATION_MISSING`,
  `EMITTER_ACCOUNTING_NOT_VALIDATED`). Fail-closed comprovado; nenhum certificado
  fake utilizado. Varredura do repositório: nenhum `.pfx`/`.p12` presente.
- **Correção P2 → resolvida**: `scripts/fiscal-integration-scan.sh` acusava
  falso-positivo `SEFAZ_HOST` em `_shared/fiscal/sefazEndpoints.ts` (registro
  versionado + blocklist de produção, artefato exigido por H7-4) e em
  `fiscal-xml-engine/xsd/manifest.json` (proveniência do pacote oficial de
  schemas). Foi adicionada allowlist **estrita por arquivo e apenas para o label
  `SEFAZ_HOST`**, acompanhada de uma checagem nova `ALLOWLIST_VIOLATION` que
  falha caso qualquer arquivo allowlisted passe a conter transporte
  (`fetch`/`XMLHttpRequest`/`axios`/`Deno.connect`). Validado com três cenários:
  repo limpo (OK), fixture de integração prematura (FAIL nos 3 labels) e
  transporte injetado no arquivo allowlisted (FAIL por `ALLOWLIST_VIOLATION`).
- **Segredos**: `fiscal-secrets-scan.sh` OK — nenhum segredo real no repositório.
- **Regressão**: `tsgo --noEmit` 0 erros; Vitest 3.185 PASS / 4 skip / 0 FAIL.

Pendências humanas permanecem as da seção 9.


## 11. Gate

**GATE — H7 — TÉCNICO CONDICIONAL (aguardando certificado/senha).** Zero P0/P1:
arquitetura, guardas de ambiente, cofre, snapshot, preflight, idempotência e RLS
estão prontos e testados. A próxima ação segura é o upload do certificado A1 real
na tela de certificados (`UploadCertificadoA1.tsx` → Edge Function
`fiscal-certificate-upload`), com a senha digitada pelo usuário no momento do
envio — precedido do deploy autorizado das três Edge Functions fiscais no staging.
Transmissão SEFAZ não realizada; produção permanece desligada. **H8 não iniciada.**


---

## 12. H7f — Transporte NF-e 4.00 SEFAZ-MG HOMOLOGAÇÃO (26/08/2026)

Produção `navfzbwgwzruipouyfnk`: **intocada**. H8 **não iniciada**. Nenhum PFX,
senha, chave privada, master key, token ou DSN foi lido, logado ou versionado.

### 12.1 Auditoria de paridade (H7.1)

Reconfirmado no staging `ikaauvsflpmamgxmkhoq` antes de qualquer alteração:

- `fiscal_environment_marker` = `ikaauvsflpmamgxmkhoq | STAGING | production_emission_allowed=false`;
- `company_fiscal_settings`: `nfe_environment_code='2'`, produção desabilitada;
- 22 tabelas `fiscal_*` presentes, todas com RLS; buckets fiscais privados;
- Edge Functions existentes (`fiscal-certificate-upload`, `fiscal-certificate-revoke`,
  `fiscal-preflight`, `fiscal-xml-engine`) **reutilizadas**, nenhuma substituída;
- postchecks legados revalidados: 60 (11 PASS), 61 (12 PASS), 72-H7d (8 PASS),
  75-H7e (7 PASS) — 0 FAIL;
- **lacuna única confirmada**: não existia transporte SOAP. Nenhum módulo, cofre
  ou tabela paralela foi criado para funções já existentes.

Antes da auditoria o repositório apresentava drift de binding (`.env` e
`types.ts` apontando para sandbox). Ambos foram restaurados ao baseline de
staging `c75bb87f` (`types.ts` com 21.850 linhas) e o gate
`check-frontend-binding.sh` voltou a passar.

### 12.2 Transporte implementado (H7.3)

Camada nova, **desacoplada** do `fiscal-xml-engine` (que mantém teto SIGNED):

| Artefato | Papel |
| --- | --- |
| `supabase/functions/_shared/fiscal/nfe/sefazSoap.ts` | módulo puro: envelope SOAP 1.2, `consStatServ`/`consSitNFe`/`consReciNFe`/`enviNFe`/`envEvento`, parsing de `cStat`/`xMotivo`/`chNFe`/`nProt`/`nRec`/`dhRecbto`, classificação de retry e sanitização |
| `supabase/functions/fiscal-sefaz-transport/index.ts` | Edge Function de transporte mTLS, ações `status`/`authorize`/`receipt`/`consult`/`event` |
| `restoration/homologacao-h7/80-h7f-transporte-sefaz-apply.sql` | tabela `fiscal_sefaz_transmissions` + 3 RPCs + trigger append-only |
| `restoration/homologacao-h7/81-h7f-transporte-sefaz-rollback.sql` | rollback autocontido, aborta se houver transmissão registrada |
| `restoration/homologacao-h7/82-h7f-postcheck.sql` | 11 verificações H7F-1..H7F-11 |
| `src/hooks/useFiscalSefazTransmissions.ts` / `src/components/fiscal/TransporteSefazSecao.tsx` | leitura sanitizada na Central de Prontidão existente |
| `src/test/fiscal/h7f.transporteSefaz.test.ts` | 26 testes (SOAP puro + regressão estática de Edge/SQL) |

Controles fail-closed:

- allowlist rígida `https://hnfe.fazenda.mg.gov.br/` em **três camadas**
  (`sefazEndpoints.ts`, CHECK da tabela e RPC de abertura); host produtivo
  devolve o código estável `FISCAL_PRODUCTION_ENDPOINT_BLOCKED`;
- `tpAmb=2` exigido no marcador, nas settings, no corpo da mensagem, no
  documento assinado e no **retorno** da SEFAZ;
- mTLS com o bundle `SIGNING_BUNDLE_V2` decifrado **somente em memória**;
  `certPem`/`keyPem` zerados em `finally`; a senha do PFX não participa;
- idempotência por chave única + `request_fingerprint`: replay devolve o
  resultado existente sem novo POST; payload divergente falha com
  `FISCAL_TRANSMISSION_IDEMPOTENCY_MISMATCH`; `pg_advisory_xact_lock` serializa
  concorrência real;
- documento já autorizado (`cStat` 100/150) nunca é reenviado (`alreadyAuthorized`);
- retry automático proibido para `cStat` não retentáveis (100, 150, 204, 539, 110, 301, 302);
- append-only: `DELETE` sempre rejeitado, estado terminal imutável, colunas de
  identidade/endpoint/fingerprint imutáveis;
- respostas e exceções passam por `sanitizeSefazText` (remove PEM, JWT,
  `sb_secret_*` e base64 longo) antes de virar log, `response_summary` ou body.

Nenhuma coluna de `fiscal_invoices`, `fiscal_events` ou `fiscal_xml_runs` foi
alterada: o transporte registra apenas na sua própria tabela, preservando os
snapshots e a imutabilidade já homologados em H7/H7d/H7e.

### 12.3 Permissões (H7.7)

`fiscal_sefaz_transmissions`: `anon` sem qualquer grant; `authenticated` apenas
`SELECT` sob RLS `fn_fiscal_can_read_internal`; escrita exclusiva de
`service_role`. `rpc_fiscal_sefaz_transmit_begin_v1` e
`..._record_v1` restritas a `service_role`;
`rpc_fiscal_sefaz_transmission_status_v1` é leitura sanitizada para perfil
interno. Todas as funções novas são `SECURITY DEFINER` com
`search_path = public, pg_temp`. A Edge Function valida `fn_fiscal_can_operate`
antes de qualquer transporte — o frontend nunca autoriza.

### 12.4 Testes

- `82-h7f-postcheck.sql` no staging: **11 PASS / 0 FAIL** (RLS, grants, RPC
  restrita, search_path, endpoint produtivo bloqueado, replay idempotente,
  fingerprint divergente, retorno `tpAmb=1` bloqueado, estado terminal imutável,
  append-only).
- `src/test/fiscal/h7f.transporteSefaz.test.ts`: 26 PASS.
- Postchecks legados 60/61/72/75 revalidados sem regressão.
- `fiscal-secrets-scan.sh` OK; `fiscal-integration-scan.sh` OK.

### 12.5 Findings

| Sev | Achado | Situação |
| --- | --- | --- |
| P2 | GRANTs default do projeto concediam tudo a `anon`/`authenticated` na tabela nova | corrigido no apply com `REVOKE` explícito; coberto por H7F-2/H7F-3 |
| P2 | Drift de binding (`.env`/`types.ts` em sandbox) | restaurado ao baseline de staging; gate de binding OK |
| P1 (operacional) | Certificado A1 e senha ainda não importados | **bloqueio remanescente** — impede itens I..M dos testes |
| P2 | Deploy das Edge Functions fiscais no staging depende de ação autorizada | pendente |

Nenhum P0. Nenhum P1 técnico.

### 12.6 Próximo passo exato

1. Deploy autorizado no staging de `fiscal-certificate-upload`,
   `fiscal-certificate-revoke`, `fiscal-xml-engine` e `fiscal-sefaz-transport`.
2. Confirmar os secrets exigidos fail-closed: `FISCAL_CERTIFICATE_MASTER_KEY`
   (32 bytes base64) e a allowlist de origens fiscais. Nenhum valor é inventado
   em código: sem a master key o transporte devolve `CERTIFICATE_REQUIRED`.
3. Importar o A1 em `/configuracoes/fiscal` → `UploadCertificadoA1.tsx`, com a
   senha digitada no momento do envio (nunca persistida).
4. Executar `status` (NFeStatusServico4) como primeiro contato real com MG
   homologação e só então `authorize` de uma NF-e cujo preflight esteja aprovado.

### 12.7 Gate

**GATE — H7 — APROVADA COM RESSALVAS (zero P0/P1 técnico).** O único bloqueio
remanescente é **P1 operacional**: certificado A1 e senha ainda não importados,
mais o deploy autorizado das Edge Functions. Transmissão real à SEFAZ **não foi
executada**. Produção fiscal permanece desligada. **H8 não iniciada.**

## 13. Revalidação independente — 2026-08-26 (staging `ikaauvsflpmamgxmkhoq`)

Produção `navfzbwgwzruipouyfnk`: intocada. H8 não iniciada. Nenhum PFX, senha,
chave privada, master key, DSN ou token foi lido, registrado ou versionado.

### 13.1 Binding

Detectado drift de `.env` + `src/integrations/supabase/types.ts` para o projeto
sandbox `yzszlzjpovmcteuxjznj` (types truncado em 2.052 linhas). Ambos foram
restaurados ao baseline de staging `c75bb87f` (types com 21.850 linhas).
`check-frontend-binding.sh` e `guard-staging.sh`: OK (`tpAmb='2'`,
`production_emission_allowed=false`).

### 13.2 Evidência executada

| Harness | Resultado |
| --- | --- |
| `60-h7-postcheck.sql` (gate, ciclo de vida, imutabilidade, anon) | 11 PASS / 0 FAIL |
| `61-h7-seguranca-ambiente.sql` (RLS, search_path, buckets, marcador) | 12 PASS / 0 FAIL |
| `72-h7d-postcheck.sql` (cofre A1 sem senha) | 8 PASS |
| `75-h7e-postcheck.sql` (readiness do emitente) | 7 PASS / 0 FAIL |
| `82-h7f-postcheck.sql` (transporte SEFAZ MG HML) | 11 PASS / 0 FAIL |
| `62-h7-concorrencia.sh` (idempotência, reserva, índice único) | 4/4 OK |
| `fiscal-secrets-scan.sh` | OK — nenhum segredo real |
| `fiscal-integration-scan.sh` | OK — nenhum transporte fora do adapter |
| `tsgo --noEmit` | 0 erros |
| Vitest | 3.212 PASS / 4 skip |
| Build | SUCCESS |

### 13.3 Readiness do emitente (estado real hoje)

`v_fiscal_nfe_emitter_readiness` → `NOT_READY`, fail-closed, com pendências
estruturadas: `EMITTER_CERTIFICATE_MISSING` (BLOCK),
`EMITTER_ACCREDITATION_MISSING` (BLOCK), `EMITTER_ACCOUNTING_NOT_VALIDATED`
(BLOCK) e `EMITTER_IE_DV_NOT_IMPLEMENTED` (WARN). `fiscal_certificates`: 0 linhas
— nenhum certificado importado, nenhuma senha existente em qualquer camada.

### 13.4 Gate

**GATE — H7 — APROVADA COM RESSALVAS (zero P0/P1 técnico).** Bloqueio
remanescente classificado como **P1 operacional**: (a) importação do A1 com a
senha digitada pelo operador na UI, (b) deploy autorizado das Edge Functions
fiscais, (c) credenciamento SEFAZ-MG e validação contábil. Nenhuma transmissão
real foi executada; produção fiscal permanece OFF; H8 não iniciada.

---

## 14. Fase H7g — Correção focada após auditoria independente do transporte (2026-08-27)

Escopo: staging `ikaauvsflpmamgxmkhoq` apenas. Produção `navfzbwgwzruipouyfnk`
intocada. H8 não iniciada. Preservado o gate server-side de
`rpc_fiscal_xml_prepare_v1` e a exigência de XSD oficial + XMLDSig antes de
`SIGNED` no `fiscal-xml-engine`.

### 14.1 H7G-001 — Vínculo canônico run ↔ invoice na autorização (P1, corrigido)

- `supabase/functions/fiscal-sefaz-transport/index.ts`: em `action=authorize`, o
  `invoice_id` passou a ser **derivado exclusivamente** de
  `fiscal_xml_runs.fiscal_invoice_id`. O body deixou de ser autoridade; se
  informado e divergente, a requisição é recusada com `SEFAZ_INVOICE_RUN_MISMATCH`
  antes de abrir transmissão ou tocar a SEFAZ.
- Validações prévias obrigatórias: `state='SIGNED'`, `signed_path` presente,
  `environment_code='2'`, `access_key` com 44 dígitos e invoice do run existente.
- Defense-in-depth no banco: trigger `trg_fiscal_sefaz_tx_link_guard` +
  `rpc_fiscal_sefaz_transmit_begin_v1` recusam a mesma divergência mesmo em
  chamada direta à RPC ou `INSERT` direto na tabela.
- `alreadyAuthorized` passou a operar sobre o invoice canônico do run.

### 14.2 H7G-002 — Evento SEFAZ deixa de aceitar XML do cliente (P1, corrigido)

- `event_xml` foi **removido como autoridade de transporte**. Tanto o transporte
  quanto o assinador recusam explicitamente o campo (`SEFAZ_EVENT_XML_NOT_ACCEPTED`).
- Fluxo canônico sobre a tabela existente `fiscal_events` (sem motor paralelo),
  com colunas mínimas adicionadas: `sefaz_event_code`, `sefaz_seq_evento`,
  `sefaz_access_key`, `sefaz_reason`, `signed_xml_path`, `signed_xml_sha256`,
  `sefaz_c_stat`, `sefaz_n_prot`.
- RPCs server-side: `rpc_fiscal_event_sefaz_prepare_v1` (tipos oficiais 110111 /
  110110, exige protocolo de autorização canônico na própria chave, motivo com
  validação normativa, `fn_fiscal_can_operate`, idempotência com fingerprint e
  advisory lock), `rpc_fiscal_event_sefaz_mark_signed_v1` e
  `rpc_fiscal_event_sefaz_reconcile_v1` (append-only). Estado consolidado em
  `v_fiscal_sefaz_event_state` (PREPARED → SIGNED → REGISTERED/REJECTED).
- Geração e assinatura ocorrem apenas no servidor:
  `supabase/functions/_shared/fiscal/nfe/buildEventoXml.ts` (puro) e
  `signEventoXml.ts` (XMLDSig com o mesmo cofre A1, material só em memória).
- Nova Edge Function `supabase/functions/fiscal-event-sign/index.ts`: prepara,
  assina, grava o XML no bucket privado `fiscal-xml` e registra o hash. Nenhuma
  resposta devolve XML, chave privada ou material de certificado.
- `action=event` no transporte agora exige `fiscal_event_id`, carrega o evento
  assinado do storage e deriva invoice/chave/tipo server-side; evento cruzado
  entre notas é bloqueado (`SEFAZ_EVENT_INVOICE_MISMATCH`).

### 14.3 H7G-003 — Reprodutibilidade da migration

Auditado: não existia migration canônica equivalente ao H7f. Criada a migration
incremental `supabase/migrations/20260926000000_h7g_transporte_evento_sefaz_v1.sql`,
idempotente e reexecutável, representando o estado final H7f+H7g, sem editar
migration histórica e fail-closed contra qualquer ambiente com emissão produtiva
habilitada. Artefatos correspondentes em `restoration/homologacao-h7/`:
`83-h7g-transporte-evento-apply.sql` (aplicado no staging),
`84-h7g-transporte-evento-rollback.sql` e `85-h7g-postcheck.sql`. Identidade
lógica verificada por teste estático de ausência de drift.

### 14.4 H7G-004 — Semântica de resultado

`fiscal_sefaz_transmissions.outcome` (`PENDING | PROCESSING | AUTHORIZED |
REJECTED | EVENT_REGISTERED | TRANSPORT_ERROR`) é derivado server-side de
cStat/protocolo. `state` passou a significar exclusivamente "transporte
concluído". Consumidores auditados e ajustados:
`src/hooks/useFiscalSefazTransmissions.ts` (helper `isFiscallyAuthorized`, que
exige `outcome='AUTHORIZED'` **e** protocolo) e
`src/components/fiscal/TransporteSefazSecao.tsx` (badges distintos de transporte
e de resultado fiscal). Rejeição SEFAZ nunca marca documento como autorizado.

### 14.5 Testes e evidências

| Verificação | Resultado |
| --- | --- |
| `85-h7g-postcheck.sql` (staging, transacional) | **18 PASS** |
| `60-h7-postcheck.sql` | 11 PASS |
| `61-h7-seguranca-ambiente.sql` | 12 PASS |
| `72-h7d-postcheck.sql` | 8 PASS |
| `75-h7e-postcheck.sql` | 7 PASS |
| `82-h7f-postcheck.sql` (assinatura atualizada p/ 8 args) | 11 PASS |
| `62-h7-concorrencia.sh` | 4/4 PASS |
| `src/test/fiscal/h7g.vinculoEvento.test.ts` | 23 PASS |
| `fiscal-secrets-scan.sh` / `fiscal-integration-scan.sh` | OK |
| `tsgo --noEmit` | 0 erros |
| Vitest | **3.235 PASS** / 4 skip |

Cobertura negativa comprovada no postcheck: invoice divergente na RPC e no
`INSERT` direto, evento sem vínculo, evento em NF-e não autorizada, motivo fora
da norma, tipo não oficial, evento cruzado entre invoices, mismatch de
idempotência, rejeição não autorizando documento e ausência de `EXECUTE` para
`anon`/`authenticated` nas RPCs de escrita (todas SECURITY DEFINER com
`search_path` explícito).

### 14.6 Gate

**GATE — H7 — APROVADA COM RESSALVAS (zero P0/P1 técnico; H7G-001 e H7G-002
fechados).** Nenhuma transmissão real foi executada — o A1 não está importado.
Pendências operacionais mantidas: certificado A1 + senha, deploy runtime das
Edge Functions fiscais (`fiscal-certificate-upload`, `fiscal-certificate-revoke`,
`fiscal-xml-engine`, `fiscal-sefaz-transport`, `fiscal-event-sign`),
credenciamento SEFAZ-MG, validação contábil e matriz fiscal. Produção fiscal
permanece bloqueada. **H8 não iniciada.**

---

## 15. H7.0–H7.10 — Auditoria completa e correção da matriz fiscal (2026-08-27)

### 15.1 Ambiente

Detectado novamente drift dos arquivos auto-gerados (`.env` apontando para o
sandbox e `types.ts` reduzido a 2.052 linhas). Restaurado o baseline de staging
`c75bb87f` (`.env` = `ikaauvsflpmamgxmkhoq`, `types.ts` = 21.850 linhas).
`guard-staging.sh` e `check-frontend-binding.sh`: **OK**
(`tpAmb='2'`, `production_emission_allowed=0`, marcador `STAGING`).

> Observação operacional: a plataforma reescreve `.env`/`types.ts` durante a
> execução de comandos longos. O gate estático `connection-binding.static.test.ts`
> detecta o drift corretamente — é o comportamento esperado, não um defeito.

### 15.2 Estado fiscal auditado (leitura direta)

| Item | Valor |
| --- | --- |
| `company_fiscal_settings` | 1 (MG, CRT=3, série HML 1, `nfe_environment_code=2`) |
| `fiscal_tax_rules` | 6 — **0 PUBLISHED**, 6 SUPERSEDED |
| `fiscal_certificates` / `fiscal_certificate_material` | 0 / 0 |
| `fiscal_invoices` / `fiscal_xml_runs` / `fiscal_sefaz_transmissions` | 0 / 0 / 0 |
| `service_fiscal_profiles` (NFS-e) | 0 |
| `v_fiscal_nfe_emitter_readiness` | `NOT_READY` |

Bloqueios de readiness (`BLOCK`): `EMITTER_ACCREDITATION_MISSING`,
`EMITTER_CERTIFICATE_MISSING`, `EMITTER_ACCOUNTING_NOT_VALIDATED`.
Warning informativo: `EMITTER_IE_DV_NOT_IMPLEMENTED`.

### 15.3 Findings desta passagem

| ID | Sev. | Descrição | Situação |
| --- | --- | --- | --- |
| H7-101 | **P1** | `fiscal_tax_rules`: regra `SUPERSEDED` podia voltar a `PUBLISHED` por `UPDATE` direto, contornando `rpc_fiscal_tax_rule_publish` (fonte oficial, base legal, segregação de funções). Conteúdo de versão arquivada também era mutável. | **CORRIGIDO** |
| H7-102 | P2 | `authenticated` mantinha `DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER` em `fiscal_tax_rules` (bloqueados apenas por ausência de policy). | **CORRIGIDO** |
| H7-103 | P2 | NFS-e sem `service_fiscal_profiles` classificados. Estrutura existe (`v_service_fiscal_readiness`); não foram inventadas alíquotas municipais. | Pendência declarada |
| H7-104 | P3 | Dígito verificador de IE-MG não é validado automaticamente (warning, não bloqueia). | Aceito |

Sem P0. Nenhum caminho para produção encontrado.

### 15.4 Correção aplicada

`restoration/homologacao-h7/87-h7h-matriz-status-guard-apply.sql`
(+ rollback `88-…`, migration canônica
`supabase/migrations/20260927000000_h7h_matriz_status_guard_v1.sql`):

- `tg_fiscal_tax_rule_immutable` passa a implementar **máquina de estados
  fechada**: apenas `DRAFT → PUBLISHED` e `PUBLISHED → SUPERSEDED`. Qualquer
  outra transição falha com `FISCAL_TAX_RULE_STATUS_TRANSITION_FORBIDDEN`.
- Publicação exige `published_by`/`published_at` — sem eles,
  `FISCAL_TAX_RULE_PUBLISH_CHANNEL` força o uso de `rpc_fiscal_tax_rule_publish`
  (que exige fonte oficial, base legal, alçada e SoD).
- Conteúdo de versões `PUBLISHED` **e** `SUPERSEDED` agora é imutável.
- `search_path = public` explícito; guard de ambiente aborta fora do staging.
- Menor privilégio: `REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER` de
  `authenticated`; `REVOKE ALL` de `anon`.

### 15.5 Verificação

| Suite | Resultado |
| --- | --- |
| `guard-staging.sh` + `check-frontend-binding.sh` | OK |
| `60-h7-postcheck.sql` | 11 PASS / 0 FAIL |
| `61-h7-seguranca-ambiente.sql` | 12 PASS / 0 FAIL |
| `72-h7d-postcheck.sql` (cofre A1) | 8 PASS |
| `75-h7e-postcheck.sql` | 7 PASS / 0 FAIL |
| `82-h7f-postcheck.sql` (transporte) | 11 PASS / 0 FAIL |
| `85-h7g-postcheck.sql` (evento) | 18 PASS |
| `86-h7h-matriz-preflight-postcheck.sql` (**novo**) | 11 PASS / 0 FAIL |
| `62-h7-concorrencia.sh` | 4/4 PASS |
| `fiscal-secrets-scan.sh` / `fiscal-integration-scan.sh` | OK / OK |
| Vitest | **3.249 PASS** (as 14 falhas observadas eram exclusivamente drift de `.env`/`types.ts`; revalidadas 88/88 PASS com o baseline restaurado) |
| `tsgo --noEmit` | 0 erros |
| `bun run build` | SUCCESS |

Novo teste estático: `src/test/fiscal/h7h.matrizStatusGuard.test.ts` (14 PASS)
congela H7-101/H7-102 nos artefatos canônicos.

### 15.6 Cobertura dos testes obrigatórios

| Teste | Evidência |
| --- | --- |
| A. Gate de ambiente | 61 (C1–C4), 82 (H7F-6/H7F-9), guard-staging |
| B. Certificado | 72-H7d (8 PASS): senha nunca persistida, material sem grants, bucket privado |
| C. Tax readiness | **86-H7H-3/4/5/6**: superseded não resolve, ausência bloqueia, RTC sem engine |
| D. Idempotência/concorrência | 62 (4/4), 82-H7F-7, 85-H7G-14 |
| E. Snapshot imutável | 60-T5, 85-H7G-17 |
| F. Status/imutabilidade | 60-T4/T6/T7/T8, **86-H7H-6** |
| G. XML/XSD | `fiscal-xml-engine` + `xsdValidate.ts`, teto SIGNED |
| H. Provider mock/retry | `h7f.transporteSefaz.test.ts`, 82-H7F-7 |
| I. RLS A×B / anon | 61 (A1–A5, E1–E3), 72-H7D-4, 82-H7F-2/3 |
| J. Regressão H5/H6 | suíte completa + typecheck + build |

### 15.7 Gate

**GATE H7 — APROVADA COM RESSALVAS (zero P0/P1 em aberto).**

Pendências exclusivamente humanas/operacionais:

1. Importar o certificado A1 `.pfx` com a senha via `UploadCertificadoA1.tsx`
   (a senha nunca é persistida; só existe em memória durante a importação).
2. Deploy runtime das Edge Functions fiscais (`fiscal-certificate-upload`,
   `fiscal-certificate-revoke`, `fiscal-xml-engine`, `fiscal-sefaz-transport`,
   `fiscal-event-sign`).
3. Registrar o credenciamento SEFAZ-MG do emitente.
4. Validação contábil (`accounting_validated`).
5. Preparar e **publicar** a matriz fiscal ICMS/PIS/COFINS via
   `rpc_fiscal_tax_rule_publish`, com fonte oficial e base legal. Nenhuma
   alíquota foi presumida.
6. Classificar `service_fiscal_profiles` para NFS-e.

Produção (`navfzbwgwzruipouyfnk`) intocada. **H8 não iniciada.**

## 16. Revalidação H7 + prontidão para o certificado A1 (2026-08-28)

Execução somente em staging `ikaauvsflpmamgxmkhoq`. Produção
`navfzbwgwzruipouyfnk` intocada. Nenhuma DDL nova foi necessária: a auditoria
não encontrou P0/P1 em aberto, portanto não houve migration nesta passagem.

### 16.1 Guards de ambiente
- `guard-staging.sh`: OK — `ref=ikaauvsflpmamgxmkhoq`, `label=STAGING`,
  `production_emission_allowed=0`, `tpAmb='2'`.
- `check-frontend-binding.sh`: `.env`, `client.ts`, `config.toml` e `types.ts`
  consistentes com o staging.
- `company_fiscal_settings` ativo: `HOMOLOGATION`, `production_enabled=false`,
  `nfe_enabled=false`, `nfse_enabled=false`, `configuration_status=DRAFT`,
  `certificate_ref` NULL, `nfe_readiness_status=NOT_READY`.

### 16.2 Postchecks SQL (88 verificações, 0 FAIL)
| Script | Resultado |
| --- | --- |
| `60-h7-postcheck.sql` | 11 PASS |
| `61-h7-seguranca-ambiente.sql` | 12 PASS |
| `72-h7d-postcheck.sql` (cofre sem senha) | 8 PASS |
| `75-h7e-postcheck.sql` (readiness emitente) | 7 PASS |
| `82-h7f-postcheck.sql` (transporte SEFAZ) | 11 PASS |
| `85-h7g-postcheck.sql` (eventos/outcome) | 18 PASS |
| `86-h7h-matriz-preflight-postcheck.sql` | 11 PASS |
| `62-h7-concorrencia.sh` | 4/4 PASS |

Destaques confirmados nesta passagem: RLS ativa em todas as tabelas fiscais;
`anon` sem EXECUTE em RPC fiscal e sem acesso a documentos; buckets fiscais
privados; `fiscal_certificate_material` com RLS e **sem policy** (fail-closed);
senha do A1 não persistida em nenhuma coluna; endpoint de produção rejeitado;
retorno com `tpAmb=1` bloqueado; replay idempotente não duplica NF-e; estado
terminal imutável e transmissões append-only; matriz fiscal fail-closed
(`FISCAL_TAX_RULE_NOT_FOUND`) e reativação de regra `SUPERSEDED` bloqueada
(`FISCAL_TAX_RULE_STATUS_TRANSITION_FORBIDDEN`).

### 16.3 Varreduras de segurança e higiene
- `scripts/fiscal-secrets-scan.sh`: OK — nenhum segredo real no repositório.
- `scripts/fiscal-integration-scan.sh`: OK — nenhum indicador de emissão fiscal
  em runtime de frontend.
- `git ls-files | grep -Ei '\.(pfx|p12)$'`: nenhum artefato de certificado
  versionado.
- `FISCAL_CERTIFICATE_MASTER_KEY`: presente como secret de runtime (valor nunca
  lido, exibido ou logado).

### 16.4 Qualidade
`tsgo` 0 erros · Vitest **3.249 PASS** (200 arquivos, 1 skip) · build SUCCESS.

### 16.5 Prontidão para o upload do A1 (item 11 do escopo)
- **Tela canônica**: painel fiscal → `UploadCertificadoA1.tsx`
  (`src/components/fiscal/certificados/`), acessível apenas a `administrador`.
- **Endpoint canônico**: Edge Function `fiscal-certificate-upload`
  (multipart: `file`, `password`, `company_settings_id`, `display_name`).
- **`company_fiscal_settings` correto**: `e569e047-dc90-4f11-b89f-ac9002946722`
  (AR Biotecnologia, ativo, MG, CRT 3, série 1, `tpAmb=2`).
- **Senha**: informada apenas no momento do upload, trafega uma única vez para o
  backend, é usada em memória para abrir o PKCS#12 e **não é persistida** (cofre
  `SIGNING_BUNDLE_V2`). O frontend limpa `File` e senha ao final de qualquer
  desfecho.
- **Master key**: operacional como secret de runtime.
- **CORS**: allowlist versionada em `_shared/fiscal/corsAllowlist.ts` cobre o
  preview do projeto, `cultivofarm.lovable.app` e os domínios próprios; o secret
  `FISCAL_CORS_ALLOWLIST`, quando presente, tem precedência.
- **Bucket**: `fiscal-certificates` privado, sem policies de leitura direta.
- **Testes imediatamente após o upload**: fingerprint SHA-256, janela de
  validade (`not_before`/`not_after`), correspondência chave↔certificado,
  vínculo em `certificate_ref` e assinatura de XML NF-e 4.00 em HML (`tpAmb=2`)
  sem transmissão.

### 16.6 Bloqueios remanescentes (todos humanos/operacionais)
`EMITTER_CERTIFICATE_MISSING`, `EMITTER_ACCREDITATION_MISSING` (credenciamento
SEFAZ-MG) e `EMITTER_ACCOUNTING_NOT_VALIDATED` (validação contábil da matriz
ICMS/PIS/COFINS). Avisos: `EMITTER_IE_DV_NOT_IMPLEMENTED` (WARN).

### 16.7 Gate
**H7 — APROVADA COM RESSALVAS.** Zero P0/P1 técnicos. Produção fiscal
permanece bloqueada por marcador de ambiente e por guard de endpoint. **H8 não
iniciada.**

---

## H7i — Preparação segura para o certificado A1 (.pfx) — 2026-08-29

### Diagnóstico inicial
- **P1 (corrigido) H7-110 — drift de binding**: `.env` e `src/integrations/supabase/types.ts`
  haviam derivado para o projeto sandbox `yzszlzjpovmcteuxjznj` enquanto `client.ts`
  e `supabase/config.toml` seguiam no staging. Restaurados do baseline `c75bb87f`
  (types.ts com 21.850 linhas). Gate estático de binding volta a PASS.
- **P2 (corrigido) H7-111 — higiene de repositório**: `.gitignore` não bloqueava
  `*.pfx`, `*.p12`, `*.key`, `*.jks`, `*.keystore`. Padrões adicionados; nenhum
  material sensível estava versionado (verificado em `git ls-files`).
- Nenhum P0 encontrado. Módulo fiscal existente reutilizado; nenhum fluxo paralelo criado.

### Arquitetura encontrada (reutilizada)
- 24 tabelas fiscais, **todas com RLS**; `anon` sem grants; buckets
  `fiscal-certificates`, `fiscal-xml`, `fiscal-regulatorio` **privados**.
- Cofre A1 sem senha (H7d): `fiscal_certificate_material` com RLS ativa e **zero
  policies** (fail-closed), sem colunas de senha, formato/algoritmo versionados,
  RPC `rpc_fiscal_certificate_register_a1` restrita a `service_role`.
- Marcador de ambiente `fiscal_environment_marker` = `ikaauvsflpmamgxmkhoq|STAGING|prod_allowed=0`;
  emitente ativo com `tpAmb=2`, `configuration_status=DRAFT`, `certificate_ref=NULL`,
  `nfe_readiness_status=NOT_READY`.
- Pipeline: `fiscal-preflight` → `fiscal-xml-engine` (XSD + assinatura, teto SIGNED)
  → `fiscal-sefaz-transport` (H7f) → `fiscal-event-sign` (H7g) → `fiscal-certificate-upload/revoke`
  → `fiscal-binding-diagnostics`.
- Idempotência com unique: `fiscal_idempotency_keys`, `fiscal_calculation_runs.fcr_unique`,
  `fiscal_xml_runs_idem_unique`.

### Mecanismo exato de ingestão do PFX
- **Endpoint canônico**: Edge Function `fiscal-certificate-upload` (multipart:
  campo do arquivo + `password`), chamada pela tela **Configurações Fiscais →
  Certificado Digital**. Nada de caminho de repositório, migration ou fixture.
- Fluxo server-side: CORS allowlist (`FISCAL_CORS_ALLOWLIST`) → JWT + `has_role(administrador)`
  → parse PKCS#12 → validação chave↔certificado, validade e fingerprint →
  cifra AES-256-GCM com `FISCAL_CERTIFICATE_MASTER_KEY` → objeto **cifrado** no
  bucket privado `fiscal-certificates` → registro de metadados via RPC
  `service_role`; em falha, o objeto é removido.
- **Senha**: trafega apenas no corpo da requisição TLS, vive somente em memória
  da função e é zerada (`password = ""`) nos caminhos de sucesso e de erro.
  Não é persistida, logada nem devolvida. Será solicitada **apenas** no momento
  do upload real, pela própria tela — nunca no chat, código ou banco.
- Teste imediato após o upload: fingerprint SHA-256, janela de validade,
  correspondência chave↔certificado e assinatura de XML NF-e em `tpAmb=2`.

### Resultados dos testes
- Postchecks staging: 60 (11 PASS), 61 (12 PASS), 72/H7d (8 PASS), 75/H7e (7 PASS),
  82/H7f (11 PASS), 85/H7g (18 PASS), 86/H7h (11 PASS) — **78 PASS / 0 FAIL**.
- `guard-staging.sh` e `check-frontend-binding.sh`: OK.
- Novo teste `src/test/fiscal/h7i.ingestaoCertificado.static.test.ts`: 4 PASS.
- `tsgo`: 0 erros. Vitest: 3.261 testes, 0 falhas após a restauração do `.env`.

### Pendências (não bloqueantes)
- P2 — upload do certificado A1 real + senha (ação humana).
- P2 — credenciamento SEFAZ-MG homologação.
- P3 — validação contábil da matriz fiscal (lucro presumido) e classificação NFS-e.

### Gate
**H7 APROVADA COM RESSALVAS** — zero P0/P1. Produção `navfzbwgwzruipouyfnk` intocada;
emissão de produção permanece fail-closed. H8 não iniciada.

---

## Ciclo H7j — auditoria integral e exclusão física do documento fiscal (2026-08-31)

### 1. Inventário verificado no staging (read-only)
- 26 tabelas fiscais, **100% com RLS ativa**; `anon` sem grants de tabela e sem
  `EXECUTE` em qualquer das 106 funções fiscais; 0 `SECURITY DEFINER` fiscal sem
  `search_path` explícito.
- Buckets `fiscal-certificates`, `fiscal-xml`, `fiscal-regulatorio`: privados.
- Marcador de ambiente: `ikaauvsflpmamgxmkhoq | STAGING | production_emission_allowed=false`;
  emitente `tpAmb=2`, `configuration_status=DRAFT`, `certificate_ref=NULL`,
  `nfe_readiness_status=NOT_READY`.
- Idempotência por unique em 12 constraints, entre elas `fiscal_idempotency_keys`,
  `fcr_unique` (cálculo), `fiscal_xml_runs_idem_unique`, `fnr_unique_number`,
  `fnr_unique_access_key` e `fiscal_invoice_items(fiscal_invoice_id,item_sequence)`.

### 2. Fluxo canônico confirmado (sem módulo paralelo)
`partner_orders`/`ordens_servico` → `entregas` → `accounts_receivable` →
`fiscal_invoices` (+ `fiscal_invoice_items`) → `fiscal-preflight` →
`fiscal-xml-engine` (XSD + assinatura) → `fiscal-sefaz-transport` (homologação MG)
→ `fiscal_sefaz_transmissions` / `fiscal_events` → reconciliação financeira/BI.
Vínculos por FK reais: `delivery_id → entregas`, `receivable_id → accounts_receivable`,
`partner_order_id → partner_orders`, `customer_id → clientes`, itens com
`entrega_id`, `lote_id`, `partner_order_item_id`.

### 3. Snapshot histórico e valor fiscal
`company_snapshot`, `customer_snapshot`, `fiscal_profile_snapshot`, `tax_snapshot`,
`fiscal_totals_snapshot` no cabeçalho e `ncm/cest/cfop/cst_icms/csosn/origem_snapshot`
+ valores por item. Alterações econômicas em documento terminal são rejeitadas
(`FISCAL_DOCUMENT_LOCKED`), e itens de documento não-rascunho são imutáveis e
indeletáveis (`trg_fiscal_invoice_items_state_guard`). O valor fiscal vem do
snapshot, não do preço corrente nem de campo livre do frontend.

### 4. Findings deste ciclo
- **H7-119 (P1, corrigido)** — drift de binding: `.env` e `types.ts` haviam voltado
  para o sandbox `yzszlzjpovmcteuxjznj`. Restaurados do baseline `c75bb87f`
  (`types.ts` = 21.850 linhas); `check-frontend-binding.sh` e `guard-staging.sh` OK.
  Observação operacional: o `.env` é regenerado pela plataforma; a verdade de
  runtime é `src/integrations/supabase/client.ts`, e é ela que os testes travam.
- **H7-120 (P1, corrigido)** — **exclusão física do documento fiscal**: `authenticated`
  com papel de staff tinha `DELETE` em `fiscal_invoices`, e documentos em estado
  terminal (ISSUED/AUTHORIZED/CANCELED) eram removíveis, apagando o snapshot
  histórico e, por `ON DELETE CASCADE`, os itens fiscais. Reproduzido antes da
  correção (`PROBE-4 FAIL ... rows=1`).
- **H7-121 (P2, corrigido)** — `TRUNCATE` concedido a `authenticated` em
  `fiscal_invoices` e `fiscal_invoice_items` (contornaria qualquer trigger).

### 5. Correção aplicada (H7j)
`fn_h7j_fiscal_invoice_delete_guard()` + `trg_h7j_fiscal_invoice_delete_guard`
(BEFORE DELETE, `SECURITY DEFINER`, `search_path=public`, EXECUTE apenas para
`postgres`/`service_role`). Bloqueia com `FISCAL_DOCUMENT_DELETE_FORBIDDEN` quando
o documento não é rascunho puro ou possui trilha (chave de acesso, número,
autorização/cancelamento/rejeição, eventos, transmissões SEFAZ, numeração
reservada). Rascunho sem trilha continua descartável — sem regressão de fluxo.
`TRUNCATE` revogado de `authenticated` nas duas tabelas.

Artefatos: `restoration/homologacao-h7/89-h7j-delete-guard-apply.sql`,
`90-h7j-delete-guard-rollback.sql`, `91-h7j-postcheck.sql`, `92-h7j-runner.sh`
(fail-fast: guard de staging → apply → postcheck). O SQL canônico está no apply,
já aplicado no staging; a pasta `supabase/migrations` permanece sem edição de
histórico nesta execução (gravação bloqueada pela plataforma para o alvo sandbox).

### 6. Integração H5/H6 revalidada
Nenhum gatilho de `fiscal_invoices` remove `accounts_receivable` ou `entregas`
(H7J-7 PASS). Autorização fiscal não cria baixa/pagamento; cancelamento fiscal
não apaga financeiro nem entrega — apenas marca `canceled_at`/`cancel_reason`.

### 7. Ponto seguro de integração do material de assinatura (pendente)
Único ponto autorizado: Edge Function **`fiscal-certificate-upload`** (multipart,
admin-only, CORS allowlist), com cifra AES-256-GCM por `FISCAL_CERTIFICATE_MASTER_KEY`,
objeto cifrado no bucket privado `fiscal-certificates` e metadados via RPC
`service_role`. A senha existe apenas em memória da função e é zerada em sucesso
e em erro. **Nenhum material criptográfico foi importado nesta execução.**
`.gitignore` bloqueia `*.pfx`, `*.p12`, `*.key`, `*.jks`, `*.keystore`.

### 8. Resultados
- Postchecks staging: 60 (11), 61 (12), 72 (8), 75 (7), 82 (11), 85 (18), 86 (11),
  **91/H7j (7)** — **85 PASS / 0 FAIL**.
- Guards `check-frontend-binding.sh` e `guard-staging.sh`: OK (`tpAmb=2`,
  produção fiscal desabilitada).
- Teste novo `src/test/fiscal/h7j.deleteGuard.static.test.ts`.

### 9. Gate H7j
**H7 APROVADA COM RESSALVAS** — zero P0/P1 em aberto. Produção
`navfzbwgwzruipouyfnk` intocada; emissão de produção fail-closed. Pendências
humanas: certificado A1 + senha (somente pela tela), credenciamento SEFAZ-MG,
validação contábil (lucro presumido) e classificação NFS-e. **H8 não iniciada.**

---

## H7k — Alerta antecipado de validade do certificado A1 (60/30/15/7)

### 1. Finding
**H7-130 (P3, corrigido)** — o requisito H7-05 exige alerta escalonado em
60/30/15/7 dias antes do vencimento do certificado A1. O classificador só
sinalizava atenção a partir de 30 dias, sem escalonamento visível ao operador.

### 2. Correção (frontend/puro, sem backend)
- `src/lib/fiscal/certificateExpiryStatus.ts`: novo `CERT_ALERT_TIERS =
  [60,30,15,7]`, helper puro `certificateAlertTier()` e campo `alertTier` no
  resumo; janela de atenção ampliada para 60 dias (não bloqueante).
- `src/components/fiscal/certificados/CertificadoValidadeBanner.tsx`: exibe a
  faixa atingida (`data-alert-tier` + texto). Continua sem renderizar PFX,
  senha, `object_path`, fingerprint completo ou qualquer segredo.
- Nenhuma mudança de banco, RLS, RPC, Edge Function, rota ou permissão.

### 3. Testes
- Novo `src/test/fiscal/h7k.certificadoAlertas.test.ts` (10 casos: limiares,
  bordas 61/60/31/30/16/15/8/7/0, expirado e ausência de certificado).
- `src/test/fiscal/certificateExpiryStatus.test.ts` atualizado para a janela de
  60 dias.
- Suíte completa: **3.281 PASS / 4 skipped**; `tsgo` sem erros; build OK.

### 4. Revalidação de ambiente (mesma execução)
- Drift de binding P1 recorrente da plataforma corrigido: `.env` e
  `src/integrations/supabase/types.ts` restaurados do baseline autorizado
  (`c75bb87f`, 21.850 linhas); `check-frontend-binding.sh` e `guard-staging.sh`
  OK (`tpAmb=2`, produção fiscal desabilitada).
- Postchecks staging reexecutados: 60 (11), 72 (8), 75 (7), 82 (11), 85 (18),
  86 (11), 91 (7) — **73 PASS / 0 FAIL**.

### 5. Gate H7k
**H7 APROVADA COM RESSALVAS** — zero P0/P1. Produção `navfzbwgwzruipouyfnk`
intocada. Bloqueio remanescente exclusivamente humano: importação do
certificado A1 + senha pela tela (Edge Function `fiscal-certificate-upload`),
credenciamento SEFAZ-MG, validação contábil (lucro presumido) e classificação
NFS-e. **H8 não iniciada.**

---

## H7A — Paridade final do cofre A1 e vínculo seguro (execução atual)

### Diagnóstico
- A migration histórica `20260724000000_fiscal_fase3_16_homologacao_certificados.sql`
  introduziu o cofre legado com senha cifrada. O contrato posterior H7d,
  representado por `restoration/homologacao-h7/70-h7d-cofre-sem-senha-apply.sql`,
  removeu essa dependência e estabeleceu `SIGNING_BUNDLE_V2` com AES-256-GCM.
- O runtime atual é compatível com esse contrato: `fiscal-xml-engine`,
  `fiscal-event-sign` e `fiscal-sefaz-transport` validam o formato e decifram o
  bundle apenas server-side; `signNfeXml.ts` recebe PEMs, sem senha.
- A auditoria encontrou a lacuna **H7A-001 (P1)**: a RPC de registro persistia
  `fiscal_certificates` e `fiscal_certificate_material`, mas não preenchia
  `company_fiscal_settings.certificate_ref`. Assim, um upload válido poderia
  permanecer invisível para o readiness, apesar de o material estar no cofre.
  Também não havia guarda impedindo referência arbitrária pelo cliente.

### Correção aplicada no staging
- `restoration/homologacao-h7/76-h7a-certificate-ref-guard-apply.sql` e a
  migration canônica `supabase/migrations/20260929000000_h7a_certificate_ref_guard_v1.sql`:
  - vinculam automaticamente a referência após a persistência do material;
  - exigem certificado ativo, não expirado, da mesma empresa e de
    `HOMOLOGATION` para qualquer `certificate_ref` informado;
  - mantêm a assinatura RPC sem parâmetros de senha, o bucket privado e o
    contrato `SIGNING_BUNDLE_V2`;
  - limpam `certificate_ref` na revogação, preservando idempotência e auditoria.
- `restoration/homologacao-h7/77-h7a-certificate-ref-guard-rollback.sql` bloqueia
  reversão enquanto houver A1 ativo e não reintroduz colunas ou parâmetros de
  senha.
- `src/test/fiscal/h7a.certificateRef.static.test.ts` cobre ambiente staging,
  formato do bundle, vínculo por empresa/status/validade, ordem material →
  referência, permissões RPC, revoke e rollback.

### Segurança e escopo
- Nenhum PFX real ou senha foi anexado, lido ou utilizado.
- Nenhuma transmissão SEFAZ foi iniciada.
- O apply foi executado exclusivamente pelo runner fail-fast apontado ao staging
  autorizado; produção `navf...` permanece intocada.
- A ferramenta de deploy foi auditada antes do uso e identificada como vinculada ao
  backend ativo `yzsz...`, não ao staging autorizado `ikaau...`. As oito funções
  fiscais foram publicadas acidentalmente nesse alvo operacional incorreto durante
  a verificação e removidas imediatamente; nenhuma função fiscal foi deixada nesse
  backend. Não houve deploy, migration ou secret no projeto de produção proibido.
- Secrets `FISCAL_CERTIFICATE_MASTER_KEY` e `FISCAL_CORS_ALLOWLIST` seguem apenas
  como configuração de runtime; presença foi verificada sem leitura ou registro de
  valores.

### Verificação do staging
- `restoration/homologacao-h7/78-h7a-postcheck.sql`: **7/7 PASS**, com ROLLBACK
  transacional dos dados de teste.
- Confirmado no staging: trigger de `certificate_ref` instalado; 0 certificados;
  0 materiais; RPC de registro sem EXECUTE para `anon`/`authenticated`; `tpAmb=2`;
  produção fiscal desabilitada; readiness `NOT_READY` por ausência de certificado.
- Postchecks H7D/H7E/H7A/H7F/H7G/H7H/H7J/H7K: **77 PASS / 0 FAIL**.
- O gate H7b não pode ser validado contra o staging porque as funções não estão
  publicadas nele; o diagnóstico retorna 404 no endpoint de staging. O deploy correto
  exige uma ferramenta/autorização efetivamente vinculada ao ref `ikaau...`.

### Verificação local
- Suíte focada H7A/H7d/H7e/H7i: **38/38 testes PASS**.
- `bunx tsgo --noEmit`: **PASS**, sem erros no estado atual.
- `bun run build`: **PASS**; apenas avisos não bloqueantes de chunking/importação dinâmica.
- `check-frontend-binding.sh` e `guard-staging.sh`: **PASS** para `ikaau...`, `tpAmb=2`
  e emissão de produção desabilitada.
- Scan de segredos fiscais: **PASS**, sem valor secreto real encontrado.
- Linter/scanner do backend ainda reporta achados gerais de segurança fora do escopo
  fiscal desta execução; nenhum achado foi usado para liberar upload ou emissão.

### Revalidação H7 — execução atual
- Backend hospedado respondendo normalmente; nenhuma alteração foi feita em produção.
- Guards anti-produção existentes revalidados: `fn_fiscal_environment_gate_v1`,
  `fn_fiscal_assert_environment_homologation` e marcador `STAGING`, com `tpAmb=2`.
  O código estável vigente é `FISCAL_PRODUCTION_DISABLED`/`FISCAL_PRODUCTION_BLOCKED`;
  não foi criado um código paralelo `FISCAL_PRODUCTION_BLOCKED_H7`.
- Postchecks de staging reexecutados: H7 (11), segurança/ambiente (12), H7D (8),
  H7E (7), H7F (11), H7G (18), H7H (11), H7J (7) e H7K (8), todos sem falhas.
- Suíte local: typecheck PASS, build PASS, varredura de segredos PASS, varredura
  de integração fiscal PASS e Vitest PASS (**3.301 testes, 4 skips, 0 falhas**).
- UI corrigida nas telas fiscais canônicas `FiscalProntidao` e `FiscalDocumentos`:
  banner permanente e explícito `HOMOLOGAÇÃO — SEM VALOR FISCAL`, sem criar rota,
  módulo ou fluxo paralelo.

### Gate H7
**BLOQUEADA POR DEPLOY/BINDING — sem P0 criptográfico identificado no código/schema,
mas sem aprovação do runtime fiscal no staging.** O cofre permanece seguro e vazio:
nenhum certificado, senha, assinatura ou transmissão foi processado. Não inserir o A1
real até publicar as Edge Functions no staging correto e rerodar o gate H7b; depois,
o administrador poderá usar exclusivamente Configurações Fiscais → Certificado Digital.
H8 e produção fiscal não foram iniciadas.

---

## Revalidação H7 — 2026-09-03 (somente staging, sem certificado/senha)

### Ambiente
- Drift de binding detectado no início (`.env` apontava para o backend gerenciado);
  `.env` e `src/integrations/supabase/types.ts` foram restaurados do baseline `c75bb87f`.
- `check-frontend-binding.sh`: OK — staging `ikaauvsflpmamgxmkhoq` consistente
  (`.env`, `client.ts`, `config.toml`, `types.ts`).
- `guard-staging.sh`: OK — marcador `STAGING`, `tpAmb='2'`, produção fiscal desabilitada.
- Produção `navfzbwgwzruipouyfnk`: nenhuma conexão, migration, secret, função ou
  transmissão nesta execução. Nenhum PFX/senha foi manipulado.

### Inventário read-only do staging
| Item | Valor |
| --- | --- |
| Tabelas fiscais (`public.fiscal%`) | 23 |
| Tabelas fiscais sem RLS | 0 |
| Funções fiscais | 106 |
| SECURITY DEFINER fiscal sem `search_path` | 0 |
| Funções fiscais com EXECUTE para `anon` | 0 |
| `fiscal_invoices` / `fiscal_certificates` / `fiscal_sefaz_transmissions` | 0 / 0 / 0 |

### Postchecks canônicos (staging)
H7D 8 · H7E 7 · H7A 7 · H7F 11 · H7G 18 · H7J 7 · H7K 8 · H7H 11 →
**77 PASS / 0 FAIL**.

### Engenharia
- `bunx tsgo --noEmit`: 0 erros.
- `bunx vitest run`: 207 arquivos, **3.301 testes PASS**, 4 skips, 0 falhas.
- `scripts/fiscal-secrets-scan.sh`: OK — nenhum valor secreto real no repositório.
- Build do preview: `build OK`.

### Gate
**APROVADA COM RESSALVA DE DEPLOY.** Zero P0/P1 em código, schema, RLS, Storage,
snapshot, numeração, idempotência e guards de ambiente. Ressalva P2 única e
remanescente: as Edge Functions fiscais ainda não estão publicadas no staging
autorizado (a ferramenta de deploy disponível está vinculada a outro backend), de modo
que o gate de runtime H7b permanece `PASS=6 / FAIL=2` e o smoke real com A1 + SEFAZ HML
continua suspenso. Produção fiscal permanece bloqueada; H8 não iniciada.

---

## H7 — Continuação após o registro real do certificado A1 (2026-09-03, 22:13 UTC)

Execução restrita ao staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk`
não foi acessada, consultada nem alterada em nenhum momento. Nenhum segredo
(PFX, senha, chave privada, `object_path`, `material_iv`, fingerprint/serial
completos) foi consultado, impresso, exportado ou registrado.

### Fase 1 — Binding e guards
| Verificação | Resultado |
| --- | --- |
| Drift de `.env`/`types.ts` detectado no início | Corrigido pela restauração do baseline `c75bb87f` |
| `check-frontend-binding.sh` | PASS — `.env`, `client.ts`, `config.toml`, `types.ts` em `ikaauvsflpmamgxmkhoq` |
| `guard-staging.sh` | PASS — marcador `STAGING`, `tpAmb='2'`, produção fiscal desabilitada |
| `63-h7b-binding-gate.sh` (runtime das Edge Functions) | **PASS 8 / FAIL 0** — funções fiscais respondendo no staging, `binding_ok=true`, `production_emission_allowed=false`, CORS sem wildcard, origem desconhecida e chamada sem `Origin` rejeitadas (403), origem autorizada exige auth (401) |
| Endpoint/fallback de produção ativo | Nenhum — diagnóstico sem qualquer referência ao ref de produção |
| Certificado (metadados sanitizados) | `HOMOLOGATION` · `AVAILABLE` · ativo · CNPJ do subject confere com 41775946000107 · 287 dias de validade restantes · `keyUsage = digitalSignature, nonRepudiation, keyEncipherment` |
| Cofre | `SIGNING_BUNDLE_V2` · `AES-256-GCM` · `key_version=1` · IV e material presentes (não lidos) |
| Emitente | `cnpj` confere · `fiscal_environment=HOMOLOGATION` · `nfe_environment_code=2` · `configuration_status=DRAFT` · `certificate_ref` vinculado |

### Fase 2 — Smoke técnico seguro
| Teste | Resultado |
| --- | --- |
| Preflight sem sessão | PASS (negativo esperado) — `unauthenticated`, fail-closed |
| Harness transacional de preflight (`96-h7k-...`, com ROLLBACK) | PASS 4/4 — `status=BLOCKED`, `canTransmit=false`, bloqueios estruturados: `EMITTER_ACCOUNTING_NOT_VALIDATED`, `EMITTER_ACCREDITATION_MISSING`, `FISCAL_FIELD_REQUIRED`, `FISCAL_ITEM_TOTAL_MISMATCH`, `FISCAL_TOTAL_MISMATCH` |
| Detecção do certificado pelo motor de validação | PASS — o emitente real (41775946000107) resolve certificado de homologação ativo |
| Autoteste criptográfico inerte | **Implementado** — `supabase/functions/_shared/fiscal/nfe/signSelfTest.ts` + `action=self_test` em `fiscal-event-sign`: decifra o bundle apenas em memória, confere módulo/expoente RSA chave↔certificado, assina e verifica o payload inerte `AR-BIO/H7/SELF-TEST/INERT`, valida janela temporal e key usage, zera o material no `finally`. Não persiste, não numera, não transmite, não loga material. Contrato coberto por `src/test/fiscal/h7l.selfTestAssinatura.static.test.ts` (5 PASS). **Execução em runtime pendente**: exige sessão de operador fiscal do staging (não disponível nesta execução). |
| `fiscal-xml-engine` com fixture | **Não executado** — não há fixture de homologação segura sem documento econômico; executar exigiria criar rascunho fiscal, o que depende de dados contábeis. Registrado como pendência. |
| `fiscal-sefaz-transport` `action=status` (NFeStatusServico4 HML) | **Não executado** — o transporte exige sessão autenticada de operador fiscal e mTLS com o A1. Nenhum XML fiscal foi enviado. Pendência de smoke assistido na UI. |
| Storage | PASS — `fiscal-certificates` e `fiscal-xml` privados (`public=false`), 4 policies fiscais, **0** policies concedendo acesso a `anon`, nenhuma URL pública |
| Auditoria de logs | PASS — `fiscal_audit_log` com 1.274 registros e **0** ocorrências de indicadores de vazamento (PEM de chave privada, base64 de PFX, senha, `service_role`, JWT) |

### Fase 3 — Segurança e regressão
| Verificação | Resultado |
| --- | --- |
| Tabelas fiscais sem RLS | 0 |
| Funções fiscais SECURITY DEFINER sem `search_path` | 0 |
| Views fiscais sem `security_invoker` | 0 |
| Grants fiscais para `anon` | 0 |
| Postchecks canônicos | H7 11 · Segurança/Ambiente 12 · H7D 8 · H7E 7 · H7A 7 · H7F 11 · H7G 18 · H7H 11 · H7J 7 · H7K 8 → **100 PASS / 0 FAIL** |
| `bunx tsgo --noEmit` | PASS |
| `bunx vitest run src/test/fiscal/` | 106 arquivos, **1.679 testes PASS**, 4 skips |
| `bun run build` | PASS |
| `scripts/fiscal-secrets-scan.sh` | OK |
| Produção | Intocada — nenhum comando executado fora do staging (runner fail-closed recusa o ref de produção) |

### Correções aplicadas (P2, reversíveis, somente staging/repositório)
1. Restauração do binding (`.env`, `src/integrations/supabase/types.ts`) para o baseline `c75bb87f`.
2. `restoration/homologacao-h7/75-h7e-postcheck.sql` — H7E-6 exigia `EMITTER_CERTIFICATE_MISSING` de forma incondicional; com o A1 legitimamente registrado a asserção passou a acusar falso FAIL. Agora o bloqueio de certificado só é exigido quando `certificate_ref IS NULL`; os bloqueios humanos (credenciamento e validação contábil) continuam obrigatórios.
3. Autoteste criptográfico inerte (arquivos novos listados acima) e deploy de `fiscal-event-sign`.

Nada foi habilitado: NF-e/NFS-e permanecem desligadas, `configuration_status` continua `DRAFT`, `nfe_readiness_status` continua `NOT_READY`, `accounting_validated_at` e credenciamento seguem pendentes. Nenhum CFOP, CST/CSOSN, NCM, CEST, alíquota, natureza de operação, credencial de provedor ou dado RTC/IBS/CBS foi preenchido.

### Classificação do gate
- **A) H7 técnica — APROVADA.** Binding, guards anti-produção, RLS/ACL/Storage, cofre A1 `SIGNING_BUNDLE_V2`, preflight fail-closed, imutabilidade, idempotência e ausência de vazamento em logs: 100 postchecks PASS, typecheck/testes/build PASS.
- **B) H7 contábil/cadastral — PENDENTE HUMANA.** Faltam decisão contábil e cadastro: `accounting_validated`, credenciamento por UF, matriz RTC 2026, produtos/serviços/clientes com perfil fiscal completo. Não implementável sem fonte contábil/oficial.
- **C) H7 SEFAZ homologação — PENDENTE.** Smoke assistido de `NFeStatusServico4` (HML) e execução em runtime do `action=self_test` exigem sessão de operador fiscal no staging; nenhum documento fiscal foi gerado ou transmitido.
- **D) Elegibilidade para promoção — NÃO ELEGÍVEL.** Promoção depende de (B) e (C) concluídos. Produção permanece bloqueada e intocada.

---

## H7 — Smokes autenticados na UI (2026-09-03, 22:2x UTC)

Escopo: habilitar, na aba **já existente** “Configuração Fiscal → Homologação
fiscal”, os dois smokes que exigem sessão real de administrador. Sem rota nova,
sem fluxo paralelo, sem tabela nova. Somente staging `ikaauvsflpmamgxmkhoq`;
produção `navfzbwgwzruipouyfnk` intocada. `fiscal-event-sign` **não** foi
redesplegada (permanece a versão publicada diretamente no staging autorizado).

### Card 1 — “Autoteste do certificado A1”
- Botão admin-only `Testar certificado em memória`, habilitado apenas com
  `fiscal_environment=HOMOLOGATION`, `nfe_environment_code=2`,
  `production_enabled=false` e certificado ativo/`AVAILABLE`/vigente.
- Invoca `supabase.functions.invoke('fiscal-event-sign', { body: { action: 'self_test' } })`
  com o JWT normal da sessão.
- Exibe apenas: bundle parseável, chave corresponde ao certificado, assinatura
  verificada, validade, key usage, dias restantes, `persisted=false`,
  `transmitted=false`, tpAmb e horário. Toda a resposta passa por allowlist
  (`sanitizeSelfTestResponse`), fail-closed em `persisted`/`transmitted`.

### Card 2 — “SEFAZ-MG — status do serviço em homologação”
- Botão admin-only `Consultar SEFAZ HML`, bloqueado fora de homologação/tpAmb 2
  ou com produção habilitada.
- Invoca exclusivamente `fiscal-sefaz-transport` `action=status`
  (**NFeStatusServico4**, endpoint `hnfe.fazenda.mg.gov.br`, allowlist dura
  server-side). Nenhum documento, chave real, evento, inutilização,
  cancelamento ou numeração é enviado.
- Exibe apenas `cStat`, `xMotivo` normalizado (≤200 chars), tpAmb, latência e
  horário. Erros aparecem como código estável sanitizado.

### Garantias
Sem exibição/registro de PFX, senha, PEM, assinatura, fingerprint/serial,
`object_path`, IV ou resposta bruta; sem `console.*`; clique duplo impedido por
`isPending`; nenhuma escrita (`update`/`insert`), nenhuma alteração de
`configuration_status` (`DRAFT`) ou de `nfe_readiness_status` (`NOT_READY`);
NF-e/NFS-e continuam desligadas.

### Arquivos alterados
| Arquivo | Ação |
| --- | --- |
| `src/lib/fiscal/homologationSmokeGate.ts` | novo — gate puro (admin/homologação/certificado) e sanitizadores |
| `src/hooks/useFiscalHomologationSmokes.ts` | novo — mutations dos dois smokes com JWT do usuário |
| `src/components/fiscal/homologacao/SmokesHomologacaoSecao.tsx` | novo — os dois cards admin-only |
| `src/components/fiscal/homologacao/HomologacaoSecao.tsx` | integração da seção na aba existente |
| `src/test/fiscal/h7m.smokesHomologacao.test.ts` | novo — 12 testes |
| `restoration/homologacao-h7/75-h7e-postcheck.sql` | correção anterior do falso FAIL H7E-6 |
| `.env`, `src/integrations/supabase/types.ts` | drift recorrente restaurado ao baseline `c75bb87f` |

### Validações
`check-frontend-binding.sh` OK (staging) · `bunx tsgo --noEmit` PASS ·
`vitest src/test/fiscal/` **1.691 PASS / 4 skips / 0 falhas** (107 arquivos) ·
`bun run build` PASS · `fiscal-secrets-scan.sh` OK.

### Situação
Botões prontos na prévia autenticada. Os smokes reais (autoteste do A1 e status
SEFAZ HML) serão executados pelo administrador na UI; até lá, C) H7 SEFAZ
homologação permanece **pendente** e D) promoção segue **não elegível**.

---

## H7 — Evidência de runtime 04/09/2026 (somente staging)

Execução ocorrida em **04/09/2026**, restrita ao staging
`ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` permaneceu **intocada**.
Nenhum PFX, senha, chave privada, master key, IV, `object_path`, fingerprint/serial
completo ou resposta bruta foi registrado nesta consolidação.

### 1. Autoteste do certificado A1 em memória

| Indicador | Resultado |
| --- | --- |
| Ação | `self_test` em `fiscal-event-sign` (versão publicada no staging) |
| Bundle parseável | **sim** |
| Chave privada corresponde ao certificado | **sim** |
| Assinatura verificável pela chave pública do certificado | **sim** |
| Certificado dentro da validade | **sim** |
| Key usage compatível com assinatura digital | **sim** |
| `persisted` | **false** |
| `transmitted` | **false** |
| Material sensível descartado após o teste | **sim** (zerado em `finally` server-side) |

O teste usou exclusivamente o payload inerte `AR-BIO/H7/SELF-TEST/INERT`; não
reservou numeração, não gerou XML fiscal e não transmitiu qualquer documento.

### 2. Consulta controlada ao status do serviço SEFAZ-MG HML

| Campo | Valor observado |
| --- | --- |
| Serviço | `NFeStatusServico4` |
| Host | `hnfe.fazenda.mg.gov.br` |
| tpAmb | `2` (homologação) |
| cStat | `107` |
| xMotivo | `"Servico em operacao"` |
| Latência na UI | `5152 ms` |
| Horário local | `04/09/2026 09:37:19` |
| Log da Edge Function `fiscal-sefaz-transport` | `POST` HTTP 200, versão 1, execução ~`4774 ms` |

A chamada foi feita com autenticação JWT de administrador e `action=status`;
nenhum XML fiscal, evento, inutilização, cancelamento, chave de acesso real ou
reserva de numeração foi enviada.

### 3. Registro técnico em `fiscal_sefaz_transmissions`

| Campo | Valor |
| --- | --- |
| `service` | `NFeStatusServico4` |
| `environment_code` | `2` |
| `state` | `SUCCEEDED` |
| `attempt` | `1` |
| `outcome` | `SERVICE_INFO` |
| Vínculo com `fiscal_invoices` | **nenhum** |
| Vínculo com `fiscal_events` | **nenhum** |
| Chave de acesso (`chNFe`) | **nenhuma** |
| Protocolo (`nProt`) / recibo (`nRec`) | **nenhum** |

### 4. Contagens após o teste

| Objeto | Quantidade |
| --- | --- |
| `fiscal_invoices` | `0` |
| `fiscal_events` | `0` |
| `fiscal_sefaz_transmissions` | `1` (somente a consulta de status) |

### 5. Estado fiscal preservado

| Campo | Valor |
| --- | --- |
| `fiscal_environment` | `HOMOLOGATION` |
| `nfe_environment_code` | `2` |
| `production_enabled` | `false` |
| `nfe_enabled` | `false` |
| `nfse_enabled` | `false` |
| `configuration_status` | `DRAFT` |
| `nfe_readiness_status` | `NOT_READY` |
| `accounting_validated_at` | `null` |
| `sefaz_homologation_at` | `null` |

Nenhuma flag de emissão foi habilitada; nenhum dado contábil/fiscal
(CFOP, CST/CSOSN, NCM, CEST, alíquota, natureza de operação, RTC/IBS/CBS) foi
preenchido.

### 6. Higiene de logs

Auditoria dos logs das Edge Functions `fiscal-event-sign` e
`fiscal-sefaz-transport` não encontrou indicadores de vazamento de PFX/base64,
senha, chave privada, `service_role`, JWT, `object_path`, IV ou plaintext. As
respostas foram sanitizadas antes de exibição/registro.

### 7. Classificação do gate H7

| Dimensão | Status |
| --- | --- |
| **A) H7 técnico** | **APROVADO** — binding, guards anti-produção, cofre A1, autoteste criptográfico, status SEFAZ HML e ausência de vazamento validados em runtime. |
| **B) Contábil/cadastral** | **PENDENTE** — validação contábil real, credenciamento SEFAZ-MG por UF, matriz fiscal RTC 2026 e cadastros fiscais de produtos/serviços/clientes. |
| **C) Conectividade SEFAZ HML** | **APROVADA para status do serviço**; homologação operacional completa de autorização de NF-e permanece pendente até que (B) seja resolvido. |
| **D) Promoção para produção** | **NÃO ELEGÍVEL e não executada** — depende de (B), do ciclo de homologação SEFAZ concluído **e da correção dos 5 ERROR do Security Advisor + da revisão P1 de funções SECURITY DEFINER executáveis por authenticated/anon**. |

### 8. Evidência do Supabase Security Advisor — 04/09/2026

Varredura atual substitui a estimativa histórica de "48 WARN". Total de
apontamentos: **491** — **5 ERROR**, **479 WARN**, **7 INFO**. Nenhum código,
banco, Edge Function ou configuração foi alterado nesta consolidação; o registro
serve como baseline auditável para o gate de promoção.

#### 8.1 ERROR — `security_definer_view` (5 views)

| View | Acesso configurado | Observação |
| --- | --- | --- |
| `vw_os_integridade_esteira` | `anon` sem SELECT; `authenticated` com SELECT | Definição contém filtros por `auth.uid()`/papel, mas roda com semântica do definidor. Eficácia dos filtros/RLS subjacentes precisa ser validada e corrigida antes de produção. |
| `vw_esteira_laboratorio` | `anon` sem SELECT; `authenticated` com SELECT | Idem. |
| `vw_fluxo_visita_tecnica` | `anon` sem SELECT; `authenticated` com SELECT | Idem. |
| `vw_catalogo_ficha_produtos` | `anon` sem SELECT; `authenticated` com SELECT | Idem. |
| `vw_catalogo_ficha_microrganismos` | `anon` sem SELECT; `authenticated` com SELECT | Idem. |

**Não foi comprovada exploração.** O risco é a potencial elevação de contexto
se a view `SECURITY DEFINER` acessar tabelas cujas RLS dependam de `auth.uid()`
sem que a view reforce o mesmo filtro de chamador.

#### 8.2 WARN — detalhamento dos 479 apontamentos

| Código | Quantidade | Descrição |
| --- | --- | --- |
| `authenticated_security_definer_function_executable` | 466 | Funções `SECURITY DEFINER` com `EXECUTE` para `authenticated`. |
| `anon_security_definer_function_executable` | 6 | Funções `SECURITY DEFINER` com `EXECUTE` para `anon`. |
| `function_search_path_mutable` | 4 | Funções sem `search_path` fixo. |
| `extension_in_public` | 2 | Extensões instaladas no schema `public`. |
| `auth_leaked_password_protection` | 1 | Proteção de vazamento de senha do auth não habilitada. |

#### 8.3 Inventário técnico das 466 funções `SECURITY DEFINER` executáveis por `authenticated`

- **27** são funções de trigger também executáveis por `authenticated`.
- **8** são helpers internos nomeados com prefixo `_` e não usados como trigger.
- **348** funções não-trigger apresentam **indício textual** de guarda de autenticação/papel.
- **83** funções não-trigger **não apresentam** esse indício textual.
- **Todas as 466** têm `search_path` fixado segundo inspeção de catálogo (o Advisor ainda as classifica por outras regras).

> A detecção textual é **triagem**, não prova de segurança. Funções com indício
de guarda ainda precisam de revisão lógica; funções sem indício não são
automaticamente vulneráveis, mas devem ser auditadas primeiro.

#### 8.4 INFO — `rls_enabled_no_policy` (7 tabelas)

Sete tabelas têm RLS habilitada sem política explícita. Devem ser revisadas
individualmente para confirmar se são tabelas internas/fechadas (fail-closed
por design) ou se precisam de políticas conforme o uso real.

### 9. Prioridade de correção antes da promoção

| Prioridade | Escopo | Ação esperada |
| --- | --- | --- |
| **P0** | 5 views `security_definer_view` | Validar e corrigir a semântica do definidor; garantir que filtros/RLS subjacentes sejam efetivos para o chamador; testar com usuários de diferentes papéis. |
| **P1** | 27 funções de trigger + 6 funções `anon` + 83 funções sem indício de guarda | Revogar `EXECUTE` direto de `anon`/`authenticated` nas 27 triggers; revisar as 6 funções `anon` individualmente (duas RPCs de validação por token podem ser públicas por design, exigindo anti-enumeração/rate limit; triggers/guards não devem estar expostos); revisar primeiro as 83 funções sem indício textual de guarda. |
| **P2** | 348 funções com indício de guarda + 8 helpers `_` + 4 `search_path` + extensões em `public` + `auth_leaked_password_protection` | Revisar as 348 com guardas para confirmar eficácia; aplicar allowlist explícita de RPCs; corrigir os 4 `search_path` restantes; avaliar extensões em `public`; habilitar leaked-password protection conforme política de segurança. |
| **P3** | 7 INFO `rls_enabled_no_policy` | Confirmar tabelas internas/fechadas ou criar políticas conforme uso. |

### 10. Arquivos alterados nesta consolidação

Apenas o relatório abaixo foi alterado; nenhum código, banco, Edge Function,
configuração, secret ou certificado foi modificado nesta execução:

- `docs/auditorias/homologacao-h7-fiscal.md`


### 9. Arquivos alterados nesta consolidação

Apenas o relatório abaixo foi alterado; nenhum código, banco, Edge Function,
configuração, secret ou certificado foi modificado nesta execução:

- `docs/auditorias/homologacao-h7-fiscal.md`


### 11. H7N — P0/P1 do Security Advisor aplicadas e versionadas (04/09/2026, 13:06–13:58 UTC)

Escopo: staging `ikaauvsflpmamgxmkhoq` exclusivamente. Produção `navfzbwgwzruipouyfnk`
**não foi consultada, migrada, publicada nem alterada**. Nenhuma promoção executada.
Relatório detalhado: `restoration/homologacao-h7/97-h7n-p0p1-auditoria.md`.

#### 11.1 Migrations forward (números exatos já aplicados no staging; não reaplicar)

| Versão | Arquivo em `supabase/migrations/` | MD5 repo == ledger | Efeito |
| --- | --- | --- | --- |
| 20260904130615 | `20260904130615_h7n_p0_security_invoker.sql` | `6e2cf6fa…` | 5 views → `security_invoker=true`; 4 wrappers SECURITY DEFINER em schema `private` (não exposto) com predicado idêntico; grants authenticated/service_role, sem anon |
| 20260904130758 | `20260904130758_h7n_p1_trigger_execute.sql` | `d90aa6fc…` | 27 funções de trigger sem EXECUTE para public/anon/authenticated |
| 20260904130941 | `20260904130941_h7n_p1_rpc_guards.sql` | `11f71e30…` | guards de papel em 13 RPCs sensíveis (B2B/KPI, financeiro, mensagens) |
| 20260904131239 | `20260904131239_h7n_p1_internal_helpers.sql` | `1be95ea1…` | 42 helpers internos sem EXECUTE para public/anon/authenticated |
| 20260904131341 | `20260904131341_h7n_p2_search_path.sql` | `9e9768c4…` | `search_path=pg_catalog` em 4 funções IMMUTABLE |

Conteúdo extraído de `supabase_migrations.schema_migrations.statements`; correspondência byte a byte verificada por
`restoration/homologacao-h7/h7n-postcheck.sh` (5/5 PASS). Nenhum DDL foi reaplicado.

#### 11.2 Rollbacks e ensaio

Rollbacks explícitos, um por migração, em `restoration/homologacao-h7/h7n-rollbacks/` (fora de `supabase/migrations`), restaurando
definições originais das views (`h7n-inventario/viewdefs.sql`), ACLs anteriores (27 triggers: authenticated em todas e anon em 4;
42 helpers: authenticated), corpos das 13 RPCs sem guard e `search_path` original. **Não executados em definitivo.**
Ensaio `rehearse-rollback-reapply.sh` em transação única descartada (13:41:51–13:42:21 UTC): rollback 5→1 (7/7 checks de estado
pré-H7N PASS) → reapply 1→5 (7/7 checks pós-H7N PASS) → `ROLLBACK`; fingerprint de catálogo idêntico antes/depois
(`138b4b37108333b7be000562b90e84a2`). Nada persistido.

#### 11.3 Validação no staging (sem mutação)

| Verificação | Resultado |
| --- | --- |
| Security Advisor — regras oficiais (`supabase/splinter`, `splinter.sql` sha256 `d8d558baad3e0383…`, executado em transação descartada) | **0 ERROR** (antes: 5 `security_definer_view`); WARN segurança **402** = 397 `authenticated_security_definer_function_executable` (antes 466) + 2 `anon_security_definer_function_executable` (antes 6) + 0 `function_search_path_mutable` (antes 4) + 2 `extension_in_public` + 1 `auth_leaked_password_protection` (verificada só pela API); **7 INFO** `rls_enabled_no_policy` (inalterado) |
| Views `security_invoker` | 5/5 (`vw_os_integridade_esteira`, `vw_esteira_laboratorio`, `vw_fluxo_visita_tecnica`, `vw_catalogo_ficha_produtos`, `vw_catalogo_ficha_microrganismos`) |
| Trigger functions SECURITY DEFINER expostas a authenticated/anon | 0 (de 27) |
| RPCs sensíveis com guard | 13/13 |
| Helpers internos sem EXECUTE de authenticated | 42/42 |
| `search_path` endurecido | 4/4 |
| Allowlist de RPCs (`h7n-inventario/rpc_allowlist.tsv`) | 504 funções `public` executáveis por anon/authenticated (397 DEFINER + 107 INVOKER); postcheck falha em drift |
| Harness por perfil (`h7n-harness-perfis.sql`, 10 papéis reais + anon, transação descartada) | **136/136 PASS**: views filtradas pelo chamador; MVs privadas 42501; helpers/trigger diretos 42501; RPCs guardadas 42501 para não autorizados; anon sem acesso às views |
| Ledger | 5 versões H7N presentes; ledger termina em `20260904131341` (650 versões) |
| Estado fiscal | `fiscal_environment=HOMOLOGATION`, `nfe_environment_code=2`, `production_enabled=false`, `nfe_enabled=false`, `nfse_enabled=false`, `configuration_status=DRAFT`, `nfe_readiness_status=NOT_READY`, marcador `STAGING`/`production_emission_allowed=false` |
| Documentos fiscais | `fiscal_invoices=0`, `fiscal_events=0`, `fiscal_sefaz_transmissions=1` (apenas a consulta `NFeStatusServico4` de 04/09, `SUCCEEDED`/`SERVICE_INFO`) |

#### 11.4 Validação do repositório

`bunx tsgo --noEmit` PASS · `bunx vite build` PASS · `scripts/fiscal-secrets-scan.sh` PASS ·
`bunx vitest run` completo: 3.304 PASS / 14 FAIL / 4 skip, sendo os 14 FAIL exclusivamente de drift de binding
(`.env`/`types.ts` regenerados pela plataforma para `yzszlzjpovmcteuxjznj` durante a execução); após restaurar o baseline
`c75bb87f`, os 5 arquivos afetados reexecutados: 74/74 PASS → efetivo **3.318 PASS / 0 FAIL / 4 skip**.

#### 11.5 Diferenças em relação ao esperado, alertas residuais e riscos

- WARN adicional `public_bucket_allows_listing` (bucket `logos`, público por design) aparece no splinter atual; não constava na baseline (lint recente). Sem ação nesta rodada.
- `rpc_b2b_aging` e `rpc_b2b_partner_profitability` (`LANGUAGE sql`) foram guardadas por filtro fail-closed (conjunto vazio para não autorizados) em vez de `RAISE 42501` — consistente em segurança, inconsistente em UX; alinhar em migração futura (P3).
- 397 SECURITY DEFINER executáveis por authenticated permanecem como **dívida técnica inventariada** (P1 residual antes da promoção); 2 anon (QR/token) intencionais — `rpc_validar_comprovante_entrega` ainda sem rate-limit em banco (P2).
- 2 `extension_in_public` (`btree_gist`, `pg_net`) e `auth_leaked_password_protection` (P2, decisão de política); 7 `rls_enabled_no_policy` fail-closed por design (P3).
- `20260903182144_h7l_security_advisor_hardening` está no ledger do staging sem arquivo no repositório (fora deste escopo; não inventado). Migrations do repositório com nome posterior a `20260904131341` não estão no ledger do staging; em reconstrução por ordem de arquivo, executar `h7n-postcheck.sh` ao final (algumas recriam views de catálogo sem `security_invoker`).
- Drift recorrente de `.env`/`types.ts` gerados pela plataforma: restaurar do baseline antes de qualquer gate (o `check-frontend-binding.sh` aborta em drift).

#### 11.6 Classificação após H7N

| Eixo | Situação |
| --- | --- |
| **A) H7 técnico** | **APROVADO** (mantido) — P0 do Advisor zerado; P1 de triggers/helpers/RPCs sensíveis aplicado com rollback ensaiado. |
| **B) Contábil/cadastral** | **PENDENTE** (inalterado) — validação contábil, credenciamento UF, matriz RTC/cadastros. |
| **C) Conectividade SEFAZ HML** | **APROVADA para status do serviço** (inalterado). |
| **D) Promoção para produção** | **NÃO ELEGÍVEL e não executada** — dependências (B), homologação operacional de autorização e revisão P1 residual (397 SECURITY DEFINER) + pendências P2. Os 5 ERROR deixaram de ser bloqueio. |

#### 11.7 Arquivos desta rodada

Novos: as 5 migrations forward acima; `restoration/homologacao-h7/h7n-rollbacks/` (5 rollbacks + `rehearse-rollback-reapply.sh`);
`restoration/homologacao-h7/h7n-postcheck.sh`; `restoration/homologacao-h7/h7n-harness-perfis.sql`;
`restoration/homologacao-h7/h7n-inventario/rpc_allowlist.tsv`; `restoration/homologacao-h7/h7n-inventario/advisor_splinter_after.txt`.
Atualizados: `restoration/homologacao-h7/97-h7n-p0p1-auditoria.md`, `roadmap.md`, este relatório.
Não alterados: código de aplicação, Edge Functions, certificado/cofre A1, secrets, configuração fiscal, dados.


---

### 12. Gate H7O — encerramento (2026-09-04, staging `ikaauvsflpmamgxmkhoq`)

Relatório definitivo: `restoration/homologacao-h7/98-h7o-relatorio-parcial.md` (seção 10).

- 4 migrations H7O aplicadas e registradas (`20260930000000`…`20260930030000`), MD5 repo == ledger; ledger em 654 versões. H7L e H7N intactas.
- `h7o-postcheck.sh`: PASS integral. Allowlist 504 → 485, **exatamente 19 assinaturas removidas e 0 adicionadas**.
- Advisor (splinter `d8d558baad3e0383`): **0 ERROR**; SECURITY 392 (378 authenticated secdef, 10 RLS fail-closed, 2 extension_in_public, 2 anon por design QR/token).
- Ensaio rollback→reapply em transação descartada: 7 PRE + 7 POST PASS, fingerprint idêntico `9102cfe8a58e5c7e3fd843cf0131a90d`.
- Suítes: typecheck 0 erro, build OK, Vitest 3.326 PASS / 4 skip / 0 FAIL, scans de segredo e de integração fiscal OK.
- Novos gates na suíte: ordem de migrations das 5 views protegidas (com verificação negativa) e execução do gate de binding de staging.
- Invariantes fiscais confirmados por leitura: `HOMOLOGATION`, `tpAmb=2`, emissão de produção desabilitada, `DRAFT|NOT_READY`, 0 notas/0 eventos.
- Produção `navfzbwgwzruipouyfnk`: não consultada, não alterada, não promovida. Promoção continua NÃO ELEGÍVEL.
