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
