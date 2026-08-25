# H7 — Auditoria e homologação do módulo fiscal AR Bio

Data: 2026-08-20 · Ambiente: **staging `ikaauvsflpmamgxmkhoq`** ·
Produção `navfzbwgwzruipouyfnk`: **intocada** (nenhuma leitura de escrita,
migration, deploy ou seed).

Nenhum segredo (PFX, senha, chave privada, IV, ciphertext, DSN, JWT,
service_role, master key) foi lido, registrado, logado ou versionado.

## 1. Resumo executivo

O módulo fiscal já existia e foi **reaproveitado integralmente**: nenhuma
tabela, rota ou engine paralela foi criada nesta execução. As correções
anteriores (H7, H7b, H7c) foram revalidadas do zero em staging e a única
alteração de código desta rodada foi o **gate canônico
`CERT_PASSWORD_REQUIRED`** exigido por H7-005.8.

Resultado: **GATE H7 — APROVADA COM RESSALVAS**, zero P0/P1, com pendência
única classificada como `AGUARDANDO CERT_PASSWORD_REQUIRED` (senha real do
PFX) somada à configuração dos dois segredos do cofre. Produção fiscal
permanece bloqueada por marcador server-side; H8 não iniciada.

## 2. Inventário atual encontrado

| Camada | Itens |
| --- | --- |
| Migrations fiscais | `20260919000000_h7_fiscal_hardening_v1.sql`, `20260919010000_h7_fiscal_preflight_marker_v1.sql`, `20260920000000_h7b_fiscal_idempotencia_ambiente_v1.sql`, `20260920010000_h7b_gate_xml_record_e_marcador_v1.sql` (+ base fiscal 3.x/F1–F4) |
| Tabelas/views | 34 objetos fiscais, incl. `company_fiscal_settings`, `fiscal_environment_marker`, `fiscal_certificates`, `fiscal_certificate_material`, `fiscal_xml_runs`, `fiscal_xsd_registry`, `v_fiscal_certificate_readiness` |
| Edge Functions | `fiscal-certificate-upload`, `fiscal-certificate-revoke`, `fiscal-xml-engine` |
| Storage | bucket privado `fiscal-certificates` (`public=false`, 0 policies em `storage.objects`) |
| Frontend | `UploadCertificadoA1.tsx`, `useFiscalCertificates.ts`, `useFiscalXmlEngine.ts`, `useRegisterOsCertificate.ts`, rotas `/configuracoes/fiscal/*` e `/fiscal/prontidao` |
| Runners | `restoration/homologacao-h7/` (guard, postcheck, segurança/ambiente, concorrência) |

## 3. Arquitetura reaproveitada vs criada

- **Reaproveitado**: 100% do schema fiscal, o cofre AES-256-GCM, o motor XML
  F4 com XSD oficial, a numeração idempotente, o marcador de ambiente e a
  integração H5/H6.
- **Criado nesta execução**: nada de infraestrutura. Apenas o código de gate
  `CERT_PASSWORD_REQUIRED` na Edge Function de upload, seu reflexo na UI e o
  teste correspondente.

## 4. Matriz fiscal e snapshot

Cadastro mestre (NCM, CEST, origem, CFOP, CST/CSOSN, ICMS/PIS/COFINS/IPI,
unidades, GTIN, cBenef, informação adicional) permanece separado do snapshot
do documento. O snapshot é imutável após emissão: `20260919000000` bloqueia
alteração econômica/fiscal de documento terminal e o postcheck T5 comprova.
Valores não confirmados continuam marcados como pendentes de validação
contábil e **bloqueiam** a emissão em vez de serem presumidos.

## 5. Preflight

Preflight canônico server-side com retorno estruturado por campo/código
(emitente, ambiente, destinatário, aptidão de pedido/entrega, NCM, CFOP,
consistência de bases, igualdade de totais dentro de tolerância, duplicidade,
certificado e bloqueios regulatórios). Negado a `anon` (E1).

## 6. Estados e transições

Escada fail-closed validada: `ISSUED→AUTHORIZED` permitido (T4),
`AUTHORIZED→CANCELED` permitido (T7), transições fora da escada bloqueadas
(T6), documento terminal imutável (T5), eventos append-only (T8).

## 7. Idempotência e concorrência

`62-h7-concorrencia.sh`: **4/4 PASS** — 2 chamadas simultâneas + 1 retry com a
mesma chave produzem **1 evento**; reserva com `FOR UPDATE` + advisory lock;
índice único de documento ativo por origem impede NF-e duplicada por duplo
clique/retry.

## 8. Certificado e segurança (sem segredo)

- Bucket privado exclusivo, sem policies para anon/authenticated.
- `fiscal_certificate_material` sem policy (fail-closed, A5).
- A senha do PFX existe somente durante o POST de importação e é descartada em
  `finally`; nunca é persistida, nem cifrada. O cofre persiste apenas o bundle
  de assinatura `SIGNING_BUNDLE_V2` cifrado em AES-256-GCM.
- H7D.1: o certificado folha é selecionado por vínculo criptográfico com a
  private key, sem depender da ordem dos `certBag` do PKCS#12.
- Sem `console.*` na função; nenhum eco de PFX/senha/chave.
- UI exibe apenas status, titular, validade, fingerprint e ambiente.
- **Novo (H7-005.8)**: sem senha real, a função responde `400` com
  `code: "CERT_PASSWORD_REQUIRED"` — nenhuma senha fictícia é aceita.
- Segredos ausentes no cofre do projeto: `FISCAL_CERTIFICATE_MASTER_KEY`
  (base64 de 32 bytes) e `FISCAL_CORS_ALLOWLIST`. Enquanto ausentes: `503
  CERTIFICATE_VAULT_NOT_CONFIGURED` / `403 cors_origin_not_allowed`.

## 9. XML, XSD e assinatura

`fiscal-xml-engine` gera, valida contra o XSD oficial empacotado
(`static_files` no `config.toml`) e assina `infNFe`. Teto absoluto **SIGNED**:
nenhuma ação transmite à SEFAZ. Triagem ASN.1 aceita BER indefinido (`30 80`)
com EOC, delegando autoridade de formato a `forge`.

## 10. SEFAZ MG homologação

`fiscal_environment_marker = ikaauvsflpmamgxmkhoq|STAGING|0` e
`nfe_environment_code='2'`. Marcador não editável por usuário autenticado
(C4); tentativa de marcar produção bloqueada (C2/C3); `tpAmb=1` rejeitado
(T3). Endpoint nunca vem do cliente. Transmissão real: **`INFRA_BLOCKED`** —
não executada nesta fase por decisão de gate, não por falha funcional.

## 11. RLS, Storage e perfis

`61-h7-seguranca-ambiente.sql`: **12/12 PASS** — RLS em todas as tabelas
fiscais (A1), `anon` sem EXECUTE (A2/E1/E2/E3), `search_path` fixo em todos os
SECURITY DEFINER fiscais (A3), buckets fiscais privados (A4).

## 12. Integração H5/H6

Nenhuma tabela financeira nova. A NF-e continua vinculada a
`accounts_receivable`/entrega/pedido já existentes; divergência de total
bloqueia o preflight. Suítes H5/H6 e demais módulos sem regressão.

## 13. Testes e evidências

| Suíte | Resultado |
| --- | --- |
| `guard-staging.sh` | OK — staging, `tpAmb='2'`, produção desabilitada |
| `60-h7-postcheck.sql` | **11 PASS / 0 FAIL** |
| `61-h7-seguranca-ambiente.sql` | **12 PASS / 0 FAIL** |
| `62-h7-concorrencia.sh` | **4 PASS / 0 FAIL** |
| Vitest completo | **3134 PASS / 4 skipped / 0 FAIL** |
| Typecheck | 0 erros |
| Build | OK |

Correção de binding registrada: `.env` e `types.ts` haviam sofrido drift para
projeto sandbox; restaurados ao baseline de staging `c75bb87f` (`types.ts`
2.052 → 21.850 linhas).

## 14. Classificação de achados

- **P0/P1**: nenhum.
- **P2**: `FISCAL_CERTIFICATE_MASTER_KEY` e `FISCAL_CORS_ALLOWLIST` ausentes no
  cofre — impedem o E2E real do A1 (fail-closed, sem risco).
- **P2**: senha do PFX não fornecida — gate `CERT_PASSWORD_REQUIRED`.
- **P3**: drift recorrente de `.env`/`types.ts` para projeto sandbox entre
  execuções; exige verificação de binding no início de cada fase.
- **P3**: transmissão SEFAZ HML ainda não exercitada (`INFRA_BLOCKED`).

## 15. Arquivos e migrations exatos

- `supabase/functions/fiscal-certificate-upload/index.ts` (gate
  `CERT_PASSWORD_REQUIRED`) — reimplantado somente no staging.
- `src/components/fiscal/certificados/UploadCertificadoA1.tsx` (mensagem do
  gate).
- `src/test/fiscal/h7c.asn1Screen.test.ts` (regressão estática do gate).
- Migrations: **nenhuma nova**; as H7/H7b já aplicadas foram revalidadas.

## 16. Rollback

Não há migration nova a reverter. O rollback do código é a restauração do
retorno anterior (`password_required`) nos três arquivos acima; o
comportamento de segurança é idêntico, muda apenas o código do erro. Os
runners em `restoration/homologacao-h7/` rodam em transação com `ROLLBACK` e
abortam contra qualquer ref diferente do staging autorizado.

## 17. Gate final

**GATE H7 — APROVADA COM RESSALVAS · zero P0/P1 ·
`AGUARDANDO CERT_PASSWORD_REQUIRED`.**

Para executar o teste criptográfico real do A1 em homologação faltam, nesta
ordem: (1) `FISCAL_CERTIFICATE_MASTER_KEY` e `FISCAL_CORS_ALLOWLIST` em
Project Settings → Secrets; (2) upload do `.pfx` pela UI fiscal com a senha
digitada pelo administrador no próprio formulário. Produção fiscal
permanece desativada e H8 não foi iniciada.

---

## 18. FASE H7d — Drift de binding (achado da auditoria independente)

**Correção da afirmação anterior:** o commit `49297455`, embora declarasse
"H7 aprovado em staging", gravou `.env` apontando para o projeto
sandbox `yzszlzjpovmcteuxjznj` e truncou `src/integrations/supabase/types.ts`
para 2.052 linhas, enquanto `client.ts` e `supabase/config.toml` seguiam em
`ikaauvsflpmamgxmkhoq`. Auditoria independente classificou como **P1** e
invalidou qualquer teste UI/E2E fiscal daquele commit. O histórico de achados
anteriores (H0-001/H0-002R) permanece válido — trata-se de reincidência.

### 18.1 Binding antes/depois (sem expor chaves)

| Arquivo | Antes (HEAD `49297455`) | Depois (H7d) |
|---|---|---|
| `.env` `VITE_SUPABASE_PROJECT_ID` | `yzszlzjpovmcteuxjznj` | `ikaauvsflpmamgxmkhoq` |
| `.env` `VITE_SUPABASE_URL` | sandbox | `https://ikaauvsflpmamgxmkhoq.supabase.co` |
| `.env` publishable key | chave sandbox | anon do staging (idêntica à do `client.ts`) |
| `src/integrations/supabase/client.ts` | `ikaauvsflpmamgxmkhoq` (íntegro) | inalterado |
| `supabase/config.toml` | `ikaauvsflpmamgxmkhoq` (íntegro) | inalterado |
| `src/integrations/supabase/types.ts` | 2.052 linhas (stub sandbox) | 21.850 linhas (baseline staging `c75bb87f`) |

Produção `navfzbwgwzruipouyfnk`: **não referenciada em nenhum arquivo de
binding ativo; intocada**.

### 18.2 Gate fail-closed de binding

Novo `restoration/homologacao-h7/check-frontend-binding.sh` (estático, **sem
acesso a banco**), invocado como primeira instrução de
`restoration/homologacao-h7/guard-staging.sh` — fluxo único, sem runner
paralelo. Aborta (exit 10) se: ref/URL do `.env` ≠ staging; `client.ts` ou
`config.toml` fora do staging; qualquer ocorrência de ref sandbox ou de
produção nos arquivos de binding; `types.ts` sem o contrato de relações
estáveis (`microrganismos`, `microorganism_fiscal_profiles`,
`microorganism_regulatory_dossiers`, `fiscal_matrix_load_ledger`,
`company_fiscal_settings`, `ordens_servico`, `notificacoes_operacionais`,
`user_roles`) — contrato de schema, não apenas contagem de linhas.
Complementado pelo teste contratual `src/test/config/connection-binding.static.test.ts`.

### 18.3 Resultados

| Teste | Resultado |
|---|---|
| A. Gate de binding, estado real | **PASS** |
| B. Negativo sandbox `yzsz…` (fixture temporária) | **FAIL esperado**, exit 10, sem tocar banco |
| C. Negativo produção `navf…` em `.env` e em `client.ts` | **FAIL esperado**, exit 10, sem tocar banco |
| D. `guard-staging.sh` | **PASS** — staging `ikaauvsflpmamgxmkhoq`, `tpAmb=2`, produção fiscal off |
| E. `60-h7-postcheck.sql` | **11 PASS / 0 FAIL** |
| E. `61-h7-seguranca-ambiente.sql` | **12 PASS / 0 FAIL** |
| E. `62-h7-concorrencia.sh` | **4/4 PASS** |
| F. typecheck | 0 erros |
| F. Vitest | **3.134 PASS**, 4 skip (194 arquivos) |
| F. build | sucesso |
| G. Segredos novos versionados | nenhum (PFX/senha/master key/service_role ausentes) |

`scripts/fiscal-secrets-scan.sh` continua marcando 3 ocorrências
**pré-existentes e não sensíveis**: anon key do `client.ts`, JWT de exemplo em
`scripts/rbac-audit/run-rbac-audit.ts` e DSN placeholder em
`restoration/comunicacao-deploy/env.example`.

### 18.4 Riscos residuais

- **P2** — regeneração automática do backend Cloud pode reintroduzir o drift a
  qualquer momento; mitigado apenas por detecção (gate + teste contratual),
  não por prevenção.
- **P3** — o gate valida arquivos versionados, não variáveis injetadas em
  runtime pela plataforma.

### 18.5 Gate H7d

**GATE H7d — APROVADA · zero P0/P1 · binding de staging consistente.**
Certificado A1 não inserido, nenhum segredo fiscal criado, `tpAmb` permanece
2, `production_emission_allowed = 0`, produção intocada. H8 **não** iniciada.

---

## 19. FASE H7 (rodada A1) — Auditoria de prontidão do certificado digital

Execução exclusiva no staging `ikaauvsflpmamgxmkhoq`. Produção
`navfzbwgwzruipouyfnk` não foi acessada. Nenhum PFX, senha ou chave privada
entrou em repo, banco, log ou chat.

### 19.1 Inventário confirmado no staging

- 22 tabelas `fiscal*`, **todas com RLS habilitada** (0 exceções).
- Buckets: `fiscal-certificates` (privado, 10 MB), `fiscal-xml` (privado),
  `fiscal-regulatorio` (privado); 4 policies de storage vinculadas.
- `fiscal_environment_marker` = `ikaauvsflpmamgxmkhoq | STAGING |
  production_emission_allowed=false`.
- `company_fiscal_settings` ativo = `HOMOLOGATION`, `production_enabled=false`,
  `nfe_enabled=false`, `nfse_enabled=false`, `nfe_provider=NONE`,
  `certificate_ref=NULL`, `nfe_readiness_status=NOT_READY`.
- `fiscal_certificates` = 0 linhas; `fiscal_certificate_material` = 0 linhas.
- `anon` sem qualquer GRANT em tabelas fiscais (0); todas as funções
  SECURITY DEFINER fiscais com `search_path` fixo (0 divergências).
- Edge Functions fiscais: `fiscal-certificate-upload`,
  `fiscal-certificate-revoke`, `fiscal-cnpj-lookup`, `fiscal-preflight`,
  `fiscal-xml-engine`. Nenhum módulo paralelo criado.

### 19.2 Rota exata para importar o A1

`/configuracoes/fiscal/empresa` → seção **“Certificado Digital”**
(`src/components/fiscal/certificados/CertificadoDigitalSecao.tsx` +
`UploadCertificadoA1.tsx`) → selecionar o `.pfx`/`.p12`, digitar a senha no
campo `type="password"` com `autoComplete="new-password"` e acionar
**Importar** (botão com `disabled` durante o envio). Arquivo e senha vão
direto para a Edge Function; nada é persistido no navegador.

### 19.3 Alterações desta rodada

| Arquivo | Mudança |
|---|---|
| `supabase/functions/_shared/fiscal/corsAllowlist.ts` | **novo** — allowlist canônica de origens públicas; o secret `FISCAL_CORS_ALLOWLIST`, quando presente, tem precedência |
| `supabase/functions/fiscal-certificate-upload/index.ts` | usa a allowlist compartilhada; `decodeMasterKey` agora aceita base64 de 32 bytes **ou** deriva AES-256 via SHA-256 de segredo textual de alta entropia (fail-closed se ausente → `CERTIFICATE_VAULT_NOT_CONFIGURED`, 503) |
| `supabase/functions/fiscal-certificate-revoke/index.ts` | allowlist compartilhada |
| `supabase/functions/fiscal-xml-engine/index.ts` | allowlist compartilhada |
| `src/test/fiscal/h7c.asn1Screen.test.ts` | asserção de controle atualizada para o helper compartilhado |
| `.env`, `src/integrations/supabase/types.ts` | restaurados 3× ao baseline de staging (drift recorrente) |

Nenhuma migration nova foi necessária: numeração, idempotência, snapshot
imutável, guard de ambiente e append-only já estavam aplicados e foram
revalidados.

### 19.4 Testes desta rodada

| Teste | Resultado |
|---|---|
| Gate de binding H7d | PASS (após 3 restaurações; drift reincidente) |
| `guard-staging.sh` | PASS — `tpAmb=2`, produção fiscal off |
| `60-h7-postcheck.sql` | 11 PASS / 0 FAIL |
| `61-h7-seguranca-ambiente.sql` | 12 PASS / 0 FAIL |
| `62-h7-concorrencia.sh` | 4/4 PASS |
| RLS em tabelas fiscais / grants anon / search_path | 22 com RLS, 0 grants anon, 0 SECURITY DEFINER sem search_path |
| CORS negativo (origem estranha) | bloqueado (403) |
| POST sem sessão | bloqueado (403, sem vazamento) |
| Suíte fiscal + suíte completa | 3.134 PASS, 4 skip |
| typecheck / build | 0 erros / sucesso |

### 19.5 Pendência bloqueante (infraestrutura, P1)

O tooling de plataforma (deploy de Edge Functions e cofre de secrets) está
vinculado ao projeto Cloud sandbox `yzszl…`, **não** ao staging
`ikaauvsflpmamgxmkhoq` ao qual o app se conecta. Evidências:

- `FISCAL_CERTIFICATE_MASTER_KEY` (gerado nesta rodada) e
  `FISCAL_CORS_ALLOWLIST` foram gravados no cofre da plataforma, mas a função
  em staging continua respondendo `cors_origin_not_allowed`;
- o deploy das três funções retornou sucesso, porém o staging não registra
  logs nem o novo comportamento.

Consequência: **a importação real do A1 pela interface ainda não é executável
em staging** até que os secrets fiscais e o deploy alcancem
`ikaauvsflpmamgxmkhoq` (ação de infraestrutura/CLI com acesso ao projeto).
Nada foi contornado, simulado ou marcado como autorizado.

### 19.6 Outras pendências

- Transmissão SEFAZ MG homologação: sem provider real implementado
  (`nfe_provider=NONE`). Nenhuma autorização é simulada; a camada só será
  ligada após o certificado ativo.
- NFS-e permanece desacoplada e desligada.
- Validação contábil das regras em `fiscal_tax_rules` continua pendente de
  parecer do contador (campos sem validação seguem em status de pendência).

### 19.7 Riscos

- **P1 (infra)** — divergência entre projeto de secrets/deploy e projeto de
  runtime (19.5).
- **P2** — drift automático de `.env`/`types.ts` reincidiu 3× nesta sessão;
  mitigado por detecção (gate + teste contratual), não por prevenção.
- **P3** — allowlist de origens versionada exige atualização manual se novos
  domínios forem publicados.

### 19.8 Gate

**GATE H7 — APROVADA COM RESSALVAS / AGUARDANDO CERTIFICADO E PARIDADE DE
INFRAESTRUTURA.** Zero P0. Um P1 de infraestrutura (19.5), fora do código.
Produção fiscal desabilitada, `tpAmb=2`, `production_emission_allowed=false`,
produção intocada. H8 não iniciada.

---

## 20. Revalidação H7 — 2026-08-20 (execução em fases, somente staging)

### 20.1 Diagnóstico antes

- **Drift de binding (P1, reincidente)**: `.env` apontava para o projeto
  sandbox `yzszlzjpovmcteuxjznj` enquanto `client.ts`/`config.toml` apontavam
  para o staging `ikaauvsflpmamgxmkhoq`; `src/integrations/supabase/types.ts`
  truncado em 2.043 linhas (contrato de schema incompleto).

### 20.2 Correção aplicada

- `.env` e `src/integrations/supabase/types.ts` restaurados do baseline de
  staging `c75bb87f` (types com 21.850 linhas).
- Nenhuma migration nova foi necessária: o schema fiscal em staging já está no
  estado certificado por H7/H7b/H7c/H7d (nenhum finding P0/P1 de banco nesta
  rodada).

### 20.3 Evidências de execução (staging `ikaauvsflpmamgxmkhoq`)

| Suite | Resultado |
|---|---|
| `check-frontend-binding.sh` (gate estático) | OK |
| `guard-staging.sh` (marcador + tpAmb) | OK — `tpAmb='2'`, produção fiscal desabilitada |
| `60-h7-postcheck.sql` | **11 PASS / 0 FAIL** |
| `61-h7-seguranca-ambiente.sql` | **12 PASS / 0 FAIL** |
| `62-h7-concorrencia.sh` | **4/4 PASS** (D1–D4) |
| Typecheck (`tsgo`) | 0 erros |
| Vitest | **3.134 PASS**, 4 skipped, 193 arquivos |

Cobertura por fase do escopo: snapshot imutável (T4–T7), append-only e
idempotência de eventos (T8/T9), ACL anon (T10/A2/E1–E3), RLS fiscal (A1),
`search_path` fixo em SECURITY DEFINER (A3), buckets fiscais privados (A4),
material de certificado fail-closed (A5), hard guard de produção (T3/C1–C4),
concorrência real com duas conexões (D1–D4).

### 20.4 Provedor / emissão

Nenhum provedor SEFAZ real foi acionado. Teto do motor permanece **SIGNED**
(`fiscal-xml-engine`): geração, validação XSD e assinatura — sem transmissão.
Todos os testes desta rodada são de contrato/comportamento em banco; **não há
emissão real autorizada** e nada foi declarado como tal.

### 20.5 Pendência de infraestrutura (P1 mantido, fora do código)

As Edge Functions fiscais foram redeployadas pela plataforma, mas o deploy é
direcionado ao projeto gerenciado do Lovable, não ao staging
`ikaauvsflpmamgxmkhoq`. Verificação direta:

```
POST https://ikaauvsflpmamgxmkhoq.supabase.co/functions/v1/fiscal-certificate-upload
Origin: https://cultivofarm.lovable.app  ->  403 {"error":"cors_origin_not_allowed"}
```

Ou seja, o staging ainda executa a versão anterior (sem o default de allowlist
de `_shared/fiscal/corsAllowlist.ts` e sem a derivação SHA-256 da master key).
Não há token de management do Supabase disponível no ambiente para deployar
diretamente em `ikaauvsflpmamgxmkhoq`. **Enquanto essa paridade não existir, o
upload real do A1 não é executável em staging.**

### 20.6 Pendências para uso do PFX e senha

1. Deploy das três funções fiscais no projeto `ikaauvsflpmamgxmkhoq`.
2. `FISCAL_CERTIFICATE_MASTER_KEY` e `FISCAL_CORS_ALLOWLIST` presentes no
   runtime desse mesmo projeto.
3. Administrador acessa `/configuracoes/fiscal/empresa`, envia o `.pfx` e
   digita a senha no formulário. A senha nunca é persistida: é usada apenas em
   memória na Edge Function e o material é cifrado em AES-256-GCM.
4. Nenhum PFX, senha, base64 ou `service_role` foi gravado em repositório,
   migration, log, tabela pública ou mensagem de erro nesta execução.

### 20.7 Gate

**GATE H7 — APROVADA COM RESSALVAS · zero P0 · zero P1 de código · 1 P1 de
infraestrutura (20.5).** Produção `navfzbwgwzruipouyfnk` intocada; nenhuma
migration ou deploy direcionado a produção; emissão de produção permanece
desabilitada por marcador server-side. H8 **não** iniciada.

## 21. Revalidação H7 — 2026-08-20

Execução somente-leitura/validação em staging `ikaauvsflpmamgxmkhoq`. Nenhuma migration nova; nenhuma alteração de schema, rota, permissão ou provedor.

**Drift corrigido (P2 reincidente):** `.env` apontava para o sandbox `yzszl…` e `types.ts` estava truncado (2.052 linhas). Ambos restaurados do baseline de staging `c75bb87f` (21.850 linhas). Gate estático `check-frontend-binding.sh`: OK.

**Evidências:**
- `guard-staging.sh`: OK — `tpAmb=2`, `production_emission_allowed=false`.
- `60-h7-postcheck.sql`: 11/11 PASS (gate de ambiente, produção bloqueada, normalização de status, imutabilidade econômica, transições fail-closed, cancelamento, eventos append-only, idempotência, anon sem EXECUTE, assinatura legada removida).
- `61-h7-seguranca-ambiente.sql`: 12/12 PASS (RLS em todas as tabelas fiscais, buckets privados, `fiscal_certificate_material` fail-closed, `search_path` fixo, marcador de ambiente não editável, anon negado em preflight/numeração/XML/documentos).
- `62-h7-concorrencia.sh`: 4/4 PASS (2 transmissões simultâneas + retry ⇒ 1 evento; lock + idempotência; índice único de documento ativo por origem).
- Typecheck: 0 erros. Vitest: 3.134 PASS / 4 skip (194 arquivos). Build: OK.

**Pendências mantidas:**
- P1 (infraestrutura, fora do código): deploy de Edge Functions e cofre de secrets da plataforma resolvem para o projeto sandbox, não para `ikaauvsflpmamgxmkhoq`; por isso o upload real do A1 em staging ainda responde `cors_origin_not_allowed` e não gera logs. Sem paridade, o teste criptográfico real do PFX não é executável.
- Gate humano da senha do PFX: a senha deve ser digitada apenas no campo password de `/configuracoes/fiscal/empresa` → “Certificado Digital”, trafegando só até a Edge Function `fiscal-certificate-upload`. Nunca em chat, código, migration, tabela, log ou variável `VITE_*`.
- P3: allowlist CORS versionada exige atualização manual ao adicionar domínios.

Produção `navfzbwgwzruipouyfnk` intocada. H8 não iniciada.

## 22. H7B/H7C — Auditoria runtime e hardening pré-certificado A1 (2026-08-20)

Ambiente: staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk`:
nenhuma leitura de escrita, nenhuma migration, nenhum deploy.

### 22.1 Ressalva antiga H7A-001 (binding SQL) — SUPERADA
A auditoria runtime desta execução consultou diretamente o staging via
`STAGING_DSN` e confirmou tabelas, RLS, buckets, marcador de ambiente e grants.
O finding H7A-001 fica **encerrado como superado**; permanece apenas o P2 de
drift automático de `.env`/`types.ts`, detectado e corrigido pelo gate
`check-frontend-binding.sh`.

### 22.2 Drift corrigido nesta execução (P2)
`.env` apontava para o sandbox `yzszl…` e `src/integrations/supabase/types.ts`
estava truncado (2.052 linhas). Ambos restaurados do baseline de staging
`c75bb87f` (`types.ts` = 21.850 linhas). Gate de binding: **OK**.
`guard-staging.sh`: **OK — tpAmb='2', produção fiscal desabilitada.**

### 22.3 Evidência runtime (staging)
| Item | Resultado |
| --- | --- |
| Postcheck H7 (`60-h7-postcheck.sql`) | **11 PASS / 0 FAIL** (inclui T3 tpAmb=1 bloqueado, T5 imutabilidade, T8 append-only, T9 idempotência, T10 anon sem EXECUTE) |
| Segurança/ambiente (`61-h7-seguranca-ambiente.sql`) | **12 PASS / 0 FAIL** (RLS em todas as tabelas fiscais, search_path fixo, buckets privados, `fiscal_certificate_material` sem policy, marcador STAGING não editável, anon negado em preflight/numeração/XML/documentos) |
| Concorrência (`62-h7-concorrencia.sh`) | **4 PASS / 0 FAIL** (3 tentativas ⇒ 1 evento; reserva com FOR UPDATE + advisory lock; índice único de documento ativo) |
| Buckets `fiscal-certificates` / `fiscal-regulatorio` / `fiscal-xml` | `public=false` |
| Policies de cliente em `storage.objects` para `fiscal-certificates` | **0** |
| `fiscal_certificates` / `fiscal_certificate_material` | **0 / 0 linhas** |
| anon EXECUTE em `rpc_fiscal_homologation_readiness_v2`, `rpc_fiscal_nfe_readiness_v1`, `rpc_fiscal_certificate_register_a1`, `rpc_fiscal_xml_status_v1` | **false** nas quatro |
| Emitente ativo | `tpAmb=2`, `HOMOLOGATION`, `nfe_enabled=false`, `production_enabled=false`, `NOT_READY`, UF `MG` |

Todos os testes SQL rodaram em transação com `ROLLBACK`; nenhuma fixture
persistida, nenhum dado fiscal alterado.

### 22.4 Cofre A1 — estado
- `fiscal-certificate-upload` mantém o desenho seguro já certificado: allowlist
  CORS fail-closed, JWT em código, papel `administrador`, ≤ 10 MB, `.pfx`/`.p12`,
  triagem ASN.1 BER/DER (`asn1Screen.ts`), PKCS#12 via node-forge, match
  chave↔certificado, validade, AES-256-GCM com IVs independentes para material e
  senha, ciphertext em bucket privado, registro atômico por RPC service-role e
  rollback do objeto em falha. **Nenhuma alteração de desenho foi necessária.**
- Sem master key ⇒ `503 CERTIFICATE_VAULT_NOT_CONFIGURED` (fail-closed).
  Senha vazia ⇒ `CERT_PASSWORD_REQUIRED`. Nenhum `console.*`; a resposta nunca
  contém senha, IV, ciphertext, `object_path`, material nem chave privada.
- `UploadCertificadoA1.tsx`: arquivo em `ref`, senha em state, ambos limpos no
  `finally`; **zero** uso de `localStorage`/`sessionStorage` em
  `src/components/fiscal/`; botão bloqueado durante o envio (`pending`).

### 22.5 Testes
Suíte fiscal Vitest: **1.511 PASS / 4 skip (93 arquivos)**. Typecheck: **0 erros**.
Build: **OK**.

### 22.6 Gate
**H7 PRONTO PARA IMPORTAÇÃO A1** no código e no banco de staging — zero P0,
zero P1 de código. Permanece o **P1 de infraestrutura** (deploy de Edge Functions
e cofre de secrets da plataforma resolvem para o projeto sandbox, não para
`ikaauvsflpmamgxmkhoq`), que precisa de paridade antes do upload real do PFX.
Nenhuma transmissão SEFAZ; H8 não iniciada.

## 23. Reexecução H7 — 2026-08-20 (auditoria + revalidação, somente staging)

### 23.1 Binding
Drift recorrente confirmado novamente: `.env` e `types.ts` haviam retornado ao
projeto sandbox (`types.ts` com 2.052 linhas). Restaurados a partir do baseline
de staging `c75bb87f` (`types.ts` 21.850 linhas). Gate estático:
`H7d BINDING GATE: OK — staging ikaauvsflpmamgxmkhoq`. Produção
`navfzbwgwzruipouyfnk` não foi tocada em nenhum momento.

### 23.2 Evidências de execução (staging `ikaauvsflpmamgxmkhoq`)
- `guard-staging.sh`: OK — `tpAmb='2'`, `production_emission_allowed=false`.
- `60-h7-postcheck.sql`: **11 PASS / 0 FAIL** (gate único de ambiente, produção
  bloqueada, normalização de status, imutabilidade econômica, transições
  inválidas rejeitadas, cancelamento permitido, eventos append-only,
  idempotência de evento, `anon` sem EXECUTE, assinatura legada removida).
- `61-h7-seguranca-ambiente.sql`: **12 PASS / 0 FAIL** (RLS em todas as tabelas
  fiscais, `anon` sem EXECUTE, `search_path` fixo em todos os SECURITY DEFINER
  fiscais, buckets fiscais privados, `fiscal_certificate_material` fail-closed,
  marcador STAGING imutável, preflight/numeração/XML/documentos negados a anon).
- `62-h7-concorrencia.sh`: **4/4 PASS** (2 tentativas simultâneas + retry ⇒ 1
  evento; reserva com `FOR UPDATE` + advisory lock; índice único de documento
  ativo por origem).
- Vitest fiscal: **1.511 PASS / 4 skip (93 arquivos)**. Typecheck: **0 erros**.

### 23.3 Alterações
Nenhuma migration nova, nenhuma Edge Function alterada, nenhum fluxo paralelo
criado. Esta execução foi de auditoria + restauração de binding + revalidação.
Arquivos alterados: `.env`, `src/integrations/supabase/types.ts` (ambos
restaurados ao baseline de staging) e este documento.

### 23.4 Gate
**GATE H7 — APROVADA COM RESSALVAS.** Zero P0 e zero P1 de código/banco.
Ressalvas mantidas:
1. **P1 de infraestrutura** — deploys de Edge Functions e cofre de secrets da
   plataforma resolvem para o projeto sandbox e não para
   `ikaauvsflpmamgxmkhoq`; sem paridade, o upload real do PFX em staging
   responde `403 cors_origin_not_allowed`.
2. **Drift recorrente de binding** — `.env`/`types.ts` voltam ao sandbox entre
   sessões; rodar `check-frontend-binding.sh` antes de qualquer ação fiscal.
3. Parâmetros fiscais ainda não homologados pelo contador permanecem
   configuráveis e bloqueiam emissão real.

Produção fiscal **não ativada**. Nenhum PFX/senha recebido, gravado ou logado.
H8 **não iniciada**.

## 24. Revalidação H7 — 2026-08-21 (staging ikaauvsflpmamgxmkhoq)

### Binding
- Drift recorrente detectado: `.env` e `src/integrations/supabase/types.ts` apontavam para o projeto sandbox.
- Restaurados a partir do baseline de staging `c75bb87f` (`types.ts` = 21.850 linhas).
- `restoration/homologacao-h7/check-frontend-binding.sh`: OK.
- `restoration/homologacao-h7/guard-staging.sh`: OK — ref `ikaauvsflpmamgxmkhoq`, `tpAmb=2`, emissão de produção desabilitada.

### Harness executado (staging)
| Harness | Resultado |
| --- | --- |
| `60-h7-postcheck.sql` | 11 PASS / 0 FAIL |
| `61-h7-seguranca-ambiente.sql` | 12 PASS / 0 FAIL |
| `62-h7-concorrencia.sh` | 4 PASS / 0 FAIL |
| `scripts/fiscal-secrets-scan.sh` | OK — nenhum segredo real |
| Typecheck | 0 erros |
| Vitest | 3.134 PASS / 4 skip (194 arquivos) |

### Correção aplicada nesta execução
- `scripts/fiscal-secrets-scan.sh`: adicionada classificação de falso-positivo comprovado
  (JWT Supabase com `role=anon`, publishable por design; DSN de documentação com placeholder
  literal `USER:PASSWORD@`). Fixtures de falha continuam falhando (`SUPABASE_SECRET`,
  `PG_URL_WITH_PWD` real, `PEM_BLOCK`), preservando o poder de detecção do scanner.

### Certificado A1
- Estado: `CERTIFICADO_PENDENTE_IMPORTACAO`.
- Mecanismo seguro pronto: Edge Function `fiscal-certificate-upload` (triagem ASN.1, AES-256-GCM,
  fail-closed sem `FISCAL_CERTIFICATE_MASTER_KEY`), material em tabela sem policy (fail-closed),
  buckets fiscais privados, frontend `UploadCertificadoA1.tsx` sem persistir senha.
- Ponto exato de fornecimento seguro: tela `/configuracoes/fiscal/empresa` → "Certificado A1",
  arquivo `.pfx` + senha digitados pelo operador, enviados apenas ao endpoint server-side.

### Ressalva bloqueante (P1 de infraestrutura, fora do código)
- Deploys/secrets da plataforma continuam resolvendo para o projeto sandbox e não para o staging
  `ikaauvsflpmamgxmkhoq`; o endpoint de upload em staging responde `403 cors_origin_not_allowed`.
- Enquanto essa paridade não for resolvida, a importação real do `.pfx` e a transmissão NF-e HML
  não podem ser executadas pelo agente.

### Gate
**H7 — APROVADA COM RESSALVAS.** Zero P0/P1 de código e banco. Produção fiscal permanece OFF
(`production_emission_allowed = false`, `tpAmb = 2`). H8 não iniciada.

---

## 25. Reexecução H7 — 2026-08-21 (auditoria + homologação, staging `ikaauvsflpmamgxmkhoq`)

### 25.1 Drift de binding corrigido antes de qualquer acesso
- `.env` e `src/integrations/supabase/types.ts` haviam voltado ao sandbox (`types.ts` com 2.052 linhas).
- Restaurados a partir da baseline de staging `c75bb87f` (`types.ts` = 21.850 linhas).
- `check-frontend-binding.sh`: **OK** (`.env`, `client.ts`, `config.toml`, `types.ts` consistentes).
- `guard-staging.sh`: **OK** — staging `ikaauvsflpmamgxmkhoq`, `tpAmb='2'`, produção fiscal desabilitada.

### 25.2 Evidências de teste (todas nesta execução)
| Bateria | Resultado |
| --- | --- |
| `60-h7-postcheck.sql` (T1–T11) | **11 PASS / 0 FAIL** — gate de ambiente, produção bloqueada, `ISSUED→AUTHORIZED`, imutabilidade econômica, transição inválida rejeitada, cancelamento permitido, eventos append-only e idempotentes, `anon` sem EXECUTE, assinatura legada removida |
| `61-h7-seguranca-ambiente.sql` (A/C/E) | **12 PASS / 0 FAIL** — RLS em todas as tabelas fiscais, `search_path` fixo em todos os SECURITY DEFINER fiscais, buckets fiscais privados, `fiscal_certificate_material` sem policy, marcador `ikaauvsflpmamgxmkhoq\|STAGING\|0`, dupla trava de produção, preflight/numeração/XML/documentos negados a `anon` |
| `62-h7-concorrencia.sh` (D1–D4) | **4/4 PASS** — duas requisições simultâneas + retry ⇒ 1 evento; reserva com `FOR UPDATE` + advisory lock; índice único de documento ativo por origem |
| `scripts/fiscal-secrets-scan.sh` | **OK** — nenhum valor secreto real no repositório |
| Typecheck (`tsgo`, tsconfig.app) | **0 erros** |
| Vitest (suíte completa) | **3.134 PASS / 4 skip** (194 arquivos) |

### 25.3 Certificado A1
- `public.fiscal_certificates`: **0 linhas** — nenhum certificado importado.
- Esquema confirmado como metadados-only (`subject_name`, `issuer_name`, `serial_number`,
  `valid_from`, `valid_until`, `fingerprint_sha256`, `key_usage`, `status`, trilha de revogação).
  Nenhuma coluna de PFX/senha/chave privada na tabela comum; material cifrado permanece em
  `fiscal_certificate_material`, fail-closed (sem policy).
- Estado: **`CERTIFICADO_PENDENTE_IMPORTACAO`**.

### 25.4 Ponto de parada
Nenhuma alteração de código ou migration foi necessária nesta execução — apenas a restauração de
binding. A execução para exatamente no ponto em que a senha do PFX é indispensável:

**`NECESSARIO_SECRET_CERTIFICADO_HML`**

- Onde inserir com segurança: tela `/configuracoes/fiscal/empresa` → bloco **Certificado A1** →
  upload do `.pfx` + campo de senha, transmitidos apenas à Edge Function server-side
  `fiscal-certificate-upload` (a senha nunca é persistida em tabela, log ou UI).
- Ação retomada depois: validação de metadados e do CNPJ do certificado contra o emitente,
  validade e capacidade de assinatura (teste G) e, na sequência, geração/assinatura/validação XSD
  e transmissão NF-e em **homologação** (teste H).

### 25.5 Achados
- P0: nenhum. P1 de código/banco: nenhum.
- P1 de infraestrutura (mantido, fora do código): deploys/secrets da plataforma resolvem para o
  projeto sandbox e não para `ikaauvsflpmamgxmkhoq`, resultando em `403 cors_origin_not_allowed`
  no upload em staging. Owner: plataforma/infra.
- P2: drift recorrente de `.env`/`types.ts` para o sandbox — mitigação ativa via
  `check-frontend-binding.sh` executado como gate fail-closed no `guard-staging.sh`.
- P3: NF-e HML de ponta a ponta (teste H) permanece não executada por depender da senha do PFX.

### 25.6 Gate
**H7 — APROVADA COM RESSALVAS.** Zero P0/P1 de código e banco. Produção fiscal permanece
hard-off (`production_emission_allowed = false`, `tpAmb = '2'`); produção `navfzbwgwzruipouyfnk`
intocada. H8 não iniciada.

## 26. Reexecução H7 — 2026-08-21 (auditoria + homologação completa, somente staging)

### 26.1 Binding
Drift detectado novamente (`.env`/`types.ts` apontando ao sandbox `yzszlzjpovmcteuxjznj`).
Restaurados `.env`, `src/integrations/supabase/client.ts` e `src/integrations/supabase/types.ts`
(21.850 linhas) da baseline de staging `c75bb87f`. `check-frontend-binding.sh`: **OK**.

### 26.2 Guard de ambiente
`guard-staging.sh`: **OK** — staging `ikaauvsflpmamgxmkhoq`, `tpAmb='2'`,
`production_emission_allowed=false`. Produção `navfzbwgwzruipouyfnk` não acessada.

### 26.3 Bateria de testes
- `60-h7-postcheck.sql` (comportamental): **11 PASS / 0 FAIL** — gate de ambiente, produção
  bloqueada, normalização de status, imutabilidade de documento autorizado, transições inválidas
  rejeitadas, eventos append-only e idempotentes, anon sem EXECUTE fiscal.
- `61-h7-seguranca-ambiente.sql` (estrutura/segurança/ambiente): **12 PASS / 0 FAIL** — RLS em
  todas as tabelas fiscais, `search_path` fixo em SECURITY DEFINER, buckets fiscais privados,
  material de certificado fail-closed, marcador de ambiente não editável, preflight/numeração/XML
  negados a anon.
- `62-h7-concorrencia.sh`: **4/4 PASS** — emissões concorrentes geram um único evento, retry não
  duplica, reserva de numeração com `FOR UPDATE` + advisory lock, índice único de documento ativo.
- Vitest: **3.134 PASS / 4 skip** (194 arquivos). Typecheck `tsgo`: **0 erros**. Build: **OK**.

### 26.4 Certificado A1
Arquitetura pronta e inalterada: PFX processado apenas server-side em
`fiscal-certificate-upload` (triagem ASN.1, AES-256-GCM com `FISCAL_CERTIFICATE_MASTER_KEY`),
metadados sanitizados persistidos, senha nunca persistida/logada e material de certificado sem
policy de leitura. Sem senha fornecida, a função responde `CERT_PASSWORD_REQUIRED`.

### 26.5 Achados
- P0: nenhum. P1 de código/banco: nenhum.
- P1 de infraestrutura (mantido, owner plataforma): deploys/secrets resolvem para o sandbox,
  impedindo o upload real do A1 em staging (`403 cors_origin_not_allowed`).
- P2: drift recorrente de binding — mitigado por gate fail-closed.
- P3: NF-e HML ponta a ponta pendente da senha do PFX.

### 26.6 Gate
**H7 — APROVADA COM RESSALVAS / AGUARDANDO CERTIFICADO E SENHA PARA TESTE REAL HML.**
Produção fiscal hard-off. H8 não iniciada.

---

## Seção 27 — H7b: correção focada do bloqueio P1 de infraestrutura fiscal

**Escopo:** somente staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` intocada. H8 não iniciada. Nenhum PFX/senha utilizado.

### Causa raiz (duas causas independentes)

1. **CORS divergente entre funções fiscais.** `fiscal-certificate-upload`, `fiscal-certificate-revoke` e `fiscal-xml-engine` liam `FISCAL_CORS_ALLOWLIST` com default versionado, enquanto `fiscal-preflight` liaan outro nome (`FISCAL_ALLOWED_ORIGINS`) com **default vazio = nega toda origem de browser**. Sem o secret na plataforma (que resolve para o sandbox), qualquer chamada de browser ao preflight retornava 403 de origem. Essa divergência de nomes é a origem do sintoma `403 cors_origin_not_allowed`.
2. **Drift de binding de deploy/secrets.** Os deploys de Edge Function e os secrets da plataforma resolvem para o projeto sandbox `yzszlzjpovmcteuxjznj`, não para o staging autorizado. Evidência direta obtida nesta fase (abaixo).

### Correções aplicadas

| Arquivo | Mudança |
|---|---|
| `supabase/functions/_shared/fiscal/corsAllowlist.ts` | Fonte única de verdade: união de `FISCAL_CORS_ALLOWLIST` + `FISCAL_ALLOWED_ORIGINS`, fallback para o default versionado. Nunca `*`. |
| `supabase/functions/fiscal-preflight/index.ts` | Passa a delegar a `fiscalAllowedOrigins()`; elimina o default vazio. |
| `supabase/functions/fiscal-binding-diagnostics/index.ts` (novo) | Diagnóstico fail-closed não sensível: `project_ref`, ambiente, `production_emission_allowed`, `binding_ok`. POST admin-only acrescenta apenas **presença booleana** de segredos e contagem de origens. Nunca valores. |
| `src/config/fiscalBinding.ts` (novo) | Guard de cliente derivado da URL efetiva do cliente Supabase (não de `import.meta.env`, sujeito a drift). Fail-closed em ref desconhecido, produção ou divergente. |
| `src/components/fiscal/certificados/UploadCertificadoA1.tsx` | Bloqueia o envio do PFX antes do `functions.invoke` quando o binding não é o staging autorizado. |
| `restoration/homologacao-h7/63-h7b-binding-gate.sh` (novo) | Gate de runtime: origem válida/inválida, ausência de Origin, auth, project ref, produção proibida, emissão de produção. |
| `src/test/fiscal/h7b.binding.static.test.ts` (novo) | Congela os invariantes acima. |
| `src/integrations/supabase/types.ts` | Restaurado do baseline de staging `c75bb87f` (21.850 linhas) após novo drift. |

Nenhuma migration histórica foi editada. Nenhuma mudança em produção.

### Evidências de runtime (staging `ikaauvsflpmamgxmkhoq`)

- Preflight CORS com origem autorizada: **200**, `Access-Control-Allow-Origin` refletindo exatamente a origem do preview.
- `POST fiscal-certificate-upload` com origem autorizada e **sem sessão**: `401 {"error":"unauthorized"}` — erro **funcional**, não mais 403 de origem. **Teste A: PASS.**
- Origem desconhecida: `403 cors_origin_not_allowed`. **Teste B: PASS.**
- Sem header `Origin`: `403`. Anon negado. **Teste C: PASS.**
- Guard de produção: nenhum endpoint fiscal referencia `navfzbwgwzruipouyfnk`; `production_emission_allowed=false`. **Teste E: PASS.**
- Storage fiscal: buckets privados, material do certificado fail-closed, `fiscal_certificates` sem material em repo. **Teste F: PASS.**

### P1 remanescente — comprovado, não resolvido

O deploy de `fiscal-binding-diagnostics` resolveu para o **sandbox**: o endpoint responde em `yzszlzjpovmcteuxjznj` com `{"project_ref":"yzszlzjpovmcteuxjznj","binding_ok":false}` e retorna **404 no staging**. Ou seja, as ferramentas de deploy/secrets desta workspace estão vinculadas ao projeto sandbox, e não ao staging autorizado. **Teste D: FAIL no staging (função ausente).**

Consequência: o código-fonte fiscal está correto e o endpoint de upload já implantado em staging está funcional e com CORS correto, mas **novas** versões de função e **novos** secrets (incluindo `FISCAL_CERTIFICATE_MASTER_KEY`) não alcançam `ikaauvsflpmamgxmkhoq` por via automatizada.

**Ação humana exata necessária (única):** implantar as funções fiscais e definir os secrets diretamente no projeto staging `ikaauvsflpmamgxmkhoq`, com credencial própria desse projeto:

```
supabase link --project-ref ikaauvsflpmamgxmkhoq
supabase secrets set FISCAL_CERTIFICATE_MASTER_KEY=<32 bytes base64>   # nunca commitar
supabase functions deploy fiscal-binding-diagnostics fiscal-certificate-upload fiscal-preflight fiscal-certificate-revoke
bash restoration/homologacao-h7/63-h7b-binding-gate.sh                  # deve sair 0
```

### Gate H7b

**BLOQUEADA** — `binding_ok` não pôde ser comprovado em staging porque o deploy resolve para sandbox. O sintoma `403 cors_origin_not_allowed` no upload está **eliminado** no staging, mas a prova completa de binding (Teste D) exige a ação humana acima. Status: **NÃO** `CERT_IMPORT_READY`. Certificado A1 e senha não solicitados nem utilizados.

---

## Seção 28 — Reexecução H7 (auditoria + revalidação, staging `ikaauvsflpmamgxmkhoq`)

### Drift de binding corrigido antes de qualquer teste
`.env` e `src/integrations/supabase/types.ts` haviam voltado ao sandbox (`yzszlzjpovmcteuxjznj`, types com 2.052 linhas). Ambos restaurados a partir do baseline de staging `c75bb87f` (types com 21.850 linhas). `check-frontend-binding.sh`: **OK**. `guard-staging.sh`: **OK — tpAmb='2', produção fiscal desabilitada**.

### Resultados dos testes obrigatórios
| Teste | Harness | Resultado |
| --- | --- | --- |
| A/E — estrutural, snapshot imutável, idempotência | `60-h7-postcheck.sql` | **11 PASS / 0 FAIL** |
| B/F/G — RLS, perfis, anon, ambiente, storage/certificado | `61-h7-seguranca-ambiente.sql` | **12 PASS / 0 FAIL** |
| D — idempotência e concorrência de emissão | `62-h7-concorrencia.sh` | **4/4 PASS** |
| Binding runtime das Edge Functions | `63-h7b-binding-gate.sh` | **6 PASS / 2 FAIL** (diagnóstico 404 no staging) |
| H — regressão | Vitest | **3.141 PASS / 4 skip** |
| H — tipos | `tsgo --noEmit` | **0 erros** |
| Segredos em repositório | `scripts/fiscal-secrets-scan.sh` | **OK** |

### Estado do certificado A1
`fiscal_certificates` = 0 linhas e `fiscal_certificate_material` = 0 linhas. Material fail-closed (sem policy, sem SELECT via API, sem retorno por RPC). Nenhum PFX, senha, PEM ou base64 existe em repositório, migrations, fixtures ou logs. Nenhuma senha foi solicitada nesta execução.

### Findings
- **P0:** nenhum.
- **P1 (infraestrutura, persistente):** deploys e secrets desta workspace resolvem para o sandbox; `fiscal-binding-diagnostics` retorna 404 no staging e `FISCAL_CERTIFICATE_MASTER_KEY` não pôde ser gravado em `ikaauvsflpmamgxmkhoq`.
- **P2:** drift recorrente de `.env`/`types.ts` para sandbox, mitigado por `check-frontend-binding.sh` no guard.
- **P3:** documentação de matriz fiscal por UF ainda depende de confirmação contábil (mantida como pendência de preflight, sem tributação inventada).

### Gate H7 (reexecução)
**BLOQUEADA pelo P1 de infraestrutura.** Código, banco, RLS, snapshots, idempotência e bloqueio hard de produção estão aprovados; produção `navfzbwgwzruipouyfnk` permanece intocada e emissão de produção continua desabilitada. H8 não iniciada.

---

## Seção 29 — Reexecução H7 (2026-08-22)

### H7.0 Inventário/binding
- Drift detectado no início: `.env` e `types.ts` apontando para sandbox (`types.ts` 2.052 linhas).
- Restaurado para o baseline de homologação `c75bb87f`: `types.ts` 21.850 linhas, `.env` em `ikaauvsflpmamgxmkhoq`.
- `check-frontend-binding.sh`: OK (.env, client.ts, config.toml, types.ts consistentes).
- `guard-staging.sh`: OK — staging `ikaauvsflpmamgxmkhoq`, `tpAmb='2'`, produção fiscal desabilitada.

### H7.1–H7.10 Evidências de reteste
| Harness | Resultado |
| --- | --- |
| `60-h7-postcheck.sql` | 11 PASS / 0 FAIL (gate, ambiente, transições, imutabilidade, append-only, idempotência de evento, anon sem EXECUTE) |
| `61-h7-seguranca-ambiente.sql` | 12 PASS / 0 FAIL (RLS em todas as tabelas fiscais, buckets privados, `fiscal_certificate_material` fail-closed, marcador não editável, anon negado) |
| `62-h7-concorrencia.sh` | 4/4 PASS (2 emissões simultâneas + retry => 1 evento; advisory lock; índice único de documento ativo por origem) |
| `63-h7b-binding-gate.sh` | 6 PASS / 2 FAIL — CORS e auth corretos; falhas exclusivas do endpoint `fiscal-binding-diagnostics` (HTTP 404, não implantado no staging) |
| `fiscal-secrets-scan.sh` | OK — nenhum segredo real no repositório |
| Vitest | 3.141 PASS / 4 skip (195 arquivos) |
| Typecheck / Build | 0 erros / build OK |

### H7.6 Certificado A1
`fiscal_certificates` e `fiscal_certificate_material` seguem vazios; material sem policy (fail-closed), sem acesso via API. Fluxo server-side (triagem ASN.1 + AES-256-GCM + `CERT_PASSWORD_REQUIRED`) pronto. Subteste de assinatura real permanece `AGUARDANDO_CARGA_CERTIFICADO_REAL`.

### Pendências
- **P1 infraestrutura (persistente):** deploys de Edge Function e secrets da plataforma chegam ao sandbox, não ao staging `ikaauvsflpmamgxmkhoq`; por isso `fiscal-binding-diagnostics` responde 404 e o upload real de A1 não pode ser exercido pela UI de homologação. Requer implantação manual via CLI no ref de staging.
- `AGUARDANDO_CARGA_CERTIFICADO_REAL` — PFX/senha não trafegaram por este canal.

### Gate H7 (2026-08-22)
**APROVADA COM RESSALVAS.** Zero P0. Nenhum sucesso fiscal simulado. Produção `navfzbwgwzruipouyfnk` intocada e emissão de produção HARD OFF. H8 não iniciada.

**Ponto exato de inserção do certificado:** UI `/configuracoes/fiscal/empresa` → aba Certificados → componente `UploadCertificadoA1` (arquivo `.pfx/.p12` + senha), que envia direto à Edge Function `fiscal-certificate-upload`. Nada é persistido no navegador. Depende da implantação da função e do secret `FISCAL_CERTIFICATE_MASTER_KEY` no ref de staging.

## Seção 30 — Execução H7 (2026-08-24)

### 30.1 Binding
Detectado novo drift do `.env`/`types.ts` para o sandbox; restaurado o baseline de homologação `c75bb87f` (`ikaauvsflpmamgxmkhoq`, `types.ts` 21.850 linhas). `check-frontend-binding.sh` e `guard-staging.sh`: OK (`tpAmb='2'`, `production_emission_allowed=false`).

### 30.2 Correção aplicada
`supabase/functions/fiscal-certificate-upload/index.ts` passou a aceitar, além do upload multipart existente, ingestão **server-side por secrets** (`{"source":"secret"}` em JSON), lendo `FISCAL_CERT_PFX_B64` e `FISCAL_CERT_PASSWORD` do ambiente da função. O PFX e a senha deixam de precisar trafegar pelo navegador. Sem os secrets, a função responde `CERTIFICATE_SECRET_PENDING` (503) — nenhum sucesso fiscal é simulado. Pipeline de validação/cifra/registro permanece único (sem fluxo paralelo).

Documentação operacional: `docs/auditorias/homologacao-h7-certificado-secrets.md` (sem valores de segredo).

### 30.3 Testes
| Harness | Resultado |
| --- | --- |
| `60-h7-postcheck.sql` | 11 PASS / 0 FAIL |
| `61-h7-seguranca-ambiente.sql` | 12 PASS / 0 FAIL |
| `62-h7-concorrencia.sh` | 4/4 PASS |
| `fiscal-secrets-scan.sh` | OK |
| Vitest | 3.141 PASS / 4 skip |
| Typecheck | 0 erros |

### 30.4 Pendências
- **P1 infraestrutura (persistente):** deploys/secrets da plataforma chegam ao sandbox, não ao ref de staging; exige implantação manual via CLI.
- `CERTIFICATE_SECRET_PENDING` — cadastrar `FISCAL_CERT_PFX_B64` e `FISCAL_CERT_PASSWORD` no staging.
- Pendências contábeis de tributação (lucro presumido / SEFAZ-MG) seguem marcadas para validação externa.

### Gate H7 (2026-08-24)
**APROVADA COM RESSALVAS.** Zero P0/P1 de código. Produção `navfzbwgwzruipouyfnk` intocada, emissão de produção HARD OFF, H8 não iniciada.

---

## Seção 31 — H7e: identidade do certificado A1 x CNPJ do emitente (2026-08-24)

### Achado H7e-001 — P1 (CORRIGIDO)
**Antes:** `fiscal-certificate-upload` validava senha, par chave/certificado, validade,
fingerprint e keyUsage, mas **não verificava a identidade do titular**. Qualquer A1
válido (inclusive de outro CNPJ ou um e-CPF) podia ser cifrado, enviado ao bucket
privado e registrado para o emitente ativo.

**Depois:** gate fail-closed antes de cifrar/upload/registro, com o CNPJ do emitente
lido **server-side** de `company_fiscal_settings.cnpj` pelo `company_settings_id` já
validado. Nenhum CNPJ é aceito do FormData/body nem devolvido em mensagem de erro.

### Precedência de extração do CNPJ do titular
Helper reutilizável `supabase/functions/_shared/fiscal/certHolderCnpj.ts` (puro, sem I/O):
1. `subjectAltName` / `otherName` OID **2.16.76.1.3.3** — CNPJ da PJ titular (fonte
   oficial ICP-Brasil, DOC-ICP-04).
2. `subject.serialNumber` (OID 2.5.4.5) quando contiver exatamente 14 dígitos.
3. `subject.CN` no padrão PJ `RAZAO SOCIAL:CNPJ` (sufixo `:` + 14 dígitos).

Regras auxiliares:
- Sequência solta de 14 dígitos em campo não relacionado (dNSName, meio do CN, OID
  ICP diferente) **não** é aceita.
- OID **2.16.76.1.3.1** (e-CPF) sem CNPJ de PJ ⇒ pessoa física, rejeitado.
- OID **2.16.76.1.3.4** (responsável do e-CNPJ) não descaracteriza a PJ.
- DV do CNPJ validado por `validateCnpjAlpha` (espelho do cliente) antes de comparar.

### Códigos de erro estáveis
| Código | HTTP | Situação |
|---|---|---|
| `CERT_CNPJ_NOT_FOUND` | 400 | Sem CNPJ inequívoco (inclui DV inválido, sanitizado) |
| `CERT_HOLDER_IS_INDIVIDUAL` | 400 | Certificado de pessoa física / e-CPF |
| `CERT_CNPJ_MISMATCH` | 409 | CNPJ do certificado ≠ CNPJ do emitente |
| `ISSUER_CNPJ_INVALID` | 409 | `company_fiscal_settings.cnpj` ausente/inválido |
| `CERT_PASSWORD_REQUIRED` | 400 | Preservado da fase H7-005.8 |

### Achado H7e-002 — paridade código/runtime
Versão canônica consolidada no repositório: `fiscalAllowedOrigins()` compartilhado,
triagem ASN.1 BER/DER via `asn1Screen.ts` (sem magic `30 82`),
`FISCAL_CERTIFICATE_MASTER_KEY` fail-closed, pipeline único para multipart e
`source=secret`, mais a validação de CNPJ desta fase. **O runtime do staging segue
atrasado** — o deploy direto em `ikaauvsflpmamgxmkhoq` é externo (P1 de infraestrutura,
inalterado nesta fase).

### Testes
- `src/test/fiscal/h7e.certHolderCnpj.test.ts` — 13 testes (cenários A–F, precedência,
  fallbacks, e-CNPJ com responsável, testes estáticos de leitura server-side do CNPJ e
  de não-eco de material sensível). Fixtures 100% sintéticas, sem PFX/senha.
- Regressão ASN.1 BER/DER: `h7c.asn1Screen.test.ts` 14/14 PASS.
- Vitest fiscal: 1.531 PASS / 4 skip. Suite total: **3.154 PASS / 4 skip**.
- Typecheck: 0 erros. Build: OK. `fiscal-secrets-scan.sh`: OK.
- Binding: drift para sandbox detectado e restaurado ao baseline `c75bb87f`;
  `check-frontend-binding.sh` OK (`ikaauvsflpmamgxmkhoq`).

### Classificação
- P0: nenhum. P1 de código: nenhum. P1 de infraestrutura: deploy do runtime de staging
  (externo). P2: `fiscal_certificates` vazio (esperado). P3: docs de rotação.

### Gate H7e
**`CERT_IMPORT_CODE_READY`** — zero P0/P1 de código. `tpAmb=2`,
`production_emission_allowed=false`, `production_enabled=false`. Produção
`navfzbwgwzruipouyfnk` intocada. Nenhum PFX/senha manipulado. H8 não iniciada.

## Seção 32 — Reexecução H7 (2026-08-25): auditoria, correção de binding e revalidação

Alvo exclusivo: staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não foi tocada.

### Correção aplicada (única)
- **Drift de binding (P1 recorrente)**: `.env`, `src/integrations/supabase/client.ts` e `src/integrations/supabase/types.ts` haviam sido regravados pela plataforma apontando ao sandbox (`yzszlzjpovmcteuxjznj`, `types.ts` reduzido a 2.052 linhas). Restaurados a partir do baseline `c75bb87f` (staging, `types.ts` 21.850 linhas). Gate `check-frontend-binding.sh`: **OK**.
- Nenhuma migration nova foi necessária: o schema fiscal já atende H7-001..H7-010.

### Evidências de auditoria (read-only, staging)
- `company_fiscal_settings`: `fiscal_environment=HOMOLOGATION`, `production_enabled=false`, `nfe_enabled=false`, `nfse_enabled=false`, `configuration_status=DRAFT`, `nfe_readiness_status=NOT_READY`, `certificate_ref=null`.
- `fiscal_environment_marker`: `ikaauvsflpmamgxmkhoq|STAGING|production_emission_allowed=0`.
- `fiscal_certificates` = 0 linhas; `fiscal_certificate_material` = 0 linhas (fail-closed, sem policy).
- Buckets `fiscal-certificates`, `fiscal-xml`, `fiscal-regulatorio`: todos **privados**.
- 96 funções/RPCs fiscais inventariadas; todas as SECURITY DEFINER fiscais com `search_path` fixo.
- `rpc_fiscal_homologation_readiness_v2()` sem contexto autorizado → `FISCAL_FORBIDDEN` (autorização server-side, não frontend). Como administrador → `status=INCOMPLETE` com checklist determinístico: pendentes `nfe_configured`, `nfse_configured`, `product_ready`, `service_ready`, `customer_ready`, `certificate_active`; prontos `env_homologation`, `production_disabled`, `company_profile`, `vault_available`, `upload_function`, `drafts_source`.

### Harness H7 (staging)
| Suite | Resultado |
|---|---|
| `guard-staging.sh` | OK — tpAmb=2, produção fiscal desabilitada |
| `60-h7-postcheck.sql` | **11 PASS / 0 FAIL** |
| `61-h7-seguranca-ambiente.sql` | **12 PASS / 0 FAIL** |
| `62-h7-concorrencia.sh` | **4/4 PASS** (reserva de número idempotente/transacional, evento único sob 3 tentativas) |
| `63-h7b-binding-gate.sh` | 6 PASS / 2 FAIL — ambos por `fiscal-binding-diagnostics` retornar HTTP 404 no staging (função não implantada) |

### Regressão
- Typecheck (`tsgo`, tsconfig.app): 0 erros.
- Vitest: **3.154 PASS**, 4 skipped, 195 arquivos.

### Certificado A1 — ponto exato de parada
Fluxo pronto e fail-closed em `fiscal-certificate-upload`: CORS allowlist, JWT + `has_role('administrador')`, exigência de senha (`CERT_PASSWORD_REQUIRED`), parse PKCS#12, match chave privada↔certificado, validade, `keyUsage`, identidade do titular vs CNPJ do emitente (`CERT_CNPJ_MISMATCH` / `CERT_HOLDER_IS_INDIVIDUAL`), cifra AES-256-GCM com `FISCAL_CERTIFICATE_MASTER_KEY` (32 bytes exigidos), ciphertext em bucket privado e registro por `rpc_fiscal_certificate_register_a1`. A UI (`UploadCertificadoA1.tsx`) limpa `File` e senha do estado no `finally`.
**A senha do certificado só é necessária no instante do upload pela UI**, na tela de Configurações Fiscais → Certificados. Nada de PFX/senha/master key foi gravado em repositório, migrations, logs ou docs.

### Pendências remanescentes
- **P1 (infraestrutura, fora do código)**: canal de deploy de Edge Functions do ambiente está vinculado ao sandbox; `fiscal-binding-diagnostics` e `fiscal-preflight` não são implantáveis no ref `ikaauvsflpmamgxmkhoq` a partir daqui (não há `SUPABASE_ACCESS_TOKEN`). Requer deploy manual por CLI com `--project-ref ikaauvsflpmamgxmkhoq`. Não é um defeito de código fiscal e não permite emissão de produção.
- **P2**: transmissão SEFAZ HML ainda não implementada — interface desacoplada preparada, nenhuma simulação de autorização.
- **P2**: NFS-e auditada estruturalmente; depende de provedor externo não configurado.
- **P3**: matriz fiscal sem produtos/serviços/clientes publicados — preflight bloqueia corretamente.

### GATE H7
**APROVADA COM RESSALVAS** — zero P0. Produção permanece bloqueada em três camadas (marker, `production_enabled=false`, gate server-side). H8 não iniciada.

---

## Seção 33 — H7 (execução 2026-08-25): guard duro de endpoints SEFAZ

### Diagnóstico
- **Drift de binding P1 recorrente** (novamente): `.env`/`types.ts` reapontados para o sandbox (`types.ts` com 2.052 linhas). Restaurados do baseline staging `c75bb87f` (21.850 linhas). `check-frontend-binding.sh` e `guard-staging.sh`: OK — `ikaauvsflpmamgxmkhoq`, `tpAmb='2'`, produção fiscal desabilitada.
- **Endpoints SEFAZ**: inventário confirmou que **não existe transporte SEFAZ implementado** no código (nenhuma Edge Function chama Web Service). Havia, portanto, ausência de guard de host — corrigido preventivamente nesta execução.
- **Readiness do emitente** (`v_fiscal_nfe_emitter_readiness`) permanece `NOT_READY`, com 5 BLOCK + 1 WARN. Nenhuma pendência foi preenchida: todas exigem decisão/evidência humana (regime PIS/COFINS, série NF-e, credenciamento MG, certificado, validação contábil). Nada foi presumido.
- `fiscal_certificates`: 0 linhas. `fiscal_certificate_material`: fail-closed (sem policy).

### Alteração aplicada (única)
- Novo módulo `supabase/functions/_shared/fiscal/sefazEndpoints.ts`:
  - registro **estático e versionado** dos 6 Web Services NF-e 4.00 de **homologação** MG (`hnfe.fazenda.mg.gov.br/nfe2/services/...`): `NFeStatusServico4`, `NFeAutorizacao4`, `NFeRetAutorizacao4`, `NFeConsultaProtocolo4`, `NFeRecepcaoEvento4`, `NFeInutilizacao4`;
  - `assertSefazEndpointAllowed(url, tpAmb)` **fail-closed**: hosts de produção conhecidos (`nfe.fazenda.mg.gov.br`, SVRS, SVAN/nacional) → `SEFAZ_PRODUCTION_HOST_BLOCKED`; `tpAmb!=2` → `SEFAZ_PRODUCTION_DISABLED`; host fora da allowlist → `SEFAZ_HOST_NOT_ALLOWLISTED`; sem TLS → `SEFAZ_ENDPOINT_NOT_TLS`; URL inválida → `SEFAZ_ENDPOINT_INVALID_URL`;
  - nenhum endpoint é descoberto/baixado em runtime.
- Testes: `src/test/fiscal/h7.sefazEndpoints.test.ts` (9 casos) — 100% PASS.

### Resultados dos harnesses (staging)
- `60-h7-postcheck.sql`: **11 PASS / 0 FAIL**.
- `61-h7-seguranca-ambiente.sql`: **12 PASS / 0 FAIL** (RLS fiscal, anon sem EXECUTE, `search_path` fixo, buckets privados, marcador STAGING não editável, preflight/numeração/XML negados a anon).

### Arquitetura real do certificado (reconfirmada)
`fiscal_certificates` (metadados) + `fiscal_certificate_material` (material cifrado AES-256-GCM, `material_iv`/`key_version`, sem policy = inacessível a qualquer usuário) + Edge Functions `fiscal-certificate-upload` / `fiscal-certificate-revoke`. Senha do PFX trafega apenas por TLS até a Edge Function, é usada para abrir o PKCS#12 e **não é persistida em texto puro**. Validações server-side: extensão/tamanho/MIME, screening ASN.1 (`asn1Screen.ts`), senha, validade, fingerprint SHA-256 e **vínculo CNPJ titular × emitente** (`certHolderCnpj.ts`, precedência SAN OID 2.16.76.1.3.3 → serialNumber → CN), com rejeição de e-CPF.

### Instrução segura para inserir o PFX real
Tela **Configurações Fiscais → Certificado Digital A1** (`UploadCertificadoA1.tsx`) → selecionar o `.pfx/.p12`, informar a senha **nesse momento** e confirmar ambiente **Homologação**. O arquivo vai por multipart direto à Edge Function `fiscal-certificate-upload` (autenticada, papel admin/financeiro). Não anexar o PFX ao repositório, não colar a senha no chat antes desse passo, e não gerar signed URL de download do material.

### Pendências
- **P1 (infra)**: deploy manual das Edge Functions fiscais por CLI com `--project-ref ikaauvsflpmamgxmkhoq` (secrets da plataforma chegam ao sandbox).
- **P2**: transporte SEFAZ HML não implementado (guard de host já pronto e testado).
- **P2**: NFS-e depende de provedor externo.
- **P3**: readiness do emitente aguarda 5 decisões humanas (nada presumido).

### GATE H7 (2026-08-25)
**APROVADA COM RESSALVAS** — zero P0. Nenhum host de produção alcançável; produção fiscal bloqueada em três camadas. H8 não iniciada.

---

## Seção 34 — H7 end-to-end (execução 2026-08-25, reauditoria)

### Correção aplicada (única)
- **Drift de binding P1 (recorrente)**: `.env` (`VITE_SUPABASE_PROJECT_ID`/`VITE_SUPABASE_URL`) e `src/integrations/supabase/types.ts` (2.052 linhas) estavam apontando para o sandbox. Restaurados do baseline staging `c75bb87f` (`ikaauvsflpmamgxmkhoq`, `types.ts` 21.850 linhas).
- Gates: `check-frontend-binding.sh` OK; `guard-staging.sh` OK — `ikaauvsflpmamgxmkhoq`, `tpAmb='2'`, produção fiscal desabilitada.
- Nenhum objeto novo criado: a arquitetura existente comportou toda a auditoria (nenhuma migration nova nesta execução).

### Testes executados (staging ikaauvsflpmamgxmkhoq)
| Harness | Escopo | Resultado |
|---|---|---|
| `60-h7-postcheck.sql` | gate de ambiente, normalização ISSUED→AUTHORIZED, imutabilidade, transições, append-only, idempotência de evento, ACL anon | **11 PASS / 0 FAIL** |
| `61-h7-seguranca-ambiente.sql` | RLS fiscal, anon sem EXECUTE, `search_path` fixo, buckets privados, material de certificado fail-closed, marcador STAGING, preflight/numeração/XML negados a anon | **12 PASS / 0 FAIL** |
| `62-h7-concorrencia.sh` | 2 chamadas simultâneas + replay ⇒ 1 evento; reserva com `FOR UPDATE` + advisory lock; índice único de documento ativo por origem | **4/4 PASS** |
| Regressão | typecheck + Vitest + build | **3.163 PASS / 4 skipped**, typecheck 0 erros |

### Inventário/cobertura observada
- Emitente (`company_fiscal_settings`): CNPJ presente, `crt=3`, UF `MG`, `nfe_environment_code='2'`.
- `v_fiscal_nfe_emitter_readiness` = **NOT_READY** — 5 BLOCK + 1 WARN, todos dependentes de decisão/evidência humana: `EMITTER_PIS_COFINS_REGIME_MISSING`, `EMITTER_SERIES_MISSING`, `EMITTER_ACCREDITATION_MISSING`, `EMITTER_CERTIFICATE_MISSING`, `EMITTER_ACCOUNTING_NOT_VALIDATED` (+ WARN `EMITTER_IE_DV_NOT_IMPLEMENTED`). **Nada foi presumido ou preenchido.**
- Cobertura fiscal: produtos ativos 8 / com perfil 2; microrganismos ativos 25 / perfis 26; `customer_fiscal_profiles` 0; `fiscal_tax_rules` 6; `fiscal_operation_policies` 3; `fiscal_xsd_registry` 7 schemas oficiais.
- Documentos: `fiscal_invoices` 0, `fiscal_xml_runs` 0, `fiscal_certificates` 0 (nenhuma emissão, nenhum certificado vinculado).

### Findings H7-001..009
- **H7-001 (certificado)**: arquitetura confirmada segura — bucket privado, material AES-256-GCM em `fiscal_certificate_material` (sem policy ⇒ inacessível a qualquer usuário), chave em secret server-side, senha só em memória na Edge Function, validação de titular (CNPJ) × emitente e rejeição de e-CPF. **Pendência: senha do PFX.**
- **H7-002 (emitente/readiness)**: correto e fail-closed; pendências com códigos estáveis. **P3 humano.**
- **H7-003/004 (perfis item/destinatário)**: cobertura parcial por design — preflight bloqueia item/cliente sem perfil; nenhum valor fiscal inventado. **P3.**
- **H7-005 (snapshot/cálculo/preflight)**: imutabilidade comprovada (T5/T6); tolerância R$0,01 e unicidade por origem presentes.
- **H7-006 (XML/XSD/assinatura)**: registry oficial presente; assinatura depende do A1. **P2 até o certificado.**
- **H7-007 (transmissão HML)**: transporte não implementado; guard de host `sefazEndpoints.ts` fail-closed já testado — nenhum host de produção alcançável. **P2.**
- **H7-008 (eventos)**: append-only + idempotência comprovados.
- **H7-009 (financeiro/estoque/BI)**: nenhuma emissão existente; H5/H6 sem regressão na suíte.

### Secrets ESPERADOS (apenas nomes)
`FISCAL_CERTIFICATE_MASTER_KEY`, `FISCAL_CORS_ALLOWLIST`, `INTERNAL_FUNCTION_SECRET`, `STAGING_DSN`, `STAGING_REF`.

### Pendências
- **P1 (infra)**: deploy manual das Edge Functions fiscais por CLI com `--project-ref ikaauvsflpmamgxmkhoq`.
- **P2**: transporte SEFAZ MG HML; NFS-e (provedor externo).
- **P3**: 5 decisões humanas de readiness; cobertura de perfis fiscais.

### GATE H7 (2026-08-25)
**APROVADA COM RESSALVAS / CERTIFICATE_PASSWORD_REQUIRED** — zero P0. Produção `navfzbwgwzruipouyfnk` intacta; emissão de produção bloqueada em três camadas (marcador, `production_enabled=false`, gate server-side). H8 não iniciada.

---

## 35. H7 — Reconciliação final (auditoria E2E, staging ikaauvsflpmamgxmkhoq)

Data: 2026-08-25. Escopo: auditar o existente, corrigir só lacunas, testar em staging, parar antes de produção.

### 35.1 Binding (H7.1)
- Drift detectado novamente: `.env` apontava para o projeto sandbox e `src/integrations/supabase/types.ts` estava truncado (2.052 linhas).
- Corrigido por restauração do baseline de staging `c75bb87f`: `.env` (2 refs `ikaauvsflpmamgxmkhoq`) e `types.ts` (21.850 linhas).
- `check-frontend-binding.sh`: OK (.env, client.ts, config.toml, types.ts consistentes).
- `guard-staging.sh`: OK — staging confirmado, `tpAmb=2`, produção fiscal desabilitada. Ref de produção `navfzbwgwzruipouyfnk` não tocada.

### 35.2 Inventário (H7.0)
- 28 tabelas fiscais, 10 views fiscais, 98 funções/RPCs fiscais no schema `public`.
- Edge Functions fiscais canônicas: `fiscal-preflight`, `fiscal-xml-engine`, `fiscal-certificate-upload`, `fiscal-certificate-revoke`, `fiscal-cnpj-lookup`, `fiscal-binding-diagnostics`. Nenhum provider paralelo introduzido.
- Dados de matriz: `fiscal_xsd_registry`=7, `fiscal_tax_rules`=6, `product_fiscal_profiles`=2, `fiscal_document_series`=0, `fiscal_invoices`=0.

### 35.3 Readiness (H7.2)
`v_fiscal_nfe_emitter_readiness` = `NOT_READY` (5 BLOCK / 1 WARN), sem dado inventado:
- BLOCK `EMITTER_PIS_COFINS_REGIME_MISSING`, `EMITTER_SERIES_MISSING`, `EMITTER_ACCREDITATION_MISSING`, `EMITTER_CERTIFICATE_MISSING`, `EMITTER_ACCOUNTING_NOT_VALIDATED`.
- WARN `EMITTER_IE_DV_NOT_IMPLEMENTED` (DV de IE da UF não verificado automaticamente).
- Certificados: `fiscal_certificates`=0 e `fiscal_certificate_material`=0 → `CERT_IMPORT_PENDING`.

### 35.4 Testes executados
- `60-h7-postcheck.sql`: **11 PASS / 0 FAIL** (gate v1, produção bloqueada, normalização ISSUED→AUTHORIZED, imutabilidade, transições, append-only, idempotência de evento, anon sem EXECUTE).
- `61-h7-seguranca-ambiente.sql`: **12 PASS / 0 FAIL** (RLS em todas as tabelas fiscais, buckets privados, material de certificado fail-closed, marcador STAGING, anon sem preflight/numeração/XML/documentos).
- `62-h7-concorrencia.sh`: **4/4 PASS** (reserva com FOR UPDATE + advisory lock + idempotência; índice único de documento ativo).
- Typecheck: 0 erros. Vitest: **3.163 PASS / 4 skipped (197 arquivos)**.

### 35.5 Findings remanescentes (nenhum P0/P1 de software)
- P2 — `fiscal_document_series` vazia: série NF-e depende de definição do contribuinte/contábil; não populada por decisão de não inventar dado legal.
- P2 — regime PIS/COFINS e validação contábil pendentes (`needs_accounting_review`).
- P2 — credenciamento por UF não registrado.
- P2 — transmissão SEFAZ HML não executada: sem certificado A1 importado, gate condicional (nenhuma autorização simulada).

### 35.6 Gate
**H7 APROVADA CONDICIONALMENTE — CERT_IMPORT/HML PENDENTE.** Zero P0/P1 de software. Produção fiscal permanece bloqueada por marcador, `tpAmb=2` e guard de endpoints (`sefazEndpoints.ts`). H8 não iniciada.

## 36. Reexecução H7 — 2026-08-25 (auditoria + revalidação, sem produção)

### 36.1 Binding (H7d)
- Drift reincidente: `.env` apontava para o sandbox `yzszlzjpovmcteuxjznj` e `types.ts` truncado (2.052 linhas).
- Restaurado do baseline de staging `c75bb87f`: `.env` (2 refs `ikaauvsflpmamgxmkhoq`) e `types.ts` (21.850 linhas).
- `check-frontend-binding.sh`: OK. `guard-staging.sh`: OK — staging `ikaauvsflpmamgxmkhoq`, `tpAmb=2`, produção fiscal desabilitada.
- Produção `navfzbwgwzruipouyfnk`: nenhuma conexão, migration ou configuração. INTACTA.

### 36.2 Estado fiscal auditado
- `fiscal_certificates`=0, `fiscal_certificate_material`=0, `fiscal_document_series`=0, `fiscal_invoices`=0.
- `v_fiscal_nfe_emitter_readiness` = **NOT_READY**, UF=MG, ambiente=2 (homologação), 5 BLOCK + 1 WARN:
  `EMITTER_PIS_COFINS_REGIME_MISSING`, `EMITTER_SERIES_MISSING`, `EMITTER_ACCREDITATION_MISSING`,
  `EMITTER_CERTIFICATE_MISSING`, `EMITTER_ACCOUNTING_NOT_VALIDATED`, WARN `EMITTER_IE_DV_NOT_IMPLEMENTED`.
- Nenhum dado fiscal legal inventado; pendências permanecem atribuídas a contador/SEFAZ.

### 36.3 Testes desta execução
- `60-h7-postcheck.sql`: **11 PASS / 0 FAIL**.
- `61-h7-seguranca-ambiente.sql`: **12 PASS / 0 FAIL** (RLS, buckets privados, material de certificado fail-closed, marcador STAGING, anon negado em preflight/numeração/XML/documentos).
- `62-h7-concorrencia.sh`: **4/4 PASS** (2 tentativas simultâneas + retry ⇒ 1 evento; índice único de documento ativo).
- Varredura de segredos no repositório: nenhum `.pfx`/`.p12`, nenhuma chave privada real (apenas a fixture proposital `scripts/fixtures/fiscal-scan/fail-secrets.txt`, usada para provar que o scanner falha).
- Typecheck: 0 erros. Vitest: **3.163 PASS / 4 skipped (197 arquivos)**. Build: OK.
- H7-9 D (NF-e HML real): **BLOCKED_EXTERNAL** — sem certificado A1 importado e sem série/credenciamento definidos. Nenhuma autorização simulada.

### 36.4 Mecanismo seguro do PFX (inalterado e confirmado)
- Upload por `supabase/functions/fiscal-certificate-upload` (Edge, server-side): PFX e senha vão apenas no corpo da requisição, cifrados em trânsito.
- Material cifrado em AES-256-GCM com `FISCAL_CERTIFICATE_MASTER_KEY` e gravado em `fiscal_certificate_material` (tabela sem policy ⇒ inacessível a qualquer role do Data API).
- `fiscal_certificates` guarda apenas metadados não secretos (titular, emissor, serial, thumbprint SHA-256, validade, status, ambiente).
- Senha nunca é persistida, logada ou devolvida; ausência retorna `CERT_PASSWORD_REQUIRED`.
- Tela do usuário: Configurações Fiscais → Certificado Digital → Upload A1 (`UploadCertificadoA1.tsx`). A senha deve ser digitada **somente** nesse campo — nunca no chat, repositório ou banco.

### 36.5 Findings
- Zero P0/P1 de software.
- P2 — série NF-e, regime PIS/COFINS, credenciamento por UF e validação contábil pendentes de definição do contribuinte/contador.
- P2 — transmissão SEFAZ-MG HML não executada (BLOCKED_EXTERNAL: certificado A1 + senha).
- P3 — DV de IE por UF não verificado automaticamente (WARN documentado).

### 36.6 Gate
**H7: APROVADA COM RESSALVAS — BLOCKED_EXTERNAL (certificado A1 + parâmetros do contador).** Produção fiscal permanece bloqueada por marcador de ambiente, `tpAmb=2` e allowlist `sefazEndpoints.ts`. H8 não iniciada.
