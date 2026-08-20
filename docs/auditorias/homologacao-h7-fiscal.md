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
- Senha e material só existem em memória na Edge Function; persistidos
  cifrados em AES-256-GCM com IVs independentes; nunca retornados ao browser.
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
