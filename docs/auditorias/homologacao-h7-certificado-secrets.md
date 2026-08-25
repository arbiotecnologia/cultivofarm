# H7 — Ingestão segura do certificado A1 (STAGING)

> **SUPERSEDIDO PELA FASE H7d.** A ingestão por secrets permanentes
> (`FISCAL_CERT_PFX_B64` / `FISCAL_CERT_PASSWORD`) foi **removida do runtime**:
> nenhuma senha ou PFX pode residir em Supabase Secrets. A única fonte é o
> upload admin autenticado (`multipart/form-data`), e a senha existe apenas em
> memória durante o POST. Ver
> `docs/auditorias/homologacao-h7d-cofre-a1-sem-senha.md`.

Este documento descreve **como** inserir o certificado A1 no staging
`ikaauvsflpmamgxmkhoq` sem que PFX ou senha passem pelo navegador, pelo
repositório, por migrations, tabelas públicas ou logs. **Nenhum valor real de
segredo é registrado aqui.**

## 1. Arquitetura adotada

Duas fontes de material, ambas processadas exclusivamente server-side na Edge
Function `fiscal-certificate-upload` (admin-only, CORS fail-closed):

| Fonte | Requisição | Uso |
| --- | --- | --- |
| Secrets (preferencial em homologação) | `POST` `application/json` com `{ "source": "secret", "company_settings_id": "<uuid>", "display_name": "..." }` | Lê `FISCAL_CERT_PFX_B64` e `FISCAL_CERT_PASSWORD` do ambiente da função |
| Upload admin (UI existente) | `multipart/form-data` com `file` + `password` | Fluxo já existente em `/configuracoes/fiscal/empresa` |

Em ambos os caminhos o pipeline é idêntico após a obtenção dos bytes:
triagem ASN.1 → extração PKCS#12 (`node-forge`) → verificação criptográfica
chave↔certificado → validade `notBefore`/`notAfter` → cifra AES-256-GCM do
material e da senha com IVs independentes (chave derivada de
`FISCAL_CERTIFICATE_MASTER_KEY`) → upload ao bucket privado
`fiscal-certificates` → registro atômico via
`rpc_fiscal_certificate_register_a1`.

Persistem apenas metadados: subject, issuer, serial, `valid_from`,
`valid_until`, fingerprint SHA-256, key usage, versão de chave e status.
A chave privada nunca sai cifrada do cofre e a senha jamais é gravada em claro.

## 2. Secrets necessários no staging

| Secret | Conteúdo | Observação |
| --- | --- | --- |
| `FISCAL_CERTIFICATE_MASTER_KEY` | chave mestra do cofre (base64 de 32 bytes ou texto ≥ 32 chars) | já previsto; sem ele a função responde `CERTIFICATE_VAULT_NOT_CONFIGURED` (503) |
| `FISCAL_CERT_PFX_B64` | conteúdo do `.pfx` codificado em base64 | ~5 KB em base64 para um PFX de ~3,8 KB |
| `FISCAL_CERT_PASSWORD` | senha do PFX | somente ambiente de função |
| `FISCAL_CORS_ALLOWLIST` | origens permitidas para as funções fiscais | fail-closed |

Os três primeiros devem ser cadastrados **apenas** no projeto de staging
`ikaauvsflpmamgxmkhoq`. Nunca em produção `navfzbwgwzruipouyfnk`.

## 3. Procedimento operacional

1. Gerar o base64 do PFX localmente, em máquina confiável, sem gravar o
   resultado em arquivo versionado.
2. (REMOVIDO em H7d) não cadastrar PFX nem senha nos secrets do
   projeto de staging (Project Settings → Secrets ou CLI no ref de staging).
3. Reimplantar `fiscal-certificate-upload` no ref de staging para que a função
   enxergue os novos secrets.
4. Disparar a ingestão autenticado como `administrador`, com corpo JSON
   `{"source":"secret","company_settings_id":"<uuid do emitente ativo>"}`.
5. Conferir em `fiscal_certificates` apenas metadados e status ativo.

## 4. Códigos de erro estáveis

| Código | Significado |
| --- | --- |
| `CERTIFICATE_SECRET_PENDING` | `FISCAL_CERT_PFX_B64` e/ou `FISCAL_CERT_PASSWORD` ausentes (503) |
| `CERTIFICATE_SECRET_INVALID` | base64 inválido no secret (400) |
| `CERTIFICATE_VAULT_NOT_CONFIGURED` | chave mestra ausente (503) |
| `CERT_PASSWORD_REQUIRED` | upload por UI sem senha (400) |
| `invalid_password` / `pkcs12_invalid` | senha incorreta ou arquivo não é PKCS#12 |

## 5. Rotação

`rpc_fiscal_certificate_register_a1` mantém versão/estado; a revogação é feita
por `fiscal-certificate-revoke`, preservando histórico (sem exclusão física).
