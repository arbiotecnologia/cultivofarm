# H7 — Ingestão segura do certificado A1 (STAGING)

> **SUPERSEDIDO PELA FASE H7d/H7D.1.** A ingestão por secrets permanentes
> (`FISCAL_CERT_PFX_B64` / `FISCAL_CERT_PASSWORD`) foi removida do runtime.
> Nenhum PFX e nenhuma senha do A1 podem residir em Secrets permanentes,
> banco, Storage, logs ou repositório. A única fonte permitida é upload admin
> autenticado (`multipart/form-data`), e a senha existe somente em memória
> durante o POST de importação.

Este documento permanece apenas como registro histórico da decisão. A
arquitetura vigente está em
`docs/auditorias/homologacao-h7d-cofre-a1-sem-senha.md`.

## Arquitetura vigente

1. Administrador autenticado envia `.pfx`/`.p12` + senha pelo formulário fiscal.
2. A Edge Function abre o PKCS#12 em memória e seleciona o certificado folha por
   vínculo criptográfico com a private key, sem confiar na ordem dos `certBag`.
3. A senha é descartada em `finally` e nunca é cifrada, hasheada ou persistida.
4. O cofre persiste somente `SIGNING_BUNDLE_V2` cifrado com AES-256-GCM pela
   chave mestra server-side.
5. A assinatura fiscal posterior usa apenas o bundle decifrado em memória; o PFX
   e sua senha não participam mais do runtime.

## Secrets permitidos

| Secret | Uso |
| --- | --- |
| `FISCAL_CERTIFICATE_MASTER_KEY` | Chave mestra server-side do cofre. |
| `FISCAL_CORS_ALLOWLIST` | Origens permitidas para funções fiscais. |

`FISCAL_CERT_PFX_B64` e `FISCAL_CERT_PASSWORD` não devem ser cadastrados.

## Códigos estáveis atuais

| Código | Significado |
| --- | --- |
| `CERTIFICATE_UPLOAD_SOURCE_REQUIRED` | Tentativa de usar fonte diferente de upload admin autenticado. |
| `CERTIFICATE_VAULT_NOT_CONFIGURED` | Chave mestra ausente/ inválida. |
| `CERT_PASSWORD_REQUIRED` | Upload sem senha do A1. |
| `invalid_password` / `pkcs12_invalid` | Senha incorreta ou arquivo não é PKCS#12 válido. |
| `private_key_does_not_match_certificate` | Nenhum certificado do PKCS#12 corresponde à private key. |
| `pkcs12_leaf_ambiguous` | Mais de um certificado verifica a private key; importação abortada. |