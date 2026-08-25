# H7c — Upload de certificado A1 e revalidação do gate fiscal (staging)

> **Atualizado pela Fase H7d:** o cofre não persiste mais a senha do PFX
> (`encrypted_password`/`password_iv` removidos) e passa a guardar apenas o
> bundle de assinatura `SIGNING_BUNDLE_V2` cifrado em AES-256-GCM. Ver
> `docs/auditorias/homologacao-h7d-cofre-a1-sem-senha.md`.

Data: 2026-08-19 · Ambiente: **staging `ikaauvsflpmamgxmkhoq`** ·
Produção `navfzbwgwzruipouyfnk`: **intocada** (nenhuma leitura de escrita,
nenhuma migration, nenhum deploy).

Nenhum material sensível (PFX, senha, chave privada, IV, ciphertext,
object_path, JWT, service_role, master key) foi lido, registrado ou
versionado nesta fase.

## 1. Achado H7C-001 (P1) — triagem frágil de magic bytes do PKCS#12

`supabase/functions/fiscal-certificate-upload/index.ts` exigia que o arquivo
começasse com SEQUENCE ASN.1 em **forma curta (0x00–0x7f)** ou **longa
(0x81–0x84)**. Um PFX A1 codificado em **BER com comprimento indefinido**
começa com `30 80` e era rejeitado com `not_pkcs12` **antes** do parser, ou
seja, antes de qualquer validação real de senha/certificado/chave.

### Antes

```ts
const derSequenceOk =
  bytes.length >= 2 &&
  bytes[0] === 0x30 &&
  (bytes[1] <= 0x7f || (bytes[1] >= 0x81 && bytes[1] <= 0x84));
if (!derSequenceOk) return json({ error: "not_pkcs12" }, 400, headers);
```

### Depois

Triagem extraída para `supabase/functions/fiscal-certificate-upload/asn1Screen.ts`
(`isPlausibleAsn1Sequence`), com regras BER/DER completas e fail-closed:

| Forma de comprimento | Antes | Depois |
| --- | --- | --- |
| curta `0x00–0x7f` | aceita | aceita, exige que o conteúdo caiba no buffer |
| indefinida `0x80` (BER) | **rejeitada** | **aceita**, exige terminador EOC `00 00` |
| longa `0x81–0x84` | aceita | aceita, rejeita truncamento evidente |
| `0x85+` / tag ≠ `0x30` | rejeitada | rejeitada |
| < 64 bytes | aceita se prefixo ok | rejeitada |

A **autoridade real de formato** passa a ser explicitamente
`forge.asn1.fromDer` + `forge.pkcs12.pkcs12FromAsn1`. A triagem não virou
validação por extensão: a extensão `.pfx`/`.p12` continua sendo exigida em
adição à triagem binária.

### Controles preservados (nenhuma alteração)

`.pfx`/`.p12` obrigatórios · ≤ 10 MB · arquivo real · senha não vazia e ≤ 256
· `company_settings_id` UUID existente · certificado X.509 + chave privada +
seleção do leaf por verificação criptográfica assinatura/verificação
chave↔certificado, independente da ordem dos `certBag` · `notBefore`/`notAfter`
· AES-256-GCM aplicado somente ao bundle de assinatura `SIGNING_BUNDLE_V2`
(sem cifrar/persistir senha) · bucket privado `fiscal-certificates` · RPC canônica
`rpc_fiscal_certificate_register_a1` · rollback do objeto em falha de registro
· CORS fail-closed (`FISCAL_CORS_ALLOWLIST`, sem eco de origem desconhecida,
inclusive no OPTIONS) · autorização admin server-side.

**Justificativa de `verify_jwt=false`**: a função valida o JWT em código
(`auth.getClaims(token)` com cliente anon carregando o header do chamador) e
exige `has_role(<user>, 'administrador')` antes de qualquer processamento
pesado; sem `Bearer` válido responde 401 e sem papel de administrador responde
403. O preflight CORS precisa responder sem JWT, daí a validação em código.

## 2. H7C-002 — prontidão do cofre (sem valores sensíveis)

| Item | Status |
| --- | --- |
| Bucket `fiscal-certificates` | **EXISTE**, `public=false` |
| Policies de `storage.objects` para o bucket | **0** (nenhum acesso via frontend) |
| `fiscal_certificate_material` — anon/authenticated SELECT | **false / false** |
| `fiscal_certificates` | **0 linhas** (nada inserido nesta fase) |
| `company_fiscal_settings` ativo | **1**, `nfe_environment_code='2'` (homologação) |
| Marcador de ambiente | `ikaauvsflpmamgxmkhoq \| STAGING \| production_emission_allowed=false` |
| `FISCAL_CERTIFICATE_MASTER_KEY` | **AUSENTE no cofre de segredos do projeto** |
| `FISCAL_CORS_ALLOWLIST` | **AUSENTE no cofre de segredos do projeto** |

Os dois segredos acima não aparecem no armazenamento de segredos do projeto
atual. Enquanto isso persistir, a função responde `503`
`CERTIFICATE_VAULT_NOT_CONFIGURED` (master key) ou `403`
`cors_origin_not_allowed` (allowlist vazia), ou seja, **fail-closed**. Por
isso **nenhuma senha foi solicitada e nenhum PFX foi importado**.

## 3. Testes

- `src/test/fiscal/h7c.asn1Screen.test.ts` — 13 testes: `30 80` (com EOC),
  `30 81`, `30 82`, forma curta passam; tag ≠ `0x30`, `0x85+`, comprimento
  truncado, BER sem EOC, buffer minúsculo e ruído aleatório são rejeitados;
  regressão estática dos controles de segurança da Edge Function (CORS, admin,
  master key, AES-GCM, bucket, RPC, rollback, ausência de `console.*`).
  Fixtures 100% sintéticas, sem material privado.
- H7 postcheck comportamental `restoration/homologacao-h7/60-h7-postcheck.sql`:
  **11 PASS / 0 FAIL** (gate bloqueia `tpAmb=1`, imutabilidade, append-only,
  idempotência, anon sem EXECUTE).
- H7 segurança/ambiente `61-h7-seguranca-ambiente.sql`: **12 PASS / 0 FAIL**.
- Typecheck, suíte Vitest e build: ver seção de evidências do relatório H7.
- Nenhuma transmissão SEFAZ; readiness externo permanece **NOT_READY**.

## 4. Deploy

Nova versão de `fiscal-certificate-upload` publicada **somente** no staging
`ikaauvsflpmamgxmkhoq`. Nenhuma outra função foi alterada ou reimplantada.

## 5. Gate

**H7c — APROVADA no código; PENDENTE de segredos do cofre.**
`30 80` deixou de ser rejeitado pelo header rígido (P1 resolvido) e o fluxo
segue fail-closed. Para declarar **PRONTO PARA IMPORTAR A1** falta apenas
configurar `FISCAL_CERTIFICATE_MASTER_KEY` (base64 de exatamente 32 bytes) e
`FISCAL_CORS_ALLOWLIST` nos segredos do projeto.

## 6. Próximo passo exato para importar o PFX

1. Administrador adiciona em **Project Settings → Secrets**:
   `FISCAL_CERTIFICATE_MASTER_KEY` (base64 de 32 bytes) e
   `FISCAL_CORS_ALLOWLIST` (origens de staging/preview, separadas por vírgula).
2. Login no staging com usuário de papel `administrador`.
3. Configurações Fiscais → Certificados → **Carregar certificado A1**
   (`UploadCertificadoA1`): selecionar o `.pfx`, digitar a senha e enviar.
   O arquivo e a senha vão direto à Edge Function; nada é persistido no
   navegador nem no repositório.
4. Conferir em `v_fiscal_certificate_readiness` o `fingerprint_sha256`,
   `valid_until` e `status=AVAILABLE`.
5. **Parar**: emissão SEFAZ continua bloqueada (`tpAmb=2`,
   `production_emission_allowed=false`). H8 não iniciada.
