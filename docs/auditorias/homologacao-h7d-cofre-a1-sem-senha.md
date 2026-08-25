# H7d — Cofre A1 sem senha persistida (staging `ikaauvsflpmamgxmkhoq`)

Produção `navfzbwgwzruipouyfnk`: **intocada** (nenhuma migration, deploy ou
leitura de escrita). H8 **não iniciada**. Nenhum valor sensível (PFX, senha,
chave privada, IV, ciphertext, `object_path`, JWT, service_role, master key)
foi lido, registrado ou versionado.

## 1. Achado corrigido (P1)

O fluxo v1 cifrava e **persistia a senha do PFX** em
`fiscal_certificate_material.encrypted_password` + `password_iv`, porque o
cofre guardava os bytes originais do PKCS#12 e precisava da senha para
reabri-los na assinatura. A documentação afirmava incorretamente que a senha
não era persistida.

## 2. Arquitetura nova (v2)

A senha do A1 existe **somente** durante o POST de importação, em memória, o
tempo de abrir o PKCS#12 uma única vez. Do material aberto extrai-se o
**bundle de assinatura** `SIGNING_BUNDLE_V2`:

| Campo | Conteúdo |
| --- | --- |
| `certPem` | certificado folha (e-CNPJ A1) em PEM |
| `chainPem[]` | cadeia intermediária/raiz, quando presente no PKCS#12 |
| `keyPem` | chave privada em PKCS#8 PEM **não cifrada por senha** |

O bundle inteiro é cifrado com **AES-256-GCM** pela chave mestra server-side
(`FISCAL_CERTIFICATE_MASTER_KEY`) e gravado no bucket privado
`fiscal-certificates`. Quem protege o material passa a ser exclusivamente a
chave mestra do cofre — não mais a senha do usuário.

Fluxo: `multipart/form-data` (admin autenticado) → triagem ASN.1 → PKCS#12 →
verificação chave↔certificado → validade → identidade do titular (CNPJ) →
`serializeSigningBundle` → AES-256-GCM → Storage privado →
`rpc_fiscal_certificate_register_a1` (**sem parâmetros de senha**).

Após o uso, `password` é descartada e os buffers (`bytes` do PFX e bytes do
bundle) são zerados. A senha **nunca é persistida** em tabela, Storage,
Secrets, logs ou repositório, nem em forma cifrada ou derivada.

## 3. Mudanças

| Artefato | Mudança |
| --- | --- |
| `supabase/functions/_shared/fiscal/certificateVault.ts` | novo; serializa/valida o bundle, rejeita chave cifrada por senha (`BUNDLE_KEY_PASSWORD_PROTECTED`) |
| `supabase/functions/fiscal-certificate-upload/index.ts` | não cifra nem envia senha; grava bundle + `material_format`/`material_algorithm`; ingestão por secret permanente **removida** (`CERTIFICATE_UPLOAD_SOURCE_REQUIRED`) |
| `supabase/functions/_shared/fiscal/nfe/signNfeXml.ts` | assina a partir de PEMs (`SigningMaterial`), sem PKCS#12 e sem senha; mantém verificação chave↔certificado (`CERTIFICATE_KEY_MISMATCH`) |
| `supabase/functions/fiscal-xml-engine/index.ts` | decifra o bundle, exige formato suportado (`isSupportedVaultFormat`) e falha fechado com `CERTIFICATE_REQUIRED`/`CERTIFICATE_DECRYPT_FAILED` |
| `restoration/homologacao-h7/70-h7d-cofre-sem-senha-apply.sql` | remove `encrypted_password`/`password_iv`, adiciona `material_format`/`material_algorithm`, reescreve a RPC sem senha |
| `restoration/homologacao-h7/71-h7d-cofre-sem-senha-rollback.sql` | reverte estrutura e RPC (sem reintroduzir dados) |
| `restoration/homologacao-h7/72-h7d-postcheck.sql` | 8 verificações (H7D-1..H7D-8) |

## 4. Controles preservados

Bucket `fiscal-certificates` privado sem policies · `fiscal_certificate_material`
com RLS ativa e **zero policies** (Data API fail-closed), `anon`/`authenticated`
sem grants · RPC restrita a `service_role` · CORS fail-closed · admin-only ·
`.pfx`/`.p12`, ≤ 10 MB, senha obrigatória no POST (`CERT_PASSWORD_REQUIRED`) ·
identidade do titular (CNPJ) · revogação, readiness, metadados e motor NF-e HML
inalterados · `tpAmb=2` e bloqueio de produção mantidos.

## 5. Testes

- `src/test/fiscal/h7d.cofreSemSenha.test.ts` — bundle (serialização, rejeição
  de chave cifrada, versão, formato) + regressão estática de upload, signer,
  motor XML, SQL/rollback/postcheck e documentação.
- Harnesses H7 (`60`, `61`, `62`) permanecem como gate fiscal.

## 6. Gate

**H7d — cofre A1 sem senha: APROVADA no código.** Aplicação do
`70-h7d-cofre-sem-senha-apply.sql` e postcheck no staging seguem o
procedimento de deploy autorizado. Nenhum certificado real foi importado.
