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
seleção do certificado folha por vínculo criptográfico com a chave privada
(independente da ordem dos `certBag`) → validade → identidade do titular
(CNPJ) → `serializeSigningBundle` → AES-256-GCM → Storage privado →
`rpc_fiscal_certificate_register_a1` (**sem parâmetros de senha**).

Após o uso, `password` é descartada e os buffers (`bytes` do PFX e bytes do
bundle, IV e ciphertext em memória) são zerados em `finally` comum, inclusive
nos caminhos de erro após o parsing do formulário. A senha **nunca é
persistida** em tabela, Storage, Secrets, logs ou repositório, nem em forma
cifrada ou derivada.

## 2.1 Correção H7D.1

- O upload deixou de assumir `allCertBags[0]` como certificado folha. Depois de
  extrair a private key, percorre todos os certificados do PKCS#12 e seleciona
  exatamente o certificado cuja `publicKey` verifica a assinatura criada pela
  private key. Sem correspondência: `private_key_does_not_match_certificate`;
  múltiplas correspondências: `pkcs12_leaf_ambiguous`.
- O rollback agora é autocontido: restaura a assinatura histórica de
  `rpc_fiscal_certificate_register_a1` com os parâmetros
  `p_encrypted_password_b64`/`p_password_iv_b64`, mas aborta se existir material
  `SIGNING_BUNDLE_V2`.
- O apply remove explicitamente o overload legado e o postcheck exige que exista
  apenas um overload de `rpc_fiscal_certificate_register_a1`.

## 3. Mudanças

| Artefato | Mudança |
| --- | --- |
| `supabase/functions/_shared/fiscal/certificateVault.ts` | novo; serializa/valida o bundle, rejeita chave cifrada por senha (`BUNDLE_KEY_PASSWORD_PROTECTED`) |
| `supabase/functions/fiscal-certificate-upload/index.ts` | não cifra nem envia senha; seleciona leaf por vínculo chave↔certificado; limpa segredos em `finally`; grava bundle + `material_format`/`material_algorithm`; ingestão por secret permanente **removida** (`CERTIFICATE_UPLOAD_SOURCE_REQUIRED`) |
| `supabase/functions/fiscal-certificate-upload/certificateLeaf.ts` | novo em H7D.1; helper puro/testável para selecionar o leaf sem depender da ordem do PKCS#12 |
| `supabase/functions/_shared/fiscal/nfe/signNfeXml.ts` | assina a partir de PEMs (`SigningMaterial`), sem PKCS#12 e sem senha; mantém verificação chave↔certificado (`CERTIFICATE_KEY_MISMATCH`) |
| `supabase/functions/fiscal-xml-engine/index.ts` | decifra o bundle, exige formato suportado (`isSupportedVaultFormat`) e falha fechado com `CERTIFICATE_REQUIRED`/`CERTIFICATE_DECRYPT_FAILED` |
| `restoration/homologacao-h7/70-h7d-cofre-sem-senha-apply.sql` | remove `encrypted_password`/`password_iv`, adiciona `material_format`/`material_algorithm`, remove overload legado e reescreve a RPC sem senha |
| `restoration/homologacao-h7/71-h7d-cofre-sem-senha-rollback.sql` | reverte estrutura e RPC histórica; aborta se material v2 existir |
| `restoration/homologacao-h7/72-h7d-postcheck.sql` | 8 verificações (H7D-1..H7D-8), incluindo overload único da RPC |

## 4. Controles preservados

Bucket `fiscal-certificates` privado sem policies · `fiscal_certificate_material`
com RLS ativa e **zero policies** (Data API fail-closed), `anon`/`authenticated`
sem grants · RPC restrita a `service_role` · CORS fail-closed · admin-only ·
`.pfx`/`.p12`, ≤ 10 MB, senha obrigatória no POST (`CERT_PASSWORD_REQUIRED`) ·
identidade do titular (CNPJ) · revogação, readiness, metadados e motor NF-e HML
inalterados · `tpAmb=2` e bloqueio de produção mantidos.

## 5. Testes

- `src/test/fiscal/h7d.cofreSemSenha.test.ts` — bundle (serialização, rejeição
  de chave cifrada, versão, formato), seleção de leaf independente da ordem,
  cleanup comum em `finally`, rollback autocontido/abortivo, overload único no
  postcheck + regressão estática de upload, signer, motor XML, SQL e docs.
- Harnesses H7 (`60`, `61`, `62`) permanecem como gate fiscal.

## 6. Gate

**H7d — cofre A1 sem senha: APROVADA no código.** Aplicação do
`70-h7d-cofre-sem-senha-apply.sql` e postcheck no staging seguem o
procedimento de deploy autorizado. Nenhum certificado real foi importado.
