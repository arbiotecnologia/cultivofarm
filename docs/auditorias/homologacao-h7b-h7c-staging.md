# H7B/H7C — Auditoria e preparação fiscal em homologação

**Ambiente:** staging `ikaauvsflpmamgxmkhoq`  
**Produção:** `navfzbwgwzruipouyfnk` não acessada nem alterada  
**Escopo:** auditoria de paridade/runtime e preparação do cofre A1, sem importação de PFX/senha e sem transmissão SEFAZ.

## Resultado executivo

- **H7B — PASS condicional:** o marcador server-side confirma `STAGING` e `production_emission_allowed=false`; o emitente ativo está em `tpAmb=2`.
- **H7C — PASS condicional:** upload e revogação do certificado exigem origem permitida e sessão autenticada; o bucket de certificados é privado; o cofre usa `SIGNING_BUNDLE_V2`/AES-256-GCM e não persiste senha.
- **Certificado A1:** não importado. Nenhum PFX/P12 ou senha foi usado, lido, registrado ou armazenado nesta auditoria.
- **Transmissão SEFAZ:** não executada.

## Checks realizados

### Binding e tipos do frontend

- `.env` restaurado para o baseline autorizado de staging `ikaauvsflpmamgxmkhoq`.
- `src/integrations/supabase/types.ts` restaurado para a versão completa do baseline (`21.850` linhas).
- `bunx tsgo --noEmit`: **PASS, 0 erros**.

### Banco e ambiente

- `fiscal_environment_marker`: `ikaauvsflpmamgxmkhoq | STAGING | production_emission_allowed=false`.
- Emitente ativo: CNPJ configurado, `nfe_environment_code=2`, status `DRAFT`.
- Tabelas fiscais auditadas com RLS ativo.
- `fiscal-certificates`, `fiscal-xml` e `fiscal-regulatorio`: buckets privados.
- `fiscal_certificate_material`: RLS ativo e sem políticas/grants para acesso público.
- Não foram executadas migrations, DML ou alterações de schema nesta passagem.

### Runtime do cofre A1

- `fiscal-certificate-upload`:
  - preflight com origem autorizada: **HTTP 200**;
  - origem desconhecida: **HTTP 403** (`cors_origin_not_allowed`);
  - ausência de origem: **HTTP 403**;
  - origem autorizada sem sessão: **HTTP 401** (`unauthorized`).
- `fiscal-certificate-revoke`:
  - preflight com origem autorizada: **HTTP 200**;
  - origem autorizada sem sessão: **HTTP 401**.
- O código valida JWT, deriva o usuário do token, exige papel `administrador` e mantém a senha do PFX somente em memória durante o processamento.
- A função de registro server-side aceita apenas `SIGNING_BUNDLE_V2`; a RPC privilegiada rejeita roles públicas.

## Pendências e bloqueios preservados

1. Deploy das Edge Functions atualizadas no staging ainda depende do pipeline autorizado; não foi realizado nesta etapa.
2. Upload do A1 real continua aguardando ação humana e deve ser feito somente após o deploy validado.
3. Credenciamento SEFAZ/MG, validação contábil e publicação da matriz fiscal continuam bloqueios de readiness.
4. Nenhuma emissão/transmissão de produção foi habilitada.

## Gate

**H7B/H7C — PARADO COM SEGURANÇA ANTES DO PFX/SENHA.**  
A preparação técnica está validada no staging. O próximo passo permitido é o deploy autorizado das funções fiscais no staging; depois disso, o upload do A1 real poderá ser feito pelo administrador na interface, sem compartilhar a senha no chat.
