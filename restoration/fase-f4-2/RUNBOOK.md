# FASE F4.2 — Runbook do harness remoto E2E do motor XML NF-e

Alvo **exclusivo**: staging `ikaauvsflpmamgxmkhoq`.
**Proibido**: produção `navfzbwgwzruipouyfnk` e qualquer publicação.
**Teto absoluto**: `SIGNED`. Nada é transmitido à SEFAZ.

## 1. Correção de empacotamento (pré-requisito)

O primeiro deploy da Edge Function `fiscal-xml-engine` não levava o bundle
XSD: `xsdValidate.ts` lê os arquivos por `import.meta.url`/`Deno.readTextFile`,
que o bundler não enxerga como dependência de import. Corrigido em
`supabase/config.toml`:

```toml
[functions.fiscal-xml-engine]
verify_jwt = true
static_files = [
  "./functions/fiscal-xml-engine/xsd/*.xsd",
  "./functions/fiscal-xml-engine/xsd/manifest.json",
]
```

Redeploy obrigatório antes do harness:

```bash
supabase functions deploy fiscal-xml-engine --project-ref ikaauvsflpmamgxmkhoq
```

Correções acompanhantes no motor (`supabase/functions/fiscal-xml-engine/index.ts`):

- `fromBinaryColumn()` — o PostgREST serializa `bytea` como hexadecimal
  `\x…`; o código anterior assumia base64 e falharia ao abrir o material do
  certificado. Base64 continua aceito.
- `resolveMasterKey()` — via de chave de teste, aplicável **somente** quando
  as três condições valem juntas: o certificado escolhido tem
  `display_name` começando em `F42-HARNESS-`, o secret
  `FISCAL_TEST_CERTIFICATE_MASTER_KEY` existe, e
  `public._fiscal_staging_marker` aponta para `ikaauvsflpmamgxmkhoq`.
  Fora disso, a chave de produção do cofre é a única usada.
- A seleção do certificado passou a preceder a resolução da chave, para que
  o gate `CERTIFICATE_REQUIRED` (412 + estado `GENERATED`) seja provado pela
  ausência real de certificado.

## 2. Chave mestra de teste — via segura de cadastro

A chave de teste **nunca** entra no repositório, em log ou em artefato.

1. O operador gera 32 bytes aleatórios em base64 na própria máquina:

   ```bash
   openssl rand -base64 32
   ```

2. Cadastra o valor em **Project Settings → Secrets** do staging com o nome
   `FISCAL_TEST_CERTIFICATE_MASTER_KEY` (a Edge lê esse nome).
3. Exporta o **mesmo** valor no shell do harness como
   `F42_TEST_MASTER_KEY_B64` — apenas na sessão, sem `history` persistente:

   ```bash
   read -rs F42_TEST_MASTER_KEY_B64 && export F42_TEST_MASTER_KEY_B64
   ```

4. Após o run, remova o secret do staging se não houver novo ciclo previsto.

O certificado A1 é **gerado em runtime** pelo harness (RSA-2048 autoassinado,
validade de 7 dias, CN sintético). Não há PFX versionado nem senha fixa: a
senha é aleatória por execução e existe apenas em memória e cifrada em
AES-256-GCM no Storage, removida no cleanup.

## 3. Variáveis exigidas

| Variável | Origem | Observação |
| --- | --- | --- |
| `PGURI` | DSN do staging | nunca ecoar |
| `F42_SUPABASE_URL` | `https://ikaauvsflpmamgxmkhoq.supabase.co` | validado no script |
| `F42_ANON_KEY` | chave publicável | — |
| `F42_SERVICE_ROLE_KEY` | Project Settings | nunca ecoar |
| `F42_TEST_MASTER_KEY_B64` | passo 2 | nunca ecoar |
| `F42_ALLOWED_ORIGIN` | origem presente em `FISCAL_CORS_ALLOWLIST` | prova o gate 403 |
| `F42_TAG` (opcional) | `F42-HARNESS-<carimbo>` | default automático |

## 4. Execução

```bash
bash restoration/fase-f4-2/run.sh
```

Ordem fail-fast: integridade do bundle XSD → `10-setup.sql` → `20-run-e2e.ts`
→ `30-verify.sql`. O `trap EXIT` sempre executa `91-cleanup-storage.ts` e
`90-cleanup.sql`, mesmo em falha (use `F42_KEEP_FIXTURES=1` para investigar
um run com falha, e rode o cleanup manualmente depois).

## 5. Gates provados (29 no harness + 11 no verify)

Contenção: 401 sem JWT, 403 origem fora da allowlist, `anon` bloqueado,
usuário sem papel fiscal bloqueado, download negado a `anon` e a usuário
sem papel.
Negócio: pedido em cotação bloqueado sem efeitos colaterais; `tpAmb != 2`
bloqueado fail-closed (o emitente sintético é alterado e restaurado, e
nenhum cadastro real é tocado).
Certificado: ausência ⇒ 412 `CERTIFICATE_REQUIRED` com a execução preservada
em `GENERATED` (nunca `FAILED`).
Motor: `SIGNED` real, `validator = xmllint-wasm@5.3.0`, pacote
`PL_010e_v1.02`, validação XSD sobre o documento **assinado**,
`signatureVerified: true`, `transmitted: false`.
Prova independente: o XML é baixado pela URL assinada de 120 s, o SHA-256
é conferido contra o registrado, a XMLDSig é reverificada **fora** da Edge
e o XSD oficial é reaplicado localmente; duas adulterações (documento e
`SignatureValue`) devem invalidar a assinatura.
Idempotência e concorrência: replay não cria nova `run_version`; payload
alterado com a mesma chave gera conflito; a mesma chave em outro documento
é rejeitada por escopo; duas invocações simultâneas produzem no máximo uma
execução.

## 6. Limpeza

`90-cleanup.sql` remove **apenas** os ids registrados em
`public._f42_harness_fixtures` para a tag, mais os certificados cujo
`display_name` começa com `F42-HARNESS-`. Nenhum `DELETE` amplo, nenhum
trigger desabilitado, nenhum UUID de dado real. Os usuários temporários são
apagados no `finally` do próprio harness. A prova de limpeza é a consulta
final do script: todas as contagens devem ser `0`.

## 7. Estado atual

Não executado nesta sessão: o ambiente do agente não possui `PGHOST`/DSN,
CLI Supabase nem os secrets de staging. O kit está pronto para execução por
um operador autorizado, na ordem acima. Produção não foi acessada.
