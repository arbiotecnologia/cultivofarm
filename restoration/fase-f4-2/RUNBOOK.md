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

## 5. Gates provados (29 no harness + 16 no verify)

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
Isolamento (G12–G16 do verify): emitente sintético é o único ativo;
o emitente ativo anterior está registrado para restauração; emitente e
destinatário sintéticos atingem `READY_HOMOLOGATION` / `READY`+`VALIDATED`
pelos gatilhos reais; não há objeto sintético de outra tag; os gatilhos
`tg_fiscal_emitter_refresh_readiness` e `tg_fiscal_recipient_refresh_readiness`
permanecem habilitados.

## 6. Schema real — correções aplicadas

O kit foi alinhado ao schema efetivo do staging:

- Destinatário fica em `public.clientes` (não `clients`), com
  `codigo_cliente` obrigatório e sem coluna `ativo`.
- `partner_accounts` exige `razao_social` (não possui `nome`);
  `nome_fantasia` e `client_id` acompanham a fixture.
- `customer_fiscal_profiles.person_type` usa o domínio `PJ|PF|ESTRANGEIRO`
  e `fiscal_email` é exigido para prontidão total.
- A prontidão **não** é recalculada por função utilitária inexistente: quem
  atualiza é o gatilho `tg_fiscal_emitter_refresh_readiness` /
  `tg_fiscal_recipient_refresh_readiness` no próprio INSERT. O setup apenas
  **verifica** o resultado e aborta com as pendências reais se divergir.
- O emitente sintético nasce com `uf_accreditations`, `certificate_ref` e
  `accounting_validated_at` preenchidos, condições exigidas por
  `READY_HOMOLOGATION`.

### Singleton de emitente ativo — isolamento reversível

`ux_company_fiscal_settings_active_singleton` admite um único emitente
ativo. O setup, **antes** de qualquer alteração, registra o id do emitente
ativo corrente em `_f42_harness_fixtures`
(`entity = 'previous_active_company_fiscal_settings'`), desativa-o e ativa
o sintético. O cleanup remove o sintético **primeiro** e só então reativa
o id registrado, validando que exatamente um emitente ficou ativo. Como o
registro é gravado antes da mudança e o cleanup roda no `trap EXIT`, a
restauração também ocorre no caminho de falha.

## 7. Limpeza

`90-cleanup.sql` remove **apenas** os ids registrados em
`public._f42_harness_fixtures` para a tag, mais os certificados cujo
`display_name` começa com `F42-HARNESS-`. Nenhum `DELETE` amplo, nenhum
trigger desabilitado, nenhum UUID de dado real. Os usuários temporários são
apagados no `finally` do próprio harness. A prova de limpeza é a consulta
final do script: `fixtures`, `certificados`, `emitentes`, `parceiros` e
`clientes` em `0`, e `emitentes_ativos` de volta a `1` quando havia
emitente ativo antes do run.

## 8. Ensaio runtime real no staging (2026-08-06) — 9/22 FAIL

Execução real em `ikaauvsflpmamgxmkhoq` com binário Deno oficial verificado:
**9/22 PASS — FAIL**. Cleanup comprovado: `active_emitters=1`,
`previous_restored=true`, `fixtures=0`, `temp_users=0`, `certs=0`, Storage
limpo; segredo de teste e PAT removidos ao final. Nenhum acesso a produção,
nenhuma transmissão SEFAZ.

Causa raiz e correções aplicadas neste pacote:

1. **T05/T06 — `FISCAL_INVOICE_NOT_DRAFT`.** O setup criava as duas notas
   sintéticas com `status = 'PENDING'`, mas o contrato real de
   `rpc_fiscal_calculate_invoice_v1` e `rpc_fiscal_reserve_nfe_number_v1`
   exige `DRAFT`. Ambas as fixtures passam a nascer em `DRAFT`, com guarda
   fail-closed no próprio setup e gate `G17` no verify. Nenhum dado real
   é tocado.
2. **T07 — ordem real das validações.** `rpc_fiscal_xml_prepare_v1` cobra
   `tax_snapshot` (`FISCAL_CALCULATION_REQUIRED`) e reserva **antes** de
   avaliar a elegibilidade do pedido; logo o gate de cotação é inalcançável
   pela Edge sem antes concluir pré-condições que o documento em cotação não
   pode ter. O gate passou a ser provado onde ele realmente vive:
   `rpc_fiscal_calculate_invoice_v1`, que aplica `fn_fiscal_invoice_eligibility`
   e devolve `FISCAL_NOT_ELIGIBLE` com a razão `FISCAL_QUOTE_ONLY_BLOCKED`.
   Nenhum erro genérico é aceito, e o novo `T07b` prova zero efeitos
   colaterais (documento segue `DRAFT`, sem `tax_snapshot`, sem
   `fiscal_calculation_runs`, sem reserva e sem `fiscal_xml_runs`).
3. **Cascata T09/T10/T12–T29 e `TXX Invalid URL`.** O harness agora
   interrompe a cadeia quando T05/T06 falham e registra os dependentes como
   `SKIP — BLOCKED_BY_PRECONDITION`, sem nunca chamar download com URL
   `undefined`. O total permanece honesto: o resumo final imprime
   `PASS/total` com `FAIL` e `SKIP` discriminados, e SKIP nunca conta como
   PASS.
4. **Regressão estática.** `src/test/fiscal/f42HarnessFixtures.static.test.ts`
   falha se qualquer fixture fiscal de cálculo voltar a ser criada fora de
   `DRAFT` ou se as guardas de DRAFT sumirem do setup/verify.

Com as fixtures em `DRAFT`, a sequência esperada é: T05/T06 PASS → T09 chega
a `412 CERTIFICATE_REQUIRED` preservando a execução em `GENERATED` → T12
assina até `SIGNED` → T13–T29 executam normalmente.

## 9. Estado atual

**CANDIDATO À REVALIDAÇÃO.** O último resultado externo conhecido é
**9/22 FAIL**; as correções acima ainda não foram reprovadas em novo ensaio
remoto, e o ambiente do agente não possui DSN/CLI/secrets de staging. Nenhum
PASS de runtime é alegado até nova prova externa. Produção
`navfzbwgwzruipouyfnk` não foi acessada, nada foi publicado, nada foi
transmitido à SEFAZ e nenhuma migration foi executada.

