# F4.1-R1 — Runbook de aplicação em staging (PENDENTE DE EXECUÇÃO)

Alvo **exclusivo**: `ikaauvsflpmamgxmkhoq`.
**Proibido**: `navfzbwgwzruipouyfnk` (produção) e qualquer publicação.

Este runbook não foi executado: a sessão do agente não possui `PGHOST`,
DSN nem CLI Supabase, e o projeto usa Supabase externo (não gerenciado
pelo Lovable Cloud). Ele existe para que a execução ocorra com um
operador autorizado, na ordem fail-fast abaixo.

## Pré-condições

- `PRODUCTION_NOT_ACCESSED=true` durante toda a janela.
- Nenhum secret, DSN, JWT ou senha pode ser ecoado em log.
- Bundle íntegro: `deno run -A restoration/fase-f4-1/runtime-harness/xsd-bundle-integrity.ts`.

## Passo 0 — Verificação canônica (repositório, sem banco)

```bash
node restoration/fase-f4-1/verify-canonical.mjs
deno run -A restoration/fase-f4-1/runtime-harness/xsd-bundle-integrity.ts
```

Esperado: `VERIFY CANONICAL: 2/2 PASS` e bundle 5/5. As migrations
canônicas são byte-idênticas aos artefatos de restoration:

| versão | arquivo canônico | SHA-256 |
| --- | --- | --- |
| 20260822000000 | `supabase/migrations/20260822000000_fase_f4_motor_xml_nfe.sql` | `d3478401e47c8de5e2d9c8b6a203c254fe28dd7dbe663397b41767f38c09ec3a` |
| 20260823000000 | `supabase/migrations/20260823000000_fase_f4_1_xsd_oficial.sql` | `c5ce55100b46731a418d966eddf818d4f241a23bcf82c087c182abd90f9c40f2` |

Se algum hash divergir, **parar**: nada abaixo pode ser executado.

## Passo 1 — Evidência do ledger (antes)

```bash
psql -v ON_ERROR_STOP=1 -f restoration/fase-f4-1/verify-canonical.sql
```

Esperado hoje: ledger termina em `20260821000000`; `20260822000000` e
`20260823000000` ainda **não registrados**, mas os objetos da F4 já
existem (aplicada fora do ledger).

## Passo 2 — Postcheck estrutural da F4 (pré-requisito do reparo)

```bash
psql --single-transaction -v ON_ERROR_STOP=1 -f restoration/fase-f4/postcheck.sql
```

O reparo do ledger da versão `20260822000000` **só é permitido** se, e
somente se, as duas condições valerem juntas:

1. este postcheck resultar **25/25 PASS**; e
2. o Passo 0 comprovar correspondência de hash entre o arquivo canônico
   `supabase/migrations/20260822000000_fase_f4_motor_xml_nfe.sql` e
   `restoration/fase-f4/migration.sql`.

Qualquer gate abaixo de 25/25 ou hash divergente ⇒ **parar**. Não
registrar ledger com base apenas em arquivos de `restoration/`.

## Passo 3 — Reparo do ledger da F4 (somente após o Passo 2)

Sem alterar objetos já aplicados:

```bash
supabase migration repair --status applied 20260822000000 --linked
```

Ou, por SQL direto:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260822000000', 'fase_f4_motor_xml_nfe')
ON CONFLICT (version) DO NOTHING;
```

A migration canônica é idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`,
`DROP ... IF EXISTS` antes de criar, `ON CONFLICT DO NOTHING` na semente):
reaplicá-la sobre o estado remoto 25/25 é **no-op sem perda de dados**.

## Passo 4 — Aplicar 20260823000000 transacionalmente

```bash
psql --single-transaction -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260823000000_fase_f4_1_xsd_oficial.sql
```

Regra inegociável: o registro no ledger vem **depois do COMMIT**, nunca
antes. Se a transação abortar, nada é registrado e o estado permanece o
anterior. Rollback disponível: `restoration/fase-f4-1/rollback.sql`.

## Passo 5 — Registrar o ledger da 20260823000000 (pós-COMMIT)

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260823000000', 'fase_f4_1_xsd_oficial')
ON CONFLICT (version) DO NOTHING;
```

## Passo 6 — Postcheck fail-fast da F4.1

```bash
psql --single-transaction -v ON_ERROR_STOP=1 -f restoration/fase-f4-1/postcheck.sql
```

Esperado: `POSTCHECK F4.1-R1: 8/8 GATES PASS`.

## Passo 7 — Deploy da Edge Function

```bash
supabase functions deploy fiscal-xml-engine --project-ref ikaauvsflpmamgxmkhoq
```

O diretório `supabase/functions/fiscal-xml-engine/xsd/` acompanha o
deploy: `xsdValidate.ts` lê os XSDs por `import.meta.url`, sem rede.
Secrets exigidos no ambiente da função: `FISCAL_CORS_ALLOWLIST`,
`FISCAL_CERTIFICATE_MASTER_KEY`.

## Passo 8 — Verificação runtime remota

1. `POST /functions/v1/fiscal-xml-engine` sem `Authorization` ⇒ 401.
2. Origem fora da allowlist ⇒ 403.
3. `generate` com JWT de perfil fiscal interno ⇒ `SIGNED` e
   `validation.validator = xmllint-wasm@5.3.0 …`, `signatureVerified: true`.
4. Sem certificado A1 disponível ⇒ 412 `CERTIFICATE_REQUIRED` e execução
   preservada em `GENERATED` (nunca `FAILED`).
5. Reenvio da mesma `idempotency_key` ⇒ replay idempotente, sem nova
   `run_version` e sem duplicar objetos no Storage.
6. `anon` não consegue ler `fiscal_xml_runs` nem baixar do bucket.
7. `download` devolve URL assinada de 120 s apenas para perfil interno.

## Passo 9 — Ledger (depois)

```bash
psql -v ON_ERROR_STOP=1 -f restoration/fase-f4-1/verify-canonical.sql
```

Esperado: `20260822000000` e `20260823000000` registrados, sem lacunas.

## Passo 10 — Reabilitação da UI

Só após os passos 6, 8 e 9 sem skip crítico, remover o bloqueio de
geração em `src/components/fiscal/documentos/GeracaoXmlNfeSecao.tsx`.
Enquanto isso, a UI permanece desabilitada com mensagem honesta.
