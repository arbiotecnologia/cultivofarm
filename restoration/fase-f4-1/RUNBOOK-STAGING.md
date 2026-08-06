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

## Passo 0 — Evidência do ledger (antes)

```sql
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
```

Esperado hoje: termina em `20260821000000`. A F4 (`20260822000000`) está
aplicada **fora do ledger** — os objetos existem no banco, a entrada não.

## Passo 1 — Reconciliação do ledger da F4

Sem alterar objetos já aplicados, registrar a F4 como aplicada:

```bash
supabase migration repair --status applied 20260822000000 --linked
```

Ou, com acesso SQL direto e o arquivo canônico já conferido:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260822000000', 'fase_f4_motor_xml_nfe')
ON CONFLICT (version) DO NOTHING;
```

Só executar após diff estrutural confirmar que
`restoration/fase-f4/migration.sql` corresponde ao schema aplicado
(inclusive bucket `fiscal-xml` e policies de Storage). Se divergir,
**parar**: a reconciliação é inválida.

## Passo 2 — Migration incremental (atômica)

```bash
psql --single-transaction -v ON_ERROR_STOP=1 -f restoration/fase-f4-1/migration-incremental.sql
```

Rollback disponível: `restoration/fase-f4-1/rollback.sql`.

## Passo 3 — Postcheck fail-fast

```bash
psql --single-transaction -v ON_ERROR_STOP=1 -f restoration/fase-f4-1/postcheck.sql
```

Esperado: `POSTCHECK F4.1-R1: 8/8 GATES PASS`.

## Passo 4 — Deploy da Edge Function

```bash
supabase functions deploy fiscal-xml-engine --project-ref ikaauvsflpmamgxmkhoq
```

O diretório `supabase/functions/fiscal-xml-engine/xsd/` acompanha o
deploy: `xsdValidate.ts` lê os XSDs por `import.meta.url`, sem rede.
Secrets exigidos no ambiente da função: `FISCAL_CORS_ALLOWLIST`,
`FISCAL_CERTIFICATE_MASTER_KEY`.

## Passo 5 — Verificação runtime remota

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

## Passo 6 — Ledger (depois)

```sql
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
```

Esperado: `20260822000000` e a incremental registrados, sem lacunas.

## Passo 7 — Reabilitação da UI

Só após 4/4 dos passos 3–6 sem skip crítico, remover o bloqueio de
geração em `src/components/fiscal/documentos/GeracaoXmlNfeSecao.tsx`.
Enquanto isso, a UI permanece desabilitada com mensagem honesta.
