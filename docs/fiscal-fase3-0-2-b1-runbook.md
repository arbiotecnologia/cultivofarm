# Fase Fiscal 3.0.2-B.1 — Runbook do Harness RLS

## Objetivo

Executar `src/test/fiscal/rls/harness.test.ts` em staging isolado, produzindo
a matriz completa de 15 perfis × 9 tabelas × 4 operações + 5 views + ownership
+ RPC (primária + 3 negativas).

## Pré-requisitos

1. Staging isolado com project ref **≠** `navfzbwgwzruipouyfnk`.
2. 489 migrations canônicas aplicadas.
3. Marker inserido:
   ```sql
   INSERT INTO public._fiscal_staging_marker(marker, project_ref)
   VALUES ('STAGING', '<ref-temp>');
   ```
4. 6 envs presentes no processo Node:
   - `FISCAL_TEST_ENV=STAGING`
   - `FISCAL_TEST_PROJECT_REF=<ref-temp>`
   - `PGURL_STAGING`
   - `PGREST_STAGING`
   - `PGREST_ANON_KEY`
   - `PGREST_SERVICE_ROLE_KEY`

Sem essas envs, o harness marca skip explícito. Com envs parciais, **falha**
(nunca converte em skip).

## Setup automático

`setupStaging(cfg)` executa sequencialmente:

1. Reconfirma marker + project_ref via `assertStagingMarker`.
2. Cria 13 usuários sintéticos (papéis não-produtores) via
   `admin.auth.admin.createUser({ email_confirm: true })`. Senha aleatória
   via `node:crypto.randomBytes(16).toString("hex")`, mantida apenas em
   variável local. Nunca logada.
3. Insere `profiles` e `user_roles` para cada.
4. Para `cliente_produtor` A e B:
   - cria usuário;
   - insere `clientes` (prefixo `FISCAL_TEST_B1_`);
   - insere `user_clientes` (obrigatório antes do role — satisfaz
     `enforce_cliente_id_for_produtor`);
   - insere `user_roles` com role `cliente_produtor`.
5. Autentica cada usuário via `signInWithPassword` para obter JWT temporário.
6. Cria fixtures fiscais descartáveis (uma por tabela + `__disposable` para
   DELETE): produto, serviço via `source_reference`, `accounts_receivable`
   vinculando `fiscal_invoices` ao `customer_id` do produtor A.
7. Guarda IDs em `session.fixtureIds` para uso pelas células.

## Ownership

O harness HTTP usa apenas o vínculo via `accounts_receivable` (produtor A →
receivable → invoice). A origem `delivery_id` foi certificada separadamente
no smoke SQL externo; não introduzimos entregas sintéticas aqui para não
enfraquecer triggers operacionais.

## RPC

Cada role executa 4 chamadas em `rpc_fiscal_event_manual`:
- primária (invoice válida + event_type válido + notes curta) — allow/deny
  conforme papel;
- invoice ausente — sempre deny/error;
- event_type inválido — sempre deny/error;
- notes > 2000 chars — sempre deny/error.

Para allow, valida retorno UUID e (via service role) confirma
`event_source='USER'`, `performed_by`, `notes` gravado.

## Classificação de resultados

- `allow`: HTTP 2xx com evidência de linha/UUID.
- `deny`: HTTP 401/403 ou SQLSTATE `42501`/`permission denied`, ou 0 linhas em
  SELECT/UPDATE/DELETE quando esperado.
- `error`: qualquer outra falha (404, constraint, FK, rede, JSON quebrado,
  coluna ausente). **Nunca convertida em `deny`.**

## Teardown

Idempotente, tolera linha ausente. Ordem:

1. `fiscal_audit_log` (linhas do fixture).
2. `fiscal_events` associados aos invoices sintéticos.
3. `fiscal_invoice_items`.
4. `fiscal_idempotency_keys`.
5. `fiscal_invoices`.
6. `customer_fiscal_profiles`, `service_fiscal_profiles`, `product_fiscal_profiles`.
7. `company_fiscal_settings`.
8. `accounts_receivable` sintéticas.
9. `user_roles`, `user_clientes`, `profiles`.
10. `clientes`, `produtos` sintéticos.
11. `auth.admin.deleteUser` para cada usuário sintético.

Ao final, contagens com prefixo `FISCAL_TEST_B1_` devem ser zero.

## Segurança de logs

Nunca imprimir: senha, JWT, `serviceRoleKey`, `anonKey`, URL de PG com senha,
e-mail sintético completo. Logs autorizados: contagens, `projectRef`,
resultado agregado (`planned/executed/passed/failed/errors/skipped`).

## Execução

```sh
export FISCAL_TEST_ENV=STAGING
export FISCAL_TEST_PROJECT_REF=<ref>
export PGURL_STAGING=<...>
export PGREST_STAGING=<...>
export PGREST_ANON_KEY=<...>
export PGREST_SERVICE_ROLE_KEY=<...>

bunx vitest run src/test/fiscal/rls/harness.test.ts
```

Sem as envs: skip explícito. Com envs parciais: falha determinística.
