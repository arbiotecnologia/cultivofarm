# Fase Fiscal 3.8 — Barreira server-side de pré-homologação

## Localização

Este diretório é **server-only por convenção**. Nenhum arquivo em `src/**` pode
importar dele. O teste estático `src/test/fiscal/fase3_8.static.test.ts`
falha imediatamente se essa regra for violada.

## Escopo desta fase

- **Somente o módulo puro** `preflight.ts` foi criado.
- Nenhum entrypoint `supabase/functions/fiscal-preflight/index.ts` foi
  materializado nesta fase — deliberadamente, para respeitar a diretriz
  "sem deploy" (o ambiente da Lovable Cloud auto-implanta qualquer função
  cujo `index.ts` exista sob `supabase/functions/`).
- O padrão seguro de autenticação/autorização já existe no repositório
  (ver `supabase/functions/list-portal-users/index.ts`: `getClaims` via
  cliente anônimo com JWT do usuário + `has_role` via cliente admin). Esse
  padrão é o que um futuro `fiscal-preflight` deve reutilizar, sem
  ampliar RLS e sem responder ao usuário com `service_role`.

## Fail-closed

O avaliador puro (`evaluatePreflight`) devolve `canTransmit: false` como
literal-type em qualquer cenário. Mesmo quando todos os gates são
explicitamente `true`, o status máximo é `PRECHECK_ONLY`. Nenhuma
transmissão é possível a partir daqui.

## Proibições ativas nesta fase

- Sem SDK/URL/fetch de provedor.
- Sem certificado/PFX/P12/token/webhook.
- Sem chamadas a `supabase.rpc`, `functions.invoke`, `.insert/.update/.delete/.upsert`.
- Sem uso de `service_role` para responder ao usuário.
- Sem leitura de segredos, sem persistência de `fiscal_events`, sem geração
  de `idempotency_key`.

## Variáveis de ambiente (nomes documentais)

Declaradas apenas por nome em `FISCAL_ENV_VAR_NAMES`, sem valores e sem
serem lidas em runtime:

- `FISCAL_RUNTIME_MODE` → default `DISABLED`
- `FISCAL_PROVIDER` → default `NONE`
- `FISCAL_EMISSION_ENABLED` → default `false`

Nenhum fallback para produção. Nenhum segredo real adicionado.
