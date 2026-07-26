# Runbook — Comunicação Fase 0.2 (revisão bloqueante)

Este runbook explica **como aplicar** o pacote em
`restoration/comunicacao-fase02/`. Enquanto a migration não estiver em
`supabase/migrations/` e registrada no histórico oficial, ela **NÃO é
canônica** — trate como PROPOSTA.

## Escopo
- Tabelas: `notificacoes_operacionais`, `portal_notificacoes`,
  `aplicacao_emails`, `monitoramento_avisos`.
- Nova RPC transacional: `rpc_check_monitoramento_and_notify(uuid)`.
- Zero mudança em rotas/dependências; UI intocada além dos callers já refatorados.

## Pré-condições
1. Ambiente destino = **staging**. Nunca produção sem verde no staging.
2. Backup completo do schema `public`.
3. Segredo `INTERNAL_FUNCTION_SECRET` configurado em Project Settings.
4. Edge Functions Fase 0.2 implantadas (`send-push-notification`,
   `enviar-pdf-visita`, `enviar-pdf-aplicacao`, `check-monitoramentos-vencidos`).

## Passo a passo

### 1. Precheck
```
psql <staging_dsn> -f restoration/comunicacao-fase02/precheck.sql
```
Aborta com `RAISE EXCEPTION` se dependências ausentes. Salva enumeração de
policies por comando e volume de dados para diff pós-aplicação. Verifica
duplicatas que impediriam os uniques.

### 2. Aplicar como migration oficial
A pasta `supabase/migrations/` é escrita pelo fluxo oficial. Ações:

- **Opção A (recomendada):** copiar
  `restoration/comunicacao-fase02/migration.sql` para
  `supabase/migrations/20260810000000_comunicacao_fase02_hardening.sql`
  em commit humano, executar `supabase db push` em staging.
- **Opção B:** `psql <staging_dsn> -1 -f restoration/comunicacao-fase02/migration.sql`,
  registrar manualmente a versão em `supabase_migrations.schema_migrations`.

> Não afirme em relatório que a migration foi aplicada enquanto ela não
> estiver no histórico oficial.

### 3. Postcheck
```
psql <staging_dsn> -f restoration/comunicacao-fase02/postcheck.sql
```
Deve terminar com `NOTICE: Postcheck OK`.

### 4. Harness RLS/RPC
Editar `restoration/comunicacao-fase02/harness-rls.sql` substituindo
`<STAFF_UID>`, `<STAFF_OTHER_UID>`, `<PRODUTOR_UID>`, `<CLIENTE_ID_A>`,
`<CLIENTE_ID_B>`, `<REGISTRO_A>` (do cliente A), `<REGISTRO_B>` (do cliente B),
`<APLICACAO_ID_A>` por UUIDs reais. Executar como service_role.
Cada seção termina com `NOTICE OK`; qualquer `FALHOU` interrompe homologação.

### 5. Regeneração e comparação de types
O arquivo `src/integrations/supabase/types.ts` foi alinhado manualmente ao
schema proposto para permitir typecheck local sem casts temporários. Depois da
migration aplicada em staging, regenere e compare:
```
supabase gen types typescript --linked --schema public > src/integrations/supabase/types.ts
```
O teste estático `src/test/comunicacao/fase02-static.test.ts` falha se casts
para as RPCs canônicas regressarem.

### 6. Certificação runtime
- Login como consultor: agendar retorno de visita → 1 notificação operacional
  e (se marcada) 1 notificação de portal do tipo `recomendacao`.
- Login como produtor: portal exibe a notificação; produtor **não** cria novas.
- `check-monitoramentos-vencidos` com `x-internal-secret`: `rpc_check_monitoramento_and_notify`
  reserva + notifica em transação única; segunda execução no mesmo dia →
  `duplicated`.
- Concorrência: forçar erro no INSERT da notificação dentro da RPC
  (`SIGNAL sqlstate '99999'` manual) e comprovar que o registro em
  `monitoramento_avisos` **não** foi persistido.
- `enviar-pdf-aplicacao` com destinatário que não esteja em `clientes.email` ou
  `clientes.contato_financeiro_email` do cliente da OS → 403/500 conforme etapa
  que recusar. Mesmo administrador só envia para destinatário cadastrado. Se
  `rpc_record_aplicacao_email` falhar, resposta é 500 e o objeto de storage é removido.

### 7. Rollback
`restoration/comunicacao-fase02/rollback.sql` remove **apenas** as adições;
**NÃO** restaura policies permissivas antigas. Prefere manter escrita
bloqueada a reabrir o vetor.

## Pendências externas
- Confirmação humana da execução em staging antes de produção.
- Cron produtivo apontando para `check-monitoramentos-vencidos` com
  `x-internal-secret`.
- Implantação de `send-transactional-email` (fora do escopo desta fase).
- Regeneração de `src/integrations/supabase/types.ts` e limpeza dos casts.
