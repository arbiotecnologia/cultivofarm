# Runbook — Comunicação Fase 0.2

Este runbook explica **como aplicar** a migration proposta em
`restoration/comunicacao-fase02/migration.sql`. Enquanto a migration
não estiver em `supabase/migrations/` e registrada no histórico oficial,
ela **NÃO é canônica** — trate como PROPOSTA.

## Escopo
- Tabelas: `notificacoes_operacionais`, `portal_notificacoes`,
  `aplicacao_emails`, `monitoramento_avisos`.
- Zero alteração de rotas ou dependências. Zero mudança em UI.
- Aditivo e idempotente.

## Pré-condições
1. Ambiente destino é **staging** primeiro. Nunca produção sem verde no staging.
2. Backup completo do schema `public` disponível.
3. Segredo `INTERNAL_FUNCTION_SECRET` já configurado em Project Settings → Secrets.
4. Edge Functions da Fase 0.1/0.2 já implantadas
   (`send-push-notification`, `enviar-pdf-visita`, `enviar-pdf-aplicacao`,
   `check-monitoramentos-vencidos`).

## Passo a passo

### 1. Precheck (leitura)
Executar `restoration/comunicacao-fase02/precheck.sql`. Nenhum RAISE EXCEPTION.
Salvar a saída do dump de policies/grants para diff posterior.

### 2. Aplicar como migration oficial
A pasta `supabase/migrations/` é escrita **apenas** pelo fluxo de migration
do projeto Lovable/Supabase. Nesta Fase 0.2, a orientação para o operador
humano é:

- **Opção A (recomendada):** copiar
  `restoration/comunicacao-fase02/migration.sql` para
  `supabase/migrations/20260810000000_comunicacao_fase02_hardening.sql`
  em um commit humano dedicado e rodar `supabase db push` no staging.
- **Opção B:** aplicar via `psql` na branch de staging usando as mesmas
  credenciais que rodam migrações regulares, com `\i restoration/comunicacao-fase02/migration.sql`
  dentro de uma transação. Registrar no `supabase_migrations.schema_migrations`
  a versão manualmente para não descasar histórico.

> Enquanto a migration não estiver em `supabase/migrations/`, **não** afirme
> em relatórios que ela foi aplicada e **não** a chame de canônica.

### 3. Postcheck (leitura)
Executar `restoration/comunicacao-fase02/postcheck.sql`. Deve terminar com
`NOTICE: Postcheck OK`. Comparar dump de policies/grants com o precheck.

### 4. Harness RLS (leitura, staging)
Editar `restoration/comunicacao-fase02/harness-rls.sql` substituindo
placeholders `<STAFF_UID>`, `<PRODUTOR_UID>`, `<CLIENTE_ID>`, `<REGISTRO_ID>`,
`<APLICACAO_ID>` etc. por UUIDs reais das fixtures. Executar como
`service_role`. Ler os `NOTICE OK` de cada seção; qualquer `FALHOU` interrompe
a homologação.

### 5. Regeneração de types
Depois da migration aplicada em staging, regerar os tipos via CLI oficial:
```
supabase gen types typescript --linked --schema public > src/integrations/supabase/types.ts
```
Em seguida remover os marcadores `// TODO(fase-0.2-regen)` e os `(supabase.rpc as any)`
listados pelo teste estático `src/test/comunicacao/rpcTypesTodo.test.ts`.

### 6. Certificação runtime
- Login como staff (`consultor_tecnico`): agendar retorno de visita técnica →
  esperada 1 notificação operacional e (se marcada) 1 notificação de portal
  do tipo `recomendacao` (nunca `visita`/`os`).
- Login como produtor: portal exibe a notificação; **não** consegue criar
  novas notificações.
- Executar `check-monitoramentos-vencidos` com header `x-internal-secret`:
  gera 1 aviso por dia; execução duplicada devolve `skipped`.
- Testar `enviar-pdf-aplicacao` e `enviar-pdf-visita` com usuário dono e
  usuário sem vínculo (403).

### 7. Rollback (apenas se necessário)
`restoration/comunicacao-fase02/rollback.sql` remove as adições **sem**
restaurar as policies vulneráveis anteriores. Prefere manter escrita
bloqueada a reabrir o vetor de ataque.

## Pendências externas ao repositório
- Confirmação humana da execução em staging antes de produção.
- Configuração do cron real (fora do repositório) apontando para
  `check-monitoramentos-vencidos` com `x-internal-secret`.
- Implantação de `send-transactional-email` (fora do escopo desta fase).
- Regeneração de `src/integrations/supabase/types.ts`.
