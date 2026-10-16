# Delta piloto F4b — /app/solicitar

Causa: o formulário enviava `client_uuid`, coluna inexistente em `portal_solicitacoes` (PGRST204). Nenhuma solicitação criada.

Migration (`supabase/migrations/` mais recente):
```sql
ALTER TABLE public.portal_solicitacoes ADD COLUMN IF NOT EXISTS client_uuid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS portal_solicitacoes_author_client_uuid_uniq
  ON public.portal_solicitacoes (user_id, client_uuid) WHERE client_uuid IS NOT NULL;
```
Rollback (corrigido após uso real): NÃO usar `DROP COLUMN`/`DROP INDEX`. A coluna já guarda chaves de idempotência de solicitações reais (ex.: SOL-2026-000003); removê-la apagaria histórico e reabriria duplicidade. Rollback seguro = reverter apenas o código do formulário para não enviar `client_uuid`, preservando coluna, índice, chaves e histórico.

Readback: coluna uuid nullable, índice presente, 0 linhas preenchidas, 9 policies inalteradas, guard `a00_producer_request_mutation_guard` habilitado (UPDATE do Produtor continua bloqueado para qualquer coluna além de `confirmacao_produtor`, incluindo `client_uuid`).

Código: `src/lib/portal/solicitacaoSubmit.ts`, `src/pages/app/MobileSolicitar.tsx`. Sem `.select()` após insert, sem grants novos.
Testes: `src/test/portal/solicitacaoSubmit.test.ts` (feliz, duplicidade, 23505 alheio, 42501 tenant forjado, erro de schema, UUID estável).
Limite conhecido: se a primeira tentativa gravou mas a resposta se perdeu e o usuário editou o formulário, o retry retorna "já enviada" sem aplicar a edição.
Não verificado: SQL adversarial com sessão real de Produtor (sem fixture autorizada); será coberto pelo piloto.
SMTP/segredos/gates não tocados.
