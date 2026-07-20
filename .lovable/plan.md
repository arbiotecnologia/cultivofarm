## Fase 3 — Auditoria estática das migrations de junho/2026

**Nada será executado.** Somente leitura em `supabase/migrations/202606*.sql`.

### 1. Totais e intervalo
- **230 arquivos**, de `20260606231743` a `20260630194437` (25 dias corridos).

### 2. Migrations a EXCLUIR (auth.users/identities, senhas fixas, seeds de usuários)

Apenas 6 arquivos manipulam de fato `auth.users`/`auth.identities` ou dependem de seed de usuário. Todos usam senha fixa `123456` via `crypt()/gen_salt('bf')`:

| Arquivo | Ação |
|---|---|
| `20260625131018_144e5b03…sql` | `INSERT INTO auth.users` + `auth.identities` para `comercial@arbio.com` |
| `20260625131334_2a83ef8e…sql` | `DELETE FROM public.user_roles` filtrado por `auth.users.email = 'comercial@arbio.com'` (depende do seed acima) |
| `20260625134747_85812a6c…sql` | `INSERT INTO auth.users` + `auth.identities` para `financeiro@arbio.com` |
| `20260625141833_872e5b38…sql` | Bloco `DO` que INSERE em `auth.users`/`auth.identities` com `crypt('123456', gen_salt('bf'))` |
| `20260625143704_a440c3e9…sql` | Idem: INSERT auth.users/identities com senha fixa |
| `20260625145234_2039da42…sql` | `UPDATE auth.users SET encrypted_password = crypt('123456', …) WHERE email='admin@arbio.com'` |

Os demais matches em `rg 'auth\.users'` são apenas **FK `REFERENCES auth.users(id)`** em CREATE TABLE / ADD COLUMN (estrutura). Não são seeds — mantidos.

Nenhum arquivo de junho contém: `CREATE USER`, `GRANT ROLE`, tokens, chaves API, secrets do Vault ou PII embutida além dos e-mails `@arbio.com` acima.

### 3. Operações potencialmente destrutivas

- **DROP TABLE / TRUNCATE:** **0 arquivos**.
- **DELETE FROM:** 17 arquivos. Amostragem mostra que são majoritariamente cleanups idempotentes (ex.: `DELETE FROM tabela WHERE …` antes de reinserir catálogo, ou revogar policy antiga). **Recomendação:** inspecionar caso a caso antes de cada sublote — não aplicar em bloco cego. O único `DELETE` que toca dado sensível é `20260625131334` (já excluído).
- **ALTER TYPE (enum add value):** 12 arquivos —
  `20260611152656`, `20260611222531`, `20260612022453`, `20260616234047`, `20260616234953`, `20260617001757`, `20260617002901`, `20260617022407`, `20260617030649`, `20260628232538`, `20260628234321`, `20260629060949`.
  Risco: `ALTER TYPE … ADD VALUE` **não pode ser usado na mesma transação** onde o novo valor é referenciado. Aplicar cada um em transação isolada.
- **DROP COLUMN / FUNCTION / POLICY / CONSTRAINT / INDEX / TRIGGER / VIEW:** 39 arquivos. Não destroem tabela nem dados, mas podem quebrar objetos que dependam deles. Verificar que cada DROP é seguido por CREATE compatível na mesma migration (padrão do repo até agora).

### 4. Migrations data-only

Total identificado (só INSERT/UPDATE, sem DDL): **7**. Descontados os 6 seeds de usuários da seção 2, restam **2 data-only não-usuário**:

| Arquivo | Classificação | Recomendação |
|---|---|---|
| `20260619135251_dd015f22…sql` | catálogo/configuração | inspecionar; aplicar se catálogo, adiar se operacional |
| `20260626150308_9f7dbea0…sql` | catálogo/configuração | idem |

Como o backfill de formulações já foi adiado por falta de catálogos-base (produtos/microrganismos), estes 2 devem ser lidos antes de aplicar — se dependerem dos mesmos catálogos, adiar junto.

### 5. Dependências externas

- **pg_cron:** 1 arquivo — `20260628215811_15ea7361…sql`. Requer `CREATE EXTENSION pg_cron` habilitada no Supabase antes de aplicar. **Bloqueia** o sublote D se não estiver ativa.
- **pg_net:** 0 referências diretas em junho.
- **Storage (`storage.buckets` / `storage.objects`):** 0 referências. Os 10 buckets atuais já foram criados em fases anteriores.
- **Vault:** 0 referências.
- **Edge Functions (`supabase_functions`, `functions.http`, `invoke`):** 0 referências em SQL. As 18 edge functions são deployadas separadamente e não são invocadas dentro das migrations de junho.

### 6. Riscos de ordem / transação / idempotência

1. **ALTER TYPE dentro de transação:** os 12 arquivos precisam rodar cada um em sua própria conexão/tx. Aplicar via `\i` arquivo-por-arquivo (como na Fase 2), nunca em bloco `BEGIN…COMMIT` agrupado.
2. **pg_cron:** aplicar `CREATE EXTENSION IF NOT EXISTS pg_cron` antes do arquivo de 28/06.
3. **Idempotência dos DELETE FROM:** re-execução pode zerar catálogo populado. Marcar cada arquivo como "roda uma vez" no `schema_migrations`.
4. **Ordem cronológica é obrigatória** — várias migrations do dia 25/06 são incrementais (INSERT → DELETE → INSERT) e quebram se reordenadas.
5. **Registro no `schema_migrations`:** os 6 arquivos excluídos precisam ser marcados como "aplicados ignorados" para não reaparecerem em rebases futuros (mesma técnica da Fase 2, migration de formulações).

### 7. Sublotes cronológicos recomendados

Aplicar em 5 sublotes, validando entre cada um (contagens de tabelas/policies/funções, typecheck/build, smoke `/auth`):

```text
Sublote A — 06 a 10/jun    (~40 arquivos, DDL early)
Sublote B — 11 a 15/jun    (~60 arquivos, inclui 3 ALTER TYPE)
Sublote C — 16 a 20/jun    (~55 arquivos, inclui 6 ALTER TYPE + FKs auth)
Sublote D — 21 a 25/jun    (~40 arquivos, EXCLUIR os 6 seeds de auth do dia 25)
Sublote E — 26 a 30/jun    (~35 arquivos, inclui pg_cron 28/jun + 3 ALTER TYPE)
```

Números exatos por dia serão emitidos no início da execução (comando `ls | cut -c1-8 | uniq -c`).

### 8. Bloqueios que exigem decisão humana antes da Fase 3

1. Confirmar exclusão definitiva dos 6 seeds de auth (senha `123456`) — usuários deverão ser criados via fluxo real de sign-up + `user_roles` posteriormente.
2. Autorizar habilitação da extensão `pg_cron` antes do sublote E (ou remover o arquivo de 28/06 do escopo).
3. Confirmar leitura dos 2 data-only não-usuário antes de aplicar — decidir catálogo vs. adiar.
4. Ainda **sem credenciais admin** no sandbox (mesmo bloqueio da Fase 2): a aplicação real depende de PAT do Supabase CLI, connection string Postgres, ou aplicação externa pelo usuário com devolução de contagens.

### 9. Entregáveis desta fase (após execução autorizada)
- Lista aplicada / lista ignorada + motivo.
- Contagens antes/depois (tabelas, policies, funções, enums, buckets).
- Typecheck + build + smoke `/auth` verdes entre sublotes.
- Nenhuma alteração em código de frontend (Vite/React Router/TS/Tailwind v3 preservados).

Aguardando decisão sobre os 4 bloqueios da seção 8 para iniciar.