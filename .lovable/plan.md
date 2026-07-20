
# Auditoria de migrations — AR Bio Manager → Supabase `navfzbwgwzruipouyfnk`

Somente leitura. Nenhum SQL executado, nenhum arquivo alterado. Todos os valores sensíveis (senhas/emails de seed) foram redigidos abaixo — ver arquivos originais para valores reais.

## 1. Contagem e intervalo

- Arquivos em `supabase/migrations/`: **486** `.sql`
- Total de linhas: **61.826**
- Intervalo cronológico (timestamp do nome):
  - Primeira: `20260314022647` — 14/mar/2026 02:26 UTC
  - Última:   `20260717230331` — 17/jul/2026 23:03 UTC
- 9 migrations com >550 linhas (base + fases grandes). Maior: `20260702145433_...` (752 linhas).
- Base estrutural: **`20260314022647_91aef323-25bf-4cdf-bd34-630a23a1ffb4.sql`** — cabeçalho "AR Bio On-Farm Manager - Complete Database", cria enums (`app_role`, `tipo_problema`, `tipo_produto`, `status_os` etc.), `profiles`, `user_roles`, função `has_role`, trigger `AFTER INSERT ON auth.users` (handle_new_user).

## 2. Dependências de extensões e schemas

- **Extensões requeridas**: `pg_cron`, `pg_net` (ambas com `IF NOT EXISTS`). Uso implícito também de `pgcrypto` (funções `crypt`, `gen_salt`) e `uuid-ossp`/`gen_random_uuid` — precisam existir antes das seeds de auth. **Nenhum `CREATE EXTENSION pgcrypto` explícito** nas migrations → risco de falha em ambiente onde não vem por padrão.
- **Schemas criados**: nenhum `CREATE SCHEMA` próprio; tudo em `public`. Escrevem em `auth.*` (users, identities, triggers) e `storage.*` (buckets, objects).
- **Trigger em `auth.users`**: 1 (`AFTER INSERT` → `handle_new_user`) na base.

## 3. Operações potencialmente destrutivas

- `DROP` (qualquer objeto): **~189 ocorrências** distribuídas — a maioria é `DROP POLICY IF EXISTS` / `DROP TRIGGER IF EXISTS` / `DROP FUNCTION` para recriação idempotente. Seguro em banco vazio.
- `DROP TABLE`: **3 arquivos** — precisam ser lidos antes de aplicar, pode ser drop de tabela temporária ou refactor.
- `TRUNCATE`: **nenhum**.
- `DELETE FROM ... ;` sem WHERE (heurística): **1 arquivo** — `20260615022132_697d1591-...sql` (arquivo grande, 572 linhas — provavelmente um DELETE seletivo mas com "final ponto-e-vírgula" logo após "tabela;" — falso positivo provável, mas exige revisão).
- `ALTER TYPE`: **21 arquivos** (evolução de enums). Nenhum `ALTER TYPE ... DROP/RENAME` detectado. `ADD VALUE` em enum é irreversível dentro de transação — o Supabase CLI aplica cada arquivo em transação; migrations com `ALTER TYPE ... ADD VALUE` devem ficar **isoladas em arquivo próprio** (padrão já respeitado).
- `CREATE OR REPLACE FUNCTION`: **673** — recriação idempotente, esperado.
- **241 migrations "pure-data"** (sem `CREATE ...`): apenas `INSERT/UPDATE/ALTER/GRANT/POLICY`. Dependem 100% de tabelas criadas anteriormente — ordem importa.

## 4. Manipulação de `auth.users` / credenciais embutidas

- 32 arquivos referenciam `auth.users` (FK, RLS, joins).
- **5 arquivos inserem diretamente em `auth.users` + `auth.identities`** (seeds de usuários com `crypt('<senha-redigida>', gen_salt('bf'))`):
  - `20260625131018_...` — usuário `comercial@arbio.com` — senha embutida REDIGIDA
  - `20260625134747_...` — usuário `financeiro@arbio.com` — senha embutida REDIGIDA
  - `20260625141833_...` — seed usuário adicional — senha embutida REDIGIDA
  - `20260625143704_...` — seed usuário adicional — senha embutida REDIGIDA
  - `20260625145234_...` — seed `admin@arbio.com` — senha embutida REDIGIDA
- `20260625131334_...` — `DELETE FROM public.user_roles WHERE user_id=(SELECT id FROM auth.users WHERE email='comercial@arbio.com')` — depende do seed anterior existir.
- **Sem `service_role`/`SUPABASE_SERVICE_ROLE_KEY`/tokens embutidos** em migrations (só via env em Edge Functions). Os "hits" da varredura por "service_role" em migrations eram falsos positivos do padrão `TO service_role` em `GRANT`.

**Risco:** senhas de teste `123456` para contas administrativas — NÃO devem ir para o novo banco em produção. Decisão humana necessária (seção 11).

## 5. Migrations que assumem estado pré-existente

- **241 pure-data migrations** dependem de tabelas criadas pelas 245 estruturais anteriores.
- 6 seeds de `auth.users` (item 4) assumem que `pgcrypto` está habilitado e que a estrutura `profiles/user_roles/user_clientes` já foi criada.
- Várias migrations `ALTER TABLE` sem `CREATE TABLE` no mesmo arquivo (esperado em projeto evolutivo).
- 43 arquivos com "fix/ajuste/correção/hotfix" nos primeiros comentários — devem ser aplicados **na ordem exata**; pular um quebra o próximo.

## 6. Duplicidades / correções posteriores

- Nenhum sufixo UUID duplicado nos nomes.
- Padrão observado: várias correções em janelas curtas de tempo (ex.: 20260516153414 cria `audit_senha_log` → 20260516153649 dropa e recria FKs → 20260519230714 reativa RLS). Consolidar quebraria assinatura de histórico; **manter sequencial**.
- `audit_senha_log` recebe RLS re-enable em migration posterior — evidência de correção. Aplicar sequencialmente resolve.

## 7. Storage / buckets

- **26 arquivos** manipulam `storage.buckets`/`storage.objects`.
- Buckets identificados nos primeiros hits: `logos` (public), `consultor-arquivos` (public), `clientes-docs` (private), `financial-docs` (private), `visitas-pdf`, `aplicacao-evidencias`, `financial-receipts`, `financial-reports`. `ON CONFLICT DO NOTHING` em vários — idempotente.
- Estado atual: 0 buckets → todos serão criados.

## 8. Edge Functions — dependências

18 funções em `supabase/functions/`. Secrets requeridos (aparecem em `Deno.env.get`):

- **Sempre**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (auto-injetados pelo Supabase).
- **Precisam ser adicionados manualmente** em Project Settings → Secrets antes do deploy:
  - `LOVABLE_API_KEY` — `ai-generate-ficha-campo`, `ai-refresh-fichas`, `ai-sugerir-alvos`
  - `GOOGLE_MAIL_API_KEY` — envio de e-mail (funções `enviar-pdf-*`, `enviar-alertas-*`)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME` — fallback SMTP
  - `ALERTAS_SLA_SECRET`, `ALERTAS_RESUMO_SECRET`, `ALERTAS_NOTIFICACOES_SECRET`, `ALERTAS_CRON_SECRET` — validação HMAC dos cron jobs
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Web Push
  - `APP_URL` / `SITE_URL` — links em e-mails
- **RPCs invocados** (devem existir antes do deploy): `has_role`, `rpc_executar_motor_alertas`, `rpc_marcar_resumo_enviado`, `rpc_marcar_resumo_falhou`, `rpc_marcar_notificacao_enviada`, `rpc_marcar_notificacao_falhou`, `rpc_aplicar_sla_alertas`, `register_financial_report_export`.
- **Tabelas tocadas** (amostra): `agenda_sync_log`, `ai_refresh_jobs`, `alertas_*`, `audit_senha_log`, `clima_dados`, `fazendas`, `ficha_tecnica_versoes`, `financial_receipts`, `formulacoes`, `microorganism_technical_profiles`, `microrganismos`, `monitoramento_avisos`, `notificacoes_operacionais`, `portal_solicitacoes`, `product_technical_profiles`, `produtos`, `profiles`, `push_subscriptions`, `registros_consultor`, `user_clientes`, `user_roles`.

## 9. Estratégia de aplicação por fases (banco vazio)

Executada por humano via `supabase db push` (com login/link para `navfzbwgwzruipouyfnk`) **após aprovação**. Nenhuma fase é executada por mim.

```text
FASE 0  Pré-requisitos (manual)
        - Habilitar extensões: pgcrypto, uuid-ossp (pg_cron/pg_net vêm nas migrations)
        - Link do CLI: supabase link --project-ref navfzbwgwzruipouyfnk
        - Snapshot vazio de referência (dump schema-only)

FASE 1  Base estrutural + auth foundation  (arquivos ~20260314*..20260331*)
        - Enums, profiles, user_roles, has_role, trigger auth.users
        - Checkpoint: SELECT count(*) FROM pg_type WHERE typtype='e'; RLS ativo em user_roles

FASE 2  Domínio operacional (abril 2026)
        - Clientes, fazendas, talhões, OS, lotes, estoque, entregas
        - Checkpoint: 0 erros de FK; listar tabelas criadas

FASE 3  Storage + documentos + laboratório (maio 2026)
        - Buckets, RLS de storage, audit_senha_log
        - Checkpoint: SELECT id FROM storage.buckets

FASE 4  Portal produtor + registros consultor (jun 1ª quinzena)
        - user_clientes, registros_consultor, portal_solicitacoes
        - Checkpoint: policies count por tabela

FASE 5  Financeiro + BI + alertas (jun 2ª quinzena)
        - Funções `rpc_*`, motor de alertas, DRE
        - Checkpoint: SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%'

FASE 6  Fases 14+ / B2B / catálogo (jul 2026)
        - Portal parceiro B2B, catálogo unificado, simulações
        - Checkpoint: smoke query em cada tabela nova

FASE 7  DECISÃO HUMANA: seeds de auth (5 arquivos 20260625*)
        - Opções: (a) pular e criar usuários via UI/dashboard;
                  (b) aplicar com senhas embutidas e forçar reset;
                  (c) reescrever migrations para senha via env.
        - Recomendação: (a) ou (c). NÃO recomendar (b) para produção.

FASE 8  Deploy Edge Functions
        - Adicionar todos os secrets da seção 8 ANTES do deploy
        - Deploy uma a uma; testar cada endpoint

FASE 9  Cron jobs (pg_cron) — validar agendamentos criados nas migrations
```

## 10. Checklist de backup / rollback por fase

Antes de cada fase:
- [ ] `pg_dump --schema-only` do estado atual → arquivo datado em `/mnt/documents/backups/`
- [ ] `pg_dump --data-only` das tabelas já populadas (fases ≥ 4)
- [ ] Registrar hash git do repo e lista de arquivos da fase
- [ ] Confirmar que `supabase_migrations.schema_migrations` reflete apenas migrations aplicadas com sucesso

Após cada fase:
- [ ] Rodar checkpoint SQL declarado na fase
- [ ] `bun run build` do frontend contra o novo estado
- [ ] Fumaça manual em 1 rota afetada pela fase

Rollback:
- Fases 1–6: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` + restore do último dump. Só viável porque partimos de banco vazio.
- Fase 7 (auth seeds): `DELETE FROM auth.users WHERE email IN (...)`.
- Fase 8 (functions): `supabase functions delete <name>`.

## 11. Riscos críticos — precisam decisão humana

1. **Senhas de teste `123456` para contas admin/comercial/financeiro** em 5 migrations. Aplicar como está expõe o ambiente. Decidir estratégia (recomendo: pular seeds e criar via dashboard).
2. **`pgcrypto` não é criado explicitamente** por nenhuma migration, mas `crypt()`/`gen_salt()` são usados nos seeds da Fase 7. Confirmar disponibilidade antes.
3. **`20260615022132_...sql`** — flagged por heurística de `DELETE FROM ... ;`. Ler manualmente antes de aplicar (arquivo tem 572 linhas).
4. **3 arquivos com `DROP TABLE`** — em banco vazio devem virar no-op, mas confirmar que não removem algo criado por outra migration na mesma sequência.
5. **`pg_cron` + `pg_net`** exigem privilégios elevados; habilitar via dashboard antes ou aceitar que essas migrations rodem com owner do projeto.
6. **HTTP-triggers de alertas** dependem de `pg_net` + secrets HMAC. Sem os secrets, funções falham silenciosamente na Fase 5/8.
7. **Trigger `handle_new_user` em `auth.users`**: se algum seed de auth rodar antes do trigger existir, `profiles` fica dessincronizado. Ordem cronológica já resolve, mas confirmar.
8. **41 arquivos flagados por `hardcoded secrets`** eram majoritariamente `TO service_role` em `GRANT` (falso positivo). Nenhum token real encontrado, mas revisão pontual dos 5 primeiros arquivos recomendada antes do push.

## Próximo passo sugerido (após aprovação)

Criar sub-plano da **Fase 1** com lista exata dos arquivos a incluir (ex.: `20260314*` a `20260331*`), o SQL de checkpoint e o comando `supabase db push --include-all` restrito por range. Nada será aplicado sem aprovação explícita.
