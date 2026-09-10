# Promoção estrutural para o novo projeto CultivoFarm (`swzpzcwiasxmjutrmvkm`)

Somente análise e plano. Nenhuma alteração de banco, deploy ou publicação nesta etapa.

## 1. Estado verificado agora (leitura de arquivos, sem acesso a banco)

- `supabase/config.toml` → `project_id = "ikaauvsflpmamgxmkhoq"` (homologação/staging).
- `src/integrations/supabase/client.ts` → URL de staging `ikaauvsflpmamgxmkhoq`.
- `.env` → aponta para o Sandbox Lovable Cloud `yzszlzjpovmcteuxjznj` (drift já conhecido; o gate `h9f-binding-gate.sh` e o teste `connection-binding.static.test.ts` reprovam esse estado).
- `supabase/migrations`: **721 arquivos**, de `20260314022647…` a `20261026000000_h9g_retorno_tecnico_tipo_demanda_v1.sql`.
- Dentro desses 721 há **20 arquivos de sandbox** (`20260812134101…20260812135640`, nomes UUID) já classificados como `BLOQUEADA_PERMANENTE` — recriam `app_role` com 3 rótulos e `user_roles`, destruindo papéis. Não entram no pacote.
- 18+ Edge Functions em `supabase/functions` (fora do escopo desta promoção estrutural).
- Dossiê de promoção existente reutilizável: `restoration/promocao-producao-h9/` (manifesto, prechecks, pós-checks, rollback por onda, runbook, validação estática) e `restoration/promocao-producao/10-inventario-readonly.sh`.

**Conclusão de conexão:** o projeto Lovable não está ligado ao CultivoFarm e não pode se ligar sozinho.

## 2. Ação manual obrigatória (fora do Lovable)

O ref `swzpzcwiasxmjutrmvkm` é um projeto Supabase externo, em outra organização. O Lovable Cloud deste projeto é um backend distinto e não pode ser reapontado. Portanto a execução é local, pela máquina do operador:

1. No dashboard Supabase da organização Cultivo Farm, projeto `swzpzcwiasxmjutrmvkm`: **Settings → Database → Connection string (session pooler)** e **Settings → API** para obter URL e chave publicável.
2. Confirmar em **Settings → Database → Backups** que o PITR/backup está ativo antes de qualquer aplicação.
3. Localmente: `supabase login`, depois `supabase link --project-ref swzpzcwiasxmjutrmvkm`.
4. As extensões exigidas (`pgcrypto`/`extensions`, `pg_cron`, `pg_net`, `pg_trgm` conforme uso) precisam ser habilitadas em **Database → Extensions** antes das migrations que as usam.
5. O arquivo `supabase/config.toml` e o binding do app só devem ser trocados para o novo ref quando você autorizar explicitamente — hoje o gate de binding reprova qualquer ref diferente de `ikaauvsflpmamgxmkhoq`.

## 3. Escopo do que promover

Incluir: schemas, tipos/enums, tabelas, índices, constraints, funções, triggers, views/matviews, RLS habilitada, policies, grants/ACLs, sequences, jobs de cron (definição, desabilitados).

Excluir: dados de negócio, usuários Auth (exceto `admin@arbio.com` numa etapa posterior), objetos de Storage, harnesses e fixtures de teste, marcadores de ambiente (`fiscal_environment_marker`, `_fiscal_staging_marker`), séries fiscais e `codigo_sequencias` (estrutura sim, valores reconfigurados), as 20 migrations de sandbox.

## 4. Ordem de migração (ondas)

- **Onda 0 — Baseline estrutural.** Em vez de replay das 721 migrations (histórico com one-shots e reescritas manuais que já falharam em dry-run), gerar um **dump estrutural somente-schema do staging** (`pg_dump --schema-only --no-owner --no-privileges` + dump separado de grants/policies) e usá-lo como baseline do CultivoFarm. Motivo: o ledger do staging não reproduz o histórico e 38+ migrations foram aplicadas fora de banda.
- **Onda 1 — Extensões e schemas** (`extensions`, `private`, enums, domains).
- **Onda 2 — Tabelas, sequences, constraints, índices.**
- **Onda 3 — Funções e triggers** (inclui `has_role` e helpers `SECURITY DEFINER` com `search_path` fixo).
- **Onda 4 — Views e matviews** com `security_invoker=true` onde já padronizado.
- **Onda 5 — RLS, policies e grants** (`GRANT` explícito por tabela; sem `anon` onde as policies escopam por `auth.uid()`).
- **Onda 6 — Cron/jobs** criados desabilitados; secrets do Vault recriados manualmente.
- **Onda 7 — Ledger.** Registrar o baseline como uma única versão no `supabase_migrations.schema_migrations` do CultivoFarm, mais registro em tabela de execução, sem inventar versões históricas.

Cada onda roda em transação própria, com pós-check antes do `COMMIT`.

## 5. Prechecks (somente leitura, antes de cada aplicação)

1. Guarda de alvo fail-closed: abortar se o ref/DSN não for `swzpzcwiasxmjutrmvkm`; abortar explicitamente se contiver `navfzbwgwzruipouyfnk` (produção AR Bio), `ikaauvsflpmamgxmkhoq` (staging) ou `yzszlzjpovmcteuxjznj` (sandbox).
2. Banco alvo vazio no schema `public` (0 tabelas) ou delta declarado e aprovado.
3. Backup/PITR confirmado por escrito.
4. Extensões requeridas presentes.
5. Inventário inicial do alvo via `restoration/promocao-producao/10-inventario-readonly.sh` para servir de baseline de rollback.
6. Inventário do staging como contrato esperado (tabelas, policies, funções, triggers, índices, enums).

## 6. Pós-checks e critérios de aceite

- Paridade de contagem staging × CultivoFarm: tabelas, RLS ativa em 100% das tabelas `public`, policies, funções (incluindo contagem de `SECURITY DEFINER`), triggers, índices, FKs, views/matviews, enums.
- Zero tabela `public` sem `GRANT` coerente com as policies.
- Zero função `SECURITY DEFINER` sem `search_path` fixo.
- Views alvo com `security_invoker=true`.
- Security Advisor do CultivoFarm sem ERROR; warnings classificados e justificados.
- Tabelas de negócio vazias (confirma que nenhum dado foi migrado).
- Auth com nenhum usuário nesta etapa; `admin@arbio.com` criado só na etapa seguinte, com papel `administrador` em `user_roles`.
- Ledger com exatamente a(s) versão(ões) do baseline registrada(s).
- No repositório: `typecheck`, `build`, vitest e o gate de binding verdes.

## 7. Rollback

- Onda em transação: falha de pós-check → `ROLLBACK` automático, nada persiste.
- Falha após commit de uma onda: como o alvo é um projeto novo e vazio, o rollback canônico é `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` mais restauração das extensões — só permitido enquanto o CultivoFarm não tiver dados reais. Após a primeira carga de dados, o rollback passa a exigir PITR.
- Rollback por onda detalhado reaproveitando o formato de `restoration/promocao-producao-h9/05-rollback-por-onda.md`.

## 8. Artefatos que serão gerados quando você aprovar

Nova pasta `restoration/promocao-cultivofarm/`:

- `00-inventario-esperado/` (contrato do staging)
- `01-prechecks-readonly.sql`
- `02-baseline-estrutural.sql` (gerado pelo dump, com hash SHA-256)
- `03-grants-policies.sql`
- `04-postchecks.sql`
- `05-rollback.md`
- `06-runbook-execucao-local.md`
- `07-manifesto-exclusoes.csv` (20 sandbox + harnesses + dados)
- `10-relatorio-final.md`

## 9. Bloqueios atuais

- Sem canal autenticado para `swzpzcwiasxmjutrmvkm` neste ambiente: toda execução é local pelo operador.
- O dump estrutural do staging exige sessão autenticada de homologação, hoje expirada.
- Binding do repositório está em drift (`.env` no sandbox) e precisa ser restaurado antes de qualquer geração de tipos.

Status: promoção **NO-GO** até dump baseline gerado, backup confirmado e prechecks executados no alvo.
