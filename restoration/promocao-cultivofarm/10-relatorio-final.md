# Promoção estrutural AR Bio Manager → CultivoFarm — Relatório de preparação

Data: 2026-09-10.
Alvo declarado: `swzpzcwiasxmjutrmvkm` (organização Cultivo Farm).
Origem do contrato: homologação `ikaauvsflpmamgxmkhoq`.
Proibidos: `navfzbwgwzruipouyfnk` (produção AR Bio) e `yzszlzjpovmcteuxjznj` (sandbox).

**Nenhum banco foi acessado e nenhum SQL foi executado na geração deste pacote.**

## 1. Conexão atual do projeto (verificação de arquivos)

| Arquivo | Ref apontado |
|---|---|
| `supabase/config.toml` | `ikaauvsflpmamgxmkhoq` (homologação) |
| `src/integrations/supabase/client.ts` | `ikaauvsflpmamgxmkhoq` (homologação) |
| `.env` | `yzszlzjpovmcteuxjznj` (Sandbox Lovable Cloud — drift conhecido) |

O ref `swzpzcwiasxmjutrmvkm` **não aparece em nenhum ponto do repositório**. O
backend gerenciado deste projeto no Lovable é um projeto distinto e não pode ser
reapontado para o CultivoFarm por dentro da plataforma: a troca é manual, pelo
dashboard Supabase e pelo CLI, conforme o Passo 0 de `06-runbook-execucao-local.md`.

## 2. Inventário de origem

- `supabase/migrations`: **721 arquivos**, de `20260314022647…` a
  `20261026000000_h9g_retorno_tecnico_tipo_demanda_v1.sql`.
- **20 arquivos de sandbox** (`20260812134101…20260812135640`) classificados como
  `BLOQUEADA_PERMANENTE` — recriam `app_role` com 3 rótulos e `user_roles`.
  Excluídos, listados em `07-manifesto-exclusoes.csv`.
- 18+ Edge Functions em `supabase/functions` — fora do escopo estrutural.
- Ledger da homologação não reproduz o histórico (38+ migrations aplicadas fora
  de banda) e há one-shots que já falharam em reexecução
  (`20260823000000_fase_f4_1_xsd_oficial` → `FISCAL_XSD_REGISTRY_IMMUTABLE`).

**Decisão:** o CultivoFarm recebe um **baseline estrutural** extraído por
`pg_dump --schema-only` da homologação, não o replay das 721 migrations.

## 3. Artefatos gerados neste pacote

| Arquivo | Papel |
|---|---|
| `01-prechecks-readonly.sql` | Prechecks somente leitura no alvo, com guarda fail-closed de ref |
| `02-gerar-baseline-estrutural.sh` | Extrai o dump estrutural + grants + inventário da homologação |
| `04-postchecks.sql` | 11 blocos de pós-check e gates de aceite |
| `05-rollback.md` | Envelope transacional, rollback por onda e reset total |
| `06-runbook-execucao-local.md` | Passo a passo na máquina do operador, incluindo as ações de dashboard |
| `07-manifesto-exclusoes.csv` | O que não vai: sandbox, dados, usuários, storage, harnesses, marcadores |
| `00-inventario-esperado/` | Recebe os `.tsv` de contrato da homologação |

`02-baseline-estrutural.sql` e `03-grants-policies.sql` **ainda não existem** —
são produzidos pelo script do Passo 2, que exige sessão autenticada de homologação.

## 4. Escopo

Promove: schemas, enums/domains, tabelas, sequences, constraints, índices,
funções, triggers, views/matviews com `security_invoker`, RLS, policies, grants
e definição de jobs de cron (desabilitados).

Não promove: dados de negócio, usuários Auth, objetos de Storage, harnesses e
fixtures, marcadores de ambiente, valores de séries fiscais e sequências.
`admin@arbio.com` é criado apenas na etapa posterior.

## 5. Critérios de aceite

1. Paridade de contagem homologação × CultivoFarm em tabelas, policies, funções,
   `SECURITY DEFINER`, triggers, índices, FKs, views/matviews e enums.
2. RLS habilitada em 100% das tabelas `public`; nenhuma tabela com RLS e zero policies.
3. Nenhuma tabela `public` sem `GRANT` coerente com as policies.
4. Nenhuma função `SECURITY DEFINER` sem `search_path` fixo.
5. Todas as views com `security_invoker=true`.
6. Todas as tabelas de negócio com `n_live_tup = 0`.
7. `auth.users` vazio nesta etapa.
8. Jobs de cron criados com `active = false`.
9. Ledger com exatamente a versão do baseline.
10. Security Advisor do CultivoFarm sem ERROR.
11. No repositório: typecheck, build, vitest e gate de binding verdes.

## 6. Bloqueios (promoção NO-GO)

- Sem canal autenticado para `swzpzcwiasxmjutrmvkm` neste ambiente; toda a
  execução é local.
- Sessão de homologação expirada: o dump baseline não pode ser gerado agora.
- Backup/PITR do CultivoFarm ainda não confirmado por escrito.
- Binding do repositório em drift (`.env` no sandbox), a corrigir antes de
  qualquer geração de tipos.

**Status: preparação concluída, promoção NO-GO** até dump gerado, backup
confirmado e prechecks executados com sucesso no alvo.
