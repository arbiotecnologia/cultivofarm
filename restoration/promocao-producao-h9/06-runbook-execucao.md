# Runbook de execução — Promoção H9

Este runbook **não foi executado**. Ele descreve a execução futura, sob
autorização humana explícita e janela aprovada.

## 0. Gates de abertura da janela

| # | Gate | Como comprovar |
|---|---|---|
| 1 | Autorização humana explícita e datada para escrever em produção | registro escrito |
| 2 | Backup/PITR de produção recente | prova escrita com data/hora |
| 3 | Delta confirmado 1:1 contra os dois ledgers reais | `03-prechecks.sql` bloco A nos dois ambientes |
| 4 | Fase P0b concluída: cópias de promoção sem guarda fixa de staging | revisão assinada |
| 5 | Decisão registrada para as 15 destrutivas e para a que toca `auth.*` | dossiê |
| 6 | Todas as integrações externas OFF | `03-prechecks.sql` bloco E |
| 7 | Ferramenta de banco vinculada ao alvo correto | conferência de ref antes de cada comando |

Faltando qualquer gate: **não abrir a janela**.

## 1. Preparação

1. Congelar deploys e alterações de schema em homologação.
2. Exportar o ledger de homologação e o de produção; gerar o diff e conferir
   contra `01-manifesto-migrations.csv`.
3. Confirmar que nenhuma versão `20260812*` (quarentena) está na lista.
4. Verificar que nenhum artefato STAGING_ONLY existe no alvo (`bloco D`).
5. Verificação de não dependência dos artefatos de homologação (reexecutável):
   busca textual por `_f42_harness_fixtures`, `_fiscal_staging_marker`,
   `_motor_b2b_pre_phase1_snapshot`, `estoque_movimentacoes_orfaos_backup`,
   `fiscal_environment_marker`, `hml_fixture_registry` em `src/` e
   `supabase/functions/` — resultado esperado: nenhuma ocorrência.

## 2. Execução por onda

Para cada onda de `02-plano-ondas.md`, na ordem P1 → P2 → P3 → P4 → P5 → P6:

1. Criar o restore point `pre_<onda>_h9`.
2. Rodar `03-prechecks.sql` e arquivar a saída.
3. Para P1: capturar `pg_get_functiondef` e ACLs das funções afetadas.
4. Aplicar as migrations da onda **uma a uma, na ordem do manifesto**, cada uma
   em transação própria, com `lock_timeout='5s'` e `statement_timeout='120s'`.
5. Parar na primeira falha e acionar `05-rollback-por-onda.md`.
6. Rodar `04-postchecks.sql` integral e arquivar a saída.
7. Rodar o smoke por perfil da onda.
8. Comparar advisors de segurança e performance com o baseline; registrar delta.
9. Decidir abort/continue e registrar a decisão antes de abrir a próxima janela.

## 3. Dados

Nenhum dado transacional de homologação é copiado. A carga de dados mestres
segue o classificado em `restoration/promocao-producao/data-manifest.md`
(Classe A), em fase própria, após P5. Séries e sequências fiscais **reiniciam**
em produção; nunca são copiadas. Usuários são recriados por convite/e-mail real;
`auth.users` e hashes nunca são copiados.

## 4. Encerramento

1. Ledger final registrado (total e última versão).
2. Advisors finais registrados; os 2 ERROR `security_definer_view` de produção
   devem estar resolvidos ou ter plano datado.
3. Evidências arquivadas em `restoration/promocao-producao-h9/evidencias/`.
4. Integrações externas continuam OFF até liberação em fase própria.
5. Emissão fiscal em produção permanece bloqueada até o gate fiscal próprio.

## 5. Comunicação de incidente

Ao abortar: registrar onda, migration, erro literal, saída dos postchecks,
rollback aplicado e estado final do ledger. Não tentar "consertar em produção"
sem nova janela e nova autorização.


## Adendo P0c — convergência do ledger, passo a passo

Para cada version da onda, nesta ordem:

1. resolver o ref do alvo por canal externo e, só então, na mesma transação,
   `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`;
2. `SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';`
3. aplicar **o artefato derivado** quando existir, senão o arquivo histórico;
4. rodar os pós-checks; qualquer falha → `ROLLBACK` e a onda para;
5. `INSERT` do par origem → artefato → SHA-256 → status → onda em
   `public.promocao_execucao_registro`;
6. registrar o ledger pelo caminho suportado
   `supabase migration repair --status applied <version>` — nunca escrita direta
   em `supabase_migrations.schema_migrations`.
