# Dívida técnica — Rebuild vazio de migrations aplicadas

## Contexto

Ao tentar reaplicar as 489 migrations do zero em um projeto Supabase vazio,
três incompatibilidades históricas quebram o rebuild determinístico. Elas
não afetam o banco atualmente aplicado (produção e staging já contêm o
estado consolidado), mas **impedem** a reconstrução linear a partir do zero.

**Regra invariável**: não editar migrations já aplicadas. Estas incompatibilidades
são registradas como dívida técnica; a correção é aditiva (migrations
complementares ou seeds prévios), nunca reescrita silenciosa do histórico.

## Achado 1 — Seed de microrganismos requerido em `20260509174314`

- **Migration**: `supabase/migrations/20260509174314_*.sql`
- **Sintoma**: FK/CHECK que assume linhas pré-existentes na tabela
  `microrganismos`. Rebuild vazio falha por ausência de dados de referência.
- **Runbook**: antes de aplicar `20260509174314` em ambiente virgem, executar
  o seed inicial de microrganismos (mesmo conjunto usado em produção quando
  a tabela foi criada). Não incluir seed dentro da própria migration — manter
  histórico intocado.

## Achado 2 — Coluna `microrganismo_id` ausente antes de `20260616000001`

- **Migration afetada**: `supabase/migrations/20260616000001_*.sql`
- **Sintoma**: presume que `public.ordens_servico_onfarm.microrganismo_id`
  já existe, porém a coluna só é adicionada em migration cronologicamente
  posterior no repositório. Ordem canônica quebra rebuild vazio.
- **Runbook**: em rebuild vazio, aplicar uma migration complementar
  intermediária (`20260616000000_precompat_microrganismo_id.sql`) que crie
  a coluna como nullable antes de `20260616000001`. Não reordenar/renumerar
  os arquivos históricos.

## Achado 3 — Patch textual não-determinístico em `20260707213038` (FASE11)

- **Migration**: `supabase/migrations/20260707213038_*.sql`
- **Sintoma**: aplica alterações via substituição textual sobre estado
  esperado; em rebuild vazio, o texto-alvo pode não existir ainda ou já ter
  sido consolidado por migration posterior, produzindo resultado não
  determinístico.
- **Runbook**: substituir por migration complementar idempotente que valide
  o estado antes de aplicar (`DO $$ BEGIN IF EXISTS(...) THEN ... END IF; END $$`).
  A migration original permanece intocada; a nova aditiva é aplicada apenas
  em cenário de rebuild.

## Ação

- **Não** editar migrations aplicadas.
- Criar, quando/se um rebuild vazio for necessário, as três migrations
  complementares acima antes das históricas problemáticas.
- Manter este documento como referência canônica da dívida técnica.

## Não escopo

Este registro é somente documental. Nenhuma migration nova é criada nesta
fase, nenhum estado de banco é alterado, e nenhum arquivo histórico é tocado.
