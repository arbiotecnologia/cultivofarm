# Relatório técnico — Melhorias aprovadas do Módulo Protocolos (staging `ikaauvsflpmamgxmkhoq`)

Produção `navfzbwgwzruipouyfnk` não foi acessada. Nada publicado. Nenhum dado histórico alterado.

## Fase 1 — React Query no cadastro de Culturas
- Novo `src/hooks/useCulturas.ts`: `useCulturas`, `useSaveCultura`, `useToggleCulturaAtivo`, `mapCulturaError`.
- `CulturasTab` (`src/pages/Protocolos.tsx`) migrada de `useState/useEffect` + `fetch` manual para React Query, com **quatro estados distintos**: carregando, vazio, erro (com "Tentar novamente") e sucesso. Invalidação também de `culturas-options`.
- Auditoria: 4 testes de estado PASS.

## Fase 2 — Rótulo "Objetivo agronômico"
- `CropsManager.tsx`: rótulo alterado de "Objetivo de uso" para "Objetivo agronômico".
- Coluna `objetivo_uso` **inalterada**; nenhuma quebra de contrato/schema. Teste garante coexistência rótulo novo + coluna antiga.

## Fase 3 — Duplicidade case-insensitive
- Precheck em staging: 1 cultura, 0 duplicatas case-insensitive, 0 nomes vazios → seguro.
- `CREATE UNIQUE INDEX culturas_nome_ci_uidx ON public.culturas (lower(btrim(nome)))`.
- Mensagem amigável no front (`mapCulturaError`).
- Rollback: `DROP INDEX public.culturas_nome_ci_uidx;`

## Fase 4 — Exclusão física bloqueada / desativação
- Colunas `ativo`, `desativada_em`, `desativada_por` em `public.culturas`.
- `fn_cultura_em_uso(uuid)` cobre 8 dependentes: `talhoes`, `talhao_safras`, `visitas_campo`, `registros_consultor`, `ordens_servico_onfarm`, `product_crop_recommendations`, `microorganism_crop_recommendations`, `objetivos_visita_sugestoes`. EXECUTE revogado de `public`.
- Trigger `trg_culturas_block_delete_in_use` (BEFORE DELETE) impede exclusão de cultura em uso, orientando desativação.
- Trigger `trg_culturas_stamp_desativacao` carimba/limpa auditoria de desativação (`auth.uid()`).
- UI: botões Desativar/Reativar e coluna Situação; `useCulturasOptions` passa a listar apenas culturas ativas.
- Rollback: `DROP TRIGGER`s, `DROP FUNCTION`s, `ALTER TABLE ... DROP COLUMN ativo, desativada_em, desativada_por;`

## Fase 5 — Testes
- Unitários (Vitest): `src/test/protocolos/culturas.hardening.test.ts` (7) e `useCulturas.states.test.tsx` (4) — 11 PASS.
- RLS/integridade (SQL transacional com ROLLBACK): `supabase/tests/protocolos/culturas-rls-harness.sql` executado em staging — **T1..T9 PASS**, incluindo bloqueio de duplicidade, bloqueio de exclusão em uso, auditoria de desativação/reativação e negativa de escrita para `cliente_produtor`.
- E2E: `e2e/protocolos-culturas.spec.ts` cobre cultura, objetivos de visita, recomendações por cultura, catálogo, e acesso a Condições e Preços (skip sem credenciais E2E).

## Fase 6 — Decisão módulo vs. entidade
- `docs/protocolos-decisao-modulo-vs-entidade.md`. Entidade "Protocolo" **não implementada**; aguarda nova aprovação.

## Validações
- Typecheck: PASS. Build: PASS.
- Vitest completo: 2670 PASS / 1 falha intermitente por timeout em `portalAcompanhamentoProdutor.test.tsx` (passa isoladamente: 10/10), sem relação com este escopo.
