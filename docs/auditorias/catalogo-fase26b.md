# FASE 26B — Implementação inicial da navegação unificada Catálogo AR Bio

Frontend-only, sem banco, migrations, RLS, RPC, aprovação técnica, precificação ou pedido B2B.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/catalogo/CatalogoKpis.tsx` | **Novo.** Componente + `computeCatalogoKpis` com os mesmos 7 KPIs e cálculos que já existiam. |
| `src/pages/comercial/CatalogoComercial.tsx` | Passa a usar `CatalogoKpis`; removidos `useMemo` de KPIs e o `Kpi` local. |
| `src/components/protocolos/CatalogoTecnicoTab.tsx` | Idem, mantendo sub-abas `catalogo`/`revisao` e `scope="admin"`. |
| `src/config/navigation.ts` | Apenas comentário de plano + keywords "catálogo ar bio". Nenhuma rota, path, permissão ou filho alterado. |
| `.env`, `src/integrations/supabase/types.ts` | Restaurados do baseline aprovado `c75bb87f` por drift do ambiente (types truncado em 2052 linhas) que quebrava o build. |

## Duplicações removidas

Bloco idêntico de ~40 linhas (7 KPIs + componente `Kpi`) que existia em duas telas passou a ter fonte única. Cálculos, rótulos, tons e ordem preservados byte-a-byte na semântica.

## Label de menu

Mantido "Base Técnica". Motivo: `src/test/protocolos/base-tecnica.rename.test.ts` fixa esse rótulo por contrato. A renomeação para "Catálogo AR Bio" fica para a Fase 26C, junto da atualização do teste. Termo já é pesquisável no menu.

## Aliases de aba

**Adiados.** `useTabParam` é compartilhado por várias telas e não suporta alias; além disso `revisao` hoje é sub-aba (`?sub=revisao`) dentro de `catalogo-tecnico`, então o mapeamento não é 1:1. Implementar em 26C com parâmetro opcional `aliases` retrocompatível.

## Rotas preservadas

`/base-tecnica` e todos os `?tab=` atuais (`produtos`, `microrganismos`, `catalogo-tecnico`, `culturas`, `problemas`), `/protocolos` (redirect), `/comercial/catalogo`, portal parceiro, portal produtor, `/app/catalogo`, planejamento e PDFs — nenhum arquivo desses fluxos foi tocado.

## Validação

- `connection-binding.static.test.ts`: 8/8 PASS.
- Typecheck, build e suíte completa: ver resultados na execução da fase.

## Pendências 26C/26D

- Renomear rótulo para "Catálogo AR Bio" + atualizar teste de contrato.
- Aliases de aba via `useTabParam` retrocompatível.
- Ficha unificada por item com abas lazy.
