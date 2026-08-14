# FASE 26C — Renomeação controlada do menu e aliases seguros do Catálogo AR Bio

Frontend-only, reversível. Sem banco, migrations, RLS, RPC, Edge Functions, aprovação técnica, precificação ou pedido B2B.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/config/navigation.ts` | Apenas o `label` do item `id="protocolos"` passa de "Base Técnica" para "Catálogo AR Bio". `searchKeywords` ganha "catalogo tecnico". |
| `src/lib/navigation/useTabParam.ts` | 4º parâmetro opcional `aliases` (retrocompatível). Leitura aceita alias; gravação sempre canônica. |
| `src/pages/Protocolos.tsx` | `TAB_ALIASES` aplicado ao `useTabParam("tab", …)`. |
| `src/test/protocolos/base-tecnica.rename.test.ts` | Expectativa de label atualizada + asserts de `legacyRoutes` e aliases. |
| `.env`, `src/integrations/supabase/types.ts` | Restaurados do baseline aprovado `c75bb87f` por drift de ambiente (types truncado em 2052 linhas). |

Preservados no item de menu: `id`, `route` (`/base-tecnica`), `legacyRoutes` (`/protocolos`), permissões, filhos, `section`/`subSection`, `order`, keywords existentes.

## Aliases criados (leitura da URL)

- `?tab=catalogo` → `catalogo-tecnico`
- `?tab=fichas` → `catalogo-tecnico`
- `?tab=tecnico` → `catalogo-tecnico`
- `?tab=revisao` → `catalogo-tecnico` (não abre `?sub=revisao` automaticamente)

Valores canônicos intactos: `produtos`, `microrganismos`, `catalogo-tecnico`, `culturas`, `problemas`. Valor desconhecido continua caindo no fallback `produtos`.

## Aliases adiados

Abertura automática da sub-aba `?sub=revisao` a partir de `?tab=revisao` — exige coordenação entre dois parâmetros; fica para 26D.

## Rotas preservadas

`/base-tecnica` (canônica, com todos os `?tab=`), `/protocolos` (redirect legado preservando query e hash), `/comercial/catalogo`, portal parceiro, portal produtor, `/app/catalogo`, planejamento e PDFs — nenhum arquivo desses fluxos foi tocado.

## Testes executados

- `connection-binding.static.test.ts`
- `useTabParam`, navegação/sidebar, protocolos/catálogo
- typecheck, suíte completa e build

Resultados registrados na execução da fase.

## Riscos

Baixo. Mudança de texto do menu e conversão de alias na leitura da URL. Único ponto sensível: testes de terceiros que fixassem o texto "Base Técnica" no menu — verificados e ajustados.

## Rollback

Reverter o `label` para "Base Técnica", remover o 4º argumento em `Protocolos.tsx` e o bloco `aliases` de `useTabParam`, e restaurar o teste de contrato. Nenhum estado persistido é afetado.

## Pendências 26D

- Ficha unificada por item com abas lazy.
- Alias `revisao` abrindo a sub-aba correspondente.
