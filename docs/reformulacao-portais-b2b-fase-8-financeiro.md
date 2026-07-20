# Fase 8 — Centralização do Financeiro do Parceiro B2B

## 1. Estrutura final do Financeiro
- Rota principal única: `/portal-parceiro/financeiro` (`src/pages/portal-parceiro/Financeiro.tsx`).
- Página organizada com `Tabs` (shadcn), sincronizando aba ativa com query param `?tab=...`.

## 2. Abas criadas
| Aba | Query | Conteúdo |
|---|---|---|
| Resumo | `?tab=resumo` (default) | `MinhaSituacaoFinanceira` (KPIs de aberto/vencido/próximos vencimentos/saldo). |
| Títulos | `?tab=titulos` | Tabela completa `usePortalPartnerFinancial` + botão "Exportar CSV". Dialog "Parcelas" preservado. |
| Histórico Financeiro | `?tab=historico` | Mesma tabela filtrada por `financial_status === "recebido"` (títulos quitados). |

Nenhum item de menu separado — "Histórico Financeiro" existe apenas como aba interna.

## 3. Rotas antigas redirecionadas (`src/App.tsx`)
- `/portal-parceiro/historico-financeiro` → `Navigate` para `/portal-parceiro/financeiro?tab=historico`.
- `/portal-parceiro/meu-historico-financeiro` → idem.
- `/portal-parceiro/meu-historico` (histórico **comercial**, não financeiro) permanece como rota separada — não é o alvo desta fase.

## 4. Técnico não acessa Financeiro
`PortalParceiroLayout.tsx` mantém guard `isTecnico && startsWith("/portal-parceiro/financeiro")` → `Navigate` para `/dashboard` (Fase 2/7). Item "Financeiro" ausente do `menuTecnico`.

## 5. Produtor não acessa Financeiro B2B
`ACCESS_MAP` (`src/lib/permissions.ts`) bloqueia `cliente_produtor` em `/portal-parceiro/*`. Hook `usePortalPartnerFinancial` valida `partner_users`; produtor não possui vínculo. RLS de `partner_orders` / `partner_order_financial_links` também restringe por `partner_id`.

## 6. Resultado do build
TypeScript sem erros. Alterações isoladas em `Financeiro.tsx` (tabs) e `App.tsx` (2 redirects).

## 7. Status
**APTO** — financeiro centralizado numa única rota com 3 abas, "Histórico Financeiro" dentro de Financeiro, técnico e produtor sem acesso, build sem erros.
