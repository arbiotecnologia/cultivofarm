# Limites de prova — títulos do Financeiro B2B (17/11/2026)

## Fatos
- HML: `a00_homolog_validation_no_receivable` sempre aborta (42501). **Preservado**; nenhum script desativa gatilho.
- Produção (leitura agregada 17/11): **zero** títulos com `partner_id` — nenhum dado sintético ou real de parceiro disponível.
- Produção não tem writer canônico instalado de título manual (pacote `financial-installments-initial-20261024` segue inativo); título B2B só nasce de NF autorizada — proibido emitir.
- HML: existência de títulos pré-existentes desconhecida → `hml/03-capture-titles.sql.readonly` (C10, só agregados).

## Consequência
| Prova | HML | Ensaio produção |
|---|---|---|
| Papel/capability/exclusividade, transição CAS, revogação/troca de sessão | sim | sim |
| SELECT direto negado (AR, parcelas, links, partner_accounts, pedidos, mensagens) | sim | sim |
| RPC com `p_partner_id` de B/C negado (forbidden, não vazio) | sim | sim |
| Crédito pela cadeia canônica B4 | **não** (topologia legada) | sim (config sintética existente, sem writer) |
| Ver os próprios títulos (positivo) | só se C10 mostrar títulos do parceiro A | **não** |
| Não ver títulos de B/C (isolamento com linhas presentes) | só se C10 mostrar títulos em B e C | **não** |

Se C10 retornar zero títulos para A/B/C, **isolamento de títulos fica NÃO PROVADO** em qualquer ambiente; resultado vazio nunca conta como PASS (a suíte marca `BLOCKED_NO_ROWS`).
Caminho único aceitável para fechar: título originado pelo fluxo canônico (NF de homologação/mocked em HML com gate próprio revisado pelo root, ou writer manual auditado após instalação revisada). Não preparado aqui por exigir documento financeiro/fiscal — decisão do root.

## Liberação pública
Gate `B2B_FINANCE_ROLE_INSTALLED` só pode ir a true com isolamento de títulos PROVADO ou com aceite explícito e escrito do proprietário desse limite.
