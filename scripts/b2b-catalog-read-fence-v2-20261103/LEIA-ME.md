# Catálogo B2B — pacote v2 (03/11/2026) — candidato NÃO aplicado

## Por que o v1 foi reprovado (reproduzido)
O v1 copiou a guarda antiga com `OR`: se `b2b_actor_scope.org_partner` = parceiro pedido, o primeiro teste passava sem exigir
papel `parceiro_b2b`. A organização FSF tem `partner_account_id` = parceiro AR Bio (e770d10e), então o administrador rh@FSF
lia o catálogo AR Bio. O ensaio com o v1 original reproduz: admin FSF recebe os 4 itens do vendedor.
A mesma falha existe na guarda do corpo vivo `get_partner_catalog_secure(uuid)`; antes da v4 ela ficava escondida porque
os preços negavam por outro caminho.

## v2
- Leitor com ramos exclusivos (ver AGENTS.md); chamado no topo do catálogo, antes de qualquer item.
- Mesmos deltas de preço do v1 (núcleo B2B → núcleo canônico privado; catálogo → helper de preço).
- Instala sobre produção (helpers ausentes, 01a) ou homolog pós-rollback v1 (helpers deny, 01b); outra base aborta.
- Rollback v2 → estado deny idêntico ao 01b.

## Ensaio (PG descartável, 12 helpers REAIS) — PASS em homolog e produção, 39 verificações cada
- Pins da base batem com os do auditor (87418209, b201e49e, ab6404d, 7b7f90d, d3217db, 1391adc, 8c6e3ec).
- Caso real: admin FSF com org_partner = parceiro AR Bio, sem vínculo → 403 forbidden_partner (também contra P1 e vendedor sem itens).
- Negados: outro parceiro, dois vínculos, vínculo revogado, tenant divergente, sem recurso, perfil inativo, senha provisória,
  técnico, comprador+técnico, interno sem pedidos_b2b, interno lendo outra carteira, interno FSF, sem papel, Superadmin,
  parceiro inativo, anônimo.
- Permitidos: teste4 (4 itens, preços 150/40/80, sem preço = sob consulta, famílias, campos sem fiscal); comprador de vendedor
  sem itens → 200 vazio; interno AR Bio da própria carteira.
- Funções públicas de preço seguem negando o comprador; funções internas sem EXECUTE de cliente.

## Pendências
- Pins deny 01b (4e9a16ad / f7ef7f50) são derivados do 04-rollback v1; confirmar por captura read-only da homolog.
- Superadmin agora recebe 403 em vez de lista vazia.
- Se a organização AR Bio tiver `partner_account_id` preenchido, teste4 seria negado (org_partner ≠ 7e52de9a): conferir no JWT real.
- Prova real: auditor aplica só na homolog e repete JWT teste4 (positivo) e rh@FSF (403).
