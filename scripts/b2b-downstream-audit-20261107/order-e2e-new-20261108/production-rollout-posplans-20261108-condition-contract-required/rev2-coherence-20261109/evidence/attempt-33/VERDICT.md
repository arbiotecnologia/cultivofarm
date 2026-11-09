# Tentativa 33 — revisão independente da autoridade do vendedor em respond 4926a99c

Correção: **REVIEW_ONLY, não instalada**. Guarda 81: **NÃO APROVADA**. Nada hospedado/publicado/ativado; gates fiscal/logístico/envios OFF.
exit 0 · harness 352/352 · CCR2 143/143 (PG 17.11 descartável). Pacote `seller-respond-fix-20261109/` idêntico ao da tentativa 29 (SHA256SUMS conferido).

## Defeito confirmado
LIVE nega admin dono sem vínculo B2B (`b2b_phase1_scope_denied`, linha 29) nas 3 checagens de `public.b2b_phase1_order_visible`:
(1) antes do advisory, (2) após advisory + FOR UPDATE e ANTES do replay de recibo, (3) após lock de crédito/resolve.
Correção restrita ao writer: cada uma vira `visible OR b2b_owner_internal_partner_readable(<parceiro do pedido>)`.
Sem mudar predicado global, sem criar vínculo externo para admin. Autoridade de preço continua `administrador|gestor_comercial`.

## Provas (espelho)
| Caso | Resultado |
|---|---|
| admin dono, LIVE | negado `b2b_phase1_scope_denied` (defeito) |
| gestor comercial dono | responde; 1 recibo |
| admin dono, replay idêntico | mesmo resultado (idempotente) |
| replay com preço diferente | `quote_idempotency_conflict` |
| financeiro dono | `forbidden_quote_response` |
| superadmin sem papel de preço no tenant | negado (`C2_EXTERNAL_OWNER_DENIED`) |
| admin F (FSF), compradores PN e P | negados |
| admin A com vínculo externo ativo | `b2b_phase1_scope_denied` (não usa caminho do dono) |
| perfil inativado / papel revogado / tenant→F durante lock da cotação | esperou lock, negado, estado e recibos inalterados |
| papel revogado / perfil inativo antes do replay | negado, recibo não devolvido |
| papel revogado durante lock antes do replay | esperou lock, negado |
| tenant trocado durante lock de crédito | negado pelo guard de itens, nada gravado |
| vínculo externo a outro parceiro durante lock de crédito | 3ª revalidação: `payment_condition_stale` (linha 154), nada gravado |

Preservados: origem (snapshot externo/interno), preços de crédito, idempotência por recibo, gates OFF, funções globais de visibilidade (md5 conferidos).

## Limites
- Muitas negativas caem antes na guarda de origem (`c2_external_origin_assert`); a costura do dono só é decisiva nos casos de vínculo externo e da 3ª revalidação.
- O `USUP` do harness também é administrador de A, então responde legitimamente; a negativa usa um superadmin só de plataforma.
- Auth sintética (sem JWT hospedado); costuras e capturas pendentes conforme `attempt-29/VERDICT.md` e `capture-request-20261109b.json`.
