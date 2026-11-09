# 81 rev2 — coerência do snapshot de condição (REVIEW_ONLY_INACTIVE_NOT_APPROVED)

Substitui o rev1 `32cfcc905`, reprovado na revisão independente. Nada foi aplicado no banco hospedado nem publicado.

## Regra efetiva
- **Alcance:** só parceiros que a ativação B3 já instalada marca como `required` (piloto ou `enforced`). Usa `platform_private.b2b_condition_mode` sem alteração. Hoje isso significa somente ARBio com piloto v2 `[5c4f35f8…, 7e52de9a…]`. Tenants sem ativação, como a FSF, mantêm o contrato atual. Ter plano aprovado, por si só, não bloqueia nada.
- **INSERT:** continua com a guarda B3 instalada (`b2b_payment_condition_required`), que não é tocada.
- **UPDATE de parceiro ou plano** (lacuna da B3, que só cobria INSERT), verificado no commit sobre a linha final:
  - se o pedido tem snapshot, o snapshot precisa casar com empresa vendedora atual, parceiro, plano, versão e meio (colunas, escolha e JSON da condição), e a versão precisa existir. Snapshot antigo nunca legitima troca, porque os snapshots são imutáveis e têm um por pedido;
  - se não tem snapshot e o parceiro é `required`, a troca é negada (`B2B_PAYMENT_CONDITION_REQUIRED`).
- **INSERT de snapshot inicial:** precisa casar com o pedido, apontar para os termos **do próprio pedido** e ser gravado na mesma transação do pedido (`created_at = now()` dos dois, o que funciona também em subtransação). Isso bloqueia backfill e enxerto copiado de outro pedido.
- **INSERT do snapshot de resposta de cotação:** precisa ter a mesma empresa, parceiro, plano, versão e meio da escolha inicial.
- **Histórico:** pedidos legados sem snapshot (como o PB-001038) ficam intactos. Atualizações comuns continuam permitidas, e só a troca de parceiro ou plano é negada. Nenhum backfill.
- **Segurança das funções:** 3 funções DEFINER com `search_path=''` e owner postgres. EXECUTE foi revogado de PUBLIC, anon, authenticated e service_role. Não há GRANT, e nenhum writer, ativação, atribuição ou dado é alterado.
- **Não coberto:** coerência de valores (total/parcelas) entre snapshot e termos além do vínculo `payment_terms_id`, porque isso é do writer B3. JWT/RLS/PostgREST hospedados não são provados.

## Arquivos e pins
- `80` PRE (somente leitura): versão, relações, rev1 ausente, rev2 ausente, MD5/owner/ACL/search_path de `b2b_condition_mode` (`7830c32a…`) e `b2b_condition_required_check` (`236b821b…`), definição exata do trigger B3 e colunas. Os pins vêm do B3 do harness e dos metadados `new-b3-metadata.json`; **o auditor deve vê-los iguais em LIVE**, e se divergirem é parar.
- `81` INSTALL: `lock_timeout 5s`, `statement_timeout 60s` e pré-checagem repetida.
- `82` POST (somente leitura): 5 funções (3 novas + 2 B3) com MD5, owner, ACL, search_path e definer exatos, além dos 4 triggers com definição e `tgenabled='O'` exatos.
- `96` ROLLBACK: aborta se os pins divergirem, remove só os objetos rev2 e confere que a guarda B3 continua. Dados e snapshots ficam preservados.
- MD5 das funções (`pins.json`): checker `d5096452e22262d617384df0fdeffd17`, trigger de pedido `7f793a95047846b63cb514e5a8b1af11`, trigger de snapshot `eb9e9179be9addb20ce09681956c6eda`.

## Ensaio PG17 descartável com writers reais
`run_ccr2.py N` copia os pacotes congelados para `/tmp` e injeta uma linha no espelho do harness `b2b-payment-condition-v1-rebase-20261106/test-local-pg.py`, antes do rollback B3 (diff em `harness-patch.diff`). No espelho rodam o create de condição REAL, o create legado REAL, a resposta de cotação REAL, os gatilhos reais de `partner_orders`, publish/assign/retire/activation reais e crédito real. Costuras declaradas do harness: auth.uid por GUC, papéis e entitlements mínimos. Testes negativos de guarda rodam isolados (outros gatilhos de usuário desabilitados, `SET CONSTRAINTS ALL IMMEDIATE` e ROLLBACK) e também na pilha integrada.

| Tentativa | exit | CCR2 | harness total | causa |
|---|---|---|---|---|
| 01 | 1 | 41/52 | — | bug do teste: fixture desabilitou gatilhos e confirmou; POST comparava `true`/`t`; ordem revogação/aposentadoria; crédito fixture |
| 02 | 1 | 51/54 | 282/285 | POST `text || "char"`; FK do teste de cotação com versão inexistente |
| 03 | 0 | 54/54 | 285/285 | PASS com pins medidos |
| 04 | 0 | 55/55 | 286/286 | PASS final com pins congelados em 82/96 |

As falhas 01/02 ficam preservadas e não contam como PASS. PostgreSQL 17.11.
