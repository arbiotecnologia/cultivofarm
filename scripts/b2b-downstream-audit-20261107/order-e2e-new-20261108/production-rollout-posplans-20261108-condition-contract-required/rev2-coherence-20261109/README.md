# 81 rev2 — coerência do snapshot de condição (INSTALAÇÃO RELATADA PELO AUDITOR — NÃO REAPLICAR)

## Estado vigente — relato do auditor em 09/11/2026 18:13 UTC
- Tentativa 33 revisada independentemente: harness 352/352, CCR2 143/143; 101 corpos usados, 98 iguais a LIVE e 3 ausências esperadas das novas funções 81 antes da instalação.
- PRE80 PASS; migration `b2b_condition_coherence_reviewed_20261109` instalada com SUCESSO pelo auditor exclusivamente em `swzpzcwiasxmjutrmvkm`; POST82 PASS. **Não reaplicar 81 nem executar PRE80 como se ainda fosse pré-instalação.**
- Seller91 **NÃO INSTALADO**: PRE90 passou ACL/ref; respond LIVE permanece MD5 `4926a99c3fa3086b34ff25bb4b4038bb`. Aguarda aprovação humana do conector após expiração da aprovação técnica; não executar pelo agente.
- Gates OFF, PB-001038 único e sem recebível, conforme relato. Frontend não publicado. Nenhum SQL hospedado ou operação de produção executado pelo agente nesta atualização.
- Aprovação independente limitada ao pacote e às evidências de componente: Auth sintética, entitlements declarados e tabelas reduzidas não provam JWT/RLS/Storage/E2E real nem autorizam logística/fiscal/cobranças/envios.
- Capturas de `attempt-29/capture-request-20261109b.json` atendidas pelos relatos de 09/11 e reconciliadas na tentativa 36 (11/11 corpo/owner/ACL). Entitlements permanece limitação declarada de schema do espelho, não captura pendente.
- Registro aditivo: `evidence/auditor-state-20261109-1813.md` e `.json`. Vereditos e SQL históricos preservados; suas referências a “não aprovada” descrevem o estado anterior a este relato.

Substitui o rev1 `32cfcc905`, reprovado na revisão independente. As seções de ensaio abaixo são históricas; não autorizam reinstalação ou publicação.

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

## Revisão independente a0e1d250 (09/11/2026 16:12) — reforço antes de liberar o 81
O auditor rodou o PRE80 em LIVE sem erro (pins B3 compatíveis) e NÃO instalou o 81.

- **Falha de teste corrigida:** CCR2-CONC-REV e CCR2-CONC-RET aceitavam PASS mesmo que a revogação ou a aposentadoria falhassem. Agora o veredito exige:
  - `rs[1].returncode==0`;
  - a linha persistida em `b2b_condition_assignment_revocations`/`b2b_condition_retirements` para a versão e o meio exatos;
  - o create concorrente confirmado com snapshot coerente ou sem nada gravado;
  - o writer **de condição** REAL negado em seguida, sem idempotência, além do legado e da ausência de opção.
- **Prova de mutação:** a mesma corrida, com a segunda operação falhando de propósito (versão +999 → `payment_condition_config_stale`), faz o veredito reprovar (`mutation_*` em `hook-results.json`).
- **Imutabilidade e ACL** de snapshots de pedido e de cotação, revogações e aposentadorias: há linhas, UPDATE/DELETE como postgres é negado por `B2B_CONDITION_RECORD_IMMUTABLE`, a contagem é preservada, e nenhuma tabela tem privilégio para anon, authenticated ou service_role.
- **Limite de `same_tx`:** `created_at = now()` no pedido e no snapshot é uma proteção de dados contra backfill e cópia pelos caminhos normais. **Não** prova uma transação inviolável: um papel privilegiado (postgres/owner) pode forjar `created_at`, desligar gatilhos ou usar `session_replication_role`. O que protege contra isso são a imutabilidade, a ACL fechada e a governança de quem tem acesso privilegiado, não esta guarda.

### Pins dos writers usados no ensaio comparados com LIVE (nunca repinados)
| writer | ensaio (pg_get_functiondef) | LIVE informado | resultado |
|---|---|---|---|
| `create_partner_order_condition_secure(...)` | `e86385fe…` | `e86385fe…` | igual |
| `create_partner_order_secure(...)` | `c34e7404…` (B3, pré-POSPLANOS) | `fe82f538…` | **diverge** |

A divergência é a instalação `cc1f6cc` de planos comerciais (POSPLANOS). Os diffs ficam em `writer-live-diff/`, gerados a partir de `commercial-plans-tenant-20261108/02-install.sql.review` contra `capture/functions/`:
- **create legado:** `plan_not_found` passa a valer também quando `NOT commercial_plan_partner_visible(plan, partner)`;
- **resposta de cotação:** o mesmo, sobre o pedido;
- **assign e retire:** acrescentam `commercial_plan_admin_allowed(plan)` (duas ocorrências).

Todas as mudanças são predicados de negação adicionais, sem novos INSERT/UPDATE em `partner_orders` nem em snapshots. Os gatilhos do rev2 não dependem desses corpos. Mesmo assim, **o ensaio não executou os corpos LIVE de create legado, resposta, assign e retire: isso fica NOT_RUN**. Para fechar, falta rodar o rev2 sobre o harness de planos comerciais, que instala esses corpos, ou com uma costura declarada, antes da liberação.

| Tentativa | exit | CCR2 | observação |
|---|---|---|---|
| 05 | 0 | 69/69 | veredito reforçado + mutação; imutabilidade ainda aceitava tabela vazia |
| 06 | 0 | 69/69 | imutabilidade exige linhas e erro explícito |
| 07 | 0 | 69/69 | final congelado (04 preservada) |

### Tentativas 25–29 (corpos LIVE 09/11: 7 + 23)
| Tentativa | exit | CCR2 | harness | causa |
|---|---|---|---|---|
| 25 | 1 | — | — | dependências ausentes (`assert_b2b_partner_scope`, `auth.jwt`, colunas) |
| 26 | 1 | — | — | `b2b_commercial_context` ausente; `entitlements_for_user` sem tabelas SaaS |
| 27 | 1 | — | — | `c2_producer_links` ausente; comparação de `valid_from` |
| 28 | 0 | 129/129 | 338/338 | PRE da correção do vendedor sem ref obrigatório |
| 29 | 0 | 130/130 | 339/339 | 22/23 LIVE exatos + costura entitlements; defeito do vendedor reproduzido; candidato `seller-respond-fix-20261109/` |
| 30 | 1 | 139/142 | — | USUP do harness também é administrador de A (autorizado); 3ª revalidação não alcançada |
| 31–32 | 0 | 142/142 | 351/351 | superadmin sem papel de preço; erro completo registrado |
| 33 | 0 | 143/143 | 352/352 | 3ª revalidação isolada (`payment_condition_stale`); veredito `evidence/attempt-33/VERDICT.md` |
| 34 | 0 | 143/143 | 352/352 | +3 corpos LIVE 09/11 (assert/target_reason/h15); stub de target_reason eliminado |
| 35 | 1 | 143/144 | 352/353 | 11 md5 LIVE iguais; 5 ACLs do espelho divergentes |
| 36 | 0 | 144/144 | 353/353 | ACLs alinhadas no espelho; 11/11 md5/owner/ACL |
