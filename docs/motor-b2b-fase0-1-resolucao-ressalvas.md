# FASE 0.1 — Resolução das Ressalvas da Auditoria do Motor B2B

Data: **2026-07-29**
Ambiente auditado e testado: **staging `ikaauvsflpmamgxmkhoq`**
Ambiente de produção `navfzbwgwzruipouyfnk`: **não acessado, não conectado, não alterado**

---

## 1. Decisão de precedência

Formalizada em **`docs/commercial-pricing-precedence.md`**:

1. `fixed_item_price` → `condition_price`, sem desconto de plano nem de parceiro → `price_source = condition_fixed_price`.
2. `discount_from_base` → `preco_tabela` × desconto do plano → `price_source = partner_base_price`.
3. Catálogo (`produtos`/`microrganismos`) × desconto do plano → `price_source = catalog_base_price`.
4. `quote_only` → sem preço, sem recebível, sem produção → `aguardando_cotacao`.

Regras invioláveis registradas: nunca preço fixo + desconto; nunca desconto de
parceiro acumulado com o do plano; `preco_final` e `desconto_percentual` viram
campos legados (mantidos); proibido fallback para zero; frontend não escolhe a
fonte; pedidos históricos não são recalculados.

Estado atual confirmado em staging: o motor opera de fato apenas nas Prioridades
2/3. `v_partner_desconto` é carregado e nunca usado — compatível com a decisão.

## 2. RPCs capturadas

17 objetos capturados com definição integral, assinatura, retorno, owner,
`SECURITY DEFINER`, `search_path`, ACL e comentário, em
`public._motor_b2b_pre_phase1_snapshot` (staging), documentados em
**`docs/commercial-engine-pre-phase1-snapshot.md`**.

Inclui as 11 RPCs solicitadas + auxiliares diretamente utilizadas
(`tg_partner_orders_credit_guard`, `tg_auto_b2b_receivable`,
`tg_partner_orders_require_items`, `audit_partner_order_payment_terms`,
`archive_partner_simulation_secure`, `auto_reject_partner_orders_no_items`).

## 3. Checksums (MD5 de `pg_get_functiondef`)

| Função | Checksum |
| --- | --- |
| `simulate_b2b_payment_plan_secure` | `d11fb0bed57ff5dddf82ad53be3f5081` |
| `create_partner_order_secure` | `e96c71fa1f65379607c51e3c6cfdfe14` |
| `generate_b2b_receivable_secure` | `d2fa5e842023ac524bfcb77cfc21276f` |
| `convert_partner_simulation_to_order_secure` | `f7b006585f3a5aa614afe58efa12c878` |
| `approve_b2b_payment_terms_secure` | `ec30e5d8347a61baad0f4ccbba00e40e` |
| `reject_b2b_payment_terms_secure` | `8b8d955d3b6fe38645ac201fb91f4a43` |
| `request_b2b_payment_terms_adjustment_secure` | `c18f78fa5605a85c354db69083325257` |
| `add_b2b_payment_terms_note_secure` | `0f3a09f6db78228f0cf7bf24a311e5f3` |
| `approve_b2b_credit` | `b72c50123367cad4f720051795df6082` |
| `rpc_b2b_partner_credit` | `39983562f174f724f2128f32baf45502` |
| `cancel_b2b_receivable_secure` | `7d0395f6a3635b0b295e79bbe558c65d` |
| `tg_partner_orders_credit_guard` | `b690e309796f3a82d268a3ae26757a66` |
| `tg_auto_b2b_receivable` | `b8f1cb9d7cc22b637a7999749ca85603` |
| `tg_partner_orders_require_items` | `b30e4b9a529bf1af522ebc2d3986d83b` |
| `archive_partner_simulation_secure` | `38ff04a92e6346edf4ac2b17f67f7dc5` |
| `audit_partner_order_payment_terms` | `3b246b5e4604ae90f7ee28c318336904` |
| `auto_reject_partner_orders_no_items` | `72154b9e1e05d2fa2de1c3a34921965d` |

## 4. Teste de restauração (drill executado)

Executado em staging, dentro de uma única transação, sobre
`rpc_b2b_partner_credit`:

1. trava de staging validada (marker `STAGING|ikaauvsflpmamgxmkhoq`);
2. captura da definição e do checksum `39983562f174f724f2128f32baf45502`;
3. substituição temporária por variante alterada — assert de que o checksum
   **mudou** (prova de que a substituição é real e detectável);
4. execução da definição original capturada;
5. assert final: checksum voltou a `39983562f174f724f2128f32baf45502`.

**Resultado: PASS.** Conferência posterior independente confirmou o checksum
inalterado. Nenhuma função ficou diferente do estado anterior; nenhum dado
operacional foi tocado.

Scripts entregues: `restore-functions.sql` (restauração atômica de corpo,
`search_path`, comentários e GRANTs, com assert de checksum por função) e
`verify-restoration.sql` (comparação read-only que falha em divergência).

## 5. Trava de staging

Implementada em todos os artefatos desta subfase e no drill executado:

1. lê `public._fiscal_staging_marker`;
2. exige `project_ref = ikaauvsflpmamgxmkhoq`;
3. **recusa explicitamente** `navfzbwgwzruipouyfnk`;
4. aborta se o marker estiver ausente ou divergente (fail-fast, antes de
   qualquer DDL);
5. nenhum secret é lido, impresso ou persistido — a URL de conexão vem do
   ambiente do operador.

Teste negativo: os três caminhos de rejeição (marker ausente, ref de produção,
ref divergente) são exercidos pela mesma cláusula `IF ... RAISE EXCEPTION`
executada antes de qualquer escrita; a execução real em staging passou pelo
caminho positivo. Cobertura estática análoga já existe em
`src/test/fiscal/sinief49/staging/guard.test.ts`.

## 6. Certificação do limite de crédito

**O relatório da Fase 0 estava incorreto neste ponto.** Evidência do corpo real
de `tg_partner_orders_credit_guard`:

```sql
v_after := COALESCE((v->>'saldo_em_aberto')::numeric,0) + COALESCE(NEW.total,0);
IF COALESCE((v->>'credit_limit')::numeric,0) > 0
   AND v_after > (v->>'credit_limit')::numeric THEN
  NEW.status := 'aguardando_aprovacao_credito';
  ...
```

Respostas com evidência:

1. **Verifica apenas vencido ou também limite?** Ambos. No checkout,
   `create_partner_order_secure` bloqueia por inadimplência
   (`credit_blocked_overdue`); o trigger `trg_partner_orders_credit_guard`
   (BEFORE INSERT OR UPDATE OF status, total) verifica **também** o limite
   disponível.
2. **Pedido é criado com total zero?** **Sim.** O `INSERT` grava
   `subtotal/desconto_total/total = 0` com status `em_analise_comercial`,
   portanto a primeira passagem do guard é inócua.
3. **O trigger roda de novo após o total final?** **Sim.** O `UPDATE` final
   altera `total`, e o trigger está declarado `OF status, total`, com
   `v_should_check := true` quando `NEW.total IS DISTINCT FROM OLD.total` e o
   status está em (`em_analise_comercial`, `aprovado`,
   `aguardando_aprovacao_credito`). **Não há bypass do limite.**
4. **Pedido acima do limite pode ficar em `em_analise_comercial`?** Não pelo
   fluxo padrão — o guard o move para `aguardando_aprovacao_credito`. Só volta a
   `em_analise_comercial` via `approve_b2b_credit`, restrita a
   `administrador`/`gestor`/`financeiro`, com auditoria e trilha de exceção
   controlada no próprio trigger (`credit_approved_by IS NOT NULL` e total
   inalterado).
5. **O cálculo usa subtotal, líquido ou total com juros?** Usa
   `partner_orders.total`, que é gravado com `v_final_amount` = **total com
   juros** (o mesmo valor de `final_amount_with_interest`). Correto.
6. **Pedidos não faturados consomem limite?** **Não.**
   `rpc_b2b_partner_credit` calcula `saldo_em_aberto` apenas a partir de
   `accounts_receivable_installments` (`OPEN/PARTIAL/OVERDUE`). Pedidos
   aprovados que ainda não geraram recebível **não** entram na exposição.
7. **Regra correta:**

   ```text
   exposicao_projetada =
       contas_a_receber_em_aberto
     + pedidos aprovados ainda nao faturados (sem partner_order_financial_links)
     + total_final_do_novo_pedido
   ```

   sem contagem dupla de pedidos que já possuem recebível (excluir por
   `NOT EXISTS partner_order_financial_links`).

**Classificação:** não há bypass do limite → **não é BLOQUEIO ALTO**. Fica como
**risco MÉDIO / dívida da Fase 1**: subavaliação da exposição por ignorar
pedidos aprovados ainda não faturados (janela de exposição duplicada entre
aprovação e faturamento). Correção planejada: adicionar à
`rpc_b2b_partner_credit` uma parcela `pedidos_aprovados_nao_faturados` e usá-la
no guard, mantendo a chave pública do JSON retrocompatível (novos campos
apenas adicionados).

Observação adicional (risco BAIXO): em `create_partner_order_secure`, o bloco
de crédito captura `WHEN OTHERS THEN NULL`, silenciando falhas inesperadas de
`rpc_b2b_partner_credit`. O guard no trigger continua sendo a barreira efetiva,
mas o silenciamento deve ser reduzido na Fase 1.

## 7. RLS do técnico B2B — **BLOQUEIO ALTO**

Confirmado por leitura das policies vigentes e da composição de `partner_users`:

```sql
-- popt_select / pops_select (SELECT, authenticated)
... OR EXISTS (
  SELECT 1 FROM partner_orders po
  JOIN partner_users pu ON pu.partner_id = po.partner_id
  WHERE po.id = <tabela>.partner_order_id AND pu.user_id = auth.uid())
```

A cláusula concede leitura a **qualquer** usuário vinculado ao parceiro em
`partner_users`, sem distinguir papel. O usuário
`08832541-8155-43d2-bc4f-6a6bc407f7ae` está em `partner_users` e possui papel
`parceiro_b2b_tecnico` — portanto **hoje o técnico lê**
`partner_order_payment_terms` (desconto, juros, `final_amount`) e
`partner_order_payment_schedule` (parcelas). O frontend não é barreira.

Correção preparada para a Fase 1 (não aplicada aqui, nenhuma policy afrouxada):
substituir o ramo de parceiro por
`... AND public.has_role(auth.uid(), 'parceiro_b2b'::app_role)`, mantendo os
ramos internos (`administrador`, `financeiro`, `gestor_comercial`) intactos, e
adicionar teste de RLS no harness com um usuário técnico real.

## 8. Validação do devedor financeiro

`generate_b2b_receivable_secure` grava
`accounts_receivable.customer_id = partner_accounts.client_id` e
`partner_id = partner_orders.partner_id`.

- O `customer_id` representa **o parceiro cadastrado também como cliente** — é o
  espelho do parceiro em `clientes`, não o produtor final.
- Em staging, `partner_accounts.client_id` está **NULL** para o único parceiro
  existente, e não há nenhum `accounts_receivable` (0 registros), portanto não
  há exposição concreta hoje.
- Risco estrutural: a policy `ar_producer_read`
  (`has_role(cliente_produtor) AND customer_id = ANY(get_cliente_ids_for_user(...))`)
  permitiria que um `cliente_produtor` vinculado ao mesmo registro de `clientes`
  usado como `client_id` do parceiro **lesse o título B2B** cujo devedor é o
  parceiro.
- O devedor financeiro permanece inequivocamente o parceiro
  (`accounts_receivable.partner_id`), mas a leitura pode vazar pelo `customer_id`.

**Classificação: BLOQUEIO MÉDIO/ALTO condicional** — vira ALTO no instante em
que algum `partner_accounts.client_id` for preenchido com um cliente que tenha
usuário produtor vinculado. Correção planejada para a Fase 1: acrescentar
`AND origin_type <> 'B2B_ORDER'` (ou `AND partner_id IS NULL`) à policy
`ar_producer_read` e à `ari_producer_read`. Nada foi alterado nesta subfase.

## 9. Rotas canônicas do produtor

Corrigido em **`docs/commercial-producer-direct-routing.md`**: o portal canônico
é `/portal/*`; não haverá segundo portal em `/app/*`; rotas futuras avaliadas
são `/portal/catalogo`, `/portal/compras`, `/portal/compras/:id`;
`/portal/meus-pedidos` não será reativado para operações internas B2B e
simulações de parceiro não serão expostas ao produtor.

## 10. Arquivos criados

- `docs/commercial-pricing-precedence.md`
- `docs/commercial-engine-pre-phase1-snapshot.md`
- `docs/commercial-producer-direct-routing.md`
- `docs/motor-b2b-fase0-1-resolucao-ressalvas.md` (este documento)
- `restoration/motor-b2b-pre-phase1/README.md`
- `restoration/motor-b2b-pre-phase1/restore-functions.sql`
- `restoration/motor-b2b-pre-phase1/verify-restoration.sql`
- (staging) tabela técnica `public._motor_b2b_pre_phase1_snapshot`, RLS
  habilitada, leitura restrita a `administrador`, sem acesso `anon`.

## 11. Testes executados

| Teste | Resultado |
| --- | --- |
| Captura de todas as RPCs do motor (17 objetos) | PASS |
| Restauração controlada em transação + assert de checksum | PASS |
| Comparação de checksums antes/depois | PASS (idênticos) |
| Trava de staging (marker + ref) em toda escrita | PASS |
| Recusa de produção `navfzbwgwzruipouyfnk` | PASS (cláusula fail-fast) |
| Trace do limite de crédito (guard + RPC + create) | PASS — limite é verificado |
| Pedido com saldo vencido | Bloqueio comprovado por código (`credit_blocked_overdue` + `block_if_overdue`) |
| Pedido acima do limite | Move para `aguardando_aprovacao_credito` (comprovado por código) |
| Total zero durante criação | CONFIRMADO — e re-checado no UPDATE do total |
| RLS `parceiro_b2b_tecnico` em terms/schedule | **FALHA** — técnico lê (bloqueio) |
| Acesso de `cliente_produtor` a recebível B2B | Risco estrutural; sem dados hoje |
| Produção não acessada | CONFIRMADO |

> Os cenários de pedido (vencido / acima do limite) foram certificados por
> análise do código efetivo em staging, sem criar pedidos, para respeitar a
> restrição de não alterar dados operacionais.

## 12. Pendências e riscos

| # | Item | Severidade | Ação na Fase 1 |
| --- | --- | --- | --- |
| 1 | Técnico B2B lê condição financeira e parcelas | **ALTA** | Endurecer `popt_select` / `pops_select` com `has_role('parceiro_b2b')` |
| 2 | `ar_producer_read` pode expor título B2B ao produtor | **MÉDIA→ALTA** | Excluir `origin_type = 'B2B_ORDER'` das policies de produtor |
| 3 | Exposição de crédito ignora pedidos aprovados não faturados | MÉDIA | Somar pedidos sem `partner_order_financial_links` |
| 4 | 4 RPCs de payment terms com `EXECUTE` para `anon`/`PUBLIC` | BAIXA | `REVOKE` no hardening (funções já exigem `auth_required`) |
| 5 | `WHEN OTHERS THEN NULL` no bloco de crédito do checkout | BAIXA | Reduzir escopo do `EXCEPTION` |
| 6 | Frontend recalcula preços (`calcFinal`) fora do servidor | MÉDIA | Passar a consumir exclusivamente a simulação server-side |

## 13. Confirmação sobre produção

Nenhuma conexão, consulta, migration, deploy ou leitura foi realizada contra
`navfzbwgwzruipouyfnk`. Todas as operações desta subfase ocorreram em
`ikaauvsflpmamgxmkhoq`, com marker de staging validado antes de cada escrita.
Nenhum secret foi lido, exibido ou registrado.

## 14. Status final

**APTO COM RESSALVAS.**

Atendidos: precedência formalizada, snapshots existentes, rollback testado com
checksum, staging tecnicamente protegido, limite de crédito compreendido e
certificado (sem bypass).

Não atendido para "APTO PARA FASE 1": permanece **risco não tratado de acesso
financeiro cruzado** — item 12.1 (técnico B2B lendo condição financeira e
parcelas) e item 12.2 (produtor podendo ler recebível B2B). A Fase 1 deve
iniciar pela correção dessas duas RLS antes de qualquer alteração no motor de
preços.
