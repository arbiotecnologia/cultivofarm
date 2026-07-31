# Homologação B2B Nacional — Execução em Staging

Ambiente: STAGING `ikaa****hoq` (marker oficial `_fiscal_staging_marker` = STAGING).
Produção `navf****fnk`: **não acessada, não publicada, nenhuma migration promovida**.

Documento vivo. Registra o que já foi executado e o que permanece pendente.

---

## 1. Gate de ambiente (§1) — CONCLUÍDO

- `project_ref` confirmado pelo marker oficial antes de qualquer escrita.
- Guarda `DO $guard$` fail-closed embutida na migration: aborta se o marker for
  de produção ou divergente do staging.
- Baseline capturado antes da escrita:

| Objeto | Baseline |
|---|---|
| commercial_payment_plans | 14 (6 sintéticos `FE-*`) |
| commercial_payment_plan_assignments | 0 |
| commercial_price_rules | 0 |
| commercial_condition_item_prices | 0 |
| partner_orders | 2 (ambos sintéticos Fase E) |
| accounts_receivable | 2 (ambos sintéticos, OPEN) |
| accounts_receivable_installments | 2 |
| fiscal_operation_policies | 0 |
| fiscal_invoices | 0 |
| partner_accounts | 5 |
| produtos / microrganismos | 7 / 18 |

## 2. Higienização (§2) — CONCLUÍDO

Tabela de rastreamento criada: `public.hml_fixture_registry`
(`fixture_run_id`, `fixture_version`, `cleanup_group`, `environment='staging'`,
`test_only`, `origem`, `motivo`, `classification`, `dependencias`,
`snapshot_before`, `acao`, `created_by`). RLS ativa, acesso apenas a
administrador e `service_role`.

Inventário gerado **antes** da limpeza (10 registros, `cleanup_group=FASE_E_HARNESS`):

| Tabela | Qtde | Origem | Ação |
|---|---|---|---|
| commercial_payment_plans | 6 | harness Fase E, prefixo `FE-*` | DEACTIVATE |
| partner_orders | 2 | pedidos criados pelo harness (plano `FE-*`) | CANCEL |
| accounts_receivable | 2 | recebíveis do harness (`FaseE`) | CANCEL_VIA_RPC |

Execução conforme as regras obrigatórias:

- recebíveis cancelados **pela RPC canônica** `cancel_b2b_receivable_secure`
  (com identidade técnica de administrador; nunca `UPDATE` direto);
- parcelas canceladas pela própria RPC;
- pedidos transicionados para `cancelado`;
- planos **desativados** (histórico preservado), não excluídos;
- sem `TRUNCATE`, sem exclusão por data, sem desabilitar trigger/RLS/constraint;
- `snapshot_before` de cada registro preservado no inventário;
- idempotente (`ON CONFLICT DO NOTHING` + filtros por estado).

Prova pós-limpeza: `FE-* ativos = 0`, `pedidos FE abertos = 0`,
`recebíveis FaseE abertos = 0`, `parcelas FaseE abertas = 0`.

## 3. Correções de segurança (§3) — CONCLUÍDO (parcial documentado)

- `rpc_cc_simulate_price`: `EXECUTE` revogado de `PUBLIC` e `anon`.
  ACL final: `postgres`, `authenticated`, `service_role`.
- `partner_accounts`, `partner_simulations`, `partner_simulation_items`:
  `REVOKE ALL ... FROM anon` (não havia grant efetivo; reforço explícito).
- `partner_simulation_items_select` **endurecida**: antes qualquer
  `authenticated` lia todos os itens; agora exige administrador,
  gestor comercial, parceiro do mesmo `partner_id` ou técnico dono da simulação.
  Nenhuma policy foi afrouxada.
- Helpers internos (`fn_b2b_credit_exposure`, `fn_cc_resolve_item_price`,
  `generate_b2b_receivable_secure_impl`, `fn_fiscal_requirement_resolve`)
  verificados: sem execução para `PUBLIC`/`anon`/`authenticated`.

Pendente: inventário formal das policies com combinação por `OR` e o
alinhamento contratual completo `forbidden_financial_terms` do técnico B2B
entre frontend e RPC (hoje bloqueado no frontend e na RPC de simulação).

## 4. Concorrência do recebível B2B (§4) — CONCLUÍDO

- `generate_b2b_receivable_secure` passou a aplicar
  `pg_advisory_xact_lock('b2b_receivable', partner_order_id)` antes de
  qualquer verificação, serializando chamadas realmente simultâneas.
- Índice único parcial criado:
  `ux_ar_one_active_per_b2b_order ON accounts_receivable(origin_id)
   WHERE origin_type='B2B_ORDER' AND status <> 'CANCELED'`.
  Cancelados não bloqueiam nova geração.
- `partner_order_financial_links.partner_order_id` (unique) continua sendo o
  vínculo canônico reutilizado.
- **Regra documentada**: o faturamento B2B gera **um único recebível
  consolidado por pedido**, com as parcelas em
  `accounts_receivable_installments`. Faturamento parcial não gera recebível
  adicional. Caso a regra mude para recebível por fatia faturada, a unicidade
  precisará incluir `billing_slice_id`/`invoice_id` — hoje isso **não** existe
  no schema e portanto o índice atual é correto e não impede nada legítimo.

Pendente: prova runtime de concorrência real (duas requisições simultâneas)
via harness com JWTs reais.

## 5. UX (§17) — parcialmente concluído

`PaymentPlanSelector` passou a ter estado de carregamento (skeleton) e estado
vazio explícito: *"Nenhuma condição comercial está disponível para sua empresa.
Entre em contato com o setor comercial."*

## 6. Massa sintética e parametrização (§5–§11) — executado

Executado no staging `ikaa****hoq` com guarda fail-closed dentro do próprio
script (aborta se `_fiscal_staging_marker` ≠ staging autorizado).

Criado nesta rodada (tudo inventariado em `hml_fixture_registry`,
`cleanup_group = 'HML-B2B'`, 27 registros):

| Plano | Código | Modo de precificação | Característica |
|---|---|---|---|
| A | `HML-B2B-A` | `discount_from_base` | À vista 7d, desconto 5% |
| B | `HML-B2B-B` | `fixed_item_price` | Prazo curto 30d, preço fixo por item |
| C | `HML-B2B-C` | `discount_from_base` | 120d / 4x, juros 1,5% a.m. composto, exige crédito, aprovação financeira e garantia |
| D | `HML-B2B-D` | `quote_only` | Sob consulta (checkout deve recusar) |

- 4 atribuições `commercial_payment_plan_assignments` **publicadas** para o
  parceiro sintético (escopo `partner`), tornando os planos efetivamente
  selecionáveis (antes: 0 atribuições → checkout impossível).
- 9 linhas de matriz `commercial_condition_item_prices` **publicadas**
  (2 produtos + 1 microrganismo × 3 planos precificáveis), com
  `min_quantity = 1` e espelhamento 1:1 em `commercial_price_rules`
  (`published_rule_id` preenchido). O plano D não recebe matriz, por ser
  `quote_only`.
- Política fiscal nacional criada em `fiscal_operation_policies`:
  `b2b_partner` / `venda_mercadoria` / UF nula (nacional) /
  `requires_invoice = true` / modelo `55`, com base legal declarada.
  Isso remove o estado `PENDING_PARAMETRIZATION` do resolvedor fail-closed
  usado por `generate_b2b_receivable_secure_impl`.

Verificação pós-seed (contagens reais): `plans=4`, `asg_pub=4`, `ip_pub=9`,
`rules=9`, `pol_nfe=1`, `reg=27`.

Evidência colateral de hardening: `fn_fiscal_requirement_resolve` recusa
execução por role sem privilégio (`42501 permission denied`), confirmando que
o revoke aplicado no bloco de segurança está ativo.

## Pendências (blocos ainda não executados)

§12–§13 (provedor fiscal / adapter `mock_homologation` com status
`SIMULATED`, cenários fiscais), §14 (quatro compras ponta a ponta),
§15 (concorrência runtime com sessões reais), §16 (RLS com JWTs reais dos
8 perfis), §18 (cleanup pós-homologação a partir do inventário).

Esses blocos dependem de usuários Auth sintéticos e de um harness Edge
dedicado (`hml-b2b-runtime-harness`), ainda não criado.


## Status atual

**BLOQUEADO PARA PRODUÇÃO** · **APTO PARA CONTINUIDADE DA HOMOLOGAÇÃO INTERNA**

Não pode ser classificado como apto para produção enquanto: o contador não
validar as classificações fiscais; não houver provedor fiscal homologado,
certificado e credenciamento; os testes de autorização fiscal real não
passarem; e as fixtures de homologação permanecerem selecionáveis.

## Rollback

- Higienização: `snapshot_before` completo em `hml_fixture_registry` permite
  reativar planos e reverter status.
- Segurança/concorrência: reverter é `DROP INDEX ux_ar_one_active_per_b2b_order`,
  restaurar a policy anterior de `partner_simulation_items_select` e recriar
  `generate_b2b_receivable_secure` sem o advisory lock (forward-only recomendado).

## Confirmação

Produção `navf****fnk` permanece **intocada**. Nenhuma credencial, certificado
ou documento fiscal de produção foi utilizado. Nenhum secret foi exposto.
