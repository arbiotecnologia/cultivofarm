# Portal Parceiro B2B — Gestor & Técnico

> **ATENÇÃO: DOCUMENTO HISTÓRICO.** Não utilizar como referência técnica atual.
> O modelo vigente está documentado em
> [docs/portal-b2b-usuarios-clientes.md](./portal-b2b-usuarios-clientes.md).
>
> Reflete a fase inicial do portal (modelo técnico × cliente, RPC
> `get_b2b_technician_clients_secure`, gestor redirecionado para fora do
> simulador). O modelo atual é **usuário B2B × cliente** via
> `partner_user_clients`, com gestor e técnico podendo ter clientes vinculados,
> simulador sempre sem desconto, pedido oficial sempre com condição comercial,
> e conversão simulação → pedido apenas pelo gestor.

Documentação do refinamento do Portal Parceiro B2B com separação de perfis.

## 1. Perfis

| Perfil | Role | Escopo |
|---|---|---|
| **Gestor** | `parceiro_b2b`, `administrador`, `gestor_comercial` | Cria pedidos reais, vê financeiro, converte simulações, gerencia equipe |
| **Técnico** | `parceiro_b2b_tecnico` | Consulta catálogo, microrganismos, produtos, fichas técnicas e salva simulações |

## 2. Rotas

### Gestor
- `/portal-parceiro/dashboard`
- `/portal-parceiro/novo` — novo pedido
- `/portal-parceiro/pedidos` — meus pedidos (com destaque `?highlight=<id>`)
- `/portal-parceiro/financeiro`
- `/portal-parceiro/historico`
- `/portal-parceiro/simulacoes-equipe` — simulações da equipe (converter em pedido)
- `/portal-parceiro/fichas-tecnicas`

### Técnico
- `/portal-parceiro/dashboard` (DashboardTecnico)
- `/portal-parceiro/simulador` — cria simulações (valores de tabela sem desconto)
- `/portal-parceiro/meu-historico` — suas simulações
- `/portal-parceiro/fichas-tecnicas` — modo B2B (audience=`b2b`)
- `/portal-parceiro/favoritos`

Gestor é redirecionado de `/simulador` para `/simulacoes-equipe`.
Técnico é redirecionado de `/pedidos`, `/financeiro`, `/simulacoes-equipe` para `/dashboard`.

## 3. Diferença Gestor × Técnico

- Técnico **não vê preço com desconto** — apenas `valor_ha_brl`, `valor_litro_brl`, `valor_dose_brl` da tabela.
- Gestor vê preço do parceiro (`partner_product_prices`), cria `partner_orders` reais e tem acesso ao módulo Financeiro.
- Técnico salva `partner_simulations` (status `rascunho` ou envia como `enviada_gestor`).
- Gestor converte simulação → pedido via RPC.

## 4. RLS aplicada

- `partner_simulations` / `partner_simulation_items` — escopadas por `partner_id` do usuário (via `partner_users`).
- `partner_orders` / `partner_order_items` — escopadas por `partner_id`; técnicos não têm INSERT.
- `partner_product_prices` — leitura restrita ao gestor do parceiro.
- `produtos`, `microrganismos` — leitura pública apenas quando `ativo=true AND b2b_enabled=true`.
- `product_technical_profiles` / `microorganism_technical_profiles` — filtro `status_validacao='aprovado'` na consulta B2B.

## 5. RPCs criadas

- `convert_partner_simulation_to_order_secure(p_simulation_id uuid, p_observacoes text)` → `uuid`
  - Valida gestor + escopo por parceiro
  - Cria `partner_orders` com `cultura`, `area_total_ha`, `origin_simulation_id`
  - Copia itens recalculando preço via `partner_product_prices`
  - Marca simulação como `convertida_pedido`
  - Registra `partner_order_audit_logs` (`converted_from_simulation`)

## 6. Tabelas alteradas

### `partner_simulations`
- `+status` (`rascunho | enviada_gestor | convertida_pedido | arquivada`)
- `+cultura`, `+area_total_ha`, `+objetivo_tecnico`
- `+converted_order_id`, `+converted_by`, `+converted_at`

### `partner_order_items`
- (mantido) `preco_unitario_brl`, `quantidade`, `observacoes`

### `partner_orders`
- `+cultura`, `+area_total_ha`, `+origin_simulation_id`

## 7. Fichas Técnicas B2B seguras

Gerador PDF em modo `audience: "b2b"`:
- **Produto**: exclui `explicacao_tecnica`, `visao_produtor`, `microrganismos`, `formulacoes`; adiciona `Tabela:` e observação técnica.
- **Microrganismo**: exclui `visao_produtor`, `mecanismo_acao`, `explicacao_produtor`, composição microbiológica, `fase_recomendada`.

## 8. Fluxo técnico → gestor

1. Técnico cria simulação em `/simulador`, informa cliente/cultura/área/objetivo, adiciona itens (valores de tabela).
2. Salva como **rascunho** ou envia como **"Enviada ao gestor"**.
3. Gestor abre `/simulacoes-equipe`, filtra por status/técnico/data, revisa detalhes.
4. Clica **"Converter em pedido"** → RPC `convert_partner_simulation_to_order_secure`.
5. Pedido criado com preço do parceiro; redireciona para `/pedidos?highlight=<order_id>`.
6. Pedido exibe ícone `FlaskConical` sinalizando origem em simulação técnica.

## 9. Pendências futuras

- Testes automatizados (Playwright) para os fluxos gestor/técnico.
- Notificação in-app quando o técnico envia simulação ao gestor.
- Exportação PDF das simulações para o cliente final.
- Bulk-convert de múltiplas simulações do mesmo cliente em um único pedido.
- Dashboard analítico: conversão simulação → pedido por técnico.
