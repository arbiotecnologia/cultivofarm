# Portal B2B — Técnico de Campo (reposicionamento parceiro_b2b_tecnico)

> **ATENÇÃO: DOCUMENTO HISTÓRICO.** Não utilizar como referência técnica atual.
> O modelo vigente está documentado em
> [docs/portal-b2b-usuarios-clientes.md](./portal-b2b-usuarios-clientes.md).
>
> Este arquivo reflete o modelo antigo `partner_technician_clients` /
> `get_b2b_technician_clients_secure` (técnico × cliente). O modelo atual é
> **usuário B2B × cliente** via `partner_user_clients` e
> `get_b2b_user_clients_secure`, com gestor e técnico podendo ter clientes
> vinculados.

**Status:** APTO COM RESSALVAS

## Nova definição
O perfil `parceiro_b2b_tecnico` passa a atuar como **técnico de campo do parceiro**:
consulta produtores vinculados, catálogo técnico B2B (valores de tabela sem desconto)
e cria simulações agronômicas, que o **gestor B2B** converte em pedido oficial.

## Diferenças de perfil
| Ação | Técnico interno | Técnico B2B | Gestor B2B |
|---|---|---|---|
| Criar simulação de custo | — | ✅ (para produtor vinculado) | ✅ |
| Ver desconto do parceiro | — | ❌ | ✅ |
| Converter simulação em pedido | — | ❌ | ✅ |
| Acessar financeiro B2B | — | ❌ | ✅ |
| Atender clientes vinculados | ✅ (`user_clientes`) | ✅ (`partner_technician_clients`) | ✅ (todos do parceiro) |

## Tabelas
- **Nova:** `partner_technician_clients` (`partner_id`, `technician_user_id`, `cliente_id`, `active`, `assigned_by`, `assigned_at`, `notes`).
- **Alterada:** `partner_simulations` — `cliente_id` + snapshots (`cliente_nome_snapshot`, `propriedade_nome_snapshot`, `cliente_cidade_snapshot`, `cliente_uf_snapshot`).
- **Alterada:** `partner_orders` — `cliente_id`.

## RPCs
- `get_b2b_technician_clients_secure(p_partner_id, p_technician_user_id)` — lista produtores permitidos.
- `get_b2b_technician_client_detail_secure(p_cliente_id)` — detalhe do produtor.
- `convert_partner_simulation_to_order_secure` — usa `cliente_id` da simulação, bloqueia técnico, recalcula preços do parceiro.

## Rotas
- **Técnico B2B:** `/dashboard`, `/meus-produtores`, `/meus-produtores/:clienteId`, `/simulador`, `/simulacoes`, `/fichas`.
- **Gestor B2B:** `/dashboard`, `/pedidos`, `/novo`, `/simulacoes-equipe`, `/tecnicos-produtores`, `/financeiro`, `/historico`, `/fichas`.
- `getHomeForRole("parceiro_b2b_tecnico") = /portal-parceiro/dashboard`.

## RLS
- **`partner_technician_clients`** — admin/gestor_comercial livre; gestor B2B gerencia do próprio parceiro; técnico só vê seus vínculos ativos.
- **`partner_simulations`** — técnico só vê/edita as próprias em `rascunho`/`enviada_gestor`; INSERT valida vínculo com o cliente.
- **`clientes`** — `can_user_access_cliente` estendida: técnico B2B via `partner_technician_clients`; gestor B2B via clientes vinculados ao parceiro.

## Fluxos
**Técnico:** produtor vinculado → simulação com valores de tabela → envio ao gestor.
**Gestor:** vincula técnico↔produtor → acompanha simulações da equipe → converte em pedido (preço recalculado com desconto do parceiro) → gerencia financeiro.

## Pendências
- Testes automatizados (Fase 21) — sugeridos, não incluídos nesta entrega.
- Log dedicado de auditoria B2B (Fase 20) — reutilizando `partner_audit_logs` / `partner_order_audit_logs` existentes.
- Vínculo cliente↔parceiro na tela de gestão hoje lista todos os `clientes`; recomenda-se restringir por RLS/parceiro se houver estrutura formal.

## Não quebrou
- Técnico interno (`tecnico_agronomo`, `consultor_tecnico`) mantém `user_clientes` inalterado.
- Gestor B2B mantém pedido/financeiro/histórico.
- Catálogo técnico e simulador continuam funcionando; simulação avulsa (sem produtor) permanece permitida.
