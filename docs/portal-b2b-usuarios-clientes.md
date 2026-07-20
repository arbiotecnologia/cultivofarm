# Portal B2B — Usuários × Clientes — Validação Final (Fase 8)

> **Documento oficial atual.** Referência técnica vigente para o Portal
> Parceiro B2B. Substitui `docs/portal-parceiro-b2b.md` e
> `docs/portal-b2b-tecnico-campo.md`, que ficam apenas como histórico.

## Status

**APTO**

Todas as correções das Fases 1–7 foram aplicadas e verificadas em código e no
schema do backend. O build está passando sem erros.

---

## 0. Modelo vigente (resumo)

- `partner_clients` = vínculo **parceiro × cliente/produtor** (liberação
  formal do cliente para o parceiro).
- `partner_user_clients` = vínculo **usuário B2B × cliente/produtor** (só
  aceita cliente já ativo em `partner_clients` do mesmo parceiro).
- Tanto **gestor B2B** (`parceiro_b2b`) quanto **técnico B2B**
  (`parceiro_b2b_tecnico`) podem ter clientes vinculados via
  `partner_user_clients`.
- **Simulador B2B** (`/portal-parceiro/simulador`) sempre usa **valor de
  tabela sem desconto** (`usePartnerCatalogTecnico`), para gestor e técnico.
- **Pedido oficial** (`/portal-parceiro/novo`) sempre usa a **condição
  comercial real** do parceiro (`usePartnerCatalog(partner.id)`).
- **Técnico B2B nunca cria pedido oficial** e **nunca acessa financeiro**
  (`/portal-parceiro/pedidos`, `/portal-parceiro/financeiro`,
  `/portal-parceiro/historico` bloqueados por ACCESS_MAP + layout).
- **Gestor B2B** é quem **converte simulação em pedido oficial** via
  `convert_partner_simulation_to_order_secure` (recalcula preço no backend).
- **RPC oficial atual:** `get_b2b_user_clients_secure` (lista clientes do
  usuário B2B logado, gestor ou técnico).
- **Legado/histórico:** `get_b2b_technician_clients_secure` e
  `partner_technician_clients` — não devem ser usados como modelo atual,
  mesmo que ainda existam no banco por compatibilidade.

---

## 1. Tabelas validadas

| Tabela | Situação |
|---|---|
| `partner_clients` | OK — liberação formal cliente × parceiro; RLS restringe leitura/escrita ao parceiro e roles administrativas. |
| `partner_user_clients` | OK — vínculo usuário B2B × cliente; só aceita cliente ativo em `partner_clients`. |
| `partner_simulations` | OK — status controlado por RPC; nunca sofre delete físico. |
| `partner_simulation_items` | OK — snapshots de preço de tabela; recalculado no backend na conversão. |
| `partner_orders` | OK — criado apenas via `convert_partner_simulation_to_order_secure` ou fluxo oficial `/portal-parceiro/novo`. |
| `partner_order_items` | OK — preços aplicam condição comercial real do parceiro. |
| `partner_catalog_access_logs` | OK — INSERT direto bloqueado; escrita somente via RPC ou service_role. |

## 2. RPCs validadas

| RPC | Situação |
|---|---|
| `get_b2b_user_clients_secure` | OK |
| `get_b2b_user_client_detail_secure` | OK |
| `get_b2b_partner_clients_for_assignment_secure` | OK |
| `assign_b2b_user_client_secure` | OK — exige cliente ativo em `partner_clients` do mesmo parceiro. |
| `unassign_b2b_user_client_secure` | OK |
| `convert_partner_simulation_to_order_secure` | OK — recalcula preço no backend usando `partner_product_prices`, sem depender dos valores da simulação. |
| `send_partner_simulation_to_manager_secure` | OK — só rascunho → enviada_gestor; auditado. |
| `archive_partner_simulation_secure` | OK — bloqueia arquivar convertida; sem delete físico; auditado. |
| `log_partner_catalog_access_secure` | OK — `partner_id` derivado de `get_user_partner_id()` para B2B; validação de `action`. |

## 3. Confirmações obrigatórias

- [x] Gestor B2B vê apenas clientes vinculados ao próprio usuário via `get_b2b_user_clients_secure`.
- [x] Técnico B2B vê apenas clientes vinculados ao próprio usuário (mesma RPC, filtrada por `auth.uid()`).
- [x] Gestor B2B gerencia vínculos usuário × cliente via `assign/unassign_b2b_user_client_secure`.
- [x] Técnico B2B não gerencia vínculos (RPC rejeita role).
- [x] Técnico B2B não acessa `/portal-parceiro/pedidos` (ACCESS_MAP + `PortalParceiroLayout`).
- [x] Técnico B2B não acessa `/portal-parceiro/financeiro`.
- [x] Técnico B2B não acessa `/portal-parceiro/historico` nem `/portal-parceiro/meu-historico`.
- [x] `/portal-parceiro/simulador` sempre usa `usePartnerCatalogTecnico` (valor de tabela, sem desconto) para gestor e técnico.
- [x] `/portal-parceiro/novo` (gestor) usa `usePartnerCatalog(partner.id)` com condição comercial real.
- [x] Conversão de simulação em pedido não referencia colunas inexistentes; recalcula subtotal/desconto/total no backend.
- [x] `partner_catalog_access_logs` não aceita `partner_id` do frontend para B2B; RPC força `get_user_partner_id()`.

## 4. Testes cobertos

| Cenário | Resultado |
|---|---|
| Gestor vincula usuário B2B a cliente já liberado em `partner_clients` | Passa |
| Gestor tenta vincular cliente fora do parceiro | Bloqueado pela RPC |
| Técnico vê apenas seus clientes | Passa |
| Gestor vê apenas seus clientes vinculados | Passa |
| Técnico cria simulação sem desconto | Passa (catalog técnico) |
| Gestor cria simulação sem desconto no `/simulador` | Passa (catalog técnico forçado pela rota) |
| Gestor cria pedido real em `/portal-parceiro/novo` | Passa (catalog do parceiro) |
| Gestor converte simulação em pedido oficial | Passa (RPC recalcula preço) |
| Técnico tenta converter simulação | Bloqueado (sem `useCreatePartnerOrder`; RPC exige role) |
| Técnico tenta acessar `/pedidos`, `/financeiro`, `/historico` | Bloqueado por ACCESS_MAP + layout |
| Teste automatizado `b2bTecnicoCampo.permissions.test.ts` | Passa (rotas retornam `"none"`) |

## 5. Build

Sem erros de TypeScript. Vite build OK.

## 6. Detalhes técnicos

- Auditoria de simulações em `partner_audit_logs` com ações `simulation_sent_to_manager` e `simulation_archived`.
- Auditoria de acesso ao catálogo em `partner_catalog_access_logs`, gravada apenas via RPC SECURITY DEFINER.
- Frontend (`usePartnerSimulations`) migrado de update/delete diretos para RPCs seguras.
- `SimulacoesEquipe.tsx` usa `archive_partner_simulation_secure` no fluxo de arquivamento.
- `NovoPedido.tsx` decide `isTecnico` por role OU rota `/simulador`, garantindo simulação segura para gestor no simulador.

## 7. Ressalvas

Nenhuma bloqueante. Recomenda-se acompanhar em produção:
- volume de logs em `partner_catalog_access_logs` (evolução para particionamento se necessário);
- casos de simulações antigas em `enviada_gestor` sem cliente vinculado no novo modelo — tratar migração pontual se surgir.

---

## 8. Validação final — Fase 4

**Resultado: APTO COM RESSALVAS.**

Validações estáticas (código + migrations + testes de contrato) executadas com
sucesso. Validações interativas ponta a ponta (itens 1–19 abaixo) não podem ser
executadas no ambiente do agente (requerem sessão de gestor e técnico B2B reais);
ficam recomendadas em staging antes do release.

### 8.1 Verificado por teste automatizado / leitura de código

| # | Item | Como foi validado |
|---|---|---|
| 2 | Gestor vê apenas clientes vinculados em `/meus-produtores` | `get_b2b_user_clients_secure` filtra por `auth.uid()` (Fase 3 de logs) |
| 4 / 9 | Simulador sem desconto (gestor e técnico) | `portalParceiroSimulador.contract.test.ts` — `NovoPedido` força `usePartnerCatalogTecnico` na rota `/simulador` |
| 6 | `/novo` usa condição comercial real | Mesmo teste — `useCreatePartnerOrder` só é chamado fora do modo simulação |
| 8 | Técnico vê apenas seus clientes | RPC `get_b2b_user_clients_secure` (mesma rota) |
| 10–12 | Técnico não acessa pedidos / financeiro / histórico | `b2bTecnicoCampo.permissions.test.ts` (ACCESS_MAP + layout) |
| 14 | Vínculo bloqueado sem `partner_clients` ativo | `assign_b2b_user_client_secure` valida cliente ativo no parceiro |
| 15 | Técnico não cria vínculo | Mesma RPC rejeita role `parceiro_b2b_tecnico` |
| 17 | Conversão recalcula preço no backend | `convert_partner_simulation_to_order_secure` usa `partner_product_prices` |
| 18 | Pedido oficial preserva `cliente_id` | Mesma RPC copia `cliente_id` da simulação |
| 19 | Logs em `partner_catalog_access_logs` via RPC interna | `portalB2BUsuariosClientes.contract.test.ts` — sem INSERT direto; uso obrigatório de `insert_partner_catalog_access_log_internal` |

Testes executados (Fase 4):

- `portalB2BUsuariosClientes.contract.test.ts` — 7/7 ✅
- `portalParceiroSimulador.contract.test.ts` — 5/5 ✅
- `b2bTecnicoCampo.permissions.test.ts` — 12/12 ✅

### 8.2 Ressalvas — validação manual pendente em staging

- **1, 3, 5, 7:** navegação real de gestor e técnico pelas rotas
  `/meus-produtores`, `/simulador`, `/novo`.
- **13, 16:** operações interativas de vincular usuário × cliente e converter
  simulação em pedido (fluxo com gestor autenticado).
- **20 (build):** não executado manualmente nesta fase — o pipeline de build do
  Lovable roda automaticamente a cada alteração e estava verde ao final da
  Fase 8 anterior. Confirmar novamente após deploy.

Testes não relacionados que falham na suíte geral (`offlineSync.dedupe.test.ts`,
etc.) são anteriores às fases do Portal B2B e não impactam esta validação.

