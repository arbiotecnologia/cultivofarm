# FASE 28A — Auditoria pós-certificação do Catálogo e mapa da próxima frente segura

Escopo desta fase: auditoria somente-leitura, testes de contrato, documentação e
diagnóstico. Nenhuma alteração de banco, migration, RLS, RPC, Edge Function,
precificação, carrinho, portais ou frontend funcional.

## 1. Status da auditoria da Fase 27E — **27E CERTIFICADA**

| Item auditado | Resultado |
| --- | --- |
| `docs/auditorias/catalogo-fase27e-certificacao-final.md` existe e conclui a frente como apta | OK (status final "FINALIZADA E APTA") |
| `src/test/catalogo/catalogo-fase27e-certificacao-final.test.ts` existe e passa | OK (17 PASS) |
| Rota canônica `/base-tecnica` | OK (`src/App.tsx:482`) |
| Rota legada `/protocolos` → `PreservedNavigate` | OK (`src/App.tsx:483`) |
| `usePartnerCatalog` → `get_partner_catalog_secure` | OK (`usePartnerCatalog.ts:67`) |
| `usePartnerCatalogTecnico` → `get_partner_catalog_tecnico_secure` | OK (`usePartnerCatalogTecnico.ts:23`) |
| `useCreatePartnerOrder` → `create_partner_order_secure` + `unidade_medida` | OK (`useCreatePartnerOrder.ts:73,78`) |
| Produto → `hectare`; microrganismo → `dose_100ml` → `dose` | OK (`NovoPedido.tsx:297-303`, `useCreatePartnerOrder.ts`) |
| `AddToCartDialog` preservado em `NovoPedido` | OK (`NovoPedido.tsx:29,751`) |
| Mobile/produtor sem custo interno, auditoria ou `catalog_technical_audit_logs` | OK |
| `CatalogoItemDrawer` restrito ao catálogo interno + testes | OK (nenhum uso em `NovoPedido`, `FichasTecnicas`, `MobileCatalogoTecnico`) |
| Alterações de banco/RLS/RPC nesta fase | Nenhuma (última migration segue `20260905000000_hardening_digest_schema_v1.sql`) |
| Grid e drawer sem acesso a dados (`supabase`/`rpc`/`useQuery`) | OK |

Ressalva operacional: no início desta fase foi novamente detectado **drift de
ambiente** — `.env` e `src/integrations/supabase/types.ts` haviam sido
regenerados para o projeto sandbox (`yzszl...`, types truncado em 2.052 linhas).
Ambos foram restaurados ao baseline `c75bb87f` (staging `ikaauvsflpmamgxmkhoq`,
types com 21.850 linhas) antes de qualquer validação. Nenhuma mudança funcional.

## 2. Validação executada

- `src/test/config/connection-binding.static.test.ts`: PASS (binding staging).
- `src/test/catalogo` + `src/test/navigation` + `src/test/protocolos`: 281 PASS.
- Typecheck (`tsgo --noEmit`): 0 erros.
- Teste novo 28A: PASS.
- Suíte completa e build: ver seção 9.

## 3. Diagnóstico do projeto após o Catálogo

Levantamento de superfície e cobertura por módulo (leitura estática):

| Módulo | Arquivos-chave | Cobertura de testes | Observação |
| --- | --- | --- | --- |
| Fiscal NF-e/NFS-e | `src/lib/fiscal/**`, `src/pages/fiscal/*` | ~93 arquivos | Mais maduro; emissão travada por `fiscalEmissionEnabled: false` |
| Comunicação/notificações | `src/features/comunicacao/**`, `src/components/notificacoes/*` | ~19 | Flags OFF por padrão (safe-by-default) |
| Pedidos B2B | `src/pages/comercial/*`, `useCreatePartnerOrder`, motor de preços | ~9 | Motor coberto; drawers/UI sem teste |
| Financeiro/recebíveis | `src/pages/financeiro/*` (30+ páginas) | ~6 | Superfície grande, cobertura fina |
| BI/dashboards | `src/components/bi/**`, `DashboardUnificado` | ~6 | Apenas smoke/resiliência; `BIPermissionGate` sem teste |
| Produção/lotes/cockpit | `CockpitLaboratorio`, `useEsteiraLaboratorio`, `src/lib/cockpit/stage.ts` | ~4 | `stage.ts` é espelho manual de `fn_cockpit_stage` |
| Entregas/comprovante | `src/components/entregas/*`, rota pública `/validar-entrega/:token` | 1 | Só o PDF é testado |
| Visitas técnicas | `useFluxoVisitaTecnica`, `EncerramentoCard` | 1 | Gate de encerramento sem teste |
| Estoque/volumes | `src/lib/estoque/motorEstoque.ts`, dialogs de reserva | 0 dedicados | Motor transversal sem teste unitário |

## 4. Matriz de priorização das frentes candidatas

| Frente | Valor de negócio | Risco técnico | Dependências | Impacto banco/RLS/RPC | Impacto portais/carrinho | Urgência | Recomendação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A. Estoque/volumes — blindagem do `motorEstoque`** | Alto (evita ruptura, estoque negativo, reserva fantasma) | Baixo se restrito a testes de contrato/unidade sobre lógica pura | Cockpit, entregas, pedidos | **Nenhum** (fase de testes) | Nenhum | Alta | **Avançar agora** |
| B. Entregas/comprovante — cobertura do fluxo e da rota pública | Alto (rastreabilidade, prova de entrega, token público) | Médio (UI complexa, casamento de OS) | Estoque, financeiro | Nenhum se só testes | Nenhum | Alta | Planejar depois (28E) |
| C. Visitas técnicas — gate de encerramento | Médio-alto (produtividade de campo) | Médio (componente grande) | Cockpit, produtor | Nenhum se só testes | Nenhum | Média | Planejar depois |
| D. Financeiro/recebíveis — cobertura de páginas | Alto | Alto (30+ páginas, RLS sensível) | Entregas, fiscal | Provável | Nenhum | Média | Planejar depois |
| E. Cockpit — paridade `stage.ts` × `fn_cockpit_stage` | Médio | Médio (exige leitura do banco) | Produção | Leitura de banco | Nenhum | Média | Planejar depois |
| F. Fiscal — habilitar emissão | Muito alto | **Muito alto** (regulatório, irreversível) | Toda a cadeia | Sim | Sim | Baixa agora | **Bloquear até validação humana/contábil** |
| G. Comunicação — ligar flags de entrega | Médio | Alto (envio real a terceiros) | SMTP/WhatsApp | Sim | Sim | Baixa | **Bloquear até checklist GO de staging** |
| H. BI/dashboards | Médio | Baixo-médio | Todos | Nenhum | Nenhum | Baixa | Planejar depois |

## 5. Frente recomendada — **A. Estoque/volumes (blindagem do motor de estoque)**

**Por que é a melhor próxima ação**
- É o único motor transversal do sistema sem nenhum teste dedicado, e alimenta
  cockpit (reserva), entregas (seleção de lote envasado) e, indiretamente,
  faturamento.
- Falha aqui é silenciosa e cara: reserva incorreta, saldo negativo, lote
  entregue duas vezes.
- Pode ser endereçada com **risco zero de runtime**: a primeira fase é
  auditoria + testes de contrato sobre lógica já existente, sem migration,
  sem RLS, sem RPC, sem tocar carrinho ou portais.
- O histórico recente do projeto (erro de envase, ação canônica de movimentação,
  saldo negativo) mostra que este é o ponto de maior recorrência de incidentes.

**O que auditar antes de implementar**
- `src/lib/estoque/motorEstoque.ts` — funções puras, invariantes e unidades.
- `src/components/estoque/ReservaDialog.tsx`, `ReservarEmbalagemEntregaDialog.tsx`.
- `src/components/cockpit/reservaCalc.ts` e `ReservarEstoqueDialog.tsx`.
- `src/components/entregas/SeletorLoteEnvasado.tsx`.
- Contrato de `rpc_estoque_operar_v1` (somente leitura da assinatura no cliente).
- Migrations já aplicadas de estoque/envase (`20260827000000_envase_acao_canonica.sql`).

**Riscos a evitar**
- Alterar `rpc_estoque_operar_v1` ou qualquer RLS na fase de auditoria.
- Refatorar `motorEstoque.ts` antes de existir teste que congele o comportamento.
- Tocar entregas/carrinho/pedido B2B a pretexto de "ajuste de estoque".
- Introduzir novo fluxo paralelo de movimentação.

**Testes obrigatórios da frente**
- Unitários de `motorEstoque.ts`: saldo, reserva, liberação, conversão de
  unidades, idempotência, rejeição de saldo negativo.
- Contrato estático: nenhum componente de estoque acessa `supabase` fora dos
  hooks canônicos; ação de movimentação usa apenas os verbos canônicos.
- Regressão: `connection-binding.static.test.ts`, suíte de cockpit e entregas.

## 6. Plano de fases futuras (não executado)

- **28B** — auditoria detalhada da frente de estoque (somente leitura).
- **28C** — implementação segura da primeira melhoria (testes + correção pontual).
- **28D** — certificação final da frente de estoque.
- **28E** (posterior) — entregas/comprovante.

## 7. Prompts futuros prontos (NÃO executar nesta fase)

### Prompt — Fase 28B (auditoria detalhada da frente de estoque)

```text
FASE 28B — Auditoria detalhada e somente-leitura do motor de estoque AR Bio

Antes de qualquer coisa, revalidar o binding de staging (ikaauvsflpmamgxmkhoq)
e restaurar .env/types.ts ao baseline se houver drift.

Escopo: auditoria estática, documentação e testes de leitura. Proibido alterar
banco, migrations, RLS, RPCs, Edge Functions, carrinho, pedido B2B, portais,
precificação e qualquer frontend funcional.

Auditar:
- src/lib/estoque/motorEstoque.ts (invariantes, unidades, arredondamento);
- src/components/estoque/* (ReservaDialog, ReservarEmbalagemEntregaDialog,
  MotivoEmbalagemDialog, EmbalagemMovimentacoesTimeline, EstoqueBI);
- src/components/cockpit/reservaCalc.ts e ReservarEstoqueDialog.tsx;
- src/components/entregas/SeletorLoteEnvasado.tsx;
- hooks de estoque e o contrato cliente de rpc_estoque_operar_v1;
- migrations já aplicadas de estoque/envase (somente leitura).

Entregar:
- mapa de funções puras versus efeitos colaterais;
- lista de invariantes que precisam de teste;
- inconsistências de unidade (L, mL, dose, hectare, vasilhame);
- pontos de risco de saldo negativo, dupla reserva e não idempotência;
- docs/auditorias/estoque-fase28b-auditoria.md;
- nenhuma alteração funcional.

Validar: connection-binding.static.test.ts, typecheck, suíte completa, build.
```

### Prompt — Fase 28C (implementação segura da primeira melhoria)

```text
FASE 28C — Blindagem por testes do motor de estoque AR Bio

Só prosseguir se a Fase 28B estiver certificada.

Escopo permitido: criar testes unitários e de contrato para o motor de estoque
e, se e somente se a 28B apontar defeito comprovado, corrigir esse defeito
pontualmente em lógica de frontend/pura. Proibido: nova tabela, migration, RLS,
RPC, Edge Function, alteração de carrinho, pedido B2B, portais, precificação,
nova biblioteca e fluxo paralelo.

Implementar:
- src/test/estoque/motor-estoque-fase28c.test.ts cobrindo saldo, reserva,
  liberação, conversão de unidades, idempotência e rejeição de saldo negativo;
- teste de contrato estático garantindo verbos canônicos de movimentação e
  ausência de acesso direto a supabase nos componentes de estoque;
- docs/auditorias/estoque-fase28c-blindagem.md com antes/depois e rollback.

Validar: connection-binding.static.test.ts, typecheck, testes de estoque,
cockpit, entregas, suíte completa, build.
```

### Prompt — Fase 28D (certificação final da frente)

```text
FASE 28D — Certificação final da frente de estoque AR Bio

Auditar a 28C aplicada no commit atual e só prosseguir se estiver íntegra.

Escopo: auditoria, teste de certificação e documentação. Nenhuma alteração
funcional, de banco, RLS, RPC, carrinho, pedido B2B ou portais.

Confirmar:
- testes 28C existem e passam;
- invariantes do motor de estoque congelados por teste;
- nenhuma migration nova nesta frente;
- cockpit, entregas e carrinho preservados;
- binding staging íntegro.

Entregar docs/auditorias/estoque-fase28d-certificacao-final.md com status
CERTIFICADA ou NÃO APTA, e recomendação da frente seguinte (entregas/comprovante).

Validar: connection-binding.static.test.ts, typecheck, suíte completa, build.
```

## 8. Rollback

Esta fase adicionou apenas dois arquivos:
- `src/test/catalogo/catalogo-fase28a-pos-certificacao.test.ts`;
- `docs/auditorias/ar-bio-pos-catalogo-fase28a-mapa-proxima-frente.md`.

Rollback = remover esses dois arquivos. `.env` e `types.ts` foram restaurados ao
baseline `c75bb87f`; nenhuma outra alteração de runtime foi introduzida.

## 9. Status final

**FASE 28A APLICADA COM SUCESSO — 27E CERTIFICADA E PRÓXIMA FRENTE RECOMENDADA
(ESTOQUE/VOLUMES — BLINDAGEM DO MOTOR DE ESTOQUE).**

Nenhuma nova frente foi executada nesta fase.
