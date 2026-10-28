# Auditoria planejada pós-implantação e testes do estado atual — 28/10/2026

## Veredito

**NO-GO: fluxo parceiro→entrega não concluído nem homologado.** Esta rodada executou testes locais e SELECT de metadados no Supabase canônico; não executou SQL mutante hosted, grants, migração, publicação/deploy, dados/sessões LIVE, fixtures reais, comunicação ou NF. O gate pós-implantação é obrigatório e não é satisfeito por testes sintéticos.

Referências: plano original `.lovable/plan/plano-de-correção-do-fluxo-de-pedido-b2b-por-etapas-2026-10-27.md`, relatório `etapas5-6-contratos-os-entrega-estoque-20261028.md` e A2 `scripts/delivery-finance-a2-20261028/README.md`.

## Matriz rastreável

`matriz-auditoria-fluxo-b2b-20261028.csv` é gerada por `scripts/rbac-audit/build-order-flow-matrix.py` (sem rede). Cada linha contém ID, cenário, passo, rota, perfil, tenant, precondição, expectativa, contrato, teste, evidência, status, nível de prova e severidade. `matriz-auditoria-fluxo-b2b-20261028-resumo.json` dá contagens reproduzíveis.

- 18 passos ×17 perfis/condições ×3 tenants ×10 eixos: **9.180 combinações reais planejadas**, não executadas. Teste relacionado não significa que a combinação foi exercitada. **PASS real = 0**.
- Cinco grupos PASS offline separados das combinações; quatro FAIL de gate não atendido (A2, grupo entrega, transição envase e equivalência OS manual). FAIL de gate não é exploração JWT comprovada.
- A/B/C são aliases de futuras empresas próprias autorizadas; A próprio, B alheio e C sem vínculo. Nenhum UUID/email fictício vira registro hosted. Multi-vínculo deve expandir para dois parceiros da mesma empresa e vínculo entre empresas explicitamente autorizado/negado no roteiro.
- CQ/logística são **tarefas**, não roles novos. Identificar o papel real autorizado na matriz servidor; `superadmin` não ganha compra/produção por ser plataforma. Papéis cumulativos só têm a união das capacidades comprovadas, nunca finanças internas do fornecedor. Produtor exclusivo sem parceiro permanece próprio.
- Eixos: status/campos; IDOR query/payload/UUID/arquivo; atomicidade/item N/auditoria; locks/revogação; replay/duplo clique/ACK/timeout; offline/reconexão; planos/features/JWT/portal; snapshots/saldos/BI/OFF; UX desktop/mobile/a11y; SQL/Storage/secrets.

## Estado LIVE constatado antes de qualquer fluxo real

Ref confirmado em `supabase/config.toml` e binding externo da ferramenta: `swzpzcwiasxmjutrmvkm`. SELECT de catálogo às01:45–01:48 UTC, sem executar RPC de negócio:

| Dependência | Evidência atual | Status |
|---|---|---|
| A2 generate/mark | `670ea34d37c4c4fd6612031ad763a3a7` / `e4008b029ce8d58f70f3fc88571d03be`, authenticated EXECUTE, corpos anteriores | BLOCKED: A2 proposta não instalada |
| Criar/confirmar/cancelar entrega | Corpos anteriores, EXECUTE postgres/service_role apenas | BLOCKED para cliente |
| Registrar envase | `867c445736fbd2de9416ae4ad6a9d253`, service-only | BLOCKED; transição integral não provada |
| Motor estoque | `c71a9e848eff0a522cbaa3a7ec2949a5`, authenticated | Instalado, mas não composição recuperação/entrega |
| Publicar planejamento | `5fe54a19d909a12a1fb310bc97b7b2e7`, authenticated | Existente; cadeia B2B/locks ainda não homologada |
| Helpers recuperação | Nenhuma linha para `stock_envase_scope_v1`/`delivery_recovery_scope_v1` no catálogo | Não instalados; delta permanece inativo |
| Tabelas/Storage | RLS/grants/policies consultados em fiscal itens, OS/entrega/títulos/pedidos e storage.objects | Inspeção, não prova JWT/RLS; não alterados |

Policies de Storage de entrega incluem leitores financeiros/staff e cliente por vínculo; a existência de policies não comprova tenant/lease em toda cadeia de helpers. ACL anon em `storage.objects` não significa leitura permitida, pois RLS compõe policies; requer ensaio negativo real. Nenhuma emissão de URL assinada frontend detectada pela suíte estática, mas URLs antigas/CDN/sessão/bytes não foram certificados.

## Falhas reproduzidas e correções mínimas

**Localização correta:** os dois PASS de caracterização anteriores demonstravam falhas em `useGenerateProductionOrders` (publicação do planejamento B2B), **não** no ACK `success` de `criarEntrega`. Não foi trocado writer de entrega para consertar problema de outro contrato.

- `src/hooks/useProductionPlanning.ts`: trava síncrona por instância, adquirida antes de await e liberada só pelo próprio ticket; `retry:false` inclusive contra defaults QueryClient; valida UUIDs, `ok===true`, mesmo planning_id, contador inteiro não negativo, replay tipado. Usa `useStorageAccessScope` existente antes/depois RPC e antes de invalidar. Ausência RPC/403/PT409/55P03/offline não abre fallback `publish_planning_to_lab` service-only. Nenhuma nova rota/RPC/tabela/feature/permissão. Não restaura contexto nem preço.
- `src/test/planejamento-producao/publicacao-contrato-current.test.tsx`: os dois testes agora exigem uma chamada e rejeição do envelope; adicionados alvo errado, NULL, contador inválido, replay inválido, tenant/ator/epoch/inativo durante await, ausência endpoint, liberação após erro e offline. **21 testes**, QueryClient real/Auth/transporte simulados.
- Trava é local por mount; não protege abas/remounts, não substitui idempotência/CAS servidor, nem garante reconciliação ACK perdido. Reenvio explícito após erro não é automático; cadeia servidor e continuidade ainda requerem gate real.
- `src/test/config/authProviderTopology.test.ts`: falso positivo por aspas simples no import relativo canônico; detector aceita ambos delimitadores mantendo só caminhos canônicos. Não foi alterado provider/import de produção.
- `src/test/multiportal.guards.test.tsx`: dois testes positivos antigos tinham papel produtor, mas lista canônica vazia. Fixtures positivas agora retornam `producer`; novo negativo exige negação quando lista vazia. **Guard/roles/rotas intocados**; teste de fixture não concede acesso.
- Grupo de entrega continua multi-RPC/best-effort e warning de expedição: **P0 não corrigido por falta de contrato atômico**, não forçar wrapper fechado. Envase/B2B/onfarm/A2 continuam inativos.

## Testes executados nesta rodada

Resultados e comandos resumidos sem tokens em `evidencias-fluxo-b2b-20261028/`. Não incluir logs completos de sessões hosted. Resultados PostgreSQL nos pacotes originais.

| Grupo | Resultado | Natureza |
|---|---|---|
| Baseline contratos | 55/55, incluindo dois testes que constatavam falhas | Não eram testes de proteção |
| Contratos após primeiro patch | 67/67 | QueryClient/transporte; ampliado depois para21 no arquivo |
| Cobertura ampla,21 arquivos | 288/288 | jsdom/mocks/estáticos: catálogo/carrinho/pedido/crédito/Storage/CQ/estoque/fiscal/portais |
| Segurança/BI/portal inicial | 95 PASS/2 FAIL em97; topologia apontada pelo subauditor também falso positivo | Fixtures produtor desatualizadas; nenhum guard relaxado |
| Segurança/BI/portal corrigidos | 121/121 em9 arquivos (inclui21 publicação) antes do novo negativo produtor | Reexecução final combinada registrada em evidências |
| Contratos/segurança/BI final,13 arquivos | **171/171** | Inclui21 publicação e novo negativo produtor; substitui contagens parciais sobrepostas |
| OS/aprovação/programação/CQ/envase/CAS fiscal/features,8 arquivos | **159/159** | Contratos/consultas e mocks, não produção real |
| Estoque/envase | 64/64 | PostgreSQL descartável: motor/reserva/ledger capturados, Auth/schema/hash sintéticos; triggers transição/financeiro omitidos |
| Entrega composto | 48/48 | PostgreSQL descartável com motor/billing/avanço stubs; rollback DDL, item/ACK/locks, não integração real |
| A2 | 76/76 | PostgreSQL/Auth sintéticos, duas funções propostas; não instalada/JWT |

Não somar execuções sobrepostas como testes únicos. Warnings Router Future Flags e mocks DOM/act de pedido observados: não ocultados, não são prova de falha hosted. Build/typecheck são automáticos do harness; não executados manualmente. Não rodados testes hosted/e2e/fixtures nem scripts `*-postgres` sem inspeção do destino.
Os três grupos finais disjuntos (21+13+8 arquivos) somam **618/618 em42 arquivos**. PostgreSQL separado: **188 checks** (64+48+76). Estes totais não cobrem toda a aplicação nem9.180 combinações reais; outros testes permanecem NOT RUN.
Dois testes adicionais de integridade da matriz (`src/test/rbac/order-flow-coverage.test.ts`) passaram: **620 testes únicos em43 arquivos** no conjunto auditado, sem promover cobertura planejada a execução real. Reexecução final de quatro arquivos:50/50; não somada novamente.

### Arquivos modificados nesta rodada

- Runtime mínimo: `src/hooks/useProductionPlanning.ts`; regra em `src/hooks/AGENTS.md`.
- Regressões: `src/test/planejamento-producao/publicacao-contrato-current.test.tsx`, `src/test/config/authProviderTopology.test.ts`, `src/test/multiportal.guards.test.tsx`, novo `src/test/rbac/order-flow-coverage.test.ts`.
- Auditoria: `scripts/rbac-audit/build-order-flow-matrix.py`, CSV/resumo JSON, este relatório, `roteiro-real-fluxo-b2b-20261028.md`, pasta `evidencias-fluxo-b2b-20261028/`.
- Plano original, `roadmap.md`, regra raiz `AGENTS.md`. Runners descartáveis regravaram apenas seus resultados/metadata locais nos pacotes A2/estoque/entrega; não geraram/aplicaram SQL hosted. Integridade dos manifestos conferida no encerramento.

### Pendências não ocultadas

- **P0/BLOCKED:** A2 não instalada; equivalência OS manual/grupo/CAS/retorno não demonstrada; envase/B2B/onfarm/ledger+financeiro completo sem prova JWT/A/B. Os quatro FAIL da matriz são gates de liberação, não ataques executados.
- **P1/NOT RUN:** escopo de caches globais de planejamento/BI além deste patch, remount/abas e perda ACK com reconciliação servidor, todos os combos reais/Storage stale URL/tenant transferência/features/planos. Nenhuma prova hosted de settings Auth/signup nem flags externas nesta rodada.
- **P2/NOT RUN:** UX visual desktop/mobile/acessibilidade real (jsdom não confirma layout/foco real/contraste); warnings dos mocks e Router. Roteiro preparado, não alegar UX homologada.

## Critérios P0/P1/P2 e métricas pós-implantação

**P0 — impede instalação/liberação:** IDOR/bytes cross-tenant, elevação de papel, segredo/token exposto, writer bypass/RLS/DEFINER inseguro, duplicação título/pedido/ledger, saldo negativo/não finito, snapshot alterado, item N parcial anunciado sucesso, bypass CQ/envase, deadlock reproduzido/autoridade stale, comunicação/NF externa involuntária. Todos devem ter correção independente + teste concreto; zero P0 aberto para GO.

**P1 — impede aceite funcional:** transição/rollback/replay/ACK/CAS/draft/revogação não demonstrados; tela legítima bloqueada, incoerência BI, cache tenant anterior, anexos inacessíveis ao próprio autorizado, método/categoria/valor/parcelas sem confirmação. Zero P1 aberto no caminho crítico; exceção só documentada/aprovada pelo proprietário, nunca para segurança.

**P2 — UX/manutenção:** textos, foco, keyboard, contraste/legibilidade, layout mobile/desktop, warnings não funcionais. Priorizar a11y; aceite explícito de pendências sem mascarar impacto.

Métricas obrigatórias: 100% cenários críticos executados com evidência real; 0 vazamentos/0 duplicações/0 saldos inválidos/0 P0; 100% replay com mesma identidade/snapshot; 100% falha item N rollback sem resíduos não auditados; 100% negativos reais por A/B/C/anon; 100% transições críticas com antes/depois/receipt/audit; timeout esperado55P03 ≤limite contratual+latência registrada (não promessa universal3s); zero retries automáticos não contratados; divergência BI=0 para fixtures reconciliadas; externo/fiscal real=0 nesta fase.

## Gate final obrigatório

Instalação e publicação autorizadas separadamente **não encerram o fluxo**. Depois da implantação coordenada, recapturar versões/hash/OID/ACL/column ACL/trigger/policy/Storage/flags, executar roteiro real controlado, anexar evidência por ID e regressões desktop/mobile. Somente GO escrito independente com zero P0 e caminho crítico P1 demonstrado permite declarar homologado. Candidatos/stubs/mocks nunca contam como JWT real. Contabilidade/fiscal reais e SU-518022 permanecem pendentes.

**Aviso de runner legado:** `scripts/rbac-audit/README.md` e `run-rbac-audit.ts` são legado de outros refs e sondas mutantes. Não foram executados, não são roteiro seguro para esta rodada; refs não canônicos continuam proibidos. O novo gerador é offline e não usa esses defaults. Ambiente real só pelo roteiro abaixo, com ref atestado e aprovação específica.
## Complemento prioritário do consumidor real (02:12 UTC)
Relatório `consumidor-real-entrega-20261028.md`: página Entregas/hook/diálogo reais com Auth/transporte simulados,32 regressões novas;332/332 em23arquivos nesta rodada, não somar sobreposições com620 anteriores. Matriz agora9190linhas:9180combinações planejadas,6grupos offline PASS,4gates FAIL. GAP-02 continua aberto por atomicidade/contrato servidor; warning/sucesso indevido corrigidos apenas no código local não publicado. JWT real PASS0;188PG são históricos não reexecutados.
