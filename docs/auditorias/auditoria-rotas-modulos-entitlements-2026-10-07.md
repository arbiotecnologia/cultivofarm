# Auditoria de rotas, módulos, permissões e entitlements — 2026-10-07

## Decisão: NO-GO funcional

Correções frontend focais verificadas estruturalmente. **Não há prova autenticada integral de navegabilidade, dados, RLS, tenant forjado ou matriz A/B/C nesta rodada.** Não declarar 100% nem restaurar acesso comercial por bypass.

Projeto frontend Cultivo Farm, Lovable `a79bb3db-f665-466d-bf41-ee8c6cb91fab`; cliente e `supabase/config.toml` confirmam exclusivamente `swzpzcwiasxmjutrmvkm`. Banco consultado somente por SELECT/advisor/scanner; nenhuma migration, Edge, fixture, mutação comercial, publicação ou deploy manual. Preço 59,90 BRL e versões comerciais preservados. Sem ativação de cobrança/NF-e/CT-e.

SHA inicial observado: `570e8935db40d42784fa97a1a9536dbd4058dcc6`; SHA intermediário observado após alterações automáticas: `202802d8dd51a392af59e2fa1454974086d9155b`. São referências observadas, não commit manual nem promessa de SHA final.

## 1. Causa objetiva do sintoma

**As cinco assinaturas vivas têm `plan_version_id NULL`: nenhuma empresa está ligada a um snapshot publicado.** A classificação `legacy_unversioned` e o bloqueio fail-closed das rotas contratáveis são coerentes com o contrato atual; chamar a empresa de “completa” ou exibir arrays legados com 17 features não constitui concessão efetiva.

- AR BIOTECNOLOGIA: TRIAL legada sem versão; regularização comercial pendente, não defeito de menu a contornar.
- Refil Informática: SUSPENDED e sem versão; acesso contratado não pode ser concedido automaticamente.
- Demais assinaturas: uma ACTIVE e duas TRIAL, também sem versão; nomes/PII omitidos.
- Overrides: zero linhas. Não há override capaz de restaurar features neste estado.
- O resolvedor privado `platform_private.entitlements_for_user` exige perfil/organização ativos, assinatura ACTIVE ou TRIAL não expirada, versão PUBLISHED vigente, feature/módulo ativos e aplica GRANT/REVOKE. Não consome `saas_plan_features` legada como autoridade.
- `get_my_entitlement_context` distingue Superadmin servidor, legado, sem assinatura e bloqueio; `useEntitlements` só consulta features em contexto ativo/trial ativo. RoleGuard faz RBAC/contexto antes do plano; portais especializados preservam guards de vínculo e EntitlementOutlet.

**Ação de produto não executada:** vincular cada empresa a uma versão publicada aprovada e vigente pela operação oficial de regularização. Não inferir contrato, prazo, preço ou assinatura a partir do rótulo “completo”. A regularização exige escolha explícita do proprietário; não foi feita nesta auditoria.

## 2. Inventário anterior às correções e metodologia

Inventário inicial: 176 declarações com path/index, 106 itens de navegação e 191 arquivos em `src/pages`. Inventário final: **179 declarações**, adicionando somente os três aliases fiscais já documentados em `legacyRoutes`. `src/routes/index.tsx` é placeholder sem uso; autoridade de router permanece `src/App.tsx`.

Arquivo complementar: `auditoria-rotas-inventario-2026-10-07.json`. Contém cada path/index, linha, componentes, guards ancestrais, redirect estático, feature_key, candidatos ACCESS_MAP, referências em fontes, entrada de menu e justificativa. Páginas incluem consumidores de imports absolutos/relativos; menu inclui audiences desktop/mobile/portais. O gerador TypeScript percorre JSX, pais sem path, nested/index e paths relativos. Imports lazy continuam nos componentes identificados pelo router.

**Limites explícitos:** candidatos ACCESS_MAP não são permissões finais (PlataformaGuard, PortalGuard, B2BRouteGuard, contexto e vínculos restringem adicionalmente); referências textuais não provam clique nem dados; parâmetros dinâmicos exigem contexto/ID válido. Classes 1/7/8 são classificações estruturais, nunca PASS autenticado. Classes 2–6 permanecem possíveis sob estados/identidades não disponíveis. Alterar/regenerar o snapshot exige revisão: ele é inventário de auditoria, não registro paralelo de autorização.

Áreas percorridas: plataforma, administrador, cadastros/cliente, financeiro/B2B, comercial, laboratório/produção/onfarm, estoque, fiscal, entregas, BI/executivo, comunicação, parceiro gestor/técnico, produtor e campo mobile. AR Bio/Refil verificadas comercialmente por consultas read-only; suas telas autenticadas não foram abertas.

## 3. Defeitos comprovados e correções mínimas

| Defeito | Causa | Correção | Evidência |
|---|---|---|---|
| Alias fiscal anunciado mas inexistente | `legacyRoutes` tinha `/fiscal/perfis/{produtos,servicos,clientes}` sem Route | Três PreservedNavigate para perfis existentes; destino permanece RoleGuard | Teste de todos os aliases do menu PASS |
| Alias com query malformada | Concatenação do destino `?tab=` com query de origem | Merge URLSearchParams; destino canônico prevalece; hash preservado | Teste renderizado `/legacy?tab=old&cliente=123#detalhe` PASS |
| Negação RBAC silenciosa | RoleGuard mandava para home | `/sem-permissao`, estado de origem; gate de plano continua posterior | Teste estático e suíte PASS; Auth real UNVERIFIED |
| Link Portal invisível para admin já permitido no PortalGuard | ACCESS_MAP `/portal` não espelhava suporte admin existente | Alinhar somente administrador + produtor; nenhuma ampliação de backend | canAccess positivo/negativo PASS |
| Comunicação herdava regra genérica de `/` | Ausência de chave ACCESS_MAP explícita | Escopo administrador/gestor igual ao guard existente | produção negada no contrato unitário |
| Menu parceiro não refletia plano | Menu só filtrava perfil | isPathEntitled no menu; EntitlementOutlet da URL preservado | Teste de fonte/filtro e suíte PASS |
| Tabs mobile não refletiam plano | Tabs só escolhiam audience | Mesmo isPathEntitled; guards da URL preservados | Teste de fonte/filtro PASS |
| Mensagem genérica para assinatura ausente/bloqueada | ForaDoPlano agregava situações | Títulos distintos para loading/erro/legado/ausência/bloqueio/feature negada | Contratos estáticos PASS |
| Catch-all em inglês | Texto herdado do template | 404 em português e Link SPA | Chromium desktop/mobile real sem Auth PASS |

Removido cast `any` desnecessário de branding parceiro (partner?.id); não alterou escopo da query. Não acrescentados módulos, páginas comerciais, preços ou limites.

## 4. Catálogo e estado vivo

Sete módulos ativos, 17 features ativas; **todas `commercializable=false` no estado consultado**. Esse metadado não substitui os snapshots publicados; não foi alterado. As 17 chaves possuem ao menos uma rota estrutural mapeada (teste estático). Catálogo remoto futuro exige reauditoria; testes locais não consultam produção.

| Módulo | Features e rotas representativas |
|---|---|
| agronomico | fichas_tecnicas → /portal-parceiro/fichas; visitas_tecnicas → /visita-tecnica, /app/visita; recomendacoes_alertas → /monitoramento-alertas |
| comercial_b2b | catalogo_precos → /base-tecnica, /portal-parceiro/catalogo; pedidos_b2b → /comercial/pedidos-b2b, /portal-parceiro/pedidos; simulacoes → /comercial/simulador, /portal-parceiro/simulador |
| comunicacao | envios_automaticos → /comunicacao, adicionalmente feature flag existente |
| financeiro | contas_receber → /financeiro/receber; contas_pagar → /financeiro/pagar; fluxo_caixa → /financeiro/fluxo-caixa |
| fiscal | emissao_nfe_nfse → /fiscal/documentos, /fiscal/prontidao; preparação não equivale a emissão |
| producao_estoque | ordens_producao → /ordens-servico, /cockpit-laboratorio; lotes_qualidade → /lotes, /controle-qualidade; envase → /envase; estoque_embalagens → /estoque |
| relatorios | paineis_executivos → /dashboard/executivo, BI; relatorios_operacionais → /relatorios |

Versões consultadas, sem alteração: Base v1 59,90 BRL vigente até 2026-10-09 00:58Z; Base v2 69,90 BRL com início futuro em 2026-10-09 00:58Z; Completo v1 599,90 BRL; Essencial v1 99,90 BRL. Valores são descrição read-only do banco existente, não proposta nem mudança de preço. Nenhuma dessas versões está vinculada às cinco assinaturas consultadas.

Tabelas SaaS examinadas com RLS ativo e ACL explícita autenticado/service_role, sem SELECT anon. `information_schema.role_table_grants` retornou vazio na consulta inicial; confirmado por `pg_class.relacl`/`has_table_privilege`, que são a evidência de ACL utilizada. Não necessário DDL; preservados grants além de RLS.

## 5. Riscos e decisões não inferidas

- `/app/notificacoes` sem tab técnico: existe central de notificações no cabeçalho compartilhado; não adicionar sexto tab sem decisão de UX. Não provado como página desaparecida.
- `/portal/fila-aprovacao`: componente é alias para `/portal/recomendacoes?aba=aguardando`, não funcionalidade independente perdida. Mantido sem novo menu.
- `/portal/meus-pedidos`, rotas de solicitação/histórico e vínculos B2B têm redirects/ocultações deliberadas documentadas. Não reexpor.
- Fazendas/talhões, configurações e relatórios-filhos são acessos contextuais. Não adicionar todos ao sidebar.
- `PlaceholderPage` e `PortalMeusPedidos` não têm consumidor importado detectado. Outros componentes importados mas não montados diretamente podem ser legados/embutidos; inventário não é autorização de exclusão.
- Atalhos executivos podem aparecer antes de checar plano do destino; URL mantém RoleGuard, mas UX autenticada não certificada.
- Comunicação ainda tem guard secundário por papel primário; cenário multipapel que passe pelo contexto efetivo mas falhe no guard secundário não foi reproduzido. Não mudar autorização sem prova.
- Algumas rotas RoleGuard herdam ACCESS_MAP raiz: `/parceiros/:id`, `/etiquetas/:id/imprimir`, `/comercial/auditoria-motor-b2b`. Escopo de detalhe/print/auditoria exige decisão/revisão própria; não inventado RBAC nem automaticamente exposto menu.
- Mobile campo é deliberadamente subconjunto dos módulos desktop. Portais têm registros/audiences diferentes; contrato estático registra essa diferença, mas não certifica usabilidade de cada identidade.
- Features financeiras de recibos/DRE/B2B, configuração fiscal e portal produtor não ganharam novos gates inferidos: falta correspondência inequívoca aprovada. Segurança de dados segue nos guards/RLS existentes. Isso impede afirmar cobertura perfeita de enforcement.

## 6. Certificação e bloqueios

| Prova | Resultado | Evidência/limite |
|---|---|---|
| Inventário integral de declarações/menu/páginas | PASS estrutural | AST + JSON + matriz abaixo; sem confirmação autenticada |
| Destinos de navegação/aliases existentes | PASS | 106 entradas e aliases testados; catch-all não conta como destino |
| Feature conhecida em rota → guard | PASS estrutural | RoleGuard/EntitlementOutlet ou alias para destino protegido |
| 17 chaves remotas → rota estrutural | PASS | snapshot read-only + teste; flags/contrato ativo não provados |
| A completo/admin, B limitado/admin, C completo/restrito | PASS unitário somente | interseção em /financeiro/receber; **não fixtures SQL/Auth** |
| Fixtures SQL A/B/C e rollback | BLOCKED / NÃO EXECUTADO | sem executor transacional seguro disponível; tool read_query SELECT-only, run_sql não oferece BEGIN/ROLLBACK; não usar migration para teste |
| Login/UI/URL/dados/forja organization_id/partner_id/RLS | BLOCKED | external_unmanaged; nenhuma sessão real disponível; não forjar JWT |
| Resíduos da rodada | nenhum criado | 0 fixtures/objetos/Auth criados; não alegar varredura global completa |
| Chromium público desktop 1280 e mobile 390 | PASS limitado | /clientes,/plataforma,/portal-parceiro/pedidos → /auth; /app/catalogo → /app/login; 404 permanece URL; sem overflow |
| UI autenticada/responsividade de cada portal/loops autenticados | BLOCKED | smoke público não substitui prova com sessão |
| Testes focais | PASS | 449/449; novos contratos 115/115 reexecutados após revisão da matriz |
| Suíte completa | PASS | 5.730 PASS / 4 skipped, 394 arquivos PASS / 1 skipped |
| Lint focal | PASS | erro any preexistente no arquivo tocado removido; execução final limpa |
| Lint global | FAIL preexistente | 3.467 erros / 127 avisos; não corrigidos fora do escopo |
| Scanners segredos/fiscal | PASS focal | scripts existentes sem segredos/emissão em runtime; não equivalem a scanner integral de todos os arquivos |
| Scanner Supabase | 10 INFO | achados existentes de catálogo/auditoria/Auth; nenhum suprimido, segurança integral não certificada |
| Advisor segurança | baseline | 461: 17 sem policy, 2 DEFINER anon, 441 DEFINER authenticated, 1 senhas vazadas OFF; sem DDL nesta rodada |
| Advisor performance | BLOCKED nesta rodada | não foi executado; histórico não reapresentado como resultado atual |
| Typecheck separado | NÃO EXECUTADO | execução manual vedada pelo ambiente; suíte/build não substituem prova específica |
| Build automático | PASS | log build OK 2026-10-07T17:42:36Z, sem execução manual |

Gate mínimo restante: disponibilizar meio autorizado de teste com sessões reais de identidades A/B/C e executor transacional de rollback no canônico, sem credenciais em chat e sem trocar usuários reais de tenant/papel. Em Supabase externo o navegador do proprietário não é injetável neste executor; evidências sanitizadas no navegador do titular são apoio, não prova local automática. Regularização das assinaturas exige versão escolhida e operação oficial aprovada, separada desta auditoria.

## 7. Snapshot final read-only

Hashes MD5 de agregação ordenada `to_jsonb(row)` (evidência de estado consultado, não prova antes/depois integral):

| Recurso | Linhas | MD5 |
|---|---:|---|
| saas_modules | 7 | cac0350361cbc59d61c167a75d764fef |
| saas_features | 17 | b96655cc7200fca21c545c4e11883dd8 |
| saas_plan_features | 54 | 0f036531b2acceceb86b8c11ae78af33 |
| saas_plan_versions | 4 | 5a1434bc7dd04c47cbeeba05f1a7c255 |
| saas_plan_version_features | 31 | 77a6736c0ebc30289b58e3ca8b153529 |
| organization_subscriptions | 5 | d8a1e581c3a6b93374248dbbf2653b95 |
| organization_feature_overrides | 0 | NULL (agregado vazio) |

## 8. Arquivos e restauração

Código: `src/App.tsx`, `src/lib/permissions.ts`, `src/components/PreservedNavigate.tsx`, `src/components/guards/ForaDoPlano.tsx`, `src/pages/NotFound.tsx`, `src/pages/app/MobileLayout.tsx`, `src/pages/portal-parceiro/PortalParceiroLayout.tsx`. Auditoria/testes: `scripts/navigation-audit/{inventory,generate}.ts`, `src/test/saas/navigation-inventory.test.tsx`, `src/test/PreservedNavigate.test.tsx`, JSON complementar, este relatório, `roadmap.md`, regra estrutural em `AGENTS.md`.

Nenhuma migration/Edge alterada. Sem mutação de banco, não há rollback de banco desta rodada. Restauração frontend, se necessária, deve ser revisão focal das alterações acima, não reversão de migrations nem histórico comercial. Nenhum estado de produção foi deliberadamente regularizado.

## 9. Matriz completa de declarações

Legenda: 1 = navegação declarativa estrutural; 7 = alias/index; 8 = interna/contextual/sensível/sistema com justificativa no JSON. Todas as linhas: Auth/URL/dados autenticados **UNVERIFIED**. Campos de perfil/referências completos estão no JSON; estes candidatos não substituem guards ancestrais. Não afirmar classes 3/4 em runtime sem sessão.

| Rota | Página/elementos | Guard ancestral | Feature | Nav/alias | Classe |
|---|---|---|---|---|---|
| /auth | AuthRoute | pública/sistema | não mapeada | system/internal route; never automatically expose | 8 |
| /reset-password | ResetPassword | pública/sistema | não mapeada | system/internal route; never automatically expose | 8 |
| /selecionar-portal | AuthenticatedShell, SelecionarPortal | pública/sistema | não mapeada | system/internal route; never automatically expose | 8 |
| /acesso-pendente | AuthenticatedShell, AcessoPendente | pública/sistema | não mapeada | system/internal route; never automatically expose | 8 |
| /sem-permissao | AuthenticatedShell, SemPermissao | pública/sistema | não mapeada | system/internal route; never automatically expose | 8 |
| /plataforma | PlataformaHome | PlataformaGuard | não mapeada | system/internal route; never automatically expose | 8 |
| /configuracoes/catalogo-ia | ConfigCatalogoIA | PlataformaGuard | não mapeada | child configuration reached from Configuracoes; platform-only where guarded | 8 |
| /validar-entrega/:token | ValidarEntrega | pública/sistema | não mapeada | contextual detail/token route; identifier required | 8 |
| /rastrear-produto/:token | RastrearProduto | pública/sistema | não mapeada | contextual detail/token route; identifier required | 8 |
| /app/login | MobileLogin | pública/sistema | não mapeada | system/internal route; never automatically expose | 8 |
| /app | MobileDashboard | AppPortalGuard, MobileLayout | não mapeada | navigation:m-c-inicio:mobile-consultor,mobile-produtor | 1 |
| /app/perfil | MobilePerfil | AppPortalGuard, MobileLayout | não mapeada | navigation:m-perfil:mobile-consultor,mobile-produtor | 1 |
| /app/notificacoes | MobileNotificacoes | AppPortalGuard, MobileLayout | não mapeada | navigation:m-p-notificacoes:mobile-produtor | 1 |
| /app/fazendas | MobileFazendas | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | não mapeada | navigation:m-c-fazendas:mobile-consultor | 1 |
| /app/registrar | MobileRegistrarOcorrencia | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | não mapeada | MobileLayout floating action and technical dashboard | 8 |
| /app/atendimentos | MobileAtendimentos | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | não mapeada | navigation:m-c-atendimentos:mobile-consultor | 1 |
| /app/registros | Navigate | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | não mapeada | /app/atendimentos | 7 |
| /app/solicitacoes | Navigate | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | não mapeada | /app/atendimentos?aba=demandas | 7 |
| /app/ordens | MobileOrdens | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | não mapeada | technical/producer dashboard action | 8 |
| /app/checkin/:solicitacaoId | MobileCheckin | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | visitas_tecnicas | contextual detail/token route; identifier required | 8 |
| /app/checkin | MobileCheckin | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | visitas_tecnicas | contextual check-in; requires solicitation; not a top-level tab | 8 |
| /app/visita/novo | MobileVisita | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | visitas_tecnicas | creation action inside technical workspace | 8 |
| /app/visita/:id | MobileVisita | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | visitas_tecnicas | contextual detail/token route; identifier required | 8 |
| /app/talhao/:id | MobileTalhaoHistorico | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | não mapeada | contextual detail/token route; identifier required | 8 |
| /app/catalogo | MobileCatalogoTecnico | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet | não mapeada | navigation:m-c-catalogo:mobile-consultor | 1 |
| /app/recomendacoes | MobileRecomendacoesProdutor | AppPortalGuard, MobileLayout, ProducerFeatureGuard | não mapeada | navigation:m-p-recomendacoes:mobile-produtor | 1 |
| /app/entregas | MobileEntregas | AppPortalGuard, MobileLayout, ProducerFeatureGuard | não mapeada | navigation:m-p-entregas:mobile-produtor | 1 |
| /app/aplicacoes | MobileAplicacoes | AppPortalGuard, MobileLayout, ProducerFeatureGuard | não mapeada | producer workflow; review discoverability with real identity | 8 |
| /app/aplicacoes/lista | MobileListaAplicacoes | AppPortalGuard, MobileLayout, ProducerFeatureGuard | não mapeada | producer dashboard action | 8 |
| /app/solicitar | MobileSolicitar | AppPortalGuard, MobileLayout, ProducerFeatureGuard | não mapeada | producer dashboard action | 8 |
| /portal | PortalDashboard | PortalGuard | não mapeada | navigation:portal-produtor:desktop, portalMenus:pp-dashboard:producer | 1 |
| /portal/fazendas | PortalFazendas | PortalGuard | não mapeada | portalMenus:pp-fazendas:producer | 1 |
| /portal/fazendas/:id | PortalFazendaDetalhe | PortalGuard | não mapeada | contextual detail/token route; identifier required | 8 |
| /portal/talhoes | Navigate | PortalGuard | não mapeada | /portal/fazendas | 7 |
| /portal/talhoes/:id | PortalTalhaoDetalhe | PortalGuard | não mapeada | contextual detail/token route; identifier required | 8 |
| /portal/agenda | PortalAgenda | PortalGuard | não mapeada | portalMenus:pp-agenda:producer | 1 |
| /portal/registros | PortalRegistros | PortalGuard | não mapeada | portalMenus:pp-registros:producer | 1 |
| /portal/registros/:id | PortalRegistroDetalhe | PortalGuard | não mapeada | contextual detail/token route; identifier required | 8 |
| /portal/recomendacoes | PortalRecomendacoes | PortalGuard | não mapeada | portalMenus:pp-recomendacoes:producer | 1 |
| /portal/fila-aprovacao | PortalFilaAprovacao | PortalGuard | não mapeada | legacy/index redirect; inspect target | 7 |
| /portal/acompanhamento | PortalAcompanhamento | PortalGuard | não mapeada | portalMenus:pp-acompanhamento:producer | 1 |
| /portal/ordens-servico | Navigate | PortalGuard | não mapeada | /portal/acompanhamento?tab=ordens-servico | 7 |
| /portal/producao | Navigate | PortalGuard | não mapeada | /portal/acompanhamento?tab=producao | 7 |
| /portal/entregas | Navigate | PortalGuard | não mapeada | /portal/acompanhamento?tab=entregas | 7 |
| /portal/aplicacoes | PortalAplicacoes | PortalGuard | não mapeada | portalMenus:pp-aplicacoes:producer | 1 |
| /portal/solicitar | PortalSolicitacao | PortalGuard | não mapeada | portalMenus:pp-solicitar:producer | 1 |
| /portal/perfil | PortalPerfil | PortalGuard | não mapeada | portalMenus:pp-perfil:producer | 1 |
| /portal/financeiro | PortalFinanceiro | PortalGuard | não mapeada | portalMenus:pp-titulos:producer | 1 |
| /portal/meus-pedidos | Navigate | PortalGuard | não mapeada | /portal | 7 |
| /portal-parceiro | B2BRouteGuard, PortalParceiroLayout | pública/sistema | não mapeada | layout entry and index redirect | 8 |
| /portal-parceiro | Navigate | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | /portal-parceiro/dashboard | 7 |
| /portal-parceiro/perfil | PortalParceiroPerfil | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | portalMenus:pb-perfil:gestor | 1 |
| /portal-parceiro/dashboard | ParceiroDashboardRouter | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | portalMenus:pb-dashboard:gestor, portalMenus:pbt-dashboard:tecnico | 1 |
| /portal-parceiro/pedidos | ParceiroMeusPedidos | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | pedidos_b2b | portalMenus:pb-pedidos:gestor | 1 |
| /portal-parceiro/solicitacoes | ParceiroSolicitacoes | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | pedidos_b2b | deliberately redirected/hidden by existing portal product rules | 8 |
| /portal-parceiro/novo | ParceiroNovoPedido | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | pedidos_b2b | order action; contextual entry | 8 |
| /portal-parceiro/catalogo | ParceiroNovoPedido | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | catalogo_precos | portalMenus:pb-catalogo:gestor | 1 |
| /portal-parceiro/simulador | ParceiroNovoPedido | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | simulacoes | portalMenus:pbt-simulador:tecnico | 1 |
| /portal-parceiro/historico | ParceiroHistorico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | deliberately redirected by existing portal product rules | 8 |
| /portal-parceiro/meu-historico | ParceiroMeuHistorico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | portalMenus:pb-meu-historico:gestor | 1 |
| /portal-parceiro/favoritos | ParceiroFavoritos | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | portalMenus:pb-favoritos:gestor | 1 |
| /portal-parceiro/financeiro | ParceiroFinanceiro | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | portalMenus:pb-financeiro:gestor | 1 |
| /portal-parceiro/historico-financeiro | Navigate | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | /portal-parceiro/financeiro?tab=historico | 7 |
| /portal-parceiro/meu-historico-financeiro | Navigate | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | /portal-parceiro/financeiro?tab=historico | 7 |
| /portal-parceiro/fichas | ParceiroFichasTecnicas | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | fichas_tecnicas | portalMenus:pb-fichas:gestor, portalMenus:pbt-fichas:tecnico | 1 |
| /portal-parceiro/simulacoes | ParceiroHistoricoSimulacoes | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | simulacoes | portalMenus:pbt-simulacoes:tecnico | 1 |
| /portal-parceiro/simulacoes-equipe | ParceiroSimulacoesEquipe | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | simulacoes | portalMenus:pb-simulacoes-equipe:gestor | 1 |
| /portal-parceiro/meus-produtores | ParceiroMeusProdutoresTecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | technical dashboard action; gestor redirected | 8 |
| /portal-parceiro/meus-produtores/:clienteId | ParceiroDetalheProdutorTecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | contextual detail/token route; identifier required | 8 |
| /portal-parceiro/tecnicos-produtores | ParceiroTecnicosProdutores | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | existing link-management UI hidden for partner roles | 8 |
| /portal-parceiro/usuarios-clientes | ParceiroUsuariosClientesB2B | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet | não mapeada | existing link-management UI hidden for partner roles | 8 |
| /visita-tecnica | RoleGuard, VisitaTecnicaLista | VisitaRouteGuard, ProtectedRoutes | visitas_tecnicas | navigation:visita-tecnica:desktop | 1 |
| /visita-tecnica/nova | RoleGuard, VisitaTecnica | VisitaRouteGuard, ProtectedRoutes | visitas_tecnicas | VisitaTecnicaLista creation action; not a standalone menu item | 8 |
| /visita-tecnica/:id | RoleGuard, VisitaTecnica | VisitaRouteGuard, ProtectedRoutes | visitas_tecnicas | contextual detail/token route; identifier required | 8 |
| / | Index | ProtectedRoutes | não mapeada | system/internal route; never automatically expose | 8 |
| /clientes | RoleGuard, Clientes | ProtectedRoutes | não mapeada | navigation:clientes:desktop | 1 |
| /clientes/:id | RoleGuard, ClienteDetalhe | ProtectedRoutes | não mapeada | contextual detail/token route; identifier required | 8 |
| /parceiros/:id | RoleGuard, ParceiroDetalhe | ProtectedRoutes | não mapeada | contextual detail/token route; identifier required | 8 |
| /fazendas | RoleGuard, Fazendas | ProtectedRoutes | não mapeada | navigation:fazendas:desktop | 1 |
| /fazendas/:id | RoleGuard, FazendaDetalhe | ProtectedRoutes | não mapeada | contextual detail/token route; identifier required | 8 |
| /talhoes | RoleGuard, Talhoes | ProtectedRoutes | não mapeada | Fazendas > TalhoesFazendaTab; not separate sidebar | 8 |
| /talhoes/:id | RoleGuard, TalhaoHistorico | ProtectedRoutes | não mapeada | contextual detail/token route; identifier required | 8 |
| /auditoria | RoleGuard, Auditoria | ProtectedRoutes | não mapeada | navigation:auditorias:desktop | 1 |
| /auditoria-sync | Navigate | ProtectedRoutes | não mapeada | /auditoria?tab=sync | 7 |
| /base-tecnica | RoleGuard, Protocolos | ProtectedRoutes | catalogo_precos | navigation:protocolos:desktop, navigation:protocolos-produtos:desktop, navigation:protocolos-microrganismos:desktop, navigation:protocolos-catalogo-tecnico:desktop, navigation:protocolos-culturas:desktop, navigation:protocolos-problemas:desktop | 1 |
| /protocolos | PreservedNavigate | ProtectedRoutes | não mapeada | /base-tecnica | 7 |
| /ordens-servico | RoleGuard, OrdensServico | ProtectedRoutes | ordens_producao | navigation:ordens-servico:desktop | 1 |
| /lotes | RoleGuard, Lotes | ProtectedRoutes | lotes_qualidade | navigation:lotes:desktop | 1 |
| /controle-qualidade | RoleGuard, ControleQualidade | ProtectedRoutes | lotes_qualidade | navigation:cq:desktop | 1 |
| /envase | RoleGuard, EnvasePage | ProtectedRoutes | envase | navigation:envase:desktop | 1 |
| /estoque | RoleGuard, Estoque | ProtectedRoutes | estoque_embalagens | navigation:estoque:desktop | 1 |
| /estoque/embalagens | RoleGuard, EstoqueEmbalagens | ProtectedRoutes | estoque_embalagens | Estoque workspace and executive shortcuts | 8 |
| /entregas | RoleGuard, Entregas | ProtectedRoutes | não mapeada | navigation:entregas:desktop | 1 |
| /entregas/:id/formulario | RoleGuard, FormularioEntregaPrint | ProtectedRoutes | não mapeada | contextual detail/token route; identifier required | 8 |
| /etiquetas/:id/imprimir | RoleGuard, EtiquetaProdutoPrintPage | ProtectedRoutes | não mapeada | contextual detail/token route; identifier required | 8 |
| /aplicacoes | RoleGuard, Aplicacoes | ProtectedRoutes | não mapeada | navigation:aplicacoes:desktop | 1 |
| /relatorios | RoleGuard, Relatorios | ProtectedRoutes | relatorios_operacionais | navigation:relatorios:desktop | 1 |
| /consultor-tecnico | RoleGuard, ConsultorTecnico | ProtectedRoutes | não mapeada | navigation:equipe-tecnica:desktop | 1 |
| /fluxo-tecnico | RoleGuard, FluxoTecnico | ProtectedRoutes | não mapeada | navigation:fluxo-tecnico:desktop | 1 |
| /bi-agronomico | RoleGuard, BIAgronomico | ProtectedRoutes | paineis_executivos | navigation:bi-agronomico:desktop | 1 |
| /bi-operacional | RoleGuard, BIOperacional | ProtectedRoutes | paineis_executivos | navigation:bi-operacional:desktop | 1 |
| /alertas-operacionais | RoleGuard, AlertasOperacionais | ProtectedRoutes | não mapeada | navigation:alertas:desktop | 1 |
| /previsao-agronomica | RoleGuard, PrevisaoAgronomica | ProtectedRoutes | recomendacoes_alertas | navigation:previsao-climatica:desktop | 1 |
| /solicitacoes | RoleGuard, Solicitacoes | ProtectedRoutes | não mapeada | navigation:solicitacoes:desktop | 1 |
| /monitoramento-alertas | RoleGuard, MonitoramentoAlertas | ProtectedRoutes | recomendacoes_alertas | navigation:monitoramento:desktop | 1 |
| /agenda-tecnica | RoleGuard, AgendaTecnica | ProtectedRoutes | visitas_tecnicas | navigation:agenda-tecnica:desktop | 1 |
| /dashboard | PreservedNavigate | ProtectedRoutes | não mapeada | /dashboard/geral | 7 |
| /dashboard/geral | RoleGuard, DashboardUnificado | ProtectedRoutes | não mapeada | navigation:dashboard:desktop, navigation:dashboard-geral:desktop | 1 |
| /dashboard/executivo | RoleGuard, DashboardUnificado | ProtectedRoutes | paineis_executivos | navigation:dashboard-executivo:desktop | 1 |
| /dashboard/operacional | RoleGuard, DashboardUnificado | ProtectedRoutes | não mapeada | navigation:dashboard-operacional:desktop | 1 |
| /painel-operacional | PreservedNavigate | ProtectedRoutes | não mapeada | /dashboard/operacional | 7 |
| /cockpit-laboratorio | RoleGuard, CockpitLaboratorio | ProtectedRoutes | ordens_producao | navigation:cockpit-lab:desktop | 1 |
| /financeiro | RoleGuard, FinanceiroDashboard | ProtectedRoutes | não mapeada | navigation:fin-dashboard:desktop | 1 |
| /financeiro/receber | RoleGuard, ContasReceber | ProtectedRoutes | contas_receber | navigation:fin-receber:desktop | 1 |
| /financeiro/pagar | RoleGuard, ContasPagar | ProtectedRoutes | contas_pagar | navigation:fin-pagar:desktop | 1 |
| /financeiro/categorias | RoleGuard, FinCategorias | ProtectedRoutes | não mapeada | navigation:fin-categorias:desktop | 1 |
| /financeiro/centros-custo | RoleGuard, FinCentrosCusto | ProtectedRoutes | não mapeada | navigation:fin-cc:desktop | 1 |
| /financeiro/contas-bancarias | RoleGuard, FinContasBancarias | ProtectedRoutes | não mapeada | navigation:fin-contas-bancarias:desktop | 1 |
| /financeiro/formas-pagamento | RoleGuard, FinFormasPagamento | ProtectedRoutes | não mapeada | navigation:fin-formas-pgto:desktop | 1 |
| /financeiro/recorrencias | RoleGuard, FinRecorrencias | ProtectedRoutes | não mapeada | navigation:fin-recorrencias:desktop | 1 |
| /financeiro/fluxo-caixa | RoleGuard, FinFluxoCaixa | ProtectedRoutes | fluxo_caixa | navigation:fin-fluxo:desktop | 1 |
| /financeiro/dre | RoleGuard, FinDRE | ProtectedRoutes | não mapeada | navigation:fin-dre:desktop | 1 |
| /financeiro/notas-fiscais | RoleGuard, FinNotasFiscais | ProtectedRoutes | emissao_nfe_nfse | navigation:fin-nfe:desktop | 1 |
| /financeiro/entregas-nao-faturadas | RoleGuard, FinEntregasNaoFaturadas | ProtectedRoutes | não mapeada | navigation:fin-ent-nfat:desktop | 1 |
| /financeiro/auditoria | Navigate | ProtectedRoutes | não mapeada | /auditoria?tab=financeiro | 7 |
| /financeiro/configuracoes | Navigate | ProtectedRoutes | não mapeada | /configuracoes?tab=financeiro | 7 |
| /financeiro/relatorios | RoleGuard, FinRelatorios | ProtectedRoutes | não mapeada | navigation:fin-relatorios:desktop | 1 |
| /financeiro/relatorios/mensal | RoleGuard, RelMensal | ProtectedRoutes | não mapeada | child report reached from FinanceiroRelatorios | 8 |
| /financeiro/relatorios/contas-receber | RoleGuard, RelReceber | ProtectedRoutes | não mapeada | child report reached from FinanceiroRelatorios | 8 |
| /financeiro/relatorios/contas-pagar | RoleGuard, RelPagar | ProtectedRoutes | não mapeada | child report reached from FinanceiroRelatorios | 8 |
| /financeiro/relatorios/inadimplencia | RoleGuard, RelInadimplencia | ProtectedRoutes | não mapeada | child report reached from FinanceiroRelatorios | 8 |
| /financeiro/relatorios/nfe-pendente | RoleGuard, RelNFePendente | ProtectedRoutes | não mapeada | child report reached from FinanceiroRelatorios | 8 |
| /financeiro/relatorios/entregas-faturamento | RoleGuard, RelEntregasFat | ProtectedRoutes | não mapeada | child report reached from FinanceiroRelatorios | 8 |
| /financeiro/relatorios/por-cliente | RoleGuard, RelPorCliente | ProtectedRoutes | não mapeada | child report reached from FinanceiroRelatorios | 8 |
| /financeiro/relatorios/prestacao-contas | RoleGuard, RelPrestacaoContas | ProtectedRoutes | não mapeada | child report reached from FinanceiroRelatorios | 8 |
| /financeiro/recibos | RoleGuard, FinRecibos | ProtectedRoutes | não mapeada | navigation:fin-recibos:desktop | 1 |
| /executivo | PreservedNavigate | ProtectedRoutes | paineis_executivos | /dashboard/executivo | 7 |
| /portal-executivo | PreservedNavigate | ProtectedRoutes | não mapeada | /dashboard/executivo | 7 |
| /comercial/parceiros | Navigate | ProtectedRoutes | não mapeada | /clientes?aba=parceiros | 7 |
| /comercial/pedidos-b2b | RoleGuard, PedidosB2B | ProtectedRoutes | pedidos_b2b | navigation:com-pedidos-b2b:desktop | 1 |
| /comercial/solicitacoes-b2b | RoleGuard, ComercialSolicitacoesB2B | ProtectedRoutes | pedidos_b2b | navigation:com-solicitacoes-b2b:desktop | 1 |
| /comercial/dashboard-b2b | Navigate | ProtectedRoutes | não mapeada | /comercial/dashboard-consolidado | 7 |
| /comercial/campanhas | RoleGuard, CampanhasComerciais | ProtectedRoutes | não mapeada | navigation:com-campanhas:desktop | 1 |
| /comercial/simulador | RoleGuard, SimuladorComercial | ProtectedRoutes | simulacoes | navigation:com-simulador:desktop | 1 |
| /comercial/catalogo | PreservedNavigate | ProtectedRoutes | não mapeada | /base-tecnica?tab=catalogo-tecnico | 7 |
| /comercial/indicadores | RoleGuard, IndicadoresComerciais | ProtectedRoutes | não mapeada | navigation:com-indicadores:desktop | 1 |
| /comercial/alertas | RoleGuard, AlertasComerciais | ProtectedRoutes | não mapeada | navigation:com-alertas:desktop | 1 |
| /comercial/dashboard-consolidado | RoleGuard, DashboardConsolidadoB2B | ProtectedRoutes | não mapeada | navigation:com-consolidado:desktop | 1 |
| /comercial/condicoes-pagamento | RoleGuard, CommercialPaymentPlansPage | ProtectedRoutes | catalogo_precos | navigation:com-condicoes-pagamento:desktop | 1 |
| /comercial/auditoria-motor-b2b | RoleGuard, AuditoriaMotorB2B | ProtectedRoutes | não mapeada | system/internal route; never automatically expose | 8 |
| /operacao/planejamento | RoleGuard, PlanejamentoProducao | ProtectedRoutes | ordens_producao | navigation:planejamento-producao:desktop | 1 |
| /operacao/planejamento/:id | RoleGuard, PlanejamentoProducaoDetalhe | ProtectedRoutes | ordens_producao | contextual detail/token route; identifier required | 8 |
| /operacao/dashboard-producao | RoleGuard, DashboardProducao | ProtectedRoutes | ordens_producao | navigation:dashboard-producao:desktop | 1 |
| /financeiro/b2b | RoleGuard, FinanceiroB2B | ProtectedRoutes | não mapeada | navigation:b2b-visao:desktop | 1 |
| /financeiro/b2b/dashboard | RoleGuard, DashboardFinanceiroB2B | ProtectedRoutes | não mapeada | navigation:b2b-dashboard:desktop | 1 |
| /financeiro/b2b/governanca | RoleGuard, GovernancaFinanceiraB2B | ProtectedRoutes | não mapeada | navigation:b2b-governanca:desktop | 1 |
| /financeiro/b2b/aging | RoleGuard, AgingFinanceiroB2B | ProtectedRoutes | não mapeada | navigation:b2b-aging:desktop | 1 |
| /financeiro/b2b/previsao | RoleGuard, PrevisaoReceitaB2B | ProtectedRoutes | não mapeada | navigation:b2b-previsao:desktop | 1 |
| /financeiro/b2b/rentabilidade | RoleGuard, RentabilidadeParceirosB2B | ProtectedRoutes | não mapeada | navigation:b2b-rentabilidade:desktop | 1 |
| /financeiro/b2b/alertas | RoleGuard, AlertasFinanceirosB2B | ProtectedRoutes | não mapeada | navigation:b2b-alertas:desktop | 1 |
| /financeiro/b2b/central-governanca | RoleGuard, CentralGovernancaB2B | ProtectedRoutes | não mapeada | navigation:b2b-central-gov:desktop | 1 |
| /financeiro/b2b/regras | RoleGuard, RegrasGovernancaB2B | ProtectedRoutes | não mapeada | navigation:b2b-regras-gov:desktop | 1 |
| /executivo/socios-b2b | RoleGuard, DashboardSociosB2B | ProtectedRoutes | paineis_executivos | navigation:b2b-socios:desktop | 1 |
| /configuracoes | RoleGuard, Configuracoes | ProtectedRoutes | não mapeada | navigation:configuracoes:desktop | 1 |
| /configuracoes/objetivos-visita | RoleGuard, ObjetivosVisita | ProtectedRoutes | não mapeada | child configuration reached from Configuracoes; platform-only where guarded | 8 |
| /configuracoes/parametros-cq | RoleGuard, ParametrosCQPage | ProtectedRoutes | não mapeada | child configuration reached from Configuracoes; platform-only where guarded | 8 |
| /configuracoes/fiscal/empresa | RoleGuard, FiscalEmpresa | ProtectedRoutes | não mapeada | navigation:config-fiscal:desktop | 1 |
| /configuracoes/fiscal/produtos | RoleGuard, FiscalProdutos | ProtectedRoutes | não mapeada | navigation:fiscal-perfis-produtos:desktop | 1 |
| /configuracoes/fiscal/servicos | RoleGuard, FiscalServicos | ProtectedRoutes | não mapeada | navigation:fiscal-perfis-servicos:desktop | 1 |
| /configuracoes/fiscal/clientes | RoleGuard, FiscalClientes | ProtectedRoutes | não mapeada | navigation:fiscal-perfis-clientes:desktop | 1 |
| /fiscal/perfis/produtos | PreservedNavigate | ProtectedRoutes | emissao_nfe_nfse | /configuracoes/fiscal/produtos | 7 |
| /fiscal/perfis/servicos | PreservedNavigate | ProtectedRoutes | emissao_nfe_nfse | /configuracoes/fiscal/servicos | 7 |
| /fiscal/perfis/clientes | PreservedNavigate | ProtectedRoutes | emissao_nfe_nfse | /configuracoes/fiscal/clientes | 7 |
| /fiscal/documentos | RoleGuard, FiscalDocumentos | ProtectedRoutes | emissao_nfe_nfse | navigation:fiscal-rascunhos:desktop | 1 |
| /fiscal/reconciliacao | RoleGuard, FiscalReconciliacao | ProtectedRoutes | emissao_nfe_nfse | system/internal route; never automatically expose | 8 |
| /fiscal/prontidao | RoleGuard, FiscalProntidao | ProtectedRoutes | emissao_nfe_nfse | navigation:fiscal-prontidao:desktop | 1 |
| /comunicacao | RoleGuard, ComunicacaoRouteGuard, ComunicacaoAdminPage | ProtectedRoutes | envios_automaticos | navigation:comunicacao-admin:desktop | 1 |
| /notificacoes | CentralNotificacoes | ProtectedRoutes | não mapeada | system/internal route; never automatically expose | 8 |
| * | NotFound | pública/sistema | não mapeada | system/internal route; never automatically expose | 8 |