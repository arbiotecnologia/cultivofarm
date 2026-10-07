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

<!-- ROUTE_MATRIX -->