# Auditoria atual de telas, perfis, planos e empresas — 2026-10-07

## 1. Decisão e limites

**PASS estrutural/read-only focal; NO-GO para certificação funcional integral.** Browser autenticado: **UNVERIFIED/BLOCKED** (`external_unmanaged`). Não há credenciais/sessões reais disponíveis neste executor. Nenhum login simulado, fixture, RPC mutável, migration, deploy, publicação ou alteração de dados nesta rodada. D52 não foi reaberto. Somente este relatório e `roadmap.md` foram alterados.

Baseline local observado: `edf34ae7b7ced624ddbd4a90ba4f113cf436d4de`. Destino canônico validado no cliente e config: `swzpzcwiasxmjutrmvkm`. Leituras remotas por SELECT; não houve prova transacional nova. O estado publicado não foi presumido idêntico ao HEAD local; o smoke abaixo testa o domínio publicado separadamente.

## 2. Estado vivo e matriz por plano

Leituras de assinaturas/snapshots e versões PUBLISHED v1 confirmaram:

| Empresa (baseline do proprietário) | Plano | Estado vivo | Snapshot | Browser real |
|---|---|---|---:|---|
| Refil | Base v1 | ACTIVE | 3 | BLOCKED |
| Homologação | Essencial v1 | TRIAL | 8 | BLOCKED |
| AR BIOTECNOLOGIA | Gestão v1 | TRIAL | 10 | BLOCKED |
| CultivoFarm | Completo v1 | ACTIVE | 17 | BLOCKED |
| FSF | Completo v1 | TRIAL | 17 | BLOCKED |

Nesta rodada a consulta agrupada comprova plano/estado/quantidade; a associação nominal é o baseline anterior do proprietário, não nova divulgação de IDs. Zero TRIAL expirado na consulta e zero overrides cadastrados. Não reinterpretar como `legacy_unversioned`: esse era diagnóstico histórico anterior à regularização.

| Feature | Base | Essencial | Gestão | Completo ACTIVE/TRIAL |
|---|:---:|:---:|:---:|:---:|
| fichas_tecnicas | Sim | Sim | Sim | Sim |
| recomendacoes_alertas | Sim | Sim | Sim | Sim |
| visitas_tecnicas | Sim | Sim | Sim | Sim |
| contas_pagar | — | Sim | Sim | Sim |
| contas_receber | — | Sim | Sim | Sim |
| fluxo_caixa | — | Sim | Sim | Sim |
| paineis_executivos | — | Sim | Sim | Sim |
| relatorios_operacionais | — | Sim | Sim | Sim |
| emissao_nfe_nfse | — | — | Sim | Sim |
| envios_automaticos | — | — | Sim | Sim |
| catalogo_precos | — | — | — | Sim |
| envase | — | — | — | Sim |
| estoque_embalagens | — | — | — | Sim |
| lotes_qualidade | — | — | — | Sim |
| ordens_producao | — | — | — | Sim |
| pedidos_b2b | — | — | — | Sim |
| simulacoes | — | — | — | Sim |

Cada Sim é elegibilidade comercial estrutural, **não** permissão do usuário ou prova de operação fiscal/entrega externa. A decisão efetiva intersecta sessão/contexto/tenant/vínculos, papel e plano; menu não autoriza. Rotas sem mapa não são automaticamente recursos de todos os planos: mantêm os guards específicos.

## 3. Papéis reais versus arquiteturais

`AppRole` possui 14 papéis; `ACTIVE_ROLES` 13 operacionais, excluindo Superadmin de plataforma. Contagens atuais de atribuições, sem identidade pessoal: administrador 4, aplicador 1, cliente_produtor 1, parceiro_b2b 1, superadmin 1. São atribuições, não prova de sessão ativa nem de perfil íntegro.

| Papel | Existente nesta leitura | Superfície candidata |
|---|---|---|
| administrador | Sim | Operação por ACCESS_MAP; suporte produtor/mobile; não vira Superadmin |
| aplicador | Sim | Técnico/mobile e operação por vínculos |
| cliente_produtor | Sim | Portal produtor/mobile por papel e cliente autorizado |
| parceiro_b2b | Sim | Portal B2B por vínculo/contexto e plano |
| superadmin | Sim | Plataforma por PlataformaGuard e autorização server-side |
| gestor | Não | Operação/gestão por ACCESS_MAP |
| gestor_comercial | Não | Comercial/B2B por ACCESS_MAP e escopo |
| financeiro | Não | Financeiro/fiscal por ACCESS_MAP e tenant |
| administrativo | Não | Operação/leitura por ACCESS_MAP |
| producao | Não | Produção por ACCESS_MAP e tenant |
| operador_onfarm | Não | Operação vinculada e mobile conforme guard |
| consultor_tecnico | Não | Técnico/campo por vínculos/contexto |
| tecnico_agronomo | Não | Técnico/campo por vínculos/contexto |
| parceiro_b2b_tecnico | Não | B2B técnico com projeções sem preço e vínculos |

Ausência é do agregado `user_roles` atual, não autorização para criar usuários. Matriz 4×10 anterior de create-user é estrutural; os outros papéis e o Superadmin não são implicitamente incluídos na allowlist tenant.

## 4. Inventário e guards

Fonte real: `src/App.tsx`; `src/routes/index.tsx` é placeholder inerte. AST/inventário existente, revalidado pelos testes: **179 declarações path/index, 178 caminhos distintos, 190 elementos Route, 106 itens de menu (83 navigation + 23 portais), 191 arquivos pages**. O mapa atual tem **38 prefixos/17 features**, não os 29/15 da contagem parcial delegada. Classificações: 97 com navegação declarativa, 25 aliases/index, 57 contextuais/internas. 129 declarações não têm feature de plano mapeada. Uma declaração não é necessariamente uma tela independente.

| Árvore | Cadeia de acesso | Limite da prova |
|---|---|---|
| Operacional desktop | ProtectedRoutes → RoleGuard → resolveEffectiveRouteRole → isPathEntitled | Fonte/testes; URL/dados autenticados pendentes |
| Plataforma | PlataformaGuard → validação Superadmin; RPCs plataforma | Não concede operação pelo simples papel de plataforma |
| Técnico mobile | AppPortalGuard → TechnicalFeatureGuard → EntitlementOutlet | RPC de contextos e vínculos permanece autoridade |
| Produtor mobile | AppPortalGuard → ProducerFeatureGuard | Recursos sem mapa preservam regras existentes |
| Portal B2B | Guard de contexto/vínculo → EntitlementOutlet | showFor/menu não substitui autorização |
| Portal produtor | PortalGuard (sessão + roles produtor/admin) → PortalLayout | Não há prefixo /portal no mapa atual |
| Públicas/sistema | Auth/recovery, validação/rastreio com token, 403/404 | Não expor rotas contextuais automaticamente |

Aliases/itens base checados contra App: nenhum menu órfão ou alias quebrado comprovado. Redirects preservam query/hash pelo contrato existente; os destinos reais precisam de sessão para homologação. `ForaDoPlano` diferencia loading/error/no_subscription/no_context/blocked_status/trial_expired/legacy e ausência de feature; 403 e 404 têm fluxos próprios. Busca/atalhos e responsividade autenticados continuam UNVERIFIED, não certificados por cobertura de fonte.

## 5. Cache, backend/RLS, Storage e mutações sensíveis

- Troca de identidade/logout em `useAuth`: limpa cache/contexto antes de novo fetch; generation/ref evita aplicação de resultado de identidade anterior. Troca B2B/técnico cancela/remove queries focais e limpa seleção; contexto disponível vem da RPC, não do storage.
- `usePortalCliente`: seleção persistida só aceita cliente na lista retornada pelo servidor. Filtro cliente_id não é fronteira de segurança.
- Introspecção viva confirmou policies RESTRICTIVE de tenant em fazendas/entregas/registros_consultor e as fontes operacionais amostradas (ordens, lotes, financeiro, fiscal); policies de papel são combinadas com isolamento. A amostra não certifica todas as tabelas/RPCs do sistema nem substitui requisição autenticada.
- Remoto: cores `platform_private.has_role`/`h15_actor_organization` DEFINER com search_path fixo; wrappers públicos INVOKER. `get_my_entitlement_context`, transição de assinatura e listagem tenant observados INVOKER. ACL/corpos de todos os helpers não foram exaustivamente provados.
- Storage vivo: 11 buckets, 10 privados e `logos` público. Policies de clientes/financeiro usam helpers de posse, consultor exige prefixo organização, branding platform exige Superadmin, fiscal é privado. A existência dessas policies não prova download/upload cruzado negado em sessão real. Traversal tem testes unitários, não tentativa autenticada nova.
- `create-user`/list-portal-users e contratos administrativos foram cobertos pelos testes locais (incluindo JWT/tenant/compensação/lock); mocks/contratos não equivalem a chamada Edge autenticada. O deploy v62 anteriormente confirmado é evidência histórica independente, não reimplantação nesta rodada.

### Achados e decisões

| ID | Diagnóstico | Evidência/decisão |
|---|---|---|
| A01 | PortalGuard não aplica isPathEntitled; /portal não tem feature mapeada | Lacuna latente, **não bypass atual comprovado**. Não ampliar mapa/permissões por inferência; sem correção funcional nesta rodada |
| A02 | Configuração fiscal sem a mesma flag de itens irmãos | Pode ser base intencional; não é P1 inequívoco. Nenhuma mudança fiscal |
| A03 | RPC legada set_partner_user_papel aceita link_id e valida papel do ator, sem tenant do alvo no corpo remoto | authenticated tem EXECUTE, anon não. DEFINER escreve partner_users/user_roles; triggers lidos cuidam de gate/revisão/admin global, não comprovam escopo do alvo. **Pendência prioritária de segurança**, sem prova autenticada de exploração nem correção às cegas. Hook existe, mas não é usado pela tabela atual. Ausência de botão não elimina chamada por API |
| A04 | Cobertura integral de Edges/RPCs e adversarial RLS/Storage | Amostra estrutural/read-only apenas; não declarar P0/P1 resolvidos nem isolamento integral novo |

A03 não deve ser descartado como “papéis globais”: admins operacionais são tenant-scoped. Antes de forward-fix é necessário determinar alvo/partner/organization canônicos e testar negativa em sessão real/ambiente autorizado preservando dados. Esta rodada não invocou a RPC. `profiles.updated_at` existe atualmente (1 coluna confirmada), portanto o trigger remoto touch_related_profiles não foi classificado como incompatibilidade com base em relato histórico.

## 6. Evidências executadas e gates

| Verificação | Resultado desta rodada |
|---|---|
| SaaS/RBAC/security/portais/aliases | PASS: 81 arquivos, 904 testes |
| Config/admin/handler create-user | PASS: 20 arquivos, 245 testes; há sobreposição com a suíte anterior, não somar como total único |
| Lint testes/inventário | PASS |
| Lint fontes auditadas | FAIL baseline: useAuth 1 erro no-explicit-any + 3 warnings; fontes não alteradas |
| Scanners fiscal secrets/integration | PASS, sem segredo real/indicador de emissão |
| Typecheck frontend isolado | NOT RUN: execução manual proibida neste ambiente; não inferir PASS pelo Vitest |
| Build | Último sinal automático observado antes da documentação: build OK 21:35:25Z; checar entrada posterior separadamente |
| Advisors Supabase nesta rodada | NOT RUN; números antigos não são novas evidências |
| Banco/RLS | PASS introspecção focal; provas 40/40 anteriores são baseline histórico do executor independente, não nova rodada |
| Browser público | PASS para três redirects /auth e um /app/login; sem autenticação |
| Browser autenticado/forja/isolation/mutações | BLOCKED/UNVERIFIED |

Smoke read-only no domínio `https://app.cultivofarm.com.br`, Chromium 1280×1800: /plataforma, /financeiro/receber e /portal-parceiro/catalogo → /auth; /app/visita/novo → /app/login; Entrar visível, zero pageerror. Captura final inspecionada em /tmp/browser/screens-audit/public_gate.png. A tentativa inicial /app/visita (sem id/novo) não é rota canônica declarada: manteve URL sem login visível; não é prova de acesso autorizado nem falha de guard. Nenhum formulário foi enviado, header/token/credencial registrado ou sessão fabricada. Mobile autenticado não executado.

## 7. Sessões necessárias e fechamento

Primeira sessão necessária: **administrador existente da AR BIOTECNOLOGIA, Gestão v1/TRIAL/10 features**, no domínio oficial. Validar identidade pelo contexto server-side; cenário allowed (visitas/financeiro), denied (produção/catalogo_precos), role-forbidden (plataforma), menus/busca/atalhos/aliases/URL e estados ForaDoPlano; sem mutação comercial. O executor external_unmanaged não pode injetar sessão nem oferecer handoff oficial conhecido; não pedir senha/token em texto.

Depois: admin + usuário existente por Base/Essencial/Gestão/Completo (oito identidades quando existentes), Completo TRIAL separado e Superadmin/non-superadmin; papéis ausentes permanecem arquiteturais/BLOCKED. Confirmar isolamento read-only entre sessões e persistência de cache; teste de mutação sensível só com autorização e alvo descartável/rollback garantido, não contra dados reais.

**NO-GO integral:** browser E2E/autorização real e escopo A03 não certificados. Nenhum novo módulo iniciado; nenhuma alteração comercial/fiscal/cobrança/SMTP/Auth/assinatura. Não há resíduos de fixtures desta rodada porque nenhuma foi criada; não foi feita varredura global de resíduos históricos.

## 8. Matriz integral de rotas (evidência estrutural)

Perfis abaixo são candidatos de ACCESS_MAP, não autorização efetiva. Pais/roles múltiplos/contexto/vínculos/tenant/plano/servidor podem restringir. Sem mapa é “—”; não é concessão automática. Paths/contextos não contêm dados de usuário.

| Rota | Feature | Menu/origem | Perfis candidatos | Guards ancestrais/componentes | Tipo |
|---|---|---|---|---|---|
| /auth | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | AuthRoute | 8 |
| /reset-password | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ResetPassword | 8 |
| /selecionar-portal | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | AuthenticatedShell, SelecionarPortal | 8 |
| /acesso-pendente | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | AuthenticatedShell, AcessoPendente | 8 |
| /sem-permissao | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | AuthenticatedShell, SemPermissao | 8 |
| /plataforma | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | PlataformaGuard, PlataformaHome | 8 |
| /configuracoes/catalogo-ia | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, aplicador, cliente_produtor | PlataformaGuard, ConfigCatalogoIA | 8 |
| /validar-entrega/:token | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ValidarEntrega | 8 |
| /rastrear-produto/:token | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | RastrearProduto | 8 |
| /app/login | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador, cliente_produtor | MobileLogin | 8 |
| /app | — | navigation:m-c-inicio:mobile-consultor,mobile-produtor | administrador, consultor_tecnico, tecnico_agronomo, aplicador, cliente_produtor | AppPortalGuard, MobileLayout, MobileDashboard | 1 |
| /app/perfil | — | navigation:m-perfil:mobile-consultor,mobile-produtor | administrador, consultor_tecnico, tecnico_agronomo, aplicador, cliente_produtor | AppPortalGuard, MobileLayout, MobilePerfil | 1 |
| /app/notificacoes | — | navigation:m-p-notificacoes:mobile-produtor | administrador, consultor_tecnico, tecnico_agronomo, aplicador, cliente_produtor | AppPortalGuard, MobileLayout, MobileNotificacoes | 1 |
| /app/fazendas | — | navigation:m-c-fazendas:mobile-consultor | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileFazendas | 1 |
| /app/registrar | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileRegistrarOcorrencia | 8 |
| /app/atendimentos | — | navigation:m-c-atendimentos:mobile-consultor | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileAtendimentos | 1 |
| /app/registros | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, Navigate | 7 |
| /app/solicitacoes | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, Navigate | 7 |
| /app/ordens | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileOrdens | 8 |
| /app/checkin/:solicitacaoId | visitas_tecnicas | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileCheckin | 8 |
| /app/checkin | visitas_tecnicas | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileCheckin | 8 |
| /app/visita/novo | visitas_tecnicas | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileVisita | 8 |
| /app/visita/:id | visitas_tecnicas | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileVisita | 8 |
| /app/talhao/:id | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileTalhaoHistorico | 8 |
| /app/catalogo | — | navigation:m-c-catalogo:mobile-consultor | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileCatalogoTecnico | 1 |
| /app/recomendacoes | — | navigation:m-p-recomendacoes:mobile-produtor | administrador, cliente_produtor | AppPortalGuard, MobileLayout, ProducerFeatureGuard, MobileRecomendacoesProdutor | 1 |
| /app/entregas | — | navigation:m-p-entregas:mobile-produtor | administrador, cliente_produtor | AppPortalGuard, MobileLayout, ProducerFeatureGuard, MobileEntregas | 1 |
| /app/aplicacoes | — | contextual/sistema | administrador, cliente_produtor | AppPortalGuard, MobileLayout, ProducerFeatureGuard, MobileAplicacoes | 8 |
| /app/aplicacoes/lista | — | contextual/sistema | administrador, cliente_produtor | AppPortalGuard, MobileLayout, ProducerFeatureGuard, MobileListaAplicacoes | 8 |
| /app/solicitar | — | contextual/sistema | administrador, cliente_produtor | AppPortalGuard, MobileLayout, ProducerFeatureGuard, MobileSolicitar | 8 |
| /portal | — | navigation:portal-produtor:desktop, portalMenus:pp-dashboard:producer | administrador, cliente_produtor | PortalGuard, PortalDashboard | 1 |
| /portal/fazendas | — | portalMenus:pp-fazendas:producer | administrador, cliente_produtor | PortalGuard, PortalFazendas | 1 |
| /portal/fazendas/:id | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, PortalFazendaDetalhe | 8 |
| /portal/talhoes | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, Navigate | 7 |
| /portal/talhoes/:id | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, PortalTalhaoDetalhe | 8 |
| /portal/agenda | — | portalMenus:pp-agenda:producer | administrador, cliente_produtor | PortalGuard, PortalAgenda | 1 |
| /portal/registros | — | portalMenus:pp-registros:producer | administrador, cliente_produtor | PortalGuard, PortalRegistros | 1 |
| /portal/registros/:id | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, PortalRegistroDetalhe | 8 |
| /portal/recomendacoes | — | portalMenus:pp-recomendacoes:producer | administrador, cliente_produtor | PortalGuard, PortalRecomendacoes | 1 |
| /portal/fila-aprovacao | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, PortalFilaAprovacao | 7 |
| /portal/acompanhamento | — | portalMenus:pp-acompanhamento:producer | administrador, cliente_produtor | PortalGuard, PortalAcompanhamento | 1 |
| /portal/ordens-servico | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, Navigate | 7 |
| /portal/producao | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, Navigate | 7 |
| /portal/entregas | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, Navigate | 7 |
| /portal/aplicacoes | — | portalMenus:pp-aplicacoes:producer | administrador, cliente_produtor | PortalGuard, PortalAplicacoes | 1 |
| /portal/solicitar | — | portalMenus:pp-solicitar:producer | administrador, cliente_produtor | PortalGuard, PortalSolicitacao | 1 |
| /portal/perfil | — | portalMenus:pp-perfil:producer | administrador, cliente_produtor | PortalGuard, PortalPerfil | 1 |
| /portal/financeiro | — | portalMenus:pp-titulos:producer | administrador, cliente_produtor | PortalGuard, PortalFinanceiro | 1 |
| /portal/meus-pedidos | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, Navigate | 7 |
| /portal-parceiro | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout | 8 |
| /portal-parceiro | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, Navigate | 7 |
| /portal-parceiro/perfil | — | portalMenus:pb-perfil:gestor | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, PortalParceiroPerfil | 1 |
| /portal-parceiro/dashboard | — | portalMenus:pb-dashboard:gestor, portalMenus:pbt-dashboard:tecnico | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroDashboardRouter | 1 |
| /portal-parceiro/pedidos | pedidos_b2b | portalMenus:pb-pedidos:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroMeusPedidos | 1 |
| /portal-parceiro/solicitacoes | pedidos_b2b | contextual/sistema | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroSolicitacoes | 8 |
| /portal-parceiro/novo | pedidos_b2b | contextual/sistema | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroNovoPedido | 8 |
| /portal-parceiro/catalogo | catalogo_precos | portalMenus:pb-catalogo:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroNovoPedido | 1 |
| /portal-parceiro/simulador | simulacoes | portalMenus:pbt-simulador:tecnico | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroNovoPedido | 1 |
| /portal-parceiro/historico | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroHistorico | 8 |
| /portal-parceiro/meu-historico | — | portalMenus:pb-meu-historico:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroMeuHistorico | 1 |
| /portal-parceiro/favoritos | — | portalMenus:pb-favoritos:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroFavoritos | 1 |
| /portal-parceiro/financeiro | — | portalMenus:pb-financeiro:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroFinanceiro | 1 |
| /portal-parceiro/historico-financeiro | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, Navigate | 7 |
| /portal-parceiro/meu-historico-financeiro | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, Navigate | 7 |
| /portal-parceiro/fichas | fichas_tecnicas | portalMenus:pb-fichas:gestor, portalMenus:pbt-fichas:tecnico | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroFichasTecnicas | 1 |
| /portal-parceiro/simulacoes | simulacoes | portalMenus:pbt-simulacoes:tecnico | administrador, gestor_comercial, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroHistoricoSimulacoes | 1 |
| /portal-parceiro/simulacoes-equipe | simulacoes | portalMenus:pb-simulacoes-equipe:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroSimulacoesEquipe | 1 |
| /portal-parceiro/meus-produtores | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroMeusProdutoresTecnico | 8 |
| /portal-parceiro/meus-produtores/:clienteId | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroDetalheProdutorTecnico | 8 |
| /portal-parceiro/tecnicos-produtores | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroTecnicosProdutores | 8 |
| /portal-parceiro/usuarios-clientes | — | contextual/sistema | administrador, gestor_comercial | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroUsuariosClientesB2B | 8 |
| /visita-tecnica | visitas_tecnicas | navigation:visita-tecnica:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo | VisitaRouteGuard, ProtectedRoutes, RoleGuard, VisitaTecnicaLista | 1 |
| /visita-tecnica/nova | visitas_tecnicas | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo | VisitaRouteGuard, ProtectedRoutes, RoleGuard, VisitaTecnica | 8 |
| /visita-tecnica/:id | visitas_tecnicas | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo | VisitaRouteGuard, ProtectedRoutes, RoleGuard, VisitaTecnica | 8 |
| / | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, Index | 8 |
| /clientes | — | navigation:clientes:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, Clientes | 1 |
| /clientes/:id | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, ClienteDetalhe | 8 |
| /parceiros/:id | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, RoleGuard, ParceiroDetalhe | 8 |
| /fazendas | — | navigation:fazendas:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, Fazendas | 1 |
| /fazendas/:id | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, FazendaDetalhe | 8 |
| /talhoes | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, Talhoes | 8 |
| /talhoes/:id | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, TalhaoHistorico | 8 |
| /auditoria | — | navigation:auditorias:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, Auditoria | 1 |
| /auditoria-sync | — | contextual/sistema | administrador, gestor | ProtectedRoutes, Navigate | 7 |
| /base-tecnica | catalogo_precos | navigation:protocolos:desktop, navigation:protocolos-produtos:desktop, navigation:protocolos-microrganismos:desktop, navigation:protocolos-catalogo-tecnico:desktop, navigation:protocolos-culturas:desktop, navigation:protocolos-problemas:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, gestor_comercial | ProtectedRoutes, RoleGuard, Protocolos | 1 |
| /protocolos | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, PreservedNavigate | 7 |
| /ordens-servico | ordens_producao | navigation:ordens-servico:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, RoleGuard, OrdensServico | 1 |
| /lotes | lotes_qualidade | navigation:lotes:desktop | administrador, gestor, administrativo, producao, financeiro | ProtectedRoutes, RoleGuard, Lotes | 1 |
| /controle-qualidade | lotes_qualidade | navigation:cq:desktop | administrador, gestor, administrativo, producao | ProtectedRoutes, RoleGuard, ControleQualidade | 1 |
| /envase | envase | navigation:envase:desktop | administrador, gestor, administrativo, producao | ProtectedRoutes, RoleGuard, EnvasePage | 1 |
| /estoque | estoque_embalagens | navigation:estoque:desktop | administrador, gestor, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, Estoque | 1 |
| /estoque/embalagens | estoque_embalagens | contextual/sistema | administrador, gestor, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, EstoqueEmbalagens | 8 |
| /entregas | — | navigation:entregas:desktop | administrador, gestor, administrativo, operador_onfarm, producao, aplicador, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, Entregas | 1 |
| /entregas/:id/formulario | — | contextual/sistema | administrador, gestor, administrativo, operador_onfarm, producao, aplicador, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, FormularioEntregaPrint | 8 |
| /etiquetas/:id/imprimir | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, RoleGuard, EtiquetaProdutoPrintPage | 8 |
| /aplicacoes | — | navigation:aplicacoes:desktop | administrador, gestor, administrativo, aplicador, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, Aplicacoes | 1 |
| /relatorios | relatorios_operacionais | navigation:relatorios:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, Relatorios | 1 |
| /consultor-tecnico | — | navigation:equipe-tecnica:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor | ProtectedRoutes, RoleGuard, ConsultorTecnico | 1 |
| /fluxo-tecnico | — | navigation:fluxo-tecnico:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, FluxoTecnico | 1 |
| /bi-agronomico | paineis_executivos | navigation:bi-agronomico:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, BIAgronomico | 1 |
| /bi-operacional | paineis_executivos | navigation:bi-operacional:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, BIOperacional | 1 |
| /alertas-operacionais | — | navigation:alertas:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, AlertasOperacionais | 1 |
| /previsao-agronomica | recomendacoes_alertas | navigation:previsao-climatica:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm | ProtectedRoutes, RoleGuard, PrevisaoAgronomica | 1 |
| /solicitacoes | — | navigation:solicitacoes:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo | ProtectedRoutes, RoleGuard, Solicitacoes | 1 |
| /monitoramento-alertas | recomendacoes_alertas | navigation:monitoramento:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo | ProtectedRoutes, RoleGuard, MonitoramentoAlertas | 1 |
| /agenda-tecnica | visitas_tecnicas | navigation:agenda-tecnica:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo | ProtectedRoutes, RoleGuard, AgendaTecnica | 1 |
| /dashboard | — | contextual/sistema | administrador, gestor | ProtectedRoutes, PreservedNavigate | 7 |
| /dashboard/geral | — | navigation:dashboard:desktop, navigation:dashboard-geral:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, DashboardUnificado | 1 |
| /dashboard/executivo | paineis_executivos | navigation:dashboard-executivo:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, DashboardUnificado | 1 |
| /dashboard/operacional | — | navigation:dashboard-operacional:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, DashboardUnificado | 1 |
| /painel-operacional | — | contextual/sistema | administrador, gestor | ProtectedRoutes, PreservedNavigate | 7 |
| /cockpit-laboratorio | ordens_producao | navigation:cockpit-lab:desktop | administrador, gestor, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, CockpitLaboratorio | 1 |
| /financeiro | — | navigation:fin-dashboard:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinanceiroDashboard | 1 |
| /financeiro/receber | contas_receber | navigation:fin-receber:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, ContasReceber | 1 |
| /financeiro/pagar | contas_pagar | navigation:fin-pagar:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, ContasPagar | 1 |
| /financeiro/categorias | — | navigation:fin-categorias:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinCategorias | 1 |
| /financeiro/centros-custo | — | navigation:fin-cc:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinCentrosCusto | 1 |
| /financeiro/contas-bancarias | — | navigation:fin-contas-bancarias:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinContasBancarias | 1 |
| /financeiro/formas-pagamento | — | navigation:fin-formas-pgto:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinFormasPagamento | 1 |
| /financeiro/recorrencias | — | navigation:fin-recorrencias:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinRecorrencias | 1 |
| /financeiro/fluxo-caixa | fluxo_caixa | navigation:fin-fluxo:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinFluxoCaixa | 1 |
| /financeiro/dre | — | navigation:fin-dre:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinDRE | 1 |
| /financeiro/notas-fiscais | emissao_nfe_nfse | navigation:fin-nfe:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinNotasFiscais | 1 |
| /financeiro/entregas-nao-faturadas | — | navigation:fin-ent-nfat:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinEntregasNaoFaturadas | 1 |
| /financeiro/auditoria | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, Navigate | 7 |
| /financeiro/configuracoes | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, Navigate | 7 |
| /financeiro/relatorios | — | navigation:fin-relatorios:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinRelatorios | 1 |
| /financeiro/relatorios/mensal | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelMensal | 8 |
| /financeiro/relatorios/contas-receber | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelReceber | 8 |
| /financeiro/relatorios/contas-pagar | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelPagar | 8 |
| /financeiro/relatorios/inadimplencia | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelInadimplencia | 8 |
| /financeiro/relatorios/nfe-pendente | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelNFePendente | 8 |
| /financeiro/relatorios/entregas-faturamento | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelEntregasFat | 8 |
| /financeiro/relatorios/por-cliente | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelPorCliente | 8 |
| /financeiro/relatorios/prestacao-contas | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelPrestacaoContas | 8 |
| /financeiro/recibos | — | navigation:fin-recibos:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinRecibos | 1 |
| /executivo | paineis_executivos | contextual/sistema | administrador, gestor | ProtectedRoutes, PreservedNavigate | 7 |
| /portal-executivo | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, PreservedNavigate | 7 |
| /comercial/parceiros | — | contextual/sistema | administrador, gestor_comercial | ProtectedRoutes, Navigate | 7 |
| /comercial/pedidos-b2b | pedidos_b2b | navigation:com-pedidos-b2b:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, PedidosB2B | 1 |
| /comercial/solicitacoes-b2b | pedidos_b2b | navigation:com-solicitacoes-b2b:desktop | administrador, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, ComercialSolicitacoesB2B | 1 |
| /comercial/dashboard-b2b | — | contextual/sistema | administrador, gestor_comercial | ProtectedRoutes, Navigate | 7 |
| /comercial/campanhas | — | navigation:com-campanhas:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, CampanhasComerciais | 1 |
| /comercial/simulador | simulacoes | navigation:com-simulador:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, SimuladorComercial | 1 |
| /comercial/catalogo | — | contextual/sistema | administrador, gestor, gestor_comercial | ProtectedRoutes, PreservedNavigate | 7 |
| /comercial/indicadores | — | navigation:com-indicadores:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, IndicadoresComerciais | 1 |
| /comercial/alertas | — | navigation:com-alertas:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, AlertasComerciais | 1 |
| /comercial/dashboard-consolidado | — | navigation:com-consolidado:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, DashboardConsolidadoB2B | 1 |
| /comercial/condicoes-pagamento | catalogo_precos | navigation:com-condicoes-pagamento:desktop | administrador, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, CommercialPaymentPlansPage | 1 |
| /comercial/auditoria-motor-b2b | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, RoleGuard, AuditoriaMotorB2B | 8 |
| /operacao/planejamento | ordens_producao | navigation:planejamento-producao:desktop | administrador, gestor, producao, gestor_comercial | ProtectedRoutes, RoleGuard, PlanejamentoProducao | 1 |
| /operacao/planejamento/:id | ordens_producao | contextual/sistema | administrador, gestor, producao, gestor_comercial | ProtectedRoutes, RoleGuard, PlanejamentoProducaoDetalhe | 8 |
| /operacao/dashboard-producao | ordens_producao | navigation:dashboard-producao:desktop | administrador, gestor, producao, gestor_comercial | ProtectedRoutes, RoleGuard, DashboardProducao | 1 |
| /financeiro/b2b | — | navigation:b2b-visao:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, FinanceiroB2B | 1 |
| /financeiro/b2b/dashboard | — | navigation:b2b-dashboard:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, DashboardFinanceiroB2B | 1 |
| /financeiro/b2b/governanca | — | navigation:b2b-governanca:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, GovernancaFinanceiraB2B | 1 |
| /financeiro/b2b/aging | — | navigation:b2b-aging:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, AgingFinanceiroB2B | 1 |
| /financeiro/b2b/previsao | — | navigation:b2b-previsao:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, PrevisaoReceitaB2B | 1 |
| /financeiro/b2b/rentabilidade | — | navigation:b2b-rentabilidade:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, RentabilidadeParceirosB2B | 1 |
| /financeiro/b2b/alertas | — | navigation:b2b-alertas:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, AlertasFinanceirosB2B | 1 |
| /financeiro/b2b/central-governanca | — | navigation:b2b-central-gov:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, CentralGovernancaB2B | 1 |
| /financeiro/b2b/regras | — | navigation:b2b-regras-gov:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RegrasGovernancaB2B | 1 |
| /executivo/socios-b2b | paineis_executivos | navigation:b2b-socios:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, DashboardSociosB2B | 1 |
| /configuracoes | — | navigation:configuracoes:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, aplicador, cliente_produtor | ProtectedRoutes, RoleGuard, Configuracoes | 1 |
| /configuracoes/objetivos-visita | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, aplicador, cliente_produtor | ProtectedRoutes, RoleGuard, ObjetivosVisita | 8 |
| /configuracoes/parametros-cq | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, aplicador, cliente_produtor | ProtectedRoutes, RoleGuard, ParametrosCQPage | 8 |
| /configuracoes/fiscal/empresa | — | navigation:config-fiscal:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalEmpresa | 1 |
| /configuracoes/fiscal/produtos | — | navigation:fiscal-perfis-produtos:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalProdutos | 1 |
| /configuracoes/fiscal/servicos | — | navigation:fiscal-perfis-servicos:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalServicos | 1 |
| /configuracoes/fiscal/clientes | — | navigation:fiscal-perfis-clientes:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalClientes | 1 |
| /fiscal/perfis/produtos | emissao_nfe_nfse | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, PreservedNavigate | 7 |
| /fiscal/perfis/servicos | emissao_nfe_nfse | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, PreservedNavigate | 7 |
| /fiscal/perfis/clientes | emissao_nfe_nfse | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, PreservedNavigate | 7 |
| /fiscal/documentos | emissao_nfe_nfse | navigation:fiscal-rascunhos:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalDocumentos | 1 |
| /fiscal/reconciliacao | emissao_nfe_nfse | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalReconciliacao | 8 |
| /fiscal/prontidao | emissao_nfe_nfse | navigation:fiscal-prontidao:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalProntidao | 1 |
| /comunicacao | envios_automaticos | navigation:comunicacao-admin:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, ComunicacaoRouteGuard, ComunicacaoAdminPage | 1 |
| /notificacoes | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, CentralNotificacoes | 8 |
| * | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | NotFound | 8 |
