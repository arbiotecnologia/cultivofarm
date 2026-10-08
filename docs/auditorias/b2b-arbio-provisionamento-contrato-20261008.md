# Provisionamento B2B — preparação do contrato, mesma auditoria

## Matriz integrada e gates

| Elo | Fonte/caminho existente | Evidência e limite | Gate para restauração |
|---|---|---|---|
| Administrador A | Configurações/create-user; ator ativo, papel e tenant derivados | Allowlist interna exclui B2B; vínculos negados antes de Auth | Autorizar operação específica, sessão vigente e plano sem ampliar papéis |
| Owner comercial | partner_accounts.commercial_owner_organization_id | Único parceiro fixture owner AR Bio confirmado Codex | Preservar owner; não inferir por CNPJ, cliente opcional ou legado NULL |
| Identidade comercial | profiles.organization_id | Decisão humana: mesmo tenant do commercial_owner_organization_id | Vínculo único ao parceiro e role exclusivamente B2B; nenhum acesso geral ao owner |
| Papel | public.user_roles | Dois papéis B2B existentes; não habilitados neste recorte | Papel mínimo protegido, sem roles extras; separação gestor/técnico |
| Vínculo | partner_users / usePartnerUsers / link_partner_user | UI e mutações fechadas; SELECT administrativo escopado | Cadeia owner→identidade→parceiro autoritativa e atomicidade/compensação |
| Primeiro acesso | Fluxos existentes de convite/definição de senha | Não executados; nenhum Auth/credencial/convite criado | Titular define senha, ação humana e efeitos externos controlados |
| Portal | get_my_available_portal_contexts / b2b_actor_scope / B2BRouteGuard | organizations.partner_account_id deve coincidir com vínculo único | Resolver compartilhado seguro, sem acesso geral entre A e P |
| Financeiro | internal_origin_snapshot / generate_b2b_receivable_secure | B2B_INTERNAL_DOWNSTREAM_UNVERIFIED permanece | Credor/emissor e cadeia downstream determinísticos; zero cobrança real |

**Decisão humana supersedente:** parceiro é cliente comercial de AR Bio, não assinatura/empresa SaaS independente. A implementação integrada está autorizada, mas não basta acrescentar B2B ao dropdown. Identidade pertence ao owner comercial com único papel/vínculo; o ramo tenantP legado só permanece quando explícito e comprovado, sem inferência P=A nem mudança de organizations.partner_account_id. Testes de proposta não constituem autorização server-side.

## Casos executáveis e procedência

`src/test/config/b2bProvisioning.proposal.test.ts` prepara 15 casos locais: candidato próprio no tenant owner explicitamente escolhido; parceiro alheio/órfão/inativo; ator inativo; usuário alheio/inativo; papel extra/reservado; duplicidade de vínculo; sessão antiga; plano ausente; cancelamento; falha parcial e evidência de compensação. Não há chamadas remotas nem importação pelo aplicativo. Compensação é pré-condição proposta, não afirmação de que já existe no fluxo B2B vivo.

`partnerUsers.session.test.tsx` executa hooks reais com Supabase mockado e conserva zero chamadas nas três mutações bloqueadas. `create-user-edge-handler.test.ts` executa handler real com SDK/Auth isolados: negativas de role/vínculo e compensação existentes, sem tratar mock como JWT real. Formulário real testado com mutações mockadas preserva razão social vazia como string para validação obrigatória e mantém opcionais nulos, CNPJ repetido rejeitado, draft/ID e lock atuais.

## Fixture, efeitos e rollback

Continuar somente com `7e52de9a-4bed-4d1e-8200-3255a805465c`, criado via UI por Codex; não duplicar nem limpar nesta rodada. Manifesto mantém owner, autor, data, 1 audit, 0 pedidos e ausência de Auth. Flags globais não demonstram envio por cadastro; verificar efeitos da próxima ação. Rollback desta correção local limita-se à normalização do formulário; nunca reabre RPCs executivas/financeiras nem altera dados persistidos.

**GO preparação e correção focal local; NO-GO provisionamento/login/faturamento e auditoria integral.** Executivo19 e DRIFT-EMAILv9 preservados. Sem nova fase ou publicação automática.

## Recorte implementado — resolver e leitura, 2026-10-08

Migrations canônicas `20261008212043_b3b02dba-c8f9-4dbb-beb4-52d77aae3f62` e `20261008212122_8dd540c1-9802-44c0-86c4-cf854f3c693e` adicionam `get_my_commercial_partner_context`, fachada SECURITY INVOKER, e core privado SECURITY DEFINER com search_path vazio. A primeira facade DEFINER foi substituída imediatamente; EXECUTE anon=false/authenticated=true, USAGE privado=true verificados read-only. O helper valida ator pronto/h15, role única B2B, vínculo único/papel coerente, parceiro ativo/owner, organização ativa e entitlement catálogo. Não altera RLS, resolver legado, vínculos ou Auth. Não afirmar ausência de todos warnings: advisor completo posterior não executado.

`useMyPartner` consome a consulta canônica, valida resposta unknown e cerca geração/logout/role/tenant; sem fallback gestor. `usePartnerUsers` prova commercial_owner diretamente, sem exigir cliente opcional, e filtra roles exclusivas. Mutações continuam bloqueadas. Tipos gerados não editados; fronteira SDK local para RPC aditiva com validação de resposta.

Teste PostgreSQL isolado: 22 asserções em um teste, RLS sintética de consumo com dois parceiros do mesmo tenant e um de outro, roles/links extras, sessão/entitlement/ativos/órfãos e ramo legado explícito, tudo rollback. Isso **não certifica RLS das tabelas reais nem JWT**. Hooks têm testes com SDK mockado.

**Pendências reais de implementação, não decisão humana:** contexto de portais/guards, catálogo/preço/pedidos, financeiro/Storage por parceiro, demais canais same-tenant e provisionamento existente com compensação/idempotência/primeiro acesso titular. O novo resolver não habilita esses canais. Dropdown permanece fechado até essas provas; nenhum Auth/envio/fixture novo ou publicação. Rollback seguro do recorte remove consumidores/consulta aditiva após dependências, nunca restaura exposições nem desfaz Executivo19/DRIFT-EMAILv9.

Verificações finais: 34/34 testes4arquivos, lint6arquivos, scanner segredos e diff-check PASS; build automático OK21:24:56Z. Typecheck app/node separado NOT RUN pela restrição do harness. Ledger remoto confirmado; migration local não materializada pela ferramenta, sem cópia manual. Não certificar advisor/RLS real/JWT/browser ou habilitação de contas com estes resultados.

## Continuação21:38 — implementação parcial, não habilitação de contas

Migrations oficiais `20261008213523` e `20261008213604` aplicadas no canônico: projeção mínima própria sem preço/desconto/documentos e preflight administrativo actor-derived, mais integração do contexto de portais existente ao resolver comercial exclusivo. Fachadas novas INVOKER, cores privados DEFINER/search_path vazio; anon EXECUTE false, authenticated true confirmados read-only. `get_user_partner_id`, `b2b_actor_scope`, `assert_b2b_partner_scope` e phase1 permanecem inalterados: ampliar seus callers ainda não foi autorizado por prova de isolamento.

`create-user` local chama preflight com bearer do ator e nega roles cumulativas/duplicadas, papel incoerente, cliente extra e owner de resposta divergente antes de Auth. Mesmo resposta remota `enabled=true` não abre criação: este recorte não tem claim/finish seguro. Perfil/roles/partner_users ainda NÃO são provisionados. Configurações mantém seletor fechado, não pede senha B2B nem envia convite. Primeiro acesso existente foi inspecionado: `platform_first_access_pending` exige estado server-only, e finalizador prova AMR/iat; não basta metadata ou email_confirm.

Guard B2B exige role exclusiva e projeção própria além do contexto. Layout commercial_owner exibe identidade própria e indisponibilidade, sem montar Outlet de pedidos/catálogo/simulações/financeiro/perfil-Storage; branding recebe alvo nulo. Isso contém a interface, **não prova containment de todos endpoints acessíveis ao mesmo tenant**. Por essa razão contas continuam bloqueadas e o objetivo de provisionamento ativo ainda NÃO foi entregue.

94/94 testes em6arquivos PASS; um teste contém35asserções PostgreSQL isolado, SQL das migrations reais reutilizado no harness, dependências Auth/entitlement/legacy ainda substituídas localmente. RLS `test_orders` é sintética, não policies completas de produção. Dois parceirosA e parceiroB, projeção própria, anon, papel técnico, roles extras/vínculos duplicados, owner cruzado, preflight e guard testados; SDK Auth mock, zero Auth real. Lint6 arquivos/scanner/diff PASS; build automáticoOK21:37:39. Typecheck app/node manual NOT RUN conforme restrição do ambiente. Duas migrations auxiliares `20261008213641`/`20261008213722` contêm somente SELECT1, chamadas de ferramenta desnecessárias, sem correção funcional nem dados; registradas sem apagar ledger/histórico.

389 achados do advisor preexistentes, zero novos segundo ferramenta:15INFO RLSsemPolicy,2WARN definerPUBLIC,371WARN definer authenticated,1WARN proteção senha vazada desativada. Não chamar advisor global PASS. Nenhuma alteração de Executivo19/emailv9/faturamento ou organizações, nenhuma nova fixture/Auth/envio/publicação.

Rollback seguro: retirar consumidores novos e fechar EXECUTE das consultas aditivas; contexto pode ser contido sem reabrir escopo global. Não reutilizar resolução arbitrária do primeiro vínculo, restaurar Executivo nem apagar fixture/audits. Próximo trabalho obrigatório: inventário/containment same-tenant completo, provisionamento idempotente/compensado com primeiro acesso titular, provas policies reais e somente então seletor. **GO consultas próprias focais; NO-GO provisionamento/login/faturamento/integral; não declarar solicitação concluída.**

Revalidação final21:38: **113/113 testes8arquivos PASS**, incluindo Gestão/contextos/cache; PostgreSQL agora carrega diretamente213523/213604 versionadas, com35asserções. Não somar94anteriores. Diff-check PASS e build automáticoOK21:38:29; permanecem as limitações de dependências SQL substituídas, RLSsintética e ausênciaJWT/browser/typecheckmanual. A projeção própria está disponível, mas o recorte integrado ativo pedido não está concluído.

## Recorte21:44 — leitura funcional de pedidos próprios

Migration oficial `20261008214232_5dcbe466-a0be-40f6-b6ea-270aa97bc45b.sql` aplicada após testes: `get_my_commercial_orders_projection()` não aceita ID do caller; deriva vínculo único pelo core comercial, verifica owner ativo e retorna somente id/número/status/data dos próprios pedidos, até100. Sem total/juros/custo/cliente/notas internas/documentos e sem alterar pedido/snapshot. Role técnica negada; façade INVOKER/private core DEFINER/search_path vazio, anon EXECUTE false confirmados read-only. Nenhum helper legado/RLS foi relaxado. O layout comercial monta somente esta lista própria para gestorB2B e continua sem Outlet de canais não escopados.

Rodada9arquivos **123/123 PASS**, contendo40asserçõesPGisolado. Negativas sibling/tenantB, técnico e ACL anon; cliente rejeita owner de resposta divergente e campos financeiros/notas extras; logout, troca de parceiro e resposta atrasada de identidade testados com SDK mock. Dois erros detectados pelo typecheck automático (`replaceAll`/tabela parametrizada) corrigidos; reexecução11/11focal e lint4/diffPASS; prévia **buildOK21:43:43**. Scanner fiscal segredosPASS. Typecheck app/node manual separado NOT RUN; não confundir log automático com comando independente. Não há JWT/consulta autenticada real do novo usuário: **Authenticated path: UNVERIFIED**.

Inventário SQL vivo read-only localizou43 consumidores diretos dos helpers legados (inclui wrappers/cores, não todos os consumidores transitivos). Famílias: pedidos/aprovação/recebível/crédito; catálogo/preços/simulações; clients/técnicos; dashboard/histórico/mensagens; guards de estoque. `get_user_partner_id` continua LIMIT1, `b2b_actor_scope` continua org.partner_account_id; **não substituir genericamente**. Policies de receivable contêm seleção por partner_users + tenant, mas isso não certifica todos os endpoints service/definer. RPCs próprias novas não usam estes guards legados nem abrem catálogo/financeiro.

Rollback preparado em `scripts/rbac-audit/b2b-commercial-own-orders.rollback.sql`, não executado; revoga apenas acesso cliente à nova leitura e preserva dados/histórico/serviceACL. **PASS funcional local de leitura própria; NO-GO criação/login/faturamento/integral.** Provisionamento idempotente/compensado, first-access titular e contenção completa same-tenant continuam não entregues; falta é implementação/prova, não decisãoA/P nem exigência de novo login. Nenhum Auth/envio/fixture/publicação neste recorte.389achados preexistentes do advisor não foram corrigidos nem classificados comoPASS.