# Provisionamento B2B — preparação do contrato, mesma auditoria

## Continuação21:55 — contenção de tabela real aplicada, provisionamento aberto

Destino comprovado pela marca canônica `swzpzcwiasxmjutrmvkm`. As cinco policies vivas de `partner_accounts`, incluindo a combinação permissiva/restritiva, foram copiadas para `scripts/rbac-audit/b2b-partner-real-policies.sql`; helpers has_role/h15/readiness/get_user_partner_id usam definições vivas. Harness `scripts/tests/b2b-partner-real-rls-local.py` cria DDL mínimo dessa tabela real e dependências, **não test_orders**, Auth/iat simulados, sem triggers/DDL integral de produção. Reproduziu técnico lendo desconto25/limite1000 do próprio parceiro, sem irmãos/tenantB. Portanto risco financeiro técnico não é mais apenas relato; prova local com policies reais, não JWT vivo.

Migration oficial `20261008215514_35afd7bc-aadd-43ee-8e0f-569b728d2432` aplicada após replay positivo/negativo: adiciona apenas policy RESTRICTIVE e helper privado DEFINER/search_path vazio. Técnico B2B e gestor commercial_owner não acessam diretamente linha completa; projeções mínimas próprias já existentes continuam caminho separado. Detecção de role é independente de readiness para não desaparecer em primeiro acesso/inatividade ou com papel extra. ACL anon=false/authenticated+service=true confirmadas; nenhuma ampliação de grants ou alteração de organizações/dados. Não fecha automaticamente outras tabelas/RPCs/Edges/Storage, nem prova negação financeira em todas elas.

Os testes também revelaram risco da policy **legada**: ator interno com partner_users residuais, movido para tenantB, retém leitura pelo ramo self-link/LIMIT1. O replay registra esse resultado (2linhas:umaA+umaB) antes de remover somente links locais; administração B sem vínculo residual lê somente sua linha. Não ocultar a hipótese inválida nem chamar isto de isolamento de todos atores internos: exige revisão específica do ramo self/imutabilidade de vínculos. Nenhum ator remoto foi modificado. Treze asserções SQL em um teste Vitest; não contar como13testes independentes.

### Bloqueadores exatos, sem nova decisão de negócio

| Ponto | Condição ainda não satisfeita |
|---|---|
| Superfície geral | 256tabelas public/647policies,30policiesStorage e538RPCspúblicas+31privadas executáveis authenticated inventariadas por contagem, não revisadas integralmente; referências diretas legadas34+6, SQL dinâmico5funções. Contagem não autoriza ativação. |
| Clientes vinculados | get_b2b_user_clients_secure executável authenticated; corpo DEFINER usa vínculos/roles antigos e devolve telefone/cidade/estatísticas, sem validar o contrato commercial_owner em todos caminhos. Nenhuma leitura de PII remota realizada. |
| Mensagens | rpc_message_set_status executável authenticated autoriza via get_user_partner_id/LIMIT1, sem core owner/roleúnica antes do UPDATE. Mutação não executada. |
| Storage | Policy de upload logo parceiro usa partner_users.papel=gestor/path; composição das30policies e helpers ainda não certificada, nenhum byte/upload/download. |
| Claim/idempotência | Nenhum receipt/lease/fencing B2B liga preflight ao novo AuthID e à compensação; unicidade email/lock local não substituem contrato distribuído. |
| Finish | Falta transação autoritativa profile tenant derivado+role exclusiva+partner_users e prova de replay/falha/compensação parcial com definições reais. |
| Primeiro acesso | Finalizador existente exige estado server-only/AMR/iat; fluxo de convite admin existente é específico do administrador provisionado, não deve ser reutilizado como autorização B2B ou emitir link ao operador. Nenhuma senha/link/Auth criado. |
| Seletor | create-user segue503 antes Auth; seletor fechado. Backend ainda não pode atestar containment total, portanto nenhuma flag cliente habilita. |

Validações: rodada criação+vínculos+primeiro acesso+RLS teve70PASS/1FAIL em71testes; falha é asserção textual histórica que espera URL literal no arquivo redirect-policy agora re-exportado de `_shared`, não falha de fluxo Auth executado. Nenhum ajuste oportunista ao fluxo emailv9. Focal anterior9/9PASS em3arquivos, lint novo/scanner fiscal-secrets/diffPASS; não somar sobreposições. Build automáticoOK21:55:34; typecheck manual não executado por restrição do harness. Advisor389preexistentes sem novos:15INFO/2WARNPUBLIC/371WARNauthenticated/1proteção senha; não classificar globalPASS.

Revalidação final21:58:45: **59/59 testes em4arquivos PASS** (37handler,14vínculos,7cache,1PostgreSQL com13asserções); lint novo/diffPASS,scannerPASS e build automáticoOK21:58:38. Corrigida a expectativa do risco legado: LIMIT1 preserva uma linhaA, não duas; a evidência positiva não foi mascarada. A falha textual first-access da rodada ampliada permanece documentada, não incluída nestes59.

Executivo19 conferido read-only:16corpos EXECUTIVO_SOURCE_UNAVAILABLE com ACLanon/authenticated negada,19total. emailv9 não editado/reimplantado. Rollback seguro é sucessor de contenção que preserve negação direta financeira até projeção autorizada; não remover esta policy para restaurar exposição. **PASS contenção focal aplicada; NO-GO provisionamento/login/faturamento/integral. Objetivo de provisionamento mínimo ativo ainda não entregue; pendências são implementação/prova, não nova decisão humana.**

## Revisão independente21:45 — implantação comprovada, gate técnico não satisfeito

Evidência independente recebida: core/fachada do recorte `e2733c` **já estão implantados** no Supabase canônico `swzpzcwiasxmjutrmvkm`, com paridade exata dos corpos SQL verificada; EXECUTE anon=false, core SECURITY DEFINER, fachada SECURITY INVOKER e search_path vazio. Não descrever estes resolvers como apenas locais nem estender sua paridade a todas as policies/RPCs/Edges/Storage. Esta rodada registra a revisão, sem nova consulta remota ou implantação.

**Risco financeiro técnico relatado:** `partner_accounts_self_select` permite a role `parceiro_b2b_tecnico` ler a linha inteira, inclusive campos financeiros. Sem prova de negação direta na tabela/RPC, **NO-GO provisionamento técnico**. Projeção mínima e ocultação UI não contêm acesso direto; revisar a composição de todas as policies/grants/callers antes de desbloquear. Nenhuma conta técnica foi criada nem policy alterada nesta integração da nota.

A leitura do arquivo atual `useMyPartner.ts` nesta rodada não encontrou retorno de `desconto_padrao`: o hook reconstrói apenas id/código/nome/ativo/papel/modo; o SQL de projeção revisado também não inclui desconto. Portanto, a afirmação independente sobre o hook é registrada como divergência de revisão, **não como vazamento atual reproduzido ou correção backend concluída**. Regressão local confirma que campos financeiros extras não chegam ao resultado para gestor ou técnico; isso não prova negação de SELECT/RPC financeiro.

Foco imediato permanece **gestor comercial parceiro_b2b**, exclusivamente seus pedidos/financeiro. Somente resumo próprio de pedidos está ativo neste recorte; financeiro próprio ainda indisponível, sem inventar preços/planos. Técnico/provisionamento/primeiro acesso continuam bloqueados até contratos e provas necessários; nenhuma fixture Auth antes do primeiro acesso humano. Executivo19/emailv9 preservados; NO-GO login/faturamento/integral.

Validação desta nota21:46: **17/17 testes em2arquivos PASS**, incluindo2regressões de campos financeiros extras no resultado do hook (gestor/técnico, transporte mockado). Lint do teste, scanner fiscal-secrets e diff-check PASS; log automático **build OK21:46:42Z**. Typecheck separado não executado. Nenhuma prova nova de negação financeira direta tabela/RPC ou JWT; não somar estes17 aos123 anteriores como casos independentes.

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