# Retomada delta — Cultivo Farm / RENATO 10K

## 1. Escopo e decisão
**Adendo prioritário19:53–20:03UTC — P1 DRIFT-EMAIL:** a afirmação anterior de nenhum P1 descreve a rodada anterior ao achado independente. Foi autorizada e solicitada explicitamente a implantação somente da Edge de troca de email; **não é sustentado afirmar alcance exclusivo**, pois o Codex mediu alteração de versões nas41funções. Fonte viva pós-deploy **VERIFICADA** pelo Codex; não houve publicação frontend solicitada pelo agente. Resultado focal e limites abaixo; NO-GO integral preservado. Continuação20:03UTC somente documental/investigação read-only, sem novos deploys, migrations, envios ou mutações.
Auditoria inicial sem nova funcionalidade, publicação frontend, emissão, cobrança, mensagens, Auth, fixtures ou alterações comerciais; autorização posterior de deploy focal DRIFT-EMAIL descrita acima. **NO-GO integral**. Inventário completo não é certificação semântica nem prova autenticada. Nenhum P0/P1 funcional foi comprovado na rodada inicial anterior ao adendo; não houve reabertura de permissões.

## 2. Referências Git e ancestralidade
Base `ecff53113532b7d8363618f9c479b9e357d822c9`; HEAD inicial `7d030dc426faa821621b39822a9b784863c6ff14`. `git merge-base --is-ancestor BASE HEAD` exit0; merge-base igual à base; 643 commits intermediários. Worktree inicial limpa. Não foi usada aceitação de SHA pela API como prova.

O harness registrou automaticamente as duas correções e a entrada inicial do roadmap em `2a59e27d8988cebe76e04da168f1111fbfa3e402` (3 arquivos,8adições/2remoções). Não foi executado comando Git stateful. Os documentos finais são alterações posteriores; o SHA final pode ser atribuído pelo harness após esta mensagem. A referência inicial permanece congelada nos inventários para não alterar o objeto auditado.

## 3. Histórico completo e delta
Pasta `docs/auditorias/retomada-delta-2026-10-08/`: `commits.csv`643linhas, `commits-arquivos.csv`1027linhas, `historico-completo.txt`, `delta-completo.patch`, `arquivos.csv`394arquivos, `migrations.csv`119adições. Delta base→HEAD inicial:31.752adições/2.044remoções. Todas as etapas intermediárias constam no histórico, inclusive commits de documentação/automáticos.

Os CSVs incluem SHA, superfície, sinais de comportamento extraídos do diff, referências verificáveis e limites. **Classificação esperada/dívida é heurística transparente, não revisão humana integral de 643 commits.** Prioridade e ausência de regressão ficam UNVERIFIED quando não há reprodução. O requisito de classificação semântica exaustiva está pendente; nomes de commits não foram usados como prova de comportamento.

## 4. Método e integridade
Git read-only, lint base via `git archive`, AST de rotas, grafo transitivo de imports/chamadas, testes locais, browser público e consultas SELECT no canônico. Cada arquivo de delta possui hash SHA256 do diff; migrations têm hash do conteúdo local. Sem SQL de alteração nem SET ROLE nesta rodada. Hash de arquivo não prova equivalência de corpo aplicado no banco.

## 5. Ambiente canônico
`lovable supabase info --json` confirmou produção `swzpzcwiasxmjutrmvkm` e URL canônica antes das consultas. CLI query recusou backend user-managed; consultas seguintes foram read-only pela ferramenta Supabase. Não foi acessada homologação. Sem export de credenciais, tokens, DSNs ou dados pessoais.

## 6. Migrations, RLS e RPCs
### Adendo DRIFT-EMAIL — dependências vivas
SELECTs desta rodada confirmaram begin/claim/finish/complete SECURITY DEFINER/search_path vazio, anon/authenticated EXECUTE negado e service_role permitido (resultado da consulta inicial completa). Begin usa require_provisioned_admin_target e service-only, idempotency/lock/colisão; claim exige target, lease2min/cooldown5min/limite20/ambiguous confirmation; finish exige lease não expirado; complete exige confirmation_sent_at, auth.users.email confirmado e email_change vazio, além de tenant/profile/provisioning provenance. Helpers privados têm ACL fechada e require_provisioned_admin_target exige profile/organization ativos, administrador real e request_id server-side. RLS ativo em invites/email_changes/audit. Não houve execução dessas RPCs com alvo real.

`rpc_service_load_provider_runtime_config` não apareceu no catálogo consultado: dependência operacional não comprovada, loader existente retorna fail-closed em erro. Não foi habilitada entrega nem adicionado secret/provider. Política hospedada Secure Email Change não lida; branch local suporta configuração com/sem confirmação no endereço antigo, mas sempre exige confirmação Auth no novo, sem updateUserById. A substituição remove o bypass administrativo independentemente de entrega estar pronta.
Ledger canônico:288versões, de20260911004353 a20261037000000. As119adições do delta constam na lista consultada; presença não prova paridade de conteúdo. Nenhuma reaplicada/alterada/removida.

ACL selecionada: `assign_b2b_user_client_secure`, `unassign_b2b_user_client_secure`, `cancel_b2b_receivable_secure`, `link_partner_user`, `set_partner_user_papel` continuam sem EXECUTE anon/authenticated; service_role preservado. `rpc_cc_simulate_price`, `rpc_estoque_reservar_v1` e `rpc_salvar_aplicacao_v1` têm authenticated EXECUTE, que sozinho não autoriza operação. Aplicação é INVOKER e seu corpo levanta `STORAGE2_APPLICATION_CONTRACT_UNAVAILABLE`.

`partner_clients`/`partner_user_clients` mantêm restrictive false `bf02_assignment_contract_containment`. Recebíveis mantêm tenant restriction organization_id/h15; movimentos mantêm contenção por lote/propriedade. `generate_b2b_receivable_secure` rejeita origem interna não comprovada com `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED`. Não houve restauração de BF01–03/ACL P1A.

## 7. Edge e Storage
### Adendo DRIFT-EMAIL — fonte e implantação
Medição independente do **Codex nesta auditoria**, via Supabase MCP:canônico `platform-org-admin-email-change`v7/updated_at1791341327241/verify_jwt=true usava `admin.auth.admin.updateUserById(userId,{email:input.newEmail,email_confirm:true})` antes de complete; diff substancial com HEAD7d030dc4. Outros entrypoints inicialmente medidos compatíveis:create-user66/PDF aplicação65/PDF visita65/provider-settings70/push63. Não atribuir essas medições ao proprietário nem a reexecução pelo Lovable.

Código local inicial hashSHA256`df71235cf910ce303b82b516fa565c7f35cfae21ac37d75ed150e125f348d00e`, sem updateUserById/email_confirm bypass, com generateLink current/new/claim/finish. Primeira chamada explícita, direcionada somente a email-change, retornou falha de bundle/deployed:none:import sibling `platform-invite-org-admin/redirect-policy.ts` não incluído. Correção mínima:constantes/função canônicas movidas para `_shared/platform-invite-redirect.ts`, sibling mantém re-export; email-change importa shared. Segunda chamada retornou **Successfully deployed platform-org-admin-email-change**, destino canônico explicitado na primeira tentativa. Isso descreve a solicitação/resposta da ferramenta, **não prova ausência de outras implantações**.

HashSHA256 do entrypoint local`6c674ed91540f804bb165e9bba4e271072ad94b6d38193b0eb05f36918c1aeda`. **Fonte viva pós-deploy VERIFICADA — Codex/Supabase MCP get_edge_function:**ACTIVE **v9**, verify_jwt=true, updated_at1791489582101; **todos12arquivos retornados exatamente iguais** aos arquivos do commit`196247dd76079b7205c1fcc36a71eb17b2b5d24f`. Entrypoint sem updateUserById/email_confirm:true. A limitação anterior de leitura pelas ferramentas deste agente foi superada pela medição independente do Codex; deploy/preflight isolados continuam não sendo prova de paridade. Não se deduz v8 ou seus conteúdos a partir do caminho temporário.

**Alcance observado — Codex/list_edge_functions antes/depois:**as41funções mudaram de versão:40subiram+1;email7→9. Exemplos:create-user66→67,PDF65→66,provider70→71,push63→64. Retirada a afirmação “nenhuma outra Edge implantada”. Versionamento não prova alteração de conteúdo das outras40nem permite atribuir causalidade à chamada explícita, ao shared ou à publicação automática sem logs correlacionados. Paridade viva dos demais entrypoints aguarda a verificação independente anunciada. Ficha de proveniência:`codex-evidencias-2003.json`; listagens/12corpos brutos não anexados nesta mensagem.

**Investigação read-only do mecanismo nesta continuação:**`supabase/config.toml:23–28` contém registro histórico de incidente2026-09-18:reconexão do Supabase republicou automaticamente37funções e motivou verify_jwt explícito. É indício documental de republicação ampla em integração/plataforma, **não log de execução20:03nem prova de reconexão atual**. A orientação da integração disponibilizada ao agente também informa deploy automático de Edge; não descreve seleção exata/execução desta rodada. Busca em scripts/package/config não identificou executor local automático de deploy das41. O script encontrado `scripts/fiscal-staging-deploy-preflight.sh:5,38` declara execução não automática/confirmada e deploy fiscal-preflight em staging; não foi executado e não comprova este evento canônico. A consulta de conhecimento não forneceu rastreamento adicional do mecanismo.

Não é comprovado que Supabase em si, reconexão, mudança em `_shared`, políticas globais ou falha de bundle causaram o conjunto de versões. Tampouco se atribui a v8 à tentativa falha:deployed:none e salto7→9 não estabelecem essa relação. Origem/seleção/ordem das implantações exige histórico correlacionado da automação/Management. Nenhuma inspeção remota nova, deploy, publicação ou mutação foi realizada nesta continuação; investigação local somente leitura. Paridade restante será medida independentemente, conforme anunciado.
24arquivos Edge afetados no delta; superfícies e sinais estão em CSV/diff. Contenções de PDF/Comunicação são indisponibilidade deliberada, não habilitação de transporte. Consulta de corpo/ACL não equivale a execução Edge autenticada.

Upload/download/signed URL, traversal, delete, proprietário forjado e concorrência de Storage: **UNVERIFIED remotamente**. Testes locais de cercas de sessão/Storage passaram. Composição de policies permissivas em buckets fora do recorte restrictive requer revisão individual; nenhum relaxamento aplicado.

## 8. Matriz de rotas, componentes e menus
`matriz.csv`:179declarações/178paths×14roles=2.506linhas. Campos:rota/linha/componente/arquivo/guard/role/RBAC candidato/feature-plano/RPC-table-Edge candidato/sidebar/redirect/evidência/resultado por camada. Grafo transitivo776arquivos; chamadas de dependências compartilhadas são **candidatas**, não prova de autorização de uma ação específica.

Regra preservada:menu não autoriza; plano∩RBAC∩ator ativo∩tenant/vínculo∩backend. `getAccessLevel` não substitui guards específicos nem concessões do servidor. O inventário AST passou; decisão efetiva por operação permanece UNVERIFIED quando não exercitada.

## 9. Roles e identidades reais
### Adendo — medições independentes do Codex, não reexecutadas pelo Lovable
8identidades existentes×33tabelas organization_id=264SELECTs read-only com authenticated/claims e rollback:sem cross-tenant nos atores empresariais testados. Admins A/B com claims tenant forjados:1assinatura própria/0alheias/0profiles cruzados; h15 deriva tenant verdadeiro.14enum roles/7papéis atribuídos,3admins3tenants,gestor+consultor ativos,B2B/produtor ativos sem org,aplicador inativo; ACTIVE2/TRIAL3 versionadas. Único objeto financial-docs invisível aos8atores.

Estas são **provas SQL com claims**, não login JWT/browser, não cobrem mutações/Edge/Realtime/concorrência/download real nem todos14roles. Resultado restrito aos264casos e negativas explicitadas; não ampliar PASS. Origem:medições independentes do Codex nesta auditoria, comunicadas19:53UTC e esclarecidas20:03UTC; scripts/output brutos não anexados. Evidência Chrome posterior é separada na seção11.
Enum vivo14roles:administrador, tecnico_agronomo, producao, administrativo, gestor, cliente_produtor, consultor_tecnico, aplicador, operador_onfarm, financeiro, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico, superadmin. Não foi inventado papel Comercial separado de gestor_comercial.

Consulta correta usa profiles.user_id=user_roles.user_id. Nove profiles; há administrador ativo em3organizações, **conta gestor+consultor ativa no tenant FSF, não AR Bio** (correção da medição Codex20:03UTC), cliente_produtor/parceiro_b2b/superadmin ativos sem organização e aplicador inativo sem organização. Ausência de conta representativa para um role não foi preenchida com criação/alteração de usuário.

## 10. Planos, estados e tenant A/P
Leitura observada:AR Bio TRIAL17features; Homologação onboarding TRIAL8; Refil rascunho ACTIVE3; CultivoFarm ACTIVE17; FSF TRIAL17. Nome Homologação não estabelece paridade ou sandbox seguro. Não se presumiu cobertura de todos os planos/estados a partir dessas linhas.

A contratante e P próprio permanecem distintos; CNPJ e organizations.partner_account_id não autorizam herança. Isolamento dinâmico nos dois sentidos e plano sem ampliação RBAC integral: **UNVERIFIED**; medição Chrome admin AR Bio focal não substitui essa cobertura. Mocks de guards/entitlements/cache são evidência estática separada.

## 11. Browser público versus privado
`browser-publico.json` registra URLs/estados desktop1280×1800 e mobile. Após hidratação, `/configuracoes`, `/plataforma`, `/clientes`, `/financeiro`, `/estoque`, `/portal-parceiro`, `/portal`, `/selecionar-portal` redirecionam `/auth`; `/app` vai `/app/login`. `/fiscal` e `/producao` e path inexistente mostram404:paths não presumidos como rotas válidas. Sem erro JS observado nesses smokes.

`LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged`:não há sessão gerenciada neste sandbox Lovable; isso **não significa ausência de browser autenticado na auditoria Codex**. Não se pediu credencial, não houve login simulado nem mudança de senha. Smoke público histórico não valida isolamento autenticado. Settings hospedados de signup/sign-in não verificados.

**Chrome real publicado — medição independente Codex20:03UTC**, `https://app.cultivofarm.com.br`, Renato administrador AR Bio:

| Caso observado | Resultado | Escopo do PASS |
|---|---|---|
| `/plataforma` | redireciona `/sem-permissao` | negativa de acesso/renderização dessa rota nesse perfil |
| Sidebar | sem plataforma | apresentação nesse perfil; menu nunca autoriza |
| `/configuracoes` | acessível | acesso/renderização |
| Meu Plano | Completo TRIAL02→16/10,17features | renderização do estado/plano observado |
| `/clientes` — Produtores | lista vazia | acesso/renderização, não prova isolamento por lista vazia |
| `/financeiro/receber` | zero contas | acesso/renderização, não prova isolamento por contagem zero |

**PASS focal de acesso/renderização somente**; não mutação, isolamento por si só, todos perfis/planos, logout/cache entre identidades, API/JWT/revogação, Storage/Realtime/concorrência. Outra sessão será disponibilizada; não iniciada nesta continuação. A medição pertence ao Codex, não ao proprietário nem a este agente.

## 12. Achados e correções mínimas
| ID | Prioridade | Evidência | Ação/limite |
|---|---|---|---|
| RD-01 | P2 contrato de tipos | teste runtime.static falhou no import Json de types gerenciados | `motorEstoque.ts`:Json vem de cultivofarm.types; cliente runtime canônico intacto; teste passou |
| RD-02 | P2 falso positivo | regex de teste encontrava skipWaiting apenas em comentário push | comentário alterado; PUSH_DELIVERY_AVAILABLE=false e controles de navegação intactos |
| RD-03 | dívida lint |4any adicionais em usePartnerSimulations | sem mudança semântica oportunista; não prova P1 |
| RD-04 | dívida hooks | warning de scope/loadDeps e2warnings usersPage | dois últimos já existiam e mudaram linhas; não tratar7diagnósticos brutos como7regressões reais |
| RD-05 | bloqueio de certificação | cobertura dinâmica incompleta; fonte email verificada e Chrome admin focal pelo Codex | NO-GO integral, não ausência de toda prova privada |
| DRIFT-EMAIL | P1 drift | Codex comprovou bypass v7 e paridade dos12arquivos v9 com commit196247dd | bypass retirado na fonte viva; fluxo positivo não executado |
| RD-DEPLOY | alcance observado | Codex mediu41versões alteradas; pedido explícito somente email-change | exclusividade retirada; causalidade e paridade dos outros entrypoints pendentes |

Na rodada inicial não foi confirmado vazamento P0/P1 novo; o adendo DRIFT-EMAIL trouxe P1 independente confirmado, tratado separadamente. O import runtime `@/integrations/supabase/client` é canônico; não é cliente paralelo. Constante push false impede openWindow; a ocorrência textual não prova navegação insegura.

## 13. Testes antes/depois
### Adendo — DRIFT-EMAIL
`bun run test -- src/test/saas/drift-email-handler.test.ts`:10/10PASS exit0, executa o corpo real do index em VM removendo imports/type annotation e injetando dependências mockadas, sem rede. Cobre sem token/token inválido/admin tenant/alvo user ou org forjado/delivery OFF/reconcile pendente/Auth confirmado/complete nega/cancel não suportado; nenhuma chamada real de links/envio/update Auth. Primeira tentativa importar npm:Deno no Vite falhou por resolução; harness ajustado, não produção. Deno policy/auth+redirect17/17PASS após shared; execução com filtro anterior teve0tests/17filtered e não é contabilizada como PASS de casos. Contagens não somadas à suíte histórica6.161.

Negativas HTTP reais após deploy no canônico:POST sem auth401 `UNAUTHORIZED_NO_AUTH_HEADER`;POST bearer inválido401 `UNAUTHORIZED_INVALID_JWT_FORMAT` (gateway, não prova handler);OPTIONS origem canônica204/CORS restrito;OPTIONS origem não confiável403/sem allow-origin. Nenhuma chamada autenticada ou positive request/send. `http-drift-email.json` preserva status públicos.
Antes:2falhas locais reproduzidas na dupla de testes config (15PASS/2FAIL). Depois:suíte completa `bun run test -- --reporter=json --outputFile=/tmp/retomada-audit/full-tests.json`, exit0: **6.161PASS/4skipped/0FAIL,434arquivos**. JSON reporta1.528suites internas; não confundir com arquivos.

Focal11arquivos251/251PASS; ampliada66arquivos730/730PASS, incluindo SaaS/roles/navigation/Auth/Storage/notificações. Contagens sobrepostas **não somadas**. PostgreSQL isolado usa Auth stub/claims locais e não prova RLS/JWT canônico. Nenhum novo SQL rollback canônico nesta rodada.

## 14. Lint, scanners, typecheck e build
**Validação independente Codex20:03UTC:**typecheck local explícito `tsc -p tsconfig.app` e `tsconfig.node` **PASS**;build **PASS**;217testes focais **PASS**;pós-correção handler realVM10 **PASS**. Lint global **3.396erros/125avisos (FAIL)** em snapshot composto, **não checkout Git exato**; não tratar diferença com3.385como regressão medida do mesmo SHA. Comandos não reexecutados nesta continuação documental. A suíte histórica6.161PASS/4skip e o handlerVM10deste agente permanecem evidências distintas e não somáveis. A tabela abaixo conserva o que foi executado pelo Lovable na rodada original, não nega o PASS independente de typecheck.
| Verificação | Comando/método | Exit/resultado |
|---|---|---|
| Lint HEAD inicial | bun run lint -- --format json |1;3.385erros/125avisos,1.529arquivos |
| Lint base | eslint no git archive base |1;3.477erros/127avisos,1.434arquivos |
| Lint diferencial | identidade arquivo/regra/mensagem |7adições/101remoções brutas; diferenças de linha/mensagem não equivalem a regressão |
| Lint focal | eslint motorEstoque.ts push-sw.js inventory.ts |0;0erros/0avisos |
| Segredos | bash scripts/fiscal-secrets-scan.sh |0 |
| Integração fiscal | bash scripts/fiscal-integration-scan.sh |0 |
| Whitespace | git diff --check |0, rechecado no fechamento |
| Typecheck app/node — Lovable original | solicitados tsc -p tsconfig.app.json --noEmit e node | **NOT RUN pelo Lovable** por instrução ambiental; **PASS explícito independente Codex** registrado acima |
| Build | automático /tmp/observability/build-errors.log |build OK19:45:58,19:50:39,19:51:54UTC; nenhum build manual |

`lovable build status` permaneceu referindo o HEAD inicial e sucesso19:35:27; por isso não é usado como prova das alterações posteriores. Log automático posterior é a evidência focal. Lint amplo segue FAIL, não foi ocultado pelo sucesso focal.

## 15. Dados, hashes e rollback
### Adendo — rollback seguro DRIFT-EMAIL
**Nunca restaurar v7 com updateUserById/email_confirm:true.** Se novo handler/dependência impedir operação, manter indisponibilidade clara `delivery_not_ready` ou implantar contenção autenticada antes de begin/link/send, não bypass Auth. Shared/re-export preserva destino fixo e não requer deploy do convite. Read-only email_changes nesta rodada:1operação/1completed, snapshot pontual; nenhuma operação criada/alterada pelo agente. Não gerar links/trocar email/envio para provar o fluxo nesta fase.
Consulta de integridade nesta rodada:partner_orders0/hashd41d8cd98f00b204e9800998ecf8427e; accounts_receivable1/hashd7f1a6de0748c84b0e31710e2716b542; fiscal_invoices4/hashde6a0db798517faa1b9abe7324acbdcb; estoque_movimentacoes2/hashf8b6fcf6aa756d745eaf205f606f7795. São snapshots read-only pontuais, **não alegação de par before/after completo**.

Sem escrita de dados, migrations, grants, Auth ou Storage. Rollback local:reverter somente import Json e comentário, se necessário, sem alterar cliente canônico/guards/RLS. Isso reapresentaria as falhas P2; não remover contenções para restaurar operação. Documentação e inventários são removíveis independentemente do runtime.

## 16. Decisão por perfil/módulo e bloqueios
Todos14roles têm inventário estrutural e cobertura mocks parcial; **nenhum role recebe PASS integral**. Administrador AR Bio tem **PASS focal Chrome de acesso/renderização** nos casos da seção11 medidos pelo Codex; outros perfis, mutações e isolamento dinâmico integral seguem UNVERIFIED. Fonte viva email v9/12arquivos **VERIFICADA** pelo Codex; paridade viva dos demais entrypoints pendente. B2B/financeiro downstream permanece fail-closed; NOTIF/STORAGE/fiscal têm bloqueios explícitos preservados. Nenhuma cobrança/emissão/envio/pagamento habilitado; alcance de versões Edge observado não foi exclusivo.

Bloqueios concretos:revisão semântica individual de643commits/394arquivos ainda não concluída; matriz efetiva de autorização backend por ação incompleta; próxima sessão/perfis não exercitados; isolamento dinâmico/mutações/Storage/concorrência não comprovados; paridade homolog não acessada; lint amplo FAIL; causalidade das41versões e paridade viva dos demais entrypoints pendentes. Typecheck não é bloqueio por ausência de execução:PASS explícito Codex, com limite de snapshot registrado. **Não declarar100%,GO operacional ou auditoria integral PASS.**

## 17. Prompt da próxima fase (não iniciada)
“Retomar somente fechamento RD, confirmar novo HEAD e ancestralidade, preservar contenções. Revisar semanticamente commits/arquivos priorizados do CSV sem assumir classificação automática como aceite; fechar vínculo rota→ação→RPC/RLS/Edge e decisão por role/plano/tenant. Com acesso seguro existente, provar positivos próprios e negativos cruzados nos dois tenants, separado de SQL claims; não criar contas/dados comerciais nem alterar senhas. Sem sessão, manter UI/API/JWT/Storage UNVERIFIED. Corrigir somente P0/P1 reproduzidos reversivelmente; atualizar evidências/roadmap e manter sem publicação, emissão, mensagens ou cobrança.”