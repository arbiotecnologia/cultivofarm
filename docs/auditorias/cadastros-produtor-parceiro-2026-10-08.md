# CADASTROS-PRODUTOR-PARCEIRO — checkpoint 2026-10-08

## Continuidade B2B-FISCAL autorizada — 17:32 UTC

Fase A preservada. BF02 **contido**, não homologado: migration oficial `20261008173204_54750128-42c5-4dfd-a9d1-4774eb2f71be.sql` adiciona RESTRICTIVE false em PC/PUC e fecha ACL/corpos assign/unassign/list; BF03 cancelamento igualmente bloqueado. Nenhum tenant P vinculado nem ownership comercial do parceiro comprovado; não inferir/preencher legado. SQL ROLE/claims com ROLLBACK:9negações, fixture invisível/UPDATE0,7contagens/hashes preservados. Não é JWT/browser nem prova positiva A/P. Detalhes no relatório B2B-FISCAL seção11. **NO-GO operacional**; checkpoints e divergência histórica de partner_audit_logs abaixo preservados.

## Fases autorizadas A corretiva e B read-only — 17:13 UTC

HEAD inicial `3381e213c817063de3520a1afde16d698f5a956a`, árvore limpa. Auditoria17:08 preservada como histórico. **A concluída / B inventariada; C não iniciada.** Não houve escrita remota, migration, Auth, vínculo, papel, convite, bytes Storage ou publicação.

### Fase A — correção dos19 diagnósticos
- `src/hooks/useParceiroB2BMutations.ts`: SDK canônico sem cast `any`, payloads `PartnerInsert`/`PartnerUpdate`, dados bancários tipados como texto/objeto JSON; erros inferidos do SDK e callbacks `unknown`. Asserções de enum na fronteira tipada preservam strings do formulário existente, sem acrescentar validação/regras. Fences, query keys, UID, calls/selects/status e soft-delete intactos.
- `src/pages/clientes/ProdutoresTab.tsx`: rows/insert/payload/form/error/filter tipados, mesmos defaults movidos para constante estável; `fetchClientes` com `useCallback` dependente de readiness/org/scope e ref da captura mais recente. Effect inclui reset/fetch estáveis: não reseta draft nem repete leitura ao digitar ou rerender na mesma sessão. Generation/caches/fences preservados. Normalização por campo mantém vazio→null, undefined/NaN numérico→null e exclusão dos campos auxiliares; nenhum código de cliente inventado.
- Tipos importados de `src/integrations/supabase/cultivofarm.types.ts`, que é o contrato usado pelo cliente canônico. Tentativa inicial com o outro arquivo gerado provocou incompatibilidades no harness; alinhada à importação do cliente, **build automático final OK17:16:23**. Nenhum arquivo gerado/cliente/dependência foi modificado. A asserção de insert cliente documenta que código obrigatório nos tipos é derivado pelo trigger vivo; não adiciona valor ao payload.
- `src/test/config/commercialRegistration.producer.test.tsx`: um teste adicional comprova draft mantido e zero consultas adicionais em rerender de mesma sessão; caso existente também afirma três numéricos opcionais null. **65 existentes PASS**17:15:35; **66/66 em7 arquivos PASS**17:16:38, não somar execuções. Mesmos sete arquivos da revisão17:08.
- **ESLint ampliado PASS:0 erros/0 warnings** em ambos os arquivos (antes18/1); focal scope/testes PASS; diff-check e scanners fiscal secrets/integration PASS. **Typecheck manual NOT RUN**, proibido; não contornado. Harness automático foi observado, não rotulado como execução manual independente. Avisos de Dialog/React Router nos testes permanecem.

### Fase B — inventário vivo exclusivamente SELECT

Destino confirmado antes do inventário por `fiscal_environment_marker.project_ref=swzpzcwiasxmjutrmvkm`. Contagens17:15–17:17: organizações5, com `partner_account_id`0; parceiro1, órfão comercial1. Nenhuma atribuição de ownership. Queries de catálogo retornam contratos reais, não sessão JWT de usuário nem teste de mutação.

|Objeto|Contrato vivo / grants / limite|
|---|---|
|`clientes`|RLS ON; permissivas read helper + writers admin/gestor/comercial; restritiva `tenant_isolation_d51_5` exige org não NULL=actor h15 em ALL. Documentos normalizados únicos por org; ID/código únicos.|
|`partner_accounts`|RLS ON; SELECT admin/comercial ou self B2B; INSERT/UPDATE admin/comercial; restritiva ALL permite USING cliente próprio **ou** id=get_user_partner_id; CHECK exige cliente próprio. Sem permissiva DELETE. Guard INSERT/UPDATE exige ator/org/cliente/consultor, deriva autor/código, bloqueia alteração identidade e valores inválidos.|
|`organizations`|authenticated SELECT=true, INSERT/UPDATE/DELETE=false; policies próprio perfil, partner_users→partner_account_id e superadmin. Vínculo comercial não cria tenant.|
|`partner_users`|Única policy SELECT tenant admin para usuário alvo; sem write policies. `get_user_partner_id()` é DEFINER que obtém primeiro partner_users por auth.uid, **não valida readiness/tenant por si**. Não confundir com organizations.partner_account_id.|
|`partner_clients`|INSERT/UPDATE e leitura admin/comercial são role-only; SELECT B2B por partner/atribuição; não há restritiva tenant na lista viva. Único trigger não interno: updated_at. **Lacuna estrutural de escopo a revisar**, não exploração certificada.|
|`partner_user_clients`|Permissivas role-only admin/comercial ou parceiro; trigger valida associação usuário/parceiro e cliente ativo em partner_clients; sync PUC→PTC. Validação não demonstra empresa contratante. **Lacuna estrutural**, sem mutação/prova JWT nesta fase.|

ACL de tabela por `has_table_privilege`: clientes, partner_accounts, partner_clients, partner_user_clients e partner_users têm authenticated SELECT/INSERT/UPDATE/DELETE=true, anon SELECT=true; relacl inclui grants amplos anon/auth. **Grants não autorizam rows:** policies continuam necessárias, ausência de DELETE policy nega DELETE parceiro. Consulta information_schema retornou vazio e não foi usada para concluir ausência de grants; confirmado por pg_class/has_table_privilege. Não alterados.

|RPC público|anon EXECUTE|authenticated EXECUTE|service_role EXECUTE|Observação do corpo|
|---|---|---|---|---|
|`link_partner_user(uuid,uuid,text)`|false|false|true|Fail-closed `CADASTRO1_PARTNER_CONTRACT_UNAVAILABLE`, sem efeitos|
|`set_partner_user_papel(uuid,text)`|false|false|true|Legado role-only/sem alvo tenant; fechado para caller, não reabrir|
|`get_user_partner_id()`|false|true|true|Lookup por UID apenas, não prova ator ativo/empresa|
|`can_user_access_cliente(uuid)` e `(uuid,uuid)`|false|true|true|Ramos globais de papéis; RLS restritiva protege SELECT direto, não assumir proteção em todo DEFINER|
|`check_cliente_dependencies(uuid)`|false|true|true|Ator/org/alvo próprios exigidos|
|`get_my_available_portal_contexts()`|false|true|true|Contexto visual; não substitui autorização alvo|
|`get_b2b_partner_clients_for_assignment_secure(text)`|false|true|true|DEFINER: ramo admin/comercial SELECT clientes sem org, LIMIT500; B2B usa partner_clients. **Falta escopo no corpo comprovada por leitura**, transporte/vazamento UNVERIFIED|
|`assign_b2b_user_client_secure(uuid,uuid,text,boolean,boolean,text)`|false|true|true|DEFINER: admin deriva partner pelo usuário alvo e faz upsert partner_clients/PUC sem empresa; trigger valida vínculo mas não tenant. Sem readiness/contrato A/P canônico no corpo|
|`unassign_b2b_user_client_secure(uuid,uuid,text)`|false|true|true|DEFINER: admin busca partner por alvo; UPDATE PUC/PTC sem org, `(v_partner IS NULL OR...)`; sem escopo tenant no corpo. Efeito real não executado|

Consumidor existente dos três últimos RPCs: `src/pages/portal-parceiro/UsuariosClientesB2B.tsx` (queries partner-only/user-only e callbacks sem fence canônico). Não modificado: B é read-only. Achados não são sanados pelo bloqueio de `useLinkPartnerUser`. **FAIL contrato estrutural desses endpoints quanto a tenant/readiness explícitos; UNVERIFIED exploração/efeito JWT**. Não emitir PASS global/RLS dessa superfície nem alegar zero vazamento por negar UI.

### Matriz A contratante / P tenant parceiro: resultados versus expectativas

|Ação|A sobre cadastro comercial próprio|P sobre dados privados de A|A sobre dados privados de P|Evidência atual|
|---|---|---|---|---|
|CREATE cliente/parceiro|Esperado permitido com papel/cliente próprio|Esperado negado, vínculo não transfere org|Esperado negado|SQL histórico own positivo/spoof negativo; mocks atuais PASS. A/P ligado JWT UNVERIFIED|
|READ direto cliente/parceiro|Próprio permitido|Cliente de A negado pela restritiva; self partner depende contrato de colunas|Dados privados de P negados|Policies SELECT auditadas; SQL histórico A/B PASS, não A/P. RPC lista admin sem escopo é exceção estrutural FAIL|
|UPDATE/inativação|Próprio permitido|Esperado negado para dados de A|Esperado negado para dados de P|Guard/CHECK tenant; mocks e SQL histórico, sem nova escrita. Assign/unassign legados não certificados|
|DELETE|Cliente próprio sem dependências conforme regra; parceiro físico sem permissiva DELETE|Esperado negado|Esperado negado|Cliente SQL histórico own positivo; P/A ligado e exclusão física parceiro JWT UNVERIFIED|
|Portal/usuários/atribuições|Apenas contrato explícito aprovado|Nenhum acesso geral à contratante|Nenhuma administração do tenant P|Nenhum tenant vinculado vivo; RPCs/PUC/PC com lacunas; browser/JWT UNVERIFIED|

### Idempotência servidor atual e proposta separada (não implementada)
Cadastro comercial continua INSERT/UPDATE direto: UUID/código/índices evitam repetição de **ID**, mas não há recibo ator+tenant+payload/replay convergente. Upserts nas atribuições alteram active/updated_at e auditam de novo; não equivalem idempotência estrita. **UNVERIFIED concorrência/retry real.**

Proposta para autorização futura, sem SQL/migration nesta fase: reutilizar fluxos existentes com core transacional server-side; readiness/org/RBAC/ownership antes de alvo/replay; chave por ator/tenant/operação/draft, hash de payload canônico; lock/unique receipt; mesma chave+payload retorna resultado persistido, divergente nega; audit única; update com versão esperada para evitar lost update; timeout reconcilia read-only, não retry cego. Exige migration/contrato e provas rollback/JWT concorrentes; não foi adicionado fluxo paralelo.

### Plano de prova JWT real e gate
1. Proprietário/segurança aprova compartilhamento específico A/P e remedia lacunas dos RPCs/tabelas antes de homologar, em autorização separada: sem impor A=P, sem regrant, sem inferir órfão. B não autoriza essas escritas.
2. Operador disponibiliza sessões reais existentes pelo mecanismo seguro, sem credenciais em texto; QA confirma actor ativo/org/papéis e vínculo A/P canônico. Atualmente linked organizations=0; não criar vínculo/roles nesta fase.
3. QA/segurança testa JWT A e P (e não pronto/papel insuficiente): list/detail/CREATE/UPDATE/DELETE permitido, spoof/reparent/cross CRUD, RPCs e portal, desktop/mobile, logout/resposta antiga; evidência HTTP/rows separada de SQL/mocks. Writes apenas com futura autorização de fixtures+manifesto/rollback/cleanup verificável; nunca usar dados reais como teste.
4. Backend/QA prova retry/concorrência/recibos após contrato idempotente; operador observa typecheck autorizado. Auditor independente esclarece hash histórico pendente. Não confundir contagens inventário com hashes preservados nesta fase.

Arquivos alterados **somente**: `src/hooks/useParceiroB2BMutations.ts`, `src/pages/clientes/ProdutoresTab.tsx`, `src/test/config/commercialRegistration.producer.test.tsx`, este relatório e `roadmap.md`. Nenhuma migration/ACL/guard/RLS/rota/AGENTS/dependência modificada. **PASS A focal; FAIL escopo estrutural legado encontrado em B; NOT RUN typecheck manual; UNVERIFIED JWT/browser/A-P ligado/Storage/concorrência/histórico. NO-GO integral; parar após A/B, sem C.**

## Revisão independente do checkpoint — 17:08 UTC, sem nova fase

**HEAD auditado:** `119fd610af5b44be11a456a8f5c55816c2d55285`, árvore inicialmente limpa. Baseline de comparação: `3773015091fb5efa93ad75f963612e4ad359a85f`, anterior à continuidade16:16. Nesta revisão foram executados somente leitura local e testes/lint; nenhuma consulta ou escrita remota, SQL, fixture, Auth, envio, migration ou publicação. Nenhuma regressão funcional comprovada exigiu correção. Atualizações persistentes somente neste relatório e `roadmap.md`.

### 1. Lint: comparação objetiva, não presunção de baseline

ESLint foi executado no HEAD e no conteúdo obtido por `git show` do baseline, via stdin com o mesmo `--stdin-filename`, usando as mesmas dependências/configuração atuais. `eslint.config.js`, `package.json` e lockfiles não têm diff entre as duas revisões. Cada diagnóstico foi associado a linha de código inalterada por comparação de sequências, verificando regra, mensagem e coluna: **19/19 correspondências, zero diagnósticos introduzidos por esta continuidade**. Isso comprova preexistência em relação ao baseline37730150, não atribui origem a todas as fases anteriores.

|Arquivo/regra|Linhas HEAD (colunas)|Linhas baseline correspondentes|Resultado|
|---|---|---|---|
|`src/hooks/useParceiroB2BMutations.ts`, `no-explicit-any`|50(21),74(53),76(50),78(77),102(50),104(26),129(50),134(14)|50,73,75,77,99,101,124,129|8 erros preexistentes|
|`src/pages/clientes/ProdutoresTab.tsx`, `no-explicit-any`|42(69),75(41),75(47),87(22),178(19),180(20),206(19),250(32),345(40),417(87)|42,75,75,87,178,180,206,248,339,411|10 erros preexistentes|
|`src/pages/clientes/ProdutoresTab.tsx`, `react-hooks/exhaustive-deps`|150(6)|150(6)|1 warning preexistente: `defaultValues`, `fetchClientes`, `methods`|

**FAIL lint ampliado:**18 erros/1 warning permanecem. **PASS ausência de regressão de lint neste checkpoint.** Sem refatoração ou supressão de regras, pois o recorte autoriza corrigir somente regressão comprovada. **PASS lint focal:** `src/hooks/useCommercialRegistrationScope.ts` e testes `commercialRegistration.producer.test.tsx`, `.session.test.tsx`, `.form.test.tsx`. Saídas temporárias em `/tmp/cadastros-review/`, não entregáveis nem novas regras de projeto.

### 2. Typecheck e build

**Typecheck explícito: NOT RUN.** A instrução vigente do ambiente proíbe execução manual de builds/typechecks do projeto; trocar para outro compilador não contorna essa restrição. `package.json` oferece `typecheck`, mas sua presença não autoriza executar. Leitura de `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` não certifica compilação. **Build automático: PASS observado**, log17:09:17 UTC; nenhuma execução manual. Não apresentar Vite como typecheck independente.

### 3. Matriz bidirecional: ownership comercial não é tenant próprio do parceiro

**A = contratante; P = tenant próprio do parceiro.** Cadeia comercial `partner_accounts.client_id → clientes.organization_id` e vínculo de portal `organizations.partner_account_id` têm significados distintos. A prova histórica A/B usou duas empresas independentes, **não** um par contratante/parceiro efetivamente vinculado. Nenhuma nova prova viva foi feita nesta revisão; ausência de vínculo real continua sendo informação histórica não revalidada remotamente.

|Operação/alvo|A→registros comerciais próprios|A→dados privados de P|P→registros comerciais/dados privados de A|P→dados próprios/portal|
|---|---|---|---|---|
|CREATE cliente/produtor/parceiro|PASS SQL histórico próprio; mocks create positivos atuais|UNVERIFIED A/P vinculado; SQL histórico nega spoof/referência cruzada entre empresas independentes|UNVERIFIED A/P vinculado; cliente do tenant do ator exigido estruturalmente|UNVERIFIED CRUD real de P; vínculo portal não concede escrita comercial em A|
|READ cliente/parceiro|PASS SQL histórico; mocks de lista/cache atuais|UNVERIFIED relação A/P; SQL histórico A/B nega leituras cruzadas|UNVERIFIED A/P; exceção histórica self-select do próprio partner exige contrato/colunas aprovado, não acesso geral|UNVERIFIED JWT/browser e colunas compartilháveis do portal|
|UPDATE/reativar/inativar|PASS SQL histórico parceiro próprio; mocks edição/callbacks atuais|UNVERIFIED A/P; SQL histórico A/B nega update/reparent|UNVERIFIED A/P; admin de P não equivale a admin de A|UNVERIFIED operação real de P; contexto visual nunca autoriza|
|DELETE físico cliente|PASS SQL histórico próprio sem dependências; mock nega exclusão com documentos/erro de dependências|UNVERIFIED delete bidirecional vinculado; não extrapolar SELECT/UPDATE|UNVERIFIED delete bidirecional vinculado|UNVERIFIED delete real em P; Storage não certificado|
|DELETE físico parceiro|UNVERIFIED: UI usa inativação, não foi provada exclusão física de parceiro|UNVERIFIED|UNVERIFIED|UNVERIFIED|
|Portal/vínculos/usuários/financeiro/documentos/notificações|Leitura estrutural anterior delimitada; provisionamento login continua contido|UNVERIFIED dinâmica vinculada em todas essas superfícies|UNVERIFIED dinâmica vinculada; vínculo comercial não transfere administração|UNVERIFIED portal real; `usePartnerUsers` não é gestão do tenant próprio de P|

**SQL:** evidências históricas com ROLE/claims simulados, não reexecutadas. Script `scripts/rbac-audit/commercial-context-isolation-proof.sql` cobre SELECT cliente/parceiro, UPDATE parceiro próprio/cruzado, UPDATE cliente cruzado e reparent negado; seus6 positivos/10 negativos não cobrem DELETE nem portal. **Mocks:**65/65 atuais não exercitam servidor, policies, JWT ou vínculo real A/P; testes com propriedade fictícia `partner_account_id` não provam o vínculo de `organizations`. **JWT real e browser:** UNVERIFIED em todas as células; nenhum login realizado. Não declarar matriz integral PASS por SQL entre tenants não vinculados.

### 4. Callbacks, UUID e idempotência

**PASS delimitação local:** fences suprimem toasts e invalidações de resposta antiga; locks impedem reentrada do formulário local; UUID estável evita gerar outro ID no retry do mesmo draft. **UNVERIFIED idempotência server-side convergente/concorrência:** índice único pode devolver conflito após primeira gravação e perda da resposta; isso não prova replay com mesmo resultado, validação de payload divergente, recibo ator/tenant ou reconciliação. UPDATE já enviado pode ser persistido mesmo com callback suprimido. Nenhum endpoint de replay foi criado; código PARC derivado do UUID não é protocolo de idempotência. Remontagem/outro formulário/outro dispositivo não são cobertos pelo lock.

### 5. Provas novas, arquivos e gate de homologação

**PASS:**65/65 em7 arquivos, início17:09:49 UTC (reexecução, não somar aos65 anteriores):
`src/test/config/commercialRegistration.producer.test.tsx`, `commercialRegistration.session.test.tsx`, `commercialRegistration.form.test.tsx`, `commercialRegistration.delete.test.tsx`, `commercialRegistration.validation.test.ts`, `partnerUsers.session.test.tsx`, `src/test/lib/inscricao-estadual-cadastro.test.tsx`. Os seis primeiros ficam em `src/test/config/`. Nenhum novo teste/arquivo de código foi criado. `useAvailablePartnerUsers` está declarado em `src/hooks/usePartnerUsers.ts`; não existe arquivo separado com esse nome. **PASS diff-check.** Avisos de acessibilidade/React Router dos testes não foram classificados como testes falhos ou provas browser.

|Gate/ação futura (não executada aqui)|Responsável|Critério de aceite|
|---|---|---|
|Revisar contrato A/P, colunas de self-select e direitos por ação|Proprietário + responsável de segurança/B2B|Contrato explícito sem administração cruzada; não inferir ownership de legado|
|Disponibilizar sessão/vínculo válido por mecanismo seguro, sem pedir credenciais em texto|Proprietário + operador do ambiente|Identidades existentes adequadas; sem criar roles/contas para fabricar PASS; se indisponível, UNVERIFIED mantido|
|Homologar API JWT e browser desktop/mobile para create/read/update/inativação/delete permitido e portal, nas duas direções|QA + segurança, após autorização específica|Positivos próprios, negativos cruzados e RBAC/plano; evidência separada por transporte; fixture/cleanup somente sob autorização específica|
|Validar retry após resposta perdida, concorrência, IDs/payload divergentes e reconciliação|Responsável backend + QA|Resultado persistido demonstrado sem duplicidade e contrato de replay aprovado; sem confundir lock com idempotência|
|Tratar dívida de18 erros/1warning fora desta revisão restrita, ou aceitar formalmente a dívida|Manutenção frontend + proprietário|Lint ampliado PASS ou aceite limitado documentado; zero nova regressão|
|Executar typecheck pelo mecanismo permitido do ambiente|Operador/harness|Resultado explícito de tipos; até lá NOT RUN, sem contornar a proibição manual|
|Esclarecer divergência histórica do hash de partner_audit_logs|Responsável banco + auditor independente|Baseline/evidência de origem sem modificar histórico; ausência mantém UNVERIFIED|

**Decisão:** PASS testes/fences e ausência de regressão de lint em relação ao baseline; FAIL lint ampliado; typecheck NOT RUN; isolamento A/P efetivamente vinculado, JWT/browser/Storage/concorrência e integridade histórica pendente UNVERIFIED. **NO-GO integral para homologação.** Nenhuma próxima fase, correção de ACL ou reabertura de login B2B. Pausar para revisão do proprietário.

## Continuidade autorizada — 16:16–16:20 UTC
HEAD conferido antes de editar: `3773015091fb5efa93ad75f963612e4ad359a85f`, árvore limpa. A execução anterior e seus limites foram revisados; não foram tomadas como prova JWT/browser. Leitura viva confirmou ref `swzpzcwiasxmjutrmvkm`, ledger `20261008160048/0379dfbf-559f-4d87-91bb-89e36ca35bbc` e restritiva `d51_5_partner_accounts_tenant_guard` intacta. Nenhuma migration nova/reaplicada e nenhuma escrita remota, fixture, conta, convite, exclusão, alteração de legado ou publicação neste complemento.

### Lacunas verificadas e correções locais
|Antes (inspeção do código)|Depois|Prova|
|---|---|---|
|`getUser()` podia divergir do ator pronto capturado antes do insert|Comparação explícita SDK UID/ator; divergência nega antes do insert|Teste mock: SDK B/ator A, zero inserts|
|Callbacks de mutação de parceiro notificavam erros antigos e invalidavam todas as empresas|`onMutate` captura geração/empresa; sucesso/erro cercados e invalidação só da chave iniciadora|Criar/editar/inativar atrasados após troca: zero toasts/invalidations|
|Produtor mostrava sucesso/duplicidade antes de conferir contexto após await|Fence imediato após create/edit; inativar/excluir também conferem contexto antes de efeitos visuais|Formulário real com SDK mock: resultado antigo sucesso/erro não aparece|
|Cobertura explícita de edição do parceiro incompleta|Testes de edição própria com ID existente e cliente cruzado ausente da lista|Update próprio uma chamada, zero create; cliente cruzado zero writes|

Arquivos desta continuidade: `src/hooks/useCommercialRegistrationScope.ts`, `src/hooks/useParceiroB2BMutations.ts`, `src/pages/clientes/ProdutoresTab.tsx`, `src/test/config/commercialRegistration.session.test.tsx`, `src/test/config/commercialRegistration.form.test.tsx`, novo `src/test/config/commercialRegistration.producer.test.tsx`, regra estrutural em `AGENTS.md`, este relatório e `roadmap.md`. RLS continua autorizando o servidor; fences não revogam request já enviado nem garantem que uma mutação em trânsito não tenha sido persistida.

IE não precisou de novo diff: cadastro aceita vazio/ISENTO/formatos variados com aviso fiscal; regressões confirmam que `510.193.600/89` é aceito no cadastro e segue inválido na validação estrita MG de emissão. Seleção explícita de cliente próprio já existe antes do insert; preservada. Tenant próprio do parceiro não substitui ownership comercial da contratante.

### Resultado por categoria
- **PASS local/mock:** 65/65 testes em 7 arquivos às16:20 UTC (não somar com72/72 ou36/36 anteriores); formulário produtor mantém geração, parceiro create/edit/negativa e lock/retry, sessão/readiness/queries, erros sanitizados, IE. Teste de edição inicialmente falhou por fixture mock incompleta gerando NaN; corrigidos campos nullable da fixture, sem alterar regra financeira.
- **PASS leitura viva SQL:** ref, ledger e restritiva confirmados. Índices vivos: documento normalizado de cliente por empresa; código cliente global único, código parceiro global único e derivado UUID. **UNVERIFIED:** unicidade CNPJ parceiro por tenant; não inventada nem nova restrição introduzida. Provas SQL anteriores create/edit/negativas/rollback permanecem históricas, não reexecutadas agora.
- **PASS lint focal:** scope e testes alterados. **FAIL lint ampliado:** hooks de mutação/produtores18 erros `any`/1 aviso de dependências preexistentes; não alegar lint global PASS. Scanners secrets/fiscal e diff-check PASS.
- **PASS build automático:** `/tmp/observability/build-errors.log` registrou `build OK`16:20:07 UTC. **Typecheck explícito NOT RUN** (instrução do ambiente proíbe execução manual); build não foi rotulado como typecheck independente.
- **UNVERIFIED JWT/API/browser/mobile/concorrência remota:** sem sessão autenticada, sem transporte validado. Testes de componentes usam SDK/mock, não RLS; SQL anterior com claims não é JWT. Lock é reentrância local, UUID/índice impedem duplicidade persistente por ID, mas replay convergente/reconciliação e disputa concorrente real permanecem não certificados.

**Riscos e pendências mantidos:** divergência histórica `partner_audit_logs` sem baseline; vínculo real tenant parceiro ausente; compartilhar somente contrato B2B aprovado, nunca administração cruzada; Storage/exclusões não atômicas contidas; login B2B não habilitado. Rollback deste complemento: reverter somente hunks/fences/testes correspondentes em revisão controlada, sem tocar migration/RLS/dados, reconhecendo que restaura efeitos visuais atrasados. **NO-GO integral; aguardar revisão, nenhuma fase seguinte iniciada.**

## Escopo e decisão
Cadastro comercial de clientes/produtores e parceiros, distinto de provisionamento de login B2B. Checkpoints STORAGE-2, MULTIPORTAL-1, CADASTRO-1 e inscrição estadual preservados. Nenhuma publicação, conta Auth, papel, convite ou envio; sem atribuir empresa a legado órfão.

**PASS focal:** contrato novo com cliente da empresa, isolamento SQL/RLS e testes locais. **NO-GO integral:** JWT/API/browser autenticado e concorrência remota não verificados. A prova SQL usa `ROLE authenticated` e claims simulados; não é sessão Auth nem prova de transporte JWT.

## Auditoria em 17 itens
| # | Superfície | Resultado/limite |
|---|---|---|
|1|Criar parceiro|`client_id` obrigatório antes do envio; instrução para cadastrar/selecionar cliente da própria empresa. Não apenas desabilitação da ação.|
|2|Ownership novo|Trigger exige cliente com `organization_id=h15_actor_organization()`, deriva autor do ator autenticado; legado sem empresa continua fechado.|
|3|RLS/grants|Restritiva `d51_5_partner_accounts_tenant_guard` mantida; sem regrant geral ou service role frontend.|
|4|Criar produtor/cliente|Empresa derivada pelo guard canônico existente; inserção própria positiva no rollback.|
|5|Editar cliente|Próprio positivo; cruzado/tenant forjado negados. Gestor existente altera cliente, não recebe escrita de parceiro.|
|6|Editar parceiro|Cliente/consultor coerentes com empresa; identidade/código/autor imutáveis no trigger.|
|7|Inativar/reativar|Parceiro usa soft-delete; cliente preserva status/histórico. Provas próprias positivas.|
|8|Excluir cliente|Próprio sem dependências positivo SQL; consulta de dependências falha fechada. Com documentos, exclusão não atômica fica indisponível; inativação permanece.|
|9|Dependências|`check_cliente_dependencies` exige alvo/empresa/ator autorizados e inclui parceiros/documentos.|
|10|Documento|Opcionalidade preservada; se preenchido CPF/CNPJ validado no formulário. Duplicidade normalizada de cliente isolada por empresa no índice. Não certifica unicidade de CNPJ em partner_accounts.|
|11|IE/campos|IE flexível e ISENTO preservados; erro mantém dados e seleciona aba pertinente no cliente. Validação fiscal não alterada.|
|12|Endereço/contatos|Consultas CEP/CNPJ cercadas por sessão e estado atual; teste de CEP atrasado não sobrescreve edição. Endereços/contatos opcionais preservados.|
|13|Lookups|Clientes/consultores limitados à empresa pronta; consultor cruzado negado pelo servidor.|
|14|Cache/sessão|Scope inclui identidade/perfil ativo/empresa/papéis; cancelamento e remoção focais das queries, respostas tardias ignoradas. Testes A→B, logout e readiness.|
|15|Reentrância/código|Lock síncrono no formulário; UUID de rascunho estável em retry, código `PARC-<UUID>` derivado servidor. Não é idempotência distribuída nem replay convergente; conflito de UUID exige reconciliação futura.|
|16|Documentos|Upload verifica cliente da empresa antes de bytes e cerca awaits; nenhuma operação real Storage nesta auditoria. Exclusão individual Storage→metadata continua não atômica, não certificada. Backup não habilita exclusão de cliente com documentos.|
|17|Mensagens/mobile|Erros de cadastro sanitizados; dados permanecem após falha. Layout existente preservado, sem certificação mobile/browser autenticado.|

## Matriz papel × superfície
|Papel/estado|Superfície|RLS/resultado|
|---|---|---|
|Administrador FSF/ARBio|`/clientes`, aba produtores/parceiros|Criar cliente/parceiro próprios permitido; leitura/update/delete/vínculo cruzados negados em SQL. Menu/URL não autoriza.|
|Gestor + consultor técnico existente|Cliente / parceiro|Update cliente próprio positivo; escrita parceiro negada. Contexto visual não altera papéis.|
|Gestor comercial|Contrato de parceiro|Permissiva existente e frontend compatíveis; sem identidade real executada, dinâmica UNVERIFIED.|
|Inativo/não pronto/sem empresa/sem UID|Cadastros|Negações SQL; não equivale renovação JWT real.|
|Demais papéis/planos|URLs e operações|Guards/entitlements preservados; matriz dinâmica completa UNVERIFIED.|

### Complemento humano — contratante e tenant próprio do parceiro
O parceiro pode ser outro tenant. `partner_accounts.client_id → clientes.organization_id` define ownership **comercial da contratante**; `organizations.partner_account_id` define o contexto próprio do parceiro. Não exigir igualdade dessas empresas. Cadastro/vínculo comercial não transfere clientes, usuários, financeiro, documentos ou notificações e não torna administrador do parceiro administrador da contratante.

Revisão do código atual: o trigger comercial160048 não consulta `organizations.partner_account_id`; sua igualdade cliente/ator diz respeito somente à escrita da contratante. Hooks comerciais cercam perfil/empresa do ator, não substituem contexto pelo parceiro. `usePartnerUsers` é leitura de usuários da **gestão comercial contratante**; não foi convertido em provisionamento/administração do tenant parceiro. A proposta de restauração em cadastro-1 foi esclarecida para não impor igualdade entre contextos distintos.

|Direção/superfície|Evidência|Gate|
|---|---|---|
|A→B e B→A, clientes/cadastros parceiros|SQL6 positivos próprios,10 negações de leitura/update/reparent|PASS focal entre empresas independentes|
|Administrador no tenant próprio do parceiro→contratante|Admin é local; nenhum organizations.partner_account_id preenchido no estado vivo|Relação parceiro-tenant real UNVERIFIED, não fabricada|
|Contratante→usuários/financeiro/documentos/notificações do parceiro|Policies vivas de profiles, accounts_receivable, financial_documents, cliente_documentos e notificações escopadas|Leitura estrutural; dinâmica vinculada UNVERIFIED|
|Leitura B2B explicitamente permitida|`partner_accounts_self_select` + `get_user_partner_id()` permitem próprio registro por vínculo/papel; não permitem clientes da contratante pela restritiva de clientes|Contrato/colunas compartilháveis requer revisão; não reabrir nem ampliar ACL|
|Tenant parceiro→administração comercial|Trigger exige cliente na empresa do ator para writes; vínculo B2B não satisfaz essa condição|Não substitui prova API real|

Risco registrado: SELECT da linha `partner_accounts` retorna todas as colunas alcançáveis; antes de restaurar provisionamento B2B, aprovar quais informações comerciais podem ser compartilhadas e verificar o guard de vínculo/prontidão. Não afirmar que cadastro comercial autoriza esse compartilhamento. Nenhuma migration nova, perfil/papel/vínculo/organização real alterado para fabricar cenário.

Prova mantida em `scripts/rbac-audit/commercial-context-isolation-proof.sql`. Run `TEMPORARY_AUDIT_228ee6ff-db64-4d60-99aa-8728ff4b46a1`: clientes `69ec6db2-ae16-41d3-84a9-95b462984d44`, `c93f4fd3-075d-4547-aa44-c434935a19e0`; parceiros `6016ebbe-3d18-4784-b1da-f2e176d87556`, `b48d583e-fa49-4663-9a0d-dfba40c5304b`. Exceção final deliberada com `positive=6 denied=10`; leitura posterior clients/partners/audits=0. Hashes antes/depois deste complemento: clientes2/65474d6e09f5030d2e96f1a619cc1efe, parceiros1/b5bad2bcc8982ec47233b346ef77994d e audit1/aa7523f762f2b171f10a80f9dfd5fc81 iguais. Divergência histórica anterior permanece sem explicação, não apagada.

Testes deste complemento:36/36 em5 arquivos, incluindo dois casos novos de contexto comercial/empresa do ator; lint teste/diff-check PASS, harness build OK16:15:25 UTC. Conjuntos anteriores não somados. SQL usa claims simulados, não JWT verificado. Prova com tenant próprio efetivamente vinculado permanece bloqueada por ausência de vínculo real e proibição de alterar organizações/vínculos reais; não criar Auth/papéis.

## Migration e rollback
Migration oficial única, ledger confirmado read-only:
`supabase/migrations/20261008160048_0379dfbf-559f-4d87-91bb-89e36ca35bbc.sql`.

Inclui trigger `guard_commercial_partner_registration`, validações de referências/financeiro finito, código/autor derivados, índice `clientes_tenant_document_unique` e core de dependências. Preflight de duplicados normalizados: zero grupos conflitantes. Não reaplicada neste fechamento.

Rollback recomendado é **forward-fix versionado** preservando RLS e guard de tenant. Antes de restaurar índice global antigo, verificar conflitos entre empresas; não remover proteção nem restaurar contrato `client_id` opcional. Frontend pode retornar ao checkpoint anterior por revisão controlada, mas voltaria a ter a contradição que originou o erro. Não executar rollback automático.

## Provas SQL e manifesto
Ambiente canônico `swzpzcwiasxmjutrmvkm`; JWT iat requerido pelo guard. Primeira tentativa sem iat falhou `tenant_context_required` e não persistiu. Provas bem-sucedidas encerram por exceção final deliberada, revertendo a transação.

- `TEMPORARY_AUDIT_cf4bd02c-2d6a-42a5-a37e-133f75d1aada`: `positives=9 denied=13`. Clientes `0f0891d1-220e-49eb-9bb5-7cf29897411f`, `0e8c6520-521a-45d5-a50b-e4cd51fe5ab7`; parceiros `053374f3-c84c-4987-8733-40e858d225ce`, `b4592818-7cd0-4744-b96c-19dbe35d60e3`. Criar/arquivar/reativar, autor/código, dependências, spoof, duplicidade normalizada, negativo/NaN e referências cruzadas.
- `TEMPORARY_AUDIT_f52cac4d-c869-476e-8fb6-fbceff68e096`: `own_delete=1 denied=7`; cliente `7df9312a-dbef-4247-bb61-d2d208468a96`. Excluir próprio sem dependências, consultor cruzado e seis contextos não prontos negados. Tentativa anterior de consultor com identificação inadequada descartada, não contabilizada como PASS.
- Manifestos exatos ausentes após rollback em clientes/parceiros/audits; última leitura dos três IDs de cliente: resíduos zero. Nenhuma identidade criada.

Hashes com `md5(string_agg(to_jsonb(row)::text,'|' ORDER BY id))`:
|Tabela|Contagem|Antes = depois|
|---|---:|---|
|clientes|2|`65474d6e09f5030d2e96f1a619cc1efe`|
|partner_accounts|1|`b5bad2bcc8982ec47233b346ef77994d`|
|partner_users|1|`04ad7c8857fa749784d7787fef559c12`|

**Divergência não explicada:** partner_audit_logs permanece 1, mas hash inicial `6afeb97f4085cfc124dd98108459e212` e final `aa7523f762f2b171f10a80f9dfd5fc81` diferem. Registro final é histórico (`create`, 2026-09-11), não fixture. Sem snapshot anterior completo não é possível atribuir a causa nem certificar integridade dessa tabela; nenhuma tentativa de corrigir seus dados. Cliente audit atual 38/hash `bd347cdc119804ff183ae24223710108`, sem baseline certificável. Não declarar todos os históricos intactos.

ACL `link_partner_user` authenticated continua false; `set_partner_user_papel` não foi liberado. Cadastro comercial não restaura login/portal B2B.

## Arquivos e verificações
- Hooks: `useCommercialRegistrationScope.ts`, `useParceiroB2BMutations.ts`, `useParceirosB2B.ts`.
- Formulários: `ParceiroB2BFormDialog.tsx`, `ProdutoresTab.tsx`, `ClienteFormTabs.tsx`, `ClienteDocumentosTab.tsx`, `ExcluirInativarDialog.tsx`.
- Contratos: `commercialRegistrationErrors.ts`, `schemas/cliente.ts`; regra estrutural registrada no bloco editável de AGENTS.
- Testes mantidos: `commercialRegistration.session.test.tsx`, `.validation.test.ts`, `.form.test.tsx`, `.delete.test.tsx`.
- Execução final: **72/72 em 8 arquivos** (cadastro, parceiro sessão, IE, telefone, scope Storage); sem somar execuções intermediárias sobrepostas.
- Lint dos novos hooks/helpers/testes PASS; lint ampliado registrou **30 erros/2 avisos** principalmente `any` existente, não PASS global. Não foi feito refactor geral fora do recorte.
- Scanners fiscal secrets/integration e diff-check PASS. Harness automático **build OK 16:11:24 UTC**, após corrigir declaração duplicada de `errors`; typecheck separado NOT RUN por instrução do ambiente, sem alegar execução manual.

## Pendências e gate
Authenticated path: **UNVERIFIED** (external_unmanaged). Sem signed-in server action/API real, não chamar erro publicado de resolvido end-to-end. Necessários browser real FSF/ARBio, mobile, troca de empresa, backend JWT e concorrência de cadastros/retries. Não criar Auth para fabricar PASS. Investigar divergência do hash de partner_audit_logs por baseline independente; não alterar o histórico. Cadastro B2B de login e legados órfãos continuam bloqueados conforme CADASTRO-1. **NO-GO integral**, sem próxima fase iniciada.