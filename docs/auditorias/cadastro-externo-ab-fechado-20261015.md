# Cadastro B2B / Cliente Produtor — A+B fechado, 19:44

## Estado e evidência
Proteção OS aplicada externamente `20261015194058`, ledger arquivado exato (MD5 `03062d703bb0ae39be08a71cc865067c`), quatro corpos coincidentes com candidato local. Hash gerador `2c75352712438df1558a3f5453e67da0`, approval `d65be82dbf38ec429b7377bd6873ba47`; quatro triggers enabled próprios read-only. Aprovação/programação auth/anon false. **Proteção aplicada; operação NO-GO** (CAS/concorrência/cadeia B2B). Sem reexecução, fabricação ou alteração OS.

Cadastro: HEAD inicial `514052a9`. `create-user` permanece inalterado, flag false. TENANT_USER_ROLES não inclui cliente_produtor nem parceiros; ramo dedicado B2B só gestor, técnico negado. Claim/finish/abort ausentes no catálogo hospedado consultado. `admin_provision_user_profile_v1` existe INVOKER, owner postgres, service-only, MD5 `9a2e228a68f369f32fe323c6c2a7f1b8`; sozinho verifica existência mas não ownership/atividade/exclusividade. É primitiva server-only, não autorização de portal. Preflight público `6c273b67760ba1a2247ed9fd8755dfcf`, privado `6e2c2eb62d5ecb13188d035f2a3c7f2b`; respeita Admin/readiness/catalogo_precos/commercial_owner. Trigger chain usuários `baf23a188b315c042bc6d3dedd7663a6`.

## Entrega local
- `scripts/rbac-audit/proposed-external-user-ab-closed.sql`: substitui candidato lifecycle antigo, não aplicar ambos. Reusa MESMA receipt/gate/prepare/complete. Todas ACL das funções novas fechadas (sem GRANT); receipt privada RLS sem leitura cliente. Não ativa flags ou altera primitivas existentes.
- `scripts/rbac-audit/proposed-create-user-external-ab.patch`: diff sobre entrypoint existente, NÃO aplicado/deployado. Papéis externos singulares; produtor exige clientes explícitos; B2B preflight existente. Tenant deriva do ator; sem senha, convite/email, SaaS/organization independente ou adoção por email.
- `scripts/rbac-audit/preflight-external-user-ab-readonly.sql`: somente SELECT para revisão, não instalar candidato.
- Harness SQL executa a primitiva profile real versionada; helpers/Auth/schema reduzidos. Grants exclusivos de ensaio depois de verificar fechamento, jamais hospedados.

## Contrato
Gate global existente → receipt → profile/invites → parceiros/clientes ordenados. UUID reservado e email único convergem; repetição não troca partner/clientes/papel/dados/actor stamp/iat/snapshot. Claim ocupado não autoriza segundo Auth. Finish service-only valida receipt/fence/identidade/app_metadata e revalida Admin/tenant/readiness/ownership/atividade/snapshot, rejeitando adoção/transferência ou roles/links existentes. Usa admin_provision_user_profile_v1 atomicamente; produtor grava exclusivamente clientes ativos do tenant em user_clientes, parceiro uma partner_users exata gestor/técnico. Histórico e links técnicos existentes nunca são adotados para conceder portal. Primeiro acesso permanece pendente no mecanismo existente.

Prepare de compensação decide estado antes de delete Auth; completed nunca é deletado. Edge confere ID/email/app_metadata próprios. Complete exige ausência de Auth/profile/roles/partner_users/user_clientes; não finge cleanup. Abort é prepare+complete existente, sem terceiro fluxo.

## Provas próprias
**30 assertions PostgreSQL descartável PASS**: dois tenants nos alvos, parceiros irmãos, foreign client/partner, troca de receipt/email, papel interno, produtor vazio, inativo, finish três papéis, replay, exclusividade/link exato, principal/atividade, revogação cliente/owner/ator, erro última gravação com rollback e compensação somente identidade reservada. **65 Vitest PASS**:55 handler real sem mudança+10 diff real aplicado apenas em memória (SDK/Auth mocks). Não JWT/RLS/browser/produção, não fullschema.

## Pendências técnicas — não decisões humanas inventadas
1. **Concorrência distribuída A+B UNVERIFIED:** gate serializa writers participantes, mas alterações clientes/parceiros/entitlements não têm prova ABA/revogação completa. Não afirmar segurança integral de snapshots updated_at sem inventário fullschema/writers.
2. **Retry após claim ocupado/crash:** diff conserva acquired=false → reconciliação requerida, sem novo Auth nem takeover automático. Convergência completed provada; retomada após crash em Auth ainda exige reconciliation dedicada dentro do fluxo existente antes de liberar. Não esconder como PASS.
3. **Produtor entitlement/portal:** não inventado feature key. Cliente ativo+role exclusivo são preparação; mapear resolver oficial portal e readers/Storage/mutações same-client (irmãos mesmo tenant) antes de abertura. Técnico B2B exige auditoria price-free em todos canais; permanece bloqueado pela flag.
4. Preflight de implantação ainda precisa assertion automática baseline/schema/ACL/owner e rollback exato dos triggers de convite substituídos. SQL atual é corpo preparatório executável, não migration pronta para aplicar fullschema.
5. Auth SDK reserved ID/receipt e cascatas reais, JWT com iat/exp e concorrência duas sessões continuam não homologados. Sem contas reais nem emails nesta fase. Testes locais não suprem essas provas.

## Rollback e gate
Não aplicar/publicar/grantar. Em ensaio usar ROLLBACK integral; eventual revisão de implantação deve envolver BEGIN/ROLLBACK e baselines dos triggers convites. Após implantação futura, fechar flag/ACL antes da reconciliação; preservar receipts/dados e não apagar identidades sem proveniência. Nunca restaurar permissões amplas. Aprovação/programação OS seguem NO-GO, independentemente do cadastro.

Typecheck/build manuais não executados (harness automático); build automático observado OK. Lint global legado não certificado. Diff-check e compilação Python focais verificados; scanner focal não é auditoria global. Nenhuma prova Auth/browser real alegada.

# Revisão f0f450d — 19:55 UTC, substitui lacunas acima onde corrigidas

## 1. Escopo vigente
Somente **parceiro_b2b gestor e cliente_produtor**. Técnico explicitamente rejeitado no scope e diff mesmo com flag aberta. Flag real continua false; entrypoint real não alterado.
## 2. Proteção OS
Evidência EXTERNA nova: 107 assertions independentes PASS, quatro corpos EXACT MATCH ledger, scanner 3995/0. Não somada a testes próprios. Migration aplicada preservada; liberação operacional OS continua pendente.
## 3. Organização sob lock
Ator/profile locked; `organizations ativo=true/status=ativa FOR SHARE`, seguido de `NOT FOUND` fail-closed. Não existe mais aprovação de atividade antes de esperar lock. Sessão revogadora mantém lock, claim bloqueia comprovadamente em pg_stat_activity e nega após commit.
## 4. Vínculos atuais
Partner share lock + commercial_owner/ativo/deleted, ou clientes ordenados share lock + organização/status ativo. Finish repete scope sob gate/locks e compara snapshot/actor stamp/invite fence. Não muda ownership nem infere tenant.
## 5. Retry de receipt
Claim existente não reacquire nem renova lease. Diff em acquired=false só lookup por UUID reservado; exige email+app_metadata receipt exatos, depois finish com revalidação server-side. Sem lookup/adoption por email, segundo createUser ou delete nesse ramo.
## 6. Crash e expiração
Finish de claimed não usa expiração de lease como autoridade: exige Auth próprio já existente, perfil limpo, vínculos atuais e receipt/fence. Lease limita apenas primeira tentativa de criação. Expirada+Auth próprio reconciliada em ensaio. Crash ANTES de criar Auth permanece retomada negada/reconciliação requerida; não inventar ausência segura enquanto primeiro worker pode estar vivo.
## 7. Concorrência real de sessões locais
PostgreSQL descartável, dois processos psql, bloqueio observado (não apenas delay): same key converge uma UUID/um acquired. Revogação de organização concorrente nega. Não são sessões JWT hospedadas nem GoTrue real.
## 8. Auth hook
Harness reaproveita hook/profile e guards das fixtures existentes. Fonte hospedada `handle_new_user` MD5 `6f3c5072b776329ac5ff9f8bbf6fd7b2`, auto-signup sem role. Harness usa versão reduzida funcional; não afirmar exact fullschema/GoTrue.
## 9. Cascatas: GAP concreto e correção candidata
Hosted FKs: partner_users só partner_id→partner_accounts; user_clientes só cliente_id→clientes, NÃO Auth FK. Ensaio confirma Auth/profile/roles removidos mas partner link sobra. Complete candidato verifica receipt/fence/status compensating + ausência Auth/profile/roles; remove somente links da UUID reservada/partner papel gestor ou clientes/assigned_by receipt exatos. Divergência mantém pending. Teste cleanup residual exato PASS; estado compensating foi montado explicitamente para esse probe isolado, não prova produção.
## 10. Baseline assertivo
Preflight SELECT usa divisão por zero em mismatch: hashes/owner/definer/ACL primitivas, user chain `baf23a188b315c042bc6d3dedd7663a6`, receipts/funções novas ausentes, ZERO invitation triggers. Novo corpo DO nega schema ocupado ANTES DDL; CREATE TABLE sem IF NOT EXISTS. Tentativa de reaplicar em ensaio negada. Preflight é parte obrigatória da mesma transação de pacote; não houve aplicação nem execução DDL remota.
## 11. Rollback exato
Hosted SELECT 19:56 encontrou **zero triggers convite** e helpers novos ausentes. `rollback-external-user-ab-closed.sql` remove exatamente três triggers/dois helpers introduzidos; fecha todas ACL novas e preserva receipts/Auth/links. Não restaura grants. Rollback transacional de instalação falha continua preferencial. Inverso executado no PostgreSQL descartável: zero triggers convite, receipt preservada, claim ACL fechada PASS. Baseline deve ser revalidado antes de futura execução.
## 12. Resolver/entitlement Produtor vigente
`featureRouteMap.ts`: `/portal/*` não mapeado, nenhum feature `portal_produtor` inventado. `/app/visita` e `/app/checkin` exigem visitas_tecnicas. `AppPortalGuard` e `ProducerFeatureGuard` aceitam papel real cliente_produtor (admin legado); usePortalCliente exige ready actor/profile/tenant/papel. Cadastro não adiciona feature nova; abertura depende auditoria dos canais atuais, não da simples role.
## 13. Same-tenant RLS/RPC
Hosted `get_cliente_ids_for_user` exige fn_authz_uid_scope_ok + user_clientes ativo/revoked/valid_from/valid_until; fallback profile só com vínculo vigente. `can_user_access_cliente(uuid)` usa esse array para produtor; ramo administrativo amplo exige policies restritivas de tenant em cada consumidor. user_clientes SELECT self não filtra atividade e usePortalCliente lê IDs crus/fallback; UI não é autoridade. PortalSolicitacao faz INSERT direto; RPC/policies finais de todos consumidores ainda precisam probes cliente irmão. Não modificar policies nesta rodada.
## 14. Storage: diagnóstico corrigido — P1 não comprovado
Corrigido pela auditoria20:03 abaixo: d516 é ampla isoladamente, mas INTERSECTA quatro policies storage1 RESTRICTIVE já hospedadas. Não concluir acesso efetivo por prefixo sem avaliar o core privado. Entrega-documentos/logo/demais canais continuam em recortes próprios; nenhuma policy alterada.
## 15. Validações próprias atuais
**31 assertions SQL +7 checks adicionais** PASS PostgreSQL descartável; **66 Vitest** PASS (55 handler baseline +11 diff em memória). ESLint focal do teste 0 erros, diff-check/Python compilation PASS. Build automático observado OK 20:00:07. Typecheck/build não executados manualmente (harness automático); sem comprovação typecheck nesta rodada. Scanner EXTERNO OS 3995/0 não equivale scanner global próprio. Sem Auth/browser hospedados.
## 16. Entrega e hashes
Candidato SQL, diff Edge, preflight assertivo, rollback e harness versionados localmente; nenhuma alteração entrypoint/UI/flags/grants/dados reais. Relatório anterior preservado como proveniência, corrigido por estas 17 seções. SHA256 atuais registrados na saída de verificação local; revisão deve recalcular ao ler arquivos.
## 17. Backlog em fases pequenas
A: correções desta revisão prontas para revisão isolada; não apto abertura global. A2: crash pré-Auth + erro/timeout compensação concorrente + fullschema exact hooks/preflight. B1: mapear/fechar Storage consultor produtor por cliente e testar irmãos/revogação por canal sem ampliar. B2: demais portal RLS/RPC/paginação/cache/seleção e acesso link-only. JWT/GoTrue existentes read-only ou futuras fixtures explicitamente autorizadas; nesta rodada nenhuma conta real/email. OS operacional separada e preservada.

# Revisão 0be49f — 20:03 UTC, atualização vigente em 17 seções

## 1. Escopo e proveniência
Somente candidatos locais Storage/pré-Auth, testes isolados e metadados hosted read-only no canônico `swzpzcwiasxmjutrmvkm`. Evidência EXTERNA Renato: d516 permissivas incluem Produtor por prefixo tenant. Não houve execução DDL, grant, deploy, publicação, arquivo removido, conta real ou email; cadastro A+B continua fechado. OS aplicada e gates operacionais preservados.
## 2. Diagnóstico concreto: interseção, não policy isolada
33 policies em storage.objects, hash agregado `cfbc909356cc3e420d66efac99e69ba6`. Quatro d516 PERMISSIVE; quatro storage1 RESTRICTIVE aplicáveis a anon/authenticated fazem CASE por bucket e chamam diretamente `platform_private.storage1_consultor_core`. Para consultor-arquivos, OR permissivo é AND com restrições. O core hospedado `5c9e435c51d19d1dcbf5d61a9095daf3` JÁ exige tenant/visita/cliente e technical_child_read_scope. Portanto a conclusão anterior de acesso efetivo por mero tenant era incompleta: **P1 por d516 isolada não comprovado**. Ensaio reproduziu before cliente irmão=0/tenant cruzado=0, não exploração de arquivos reais.
## 3. Policies aplicáveis
Revisadas todas as 33: d516 e storage1 são as únicas expressões específicas desse bucket; demais permissivas condicionam outros buckets, sem policy genérica aberta encontrada. storage1 mantém `USING` e `WITH CHECK` em UPDATE, INSERT check, DELETE/read using. Não remover d516 nem enfraquecer restrições; candidato altera SOMENTE corpo do core, preserva ACL/owner/todas policies e sem objetos novos.
## 4. Metadata e path
Caminho real é tenant/registro/(foto|audio|documento)/arquivo; UUID cast protegido, traversal/%/barra duplicada/ID inexistente/prefixo forjado negados. `storage.objects.metadata`, owner_id, nome original, uploaded_by e claims fornecidos pelo cliente não autorizam. **Correção 20:12**: o vínculo autorizador atual é path→registro→cliente com tenant e helpers transitivos; metadata de anexo não é fonte de autorização. O ensaio de metadata divergente não demonstrou acesso a visita/cliente não autorizado, portanto não comprova P1. A exigência extra de referência única não foi solicitada e o candidato correspondente foi retirado. Nenhuma regra existente será removida ou substituída.
## 5. Cliente e liberação
Produtor exige role real, h15/readiness, cliente no tenant ativo (`status_cliente=ativo`), vínculo canônico vigente em get_cliente_ids_for_user (ativo/revoked/valid_from/valid_until), visita liberada aprovado/finalizado/convertido_os e escopo child existente. ID de cliente/visita no path não cria vínculo. Revogação/cliente inativo/tenant alterado negam.
## 6. Internos e técnicos
Ramos internos mantidos byte a byte após fence Produtor: leitura usa can_view_technical_visit; escrita usa can_manage_technical_visit e visita rascunho/em_andamento. Admin/Gestor mantidos; Consultor/Agrônomo somente carteira e responsável/participação conforme helper hospedado. Aplicador não ganha exceção onde helpers existentes negam. Usuário com role Produtor, ainda que multipapel legado, recebe restrição conservadora; cadastro A+B exige exclusividade. Upload interno→list→metadata não é quebrado por exigir metadata antes do upload.
## 7. CRUD e renomeação
Produtor SELECT apenas após prova inteira; INSERT/UPDATE/DELETE negados explicitamente, inclusive arquivo próprio. PostgreSQL RLS executou INSERT prefixo forjado com metadata/owner e negou; UPDATE/DELETE Produtor afetaram zero linhas. Técnico autorizado fez INSERT/UPDATE/DELETE; UPDATE de path para outro tenant falhou WITH CHECK. Rename dentro de escopo não ganha autorização adicional; referência divergente fica invisível ao Produtor.
## 8. Cadeia metadata/visitas
Metadata tem três permissivas (Admin/Gestor/Administrativo ALL; responsável ALL; cliente arquivos liberados SELECT), quatro restritivas technical_files_* que exigem child read/manage, status, uploaded_by, path/registro e core. Legacy can_user_access_registro_consultor possui ramos amplos, mas o candidato não o usa como substituto dos helpers técnicos. `technical_child_read_scope` hash220b06fa; can_view e1534128; can_manage d95c2c2b; get_cliente_ids c80d5900. Revalidação atual pelo servidor, nunca UI como autorização.
## 9. URL assinada e público
Bucket hospedado **`public=false`**, limite20MiB. useSignedUrls usa SDK canônico/ator e createSignedUrls com TTL3600s; RLS SELECT decide NOVA assinatura. URL já emitida é bearer até expirar: revogar vínculo não invalida retroativamente o token; cache/fence visual não é revogação Storage. Sem emissão/download de URL real nesta rodada. Caso de API assinatura após revogação/TTL permanece UNVERIFIED, não contar SQL como prova Storage API. Helpers de path não implementam assinatura nem autorizam service.
## 10. Edge/service_role
Busca em todas funções locais não encontrou acesso ao bucket literal consultor-arquivos; `enviar-pdf-visita` responde503 antes de Auth/reads/transport, sem links. Outros signers têm buckets próprios. Service_role BYPASSRLS provado no ensaio; policy autenticada NÃO o contém. Inventário de funções SQL com referências ao bucket/core e wrappers foi lido; implantação remota das Edges não conferida, buckets dinâmicos/produtores externos não certificados. Não usar service_role para simular Produtor. Nenhum endpoint privilegiado foi aberto/modificado.
## 11. Candidato/baseline
`scripts/rbac-audit/proposed-consultor-storage-client-fence.sql` contém BEGIN + baseline assertivo + uma substituição de core + COMMIT, **NÃO APLICADO**. `preflight-consultor-storage-client-readonly.sql` exige hash corpo/33policies, postgres/DEFINER/search_path vazio/ACL exata, RLS, bucket privado e colunas existentes. Preflight executado read-only próprio retornou1. Ref validado pela configuração canônica/tool vinculado; SQL não inventa ref via GUC. Novo core MD5 compilado PostgreSQL isolado `0aee68429a879f5ffc4ef7a87d0ea8e8`; baseline compilado em schema reduzido, não instalação fullschema.
## 12. Rollback restritivo
`rollback-consultor-storage-client-fence.sql` verifica hash candidato/ACL antes de substituir; mantém internos baseline e NEGA todo Produtor. Não restaura core broad, grants ou apaga dados. Falha na instalação usa ROLLBACK integral preferencial. Preserva policies/owner/ACL; revisão deve executar baseline e diff dentro da mesma transação, sem concorrentes DDL. Rollback local executado, produtor permaneceu negado.
## 13. Crash pré-Auth
Diff `proposed-create-user-external-ab.patch` não aplicado ao create-user. acquired=false na MESMA receipt/UUID retorna409 `b2b_provisioning_auth_pending`, pending/recovery_required/retry_same_request se lookup ausente, error ou throw. Mensagem preserva solicitação/email; não exige outro email, reset, takeover, lease, segundo Auth ou delete. Receipt permanece claimed/fenced. Ausência404 não demonstra worker encerrado; não alegar recuperação automática concluída.
## 14. Recuperação controlada
Retry existente revalida claim/ator/tenant/vínculos sob locks; consulta SOMENTE UUID reservada. Se primeiro worker termina e Auth própria aparece com email/app_metadata receipt, finish revalida servidor/snapshot/fence; teste converge sem segunda criação. Identidade alheia mantém reconciliation_required. Se nunca aparece: estado pending explícito é resultado seguro autorizado, não decisão humana inventada. Reset/acquire controlado só em recorte futuro com prova de worker encerrado, ausência GoTrue inequívoca e locks/fences atuais; nenhum novo mecanismo foi criado. Compensação timeout/fullschema segue pendente separadamente.
## 15. Provas próprias
**75 assertions PostgreSQL descartável Storage PASS**, core hospedado real antes/depois + policies permissivas reais, RLS de PostgreSQL, helpers Auth/visita reduzidos. Cobrem dois clientes irmãos/outro tenant, before/after metadata divergente, NULL/múltiplas, forged IDs/path/metadata/owner, quatro ações, status/inatividade/validade/revogação/carteira/readiness, internos, anon e limite service bypass. **31 assertions +7 checks cadastro** regressão PASS, duas sessões concorrentes existentes/rollback exato. **75 Vitest PASS**:55 handler real fechado+16 diff em memória+4 paths; SDK/Auth mocks, sem GoTrue. ESLint focal0, Python compile/diff-check PASS. Build automático observado OK20:09:39; typecheck separado sem sinal, lint/scanner globais não certificados. Scanner focal de candidatos/testes sem credenciais relatado na verificação final; não scanner3995 externo.
## 16. Entrega e reprodução
Rodar `python3 scripts/tests/consultor-storage-client-local.py`, `python3 scripts/tests/external-user-ab-local.py`, `bun run test -- src/test/security/external-user-ab-proposal.test.ts src/test/security/create-user-edge-handler.test.ts src/test/security/d51-6-storage-path.test.ts`. Não usam banco hospedado. Candidato/preflight/rollback Storage novos; diff Edge/teste existentes ajustados; relatório/roadmap atualizados, app/flags/deps/contas inalterados. Hashes SHA256 registrados na saída de entrega, recalcular após revisão.
SHA256 candidato Storage `1dce84b31d3f2869e9beb6ef6fd257b5be48a3abbf8e069a1c1602b542a0d48e`; preflight `69b55b6065972c55c90ea755fd3bf2e5deedbcff9204d3c42b8f8154e9f64857`; rollback `9e752f05c474e23877d82976ad268911ce730b2ec80f0adde9aa708fdd082a71`; diff Edge `75ca57e1709b080fe09c611bdaadbb417dadef6bd11116f8aeed096085ee3643`. Baseline ACL exata foi reproduzida no harness; primeiro ensaio do novo assert de rollback identificou ACL local PUBLIC diferente, corrigida somente no setup isolado e retestada75/75, sem mudar candidato para contornar baseline.
## 17. Gates e pendências concretas
GO preparação focal/revisão, **NO-GO aplicação/A+B/liberação operacional OS**. JWT/GoTrue/Storage API/signed URL/fullschema/Edges hospedadas ainda UNVERIFIED; não se trata de falta de credenciais: fixtures AR já autorizadas quando indispensáveis e login titular humano. Nesta rodada NÃO alterar contas reais nem criar fixtures; candidato inexistente remotamente impede end-to-end do after. B2 demais readers/RPC/Storage logo/seleção/cache ainda auditados por recortes pequenos, sem feature portal inventada. Próximo passo revisão independente destes arquivos, depois probes hospedados explicitamente aprovados; não abrir grants/flag automaticamente.


# Revisão 20:12 — vigente; supersede o reforço Storage anterior

## 1. Escopo
Auditoria das regras existentes e regressão pré-Auth; sem app, DDL, grants, conta, email ou publicação.
## 2. Evidência externa
Renato confirmou interseção PERMISSIVE/RESTRICTIVE com tenant, registro, cliente e autorização transitiva; d516 isolada não demonstra P1.
## 3. Baseline próprio hospedado
Read-only canônico: core `5c9e435c51d19d1dcbf5d61a9095daf3`, 33 policies `cfbc909356cc3e420d66efac99e69ba6`, bucket privado; sem drift.
## 4. Todas as policies
Auditoria anterior das 33 preservada: somente d516 oferece ramo permissivo desse bucket; storage1 restringe as quatro ações. Não analisar OR permissivo como autorização final.
## 5. Cadeia transitiva
Core usa path estrito→registro→cliente tenant, technical_child_read_scope SELECT; mutações internas can_manage + rascunho/em_andamento. Corpo hospedado child `220b06fa2e634b7ea23df04cbd473c5e` coincide com arquivo versionado; get_cliente_ids `c80d5900692d960f649d0a9f7850fe2c` conferido read-only e reproduzido com fallback dependente de vínculo vigente.
## 6. Probes efetivos
Harness agora executa SOMENTE core/policies existentes + corpos técnicos versionados, não candidato; RLS PostgreSQL combina permissiva E restritiva. Dois clientes irmãos, outro tenant, prefixos/IDs forjados, CRUD, revogação/validade, papel/participação/carteira/status/readiness.
## 7. Referências
Path/registro/cliente são autoridade existente. Metadata NULL, duplicada ou divergente não cria acesso a cliente irmão; requisito adicional de unicidade retirado. Fazenda cruzada é negada pela cadeia transitiva.
## 8. Internos
Admin/Gestor preservados; técnico precisa carteira e responsável/participante para leitura, somente responsável com execute/manage para mutação. Participação revogada e carteira read-only testadas.
## 9. Retirada do candidato
`proposed-consultor-storage-client-fence.sql.withdrawn` e `rollback-consultor-storage-client-fence.sql.withdrawn` são histórico NÃO executável como migration, retirados da entrega ativa. Não aplicar rollback de mudança nunca aplicada; nenhuma nova migration Storage necessária pelos probes atuais.
## 10. API e assinatura
URL já assinada até expirar e caminho privilegiado continuam limitações da API, não P1 inferido nem motivo para substituir policies. Sem assinatura/download real ou service-role remoto. Bucket privado permanece.
## 11. Pré-Auth concluído no recorte seguro
Ausência/erro/timeout da UUID reservada retorna pending 409, mesma solicitação/email. Worker possivelmente vivo não autoriza reset ou segunda criação. Estado pendente explicado é resultado suficiente autorizado, não lacuna de nova identidade.
## 12. Recuperação
Se Auth própria surge, retry UUID+receipt→finish revalidado; identidade alheia, claim negado ou finish revogado não criam/deletam/adotam conta. Testes adicionais cobrem falha de revalidação no retry.
## 13. Concorrência local
Harness A+B usa duas sessões PostgreSQL para mesma receipt e revogação sob locks; hooks/cascatas reduzidos continuam distinguidos de GoTrue real.
## 14. Diagnóstico final corrigido
Não há P1 comprovado de acesso Storage por d516 isolada nem pelo requisito de metadata adicional. Preservar integralmente helpers/policies existentes. Os probes efetivos passaram no modelo isolado; não equivalem a Storage API/JWT hospedados.
## 15. Validações
82 assertions Storage nas regras EXISTENTES PASS; 31 assertions +7 checks A+B PASS (incluem duas sessões concorrentes e revogação sob lock); 77 Vitest PASS, SDK/Auth simulados. ESLint focal, Python compile e diff-check PASS. Build/typecheck automático final20:16:00 OK após corrigir tipagem do mock de finish; erro intermediário não omitido. Nenhum teste próprio JWT/Storage API/fullschema, lint global ou auditoria integral. Sem app modificado.
## 16. Pendências reais A+B
Hook/Auth fullschema, timeout de compensação, demais canais de portal B2 e seleção/cache continuam requisitos de abertura, não novo diagnóstico Storage. A+B flag/entrypoint/deploy/grants continuam fechados; não é falta de credencial.
## 17. Rollback e OS
Sem mudança hospedada, nenhum rollback Storage a executar. A+B inverso restritivo existente preservado; proteção OS aplicada não alterada e liberação operacional separada.


# Entrega 20:40 — integração existente e pacote fechado, vigente

## 1. Escopo
Continuação autorizada de 9db5706; UI no código existente, candidatos SQL/diff Edge locais. Nenhum DDL/grant/deploy/publicação/Auth real/email executado. OS20261015194058 e Storage core/policies preservados; .withdrawn fora da entrega.
## 2. Usuários
Configuracoes mantém interno e acrescenta B2B gestor/Produtor, vínculos paginados20 e principal explícito; Técnico negado. Sem tenant/senha em payload externo. Submit externo desabilitado por EXTERNAL_USER_ACTIVATION_REVIEWED=false, também negado na mutation. Contexto muda: formulário/diálogo reset, query cancel/eviction. Callbacks recebem fence POR REQUEST, não ref compartilhada. Campos opcionais internos não são oferecidos ao externo quando não transportados.
## 3. Validação
externalUserDraft valida papéis exclusivos, UUID, clientes1–100 sem duplicatas e principal pertencente; senha externa proibida. O validador interno continua exigindo senha. Testes atuais demonstram rascunho externo sem senha válido; suspeita de bug herdado de senha não se confirmou (erro password removido no contrato externo).
## 4. Auth inventário fullschema
Read-only hosted inventariou constraints/triggers profiles/user_roles/user_clientes/partner_users/auth e handle_new_user6f3c5072. Perfil sem role; Auth cascade profile/roles, NÃO partner_users/user_clientes. Guards de gate/status/tenant/sensitive/profile timestamp e sync_user_cliente_principal50392a57 identificados. Harness inclui sync real e gatilhos de links, mais primitiva profile real; NÃO é reprodução integral GoTrue/fullschema.
## 5. Compensação concluída no candidato
Diff create-user existente retoma receipt compensating; prepare lê estado locked, completed retorna sem lookup/delete. UUID/email/app_metadata exatos antes delete; timeout/erro delete/cleanup→503 pending. Auth404 após delete apenas chama complete SQL, que exige ausência Auth/profile/roles e links exatos. Lookup incerto/foreign não deleta. Retry claimed pré-Auth permanece409 pending seguro aceito; nunca segundo Auth/email/reset/lease como autoridade.
## 6. Replay
Finish completed agora também exige Auth UUID/email/receipt além perfil/role/links. Nenhuma conta completed é compensada. Claim/finish revalidam ator/tenant/links locks; gate impede concorrência entre finish e prepare participantes. Não afirmar fencing distribuído de serviços externos não inventariados.
## 7. Concorrência e falha encontrada no ensaio
38 checks A+B locais (31 SQL+7 checks incluindo duas conexões), PASS. Uma reexecução concorrente falhou: stub auth.jwt criava iat via now() em cada transação; corrigido ENSAIO para mesmo iat atual nas duas sessões, sem flexibilizar candidato. Same key→uma UUID/um acquired; organização revogada após espera negada. Snapshot/iat diferente continua conflito seguro.
## 8. Seleção do Produtor
usePortalCliente usa get_cliente_ids_for_user ativo/vigente/revoked e resolve cliente ativo no tenant, sem IDs crus/fallback como autoridade. user_clientes principal serve somente preferência. AbortSignal/epoch/scope e refresh focus eliminam late results; provisória/loading desabilitam. Preferência scoped é limpa no logout sem apagar keys alheias.
## 9. Cache/mutações
useScopedPortalQuery usa user/org/roles/readiness, AbortSignal, fence, eviction; orders/items/list/detail e consumidores comerciais reutilizam wrapper (sem mudar RBAC). Mutações create_partner_order/actions ignoram callbacks/toasts/invalidation stale. RPC/RLS continuam autoridade, sem retry de writes automático.
## 10. Workspace Produtor
PortalLayout contador scoped/abort/fence realtime; troca user/tenant/client/revoke/loading desmonta Outlet e fecha picker, evitando formulário/filhos antigos. Prova com página/QueryClient reais e sessão mock. Não certifica cada cache agrícola interno; inventário viu chaves antigas em Fazenda/Talhão/Recomendacoes, pendência técnica explícita antes abertura geral.
## 11. P1 estrutural distinto do Storage
Quatro get_portal_cliente_b2b_* SECURITY DEFINER authenticated EXECUTE=true usam _portal_cliente_user_has_link cru, sem revogação/atividade/vigência. Esta é lacuna concreta de autorização estrutural, NÃO exploração JWT provada. Candidato producer-commercial-read separado: role/readiness/cliente ativo/link vigente+tenant+partner commercial_owner, IDs detalhes alheios/inexistentes mesmo erro, ACL fechada. Helper compartilhado de notificações e Storage intocados.
## 12. Provas dos readers
17 assertions PostgreSQL descartável com QUATRO corpos efetivos candidatos: próprio, irmão, outro tenant,NULL, lists/details, revogado/expirado/inativo/técnico, parceiro cruzado, anon e ACL fechada. Tables/Auth/helpers reduzidos; preflight hosted não roda no stub, explicitamente retirado SOMENTE no ensaio. Não prova RLS/JWT real nem inventário total de descendentes catálogo privado; ownership OFF.
## 13. Entitlement/contexto
Nenhuma feature portal_produtor criada: mapa /portal sem key; App/Producer guards papel real. get_my_available_portal_contexts sem produtor NÃO é isoladamente bloqueio: AuthRoute produtor usa fluxo legado /app porque hasPortalRole exclui produtor. Sem rotas/permissões alteradas. Solicitações têm restritiva technical_request_tenant_isolation e leitura/mutação linked; criador também permissivo, requer ensaio efetivo completo antes certificar revogação de todas APIs.
## 14. Artefatos/preflight/rollback
SQL A+B, diff create-user, preflight/rollback existentes; novo proposed/preflight/rollback-producer-commercial-read; contrato external-user-ab-activation-contract.md. Baseline readers atômico no candidato; quatro hashes, owner/ACL assertados. Contrato grants mínimo DOCUMENTAL, nenhum grant executado. Rollback fecha, não restaura leitor vulnerável, não remove dados.
## 15. QA
208/208 Vitest16arquivos PASS, 38 A+B PostgreSQL e17reader PASS; Auth/transporte simulados. Lint novo/focal10arquivos0; arquivos legados Configuracoes/order hooks/validation apresentam no-explicit-any e demais erros anteriores, NÃO lint global PASS. Scanner focal0/diff-checkPASS. Build automático20:40:09 OK; erros TS intermediários de colunas corrigidos via filter. Nenhum typecheck/build manual executado; newest harness build OK, typecheck separado sem saída de sucesso explícita — não alegar certificação própria independente.
## 16. Limites e intervenção real
external_unmanaged confirmado: ferramenta não oferece sessão autenticada end-to-end deste projeto, não pedir credenciais. Nenhuma fixture Auth criada: pacote precisa revisão antes instalação e testes do after. Não é autorização para emails, fabricar, cobrança ou liberar gates. Auth fullschema real/GoTrue/canais agrícolas ainda não certificados; pacote revisável entregue, ativação NÃO apta automática.
## 17. Resultado
GO para revisão local dos artefatos e UI fechada; aplicação/ativação aguarda revisão expressa. Bloqueios concretos: candidato ausente hosted, Auth/GoTrue completo não executado e matriz dos canais agrícolas remanescente. Sem novo fluxo paralelo, sem decisão humana comercial inventada. SHA256 atuais em manifesto de entrega, recalcular ao revisar.

# Revisão 20:42 — código real do portal, supersede pendência de cache20:40

Seleção same-tab agora usa `useSyncExternalStore` no hook EXISTENTE, sem provider ou cliente Supabase paralelo. Cada instância resolve `get_cliente_ids_for_user` antes de clientes ativos no tenant; `user_clientes` não autoriza fallback e principal só considera `is_active`, `revoked_at` e vigência. Readiness exige perfil correspondente/ativo, tenant, papel elegível e senha não provisória. Preferências em memória e storage são limpas no logout; storage event sincroniza outras abas somente com cliente já validado.

Financeiro, Dashboard existente, Fazenda/Talhão e filhos, Registros/Recomendações, Solicitação/Agenda, OS/Produção/Entregas/Aplicações/Histórico usam o wrapper existente: key contém ator/tenant/papéis/readiness mais cliente/recurso/filtro, cancelamento exato + epoch, eviction de outro ator, sem cancelamento de recursos irmãos. Detalhes exigem pai filtrado pelo cliente antes de executar filhos; Talhão usa join inner da fazenda. Respostas tardias não repovoam cache. Realtime e callbacks de Solicitação/Agenda capturam contexto e ignoram efeitos antigos. Layout existente desmonta filhos na troca de escopo/cliente; nenhuma rota/feature/grant nova.

Provas próprias: componentes reais Financeiro/Dashboard/Fazenda/Talhão renderizados com QueryClient real e Supabase/sessão SIMULADOS. Troca de cliente aborta todos requests antigos; filhos não executam antes de pai; senha provisória bloqueia requests. Hook com duas instâncias demonstra troca sincronizada; testes de user/tenant/loading/logout/revoke/cliente/disabled/password e recursos irmãos. Isso NÃO é JWT/Auth/browser hospedado. Erros intermediários de imports, mock `.is`, `setLoading` residual e campo legado de observação foram detectados e corrigidos, não ocultados.

Evidência EXTERNA Renato: hook Auth `6f3c5072b776329ac5ff9f8bbf6fd7b2`,27 triggers users examinados/sem role automática; inventário ARBio1Admin pronto/zeroB2B/Produtor. Nenhuma conta criada nesta rodada. Prova real depois da instalação revisada depende identidade autorizada e login titular; não forjar claims como JWT. Storage core/policies e proteção OS20261015194058 intactos. SQL/diff Edge/preflight/rollback/grants DOCUMENTAIS da entrega20:40 permanecem fechados e com hashes do manifesto; nenhuma migration adicional para cache. Rollback frontend deve fechar montagem do workspace/ativação, não restaurar cache sem escopo nem reabrir leitores vulneráveis.

QA final deste recorte:82/82 Vitest em9arquivos PASS; scanner de secrets PASS, cinco hashes do manifesto conferidos e diff-check sem erro. Build/typecheck AUTOMÁTICOS20:49:49 OK após key estável;27/27 testes de quatro arquivos reexecutados PASS e lint focal quatro arquivos0erros/0warnings. Não declarar lint global PASS, nem estes testes como Auth/JWT real. Nenhuma publicação/DDL/grant/deploy/conta/email.

# Recorte 20:50 — títulos e parcelas B2B (candidato, NÃO aplicado)

## Diagnóstico confirmado e proveniência
Inspeção read-only exclusivamente no ref canônico confirmou todas as policies de accounts_receivable, accounts_receivable_installments, partner_users e links financeiros. Títulos/parcelas têm permissivas próprias e restritiva tenant_isolation_d51_5; partner_users tem somente SELECT admin via is_tenant_admin_for_user, que exige administrador. Ensaio PostgreSQL DESCARTÁVEL com SET ROLE authenticated, predicates efetivos e contexto coerente existente demonstrou: vínculo próprio invisível; contexto B2B não NULL; zero títulos e zero parcelas. É falha funcional reproduzida LOCALMENTE, não vazamento nem JWT B2B hospedado comprovados.

## Correção mínima preparada
proposed-b2b-receivables-read.sql altera SOMENTE ar_partner_select_own_b2b e ari_partner_select_own_b2b: partner_id vem de b2b_commercial_context, sem subquery client-side a partner_users. Papel parceiro_b2b continua obrigatório; técnico negado. Contexto já exige papel externo exclusivo, vínculo único/papel gestor, readiness, organização e parceiro ativos, owner coerente e entitlement catalogo_precos. Restritiva tenant permanece; não traduzir tenant P em A nem ampliar títulos legados. Parcela exige pai visível via RLS e origem B2B_ORDER; own título NULL/cross-tenant ou filho forjado/órfão não aparece. ar_producer_read/ari_producer_read ficam byte-for-byte inalteradas: get_cliente_ids_for_user, partner_id NULL, origin_type IS DISTINCT FROM B2B_ORDER.

## Preflight e inverso
Preflight assertivo embutido compara todas policies das duas tabelas e partner_users, RLS/owner e hashes dos três helpers, além EXECUTE authenticated/anon do contexto. Nenhum GRANT ou helper novo. Baselines policies: AR dd0570ef9de3819bd7b165dda783aec2; parcelas b57b4d9b7549325c20f77bd829afdae0; partner_users f48a220014054b74eda8f90326bf09d1. Core contexto02158d4204dea67308558f649113ba6d; h1564e10608403238a41a9baf92857ca881; admin6f548278ad7a8fc39e83cad7c0101de2. rollback-b2b-receivables-read.sql fecha só as duas branches B2B, sem restaurar subquery defeituosa ou tocar Produtor/internos/dados.

## Consumidores e dependências reais
useB2BReceivables usa join partner_order_financial_links→accounts_receivable; também há subquery crua em pofl_partner_select_own, pops_select, popt_select e ptl_select_staff_or_partner. Links/schedule/terms intersectam b2b_phase1_* restritivos, cujo b2b_actor_scope depende organizations.partner_account_id legado — não supor que contexto commercial_owner corrige isso. São dependências fora das duas policies, NÃO reabertas neste candidato; não alegar financeiro portal completo resolvido.

Portal Parceiro Financeiro usa usePortalPartnerFinancial→rpc_portal_partner_financial(uuid). BOTH overloads (uuid e sem args) têm authenticated/anon EXECUTE fechado: hashes ecd99f80a194bb9b540a4c197e0b9afe /832b0b107151ffd2c2f2be385964c22a. Seus corpos SECURITY DEFINER consultam tabelas como owner e não se beneficiam desta correção RLS; permanecerão fechados. A versão uuid permite filtro staff sem tenant explícito: não conceder EXECUTE isoladamente. rpc_b2b_partner_credit40c9e5493f4901521f277242d502c55f reutiliza assert_b2b_partner_scope antes calculator, preservado. Harnesses Edge fase-e-runtime-harness/entrega-runtime-harness usam service para fixtures; não invocados, não equivalem a usuário B2B/RLS. Nenhum transporte externo ou geração financeira executado.

## QA focal 20:55
26 assertions PostgreSQL/RLS PASS (incluindo baseline antes, candidato depois e rollback);44/44 Vitest em3arquivos PASS, scanner secrets PASS e git diff --check PASS. Build automático20:54:58 OK; sem typecheck/build manual e sem lint global declarado. Manifesto separado b2b-receivables-delivery.sha256 cobre candidato/inverso/runner; manifesto A+B anterior preservado.

## Provas e limites
Runner scripts/tests/b2b-receivables-rls-local.py usa PostgreSQL/RLS real isolado com schema reduzido, Auth/entitlements/readiness/legado e vínculo Produtor SIMULADOS. Corpo comercial existente reutilizado; preflight hospedado removido somente no ensaio. Testa baseline defeituoso, próprios/irmãos/tenant cruzado, IDs de filhos cruzados/NULL/órfãos, vínculo duplicado/revogado, readiness/senha provisória, parceiro inativo/owner inválido, entitlement revogado, técnico, troca cliente/parceiro, Produtor ativo/revogado, anon, internos e rollback. Sessão Admin AR confirmada pelo usuário é evidência EXTERNA e não substitui identidade B2B exclusiva. Ambiente informa external_unmanaged: nenhuma sessão titular foi forjada nem credencial solicitada. Revisão/aplicação e JWT B2B after permanecem gates concretos; GO somente para revisão focal, não abertura do Financeiro. Storage/.withdrawn/OS20261015194058 preservados.
