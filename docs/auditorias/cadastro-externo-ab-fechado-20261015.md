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
Hosted SELECT 19:56 encontrou **zero triggers convite** e helpers novos ausentes. `rollback-external-user-ab-closed.sql` remove exatamente três triggers/dois helpers introduzidos; fecha todas ACL novas e preserva receipts/Auth/links. Não restaura grants. Rollback transacional de instalação falha continua preferencial. Baseline deve ser revalidado antes de futura execução.
## 12. Resolver/entitlement Produtor vigente
`featureRouteMap.ts`: `/portal/*` não mapeado, nenhum feature `portal_produtor` inventado. `/app/visita` e `/app/checkin` exigem visitas_tecnicas. `AppPortalGuard` e `ProducerFeatureGuard` aceitam papel real cliente_produtor (admin legado); usePortalCliente exige ready actor/profile/tenant/papel. Cadastro não adiciona feature nova; abertura depende auditoria dos canais atuais, não da simples role.
## 13. Same-tenant RLS/RPC
Hosted `get_cliente_ids_for_user` exige fn_authz_uid_scope_ok + user_clientes ativo/revoked/valid_from/valid_until; fallback profile só com vínculo vigente. `can_user_access_cliente(uuid)` usa esse array para produtor; ramo administrativo amplo exige policies restritivas de tenant em cada consumidor. user_clientes SELECT self não filtra atividade e usePortalCliente lê IDs crus/fallback; UI não é autoridade. PortalSolicitacao faz INSERT direto; RPC/policies finais de todos consumidores ainda precisam probes cliente irmão. Não modificar policies nesta rodada.
## 14. Storage: prioridade seguinte comprovada estruturalmente
Policies hosted `d516_consultor_select/insert/update/delete` incluem cliente_produtor e escopam SOMENTE prefixo tenant/role/profile ativo em consultor-arquivos: não provam cliente individual/arquivo. Risco same-tenant estrutural, sem exploração de dados. Entrega-documentos usa get_cliente_ids_for_user; logos/clientes usa vínculo ativo mas deve revisar valid_from/tenant/cadeia. Não abrir cadastro antes contenção/auditoria focal por família; nenhuma policy alterada nesta fase.
## 15. Validações próprias atuais
**31 assertions SQL +6 checks adicionais** PASS PostgreSQL descartável; **66 Vitest** PASS (55 handler baseline +11 diff em memória). ESLint focal do teste 0 erros, diff-check/Python compilation PASS. Build automático observado OK 20:00:07. Typecheck/build não executados manualmente (harness automático); sem comprovação typecheck nesta rodada. Scanner EXTERNO OS 3995/0 não equivale scanner global próprio. Sem Auth/browser hospedados.
## 16. Entrega e hashes
Candidato SQL, diff Edge, preflight assertivo, rollback e harness versionados localmente; nenhuma alteração entrypoint/UI/flags/grants/dados reais. Relatório anterior preservado como proveniência, corrigido por estas 17 seções. SHA256 atuais registrados na saída de verificação local; revisão deve recalcular ao ler arquivos.
## 17. Backlog em fases pequenas
A: correções desta revisão prontas para revisão isolada; não apto abertura global. A2: crash pré-Auth + erro/timeout compensação concorrente + fullschema exact hooks/preflight rollback executado. B1: mapear/fechar Storage consultor produtor por cliente e testar irmãos/revogação por canal sem ampliar. B2: demais portal RLS/RPC/paginação/cache/seleção e acesso link-only. JWT/GoTrue existentes read-only ou futuras fixtures explicitamente autorizadas; nesta rodada nenhuma conta real/email. OS operacional separada e preservada.
