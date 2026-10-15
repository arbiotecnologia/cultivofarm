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
