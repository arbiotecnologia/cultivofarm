# Auditoria D51 — relatório do gate

Data da execução: 2026-10-02  
Supabase auditado: `swzpzcwiasxmjutrmvkm`  
Escopo encerrado antes de SMTP real, pedido real e D52.

## Decisão

**Gate D51: aprovado tecnicamente para o escopo seguro, mas BLOQUEADO para homologação real de Auth/SMTP.**

Não houve envio de e-mail, criação intencional de usuário, processamento de pedido ou publicação do aplicativo. A única publicação autorizada nesta continuação foi a Edge Function `platform-invite-org-admin`, necessária para alinhar o runtime ao forward-fix canônico já aplicado.

O bloqueio permanece porque não foi executado E2E autenticado com conta descartável controlada e porque o projeto mantém 492 achados históricos do linter, incluindo proteção contra senhas vazadas desativada. A suíte completa também contém seis testes estáticos históricos incompatíveis com o estado atual das migrations/JWT; os testes focados D51 estão verdes.

## Diferenças em relação ao estado encontrado

- O provisionamento anterior era síncrono e tinha janela de órfão entre Auth e Postgres.
- Não havia retomada segura por intenção server-only nem fencing para takeover de lease.
- Reenvio/retomada não renovava necessariamente link ou senha para uma conta já criada.
- `admin-update-user-password` autorizava administrador genérico sem comprovar o mesmo tenant.
- `/reset-password` era destino de recovery sem rota implementada.
- Sessão Auth sem `profiles` permanecia autenticada.
- O caminho histórico de conclusão baseado em MD5/GUC ainda existia no banco.

## Correções P0/P1

### Provisionamento SaaS e Auth ↔ Postgres

- Intenção persistida em `platform_org_admin_invites`, com `request_id`, contador de tentativas, status, erro sanitizado e lease.
- Serialização por e-mail com advisory lock e índice único.
- Lease de dois minutos com token de fencing; finalize/fail só aceitam a reserva vigente.
- Estado `ativo` é terminal e retorna idempotentemente, sem reprovisionar.
- Retomada aceita somente Auth user cujo `raw_app_meta_data.provisioning_request_id` coincide com a intenção; e-mail isolado e `user_metadata` não autorizam adoção.
- Reenvio reaproveita a conta comprovada e renova link recovery ou senha temporária, sem criar outra conta.
- Compensação remove somente usuário criado pela execução corrente; conta retomada nunca é apagada.
- Nenhuma senha, token ou link completo é registrado em logs/auditoria.
- Superadmin é validado server-side como ator, mas não recebe papel operacional.

### Senha e recovery

- `admin-update-user-password` consulta decisão server-only que exige administrador e alvo na mesma organização e bloqueia superadmin como alvo.
- Primeiro acesso continua com senha atualizada pela Admin API antes da limpeza transacional do estado; falha preserva o bloqueio.
- O caminho legado MD5/GUC perdeu todos os grants.
- `/reset-password` trata `PASSWORD_RECOVERY`, valida a senha, limpa URL/history, encerra a sessão e não aceita redirect arbitrário.
- Sessão Auth sem perfil local agora executa `signOut` fail-closed.

## Banco, migrations e estado aplicado

Arquivos versionados:

- `supabase/migrations/20261038000000_d51_provisioning_fencing.sql`
- `supabase/migrations/20261038001000_d51_admin_password_tenant_guard.sql`

Forward-fix aplicado ao canônico:

- assinatura canônica de `platform_claim_org_admin_provisioning` inclui `p_actor_id`;
- RPCs claim/find/finalize/fail são `SECURITY DEFINER`, `search_path=''` e executáveis somente por `service_role`;
- lookup usa `auth.users.raw_app_meta_data`, nunca `raw_user_meta_data`;
- escrita direta em convites foi revogada de `anon`/`authenticated`;
- `admin_can_update_user_password_server` é executável somente por `service_role`;
- funções históricas de conclusão de senha ficaram sem EXECUTE para cliente e service role.

Evidência pós-migration: linter informou que nenhum achado foi introduzido. A tabela possui índices únicos por `lower(email)` e `request_id`, além do índice parcial de lease.

Observação de reconciliação: o registry `supabase_migrations.schema_migrations` não exibiu versões `20261038...`, embora os objetos e grants tenham sido confirmados diretamente. Isso indica dívida de ledger/nomenclatura a reconciliar antes de promoção formal; não reaplicar a migration cegamente.

## RLS, grants e isolamento

- RPCs internas D51: `anon=false`, `authenticated=false`, `service_role=true`.
- Funções auditadas possuem `search_path` fixo.
- `organizations`, `profiles`, `user_roles`, convites, assinaturas e fiscal foram inventariados.
- `company_fiscal_settings` possui escopo por `organization_id`, leitura por papéis permitidos e escrita de administrador do mesmo tenant; módulo geral continua independente.
- `configuracoes_sistema` permanece singleton global histórico, não cadastro por organização.
- Estado canônico: 1 superadmin e 0 superadmins com papel operacional.
- Não foi executado harness destrutivo/autenticado A/B; o bloqueio tenant foi comprovado por análise de policies, funções e testes estáticos focados, não como E2E real.

## Concorrência e lease

- Duas solicitações do mesmo e-mail serializam no banco.
- Lease ativo impede segundo claim.
- Após expiração, uma nova execução recebe outro token.
- Execução antiga não finaliza nem marca falha após takeover porque finalize/fail comparam `lease_token` e validade.
- Job `ativo` não retorna a provisionar.
- Há uma limitação operacional deliberada: não existe heartbeat. Operações Auth superiores a dois minutos falham por stale lease e exigem retomada; isso é fail-closed.

## Cadastro geral × fiscal

- `configuracoes_sistema` é singleton global legado.
- Cadastro organizacional está em `organizations` e onboarding associado.
- Identidade emissora está em `company_fiscal_settings`, um registro ativo observado por organização e RLS tenant-scoped.
- Não foi tentada criação de emissor sem entitlement fiscal; a evidência nesta rodada é estrutural/teste, não E2E autenticado.

## Pedido legado

- `partner_orders`: 0 registros totais e 0 com status `solicitado` na leitura do gate.
- Nenhum pedido foi criado, atualizado ou processado.

## Estado de dados após o gate

- `auth.users`: 6.
- `profiles`: 6.
- `organizations`: 2.
- `organization_subscriptions`: 2.
- `platform_org_admin_invites`: 1 ativo, 0 pendentes, 0 processando, 0 falhos e 0 leases ativos.
- Não houve criação intencional de dado de teste nesta rodada.

## Arquivos de aplicação alterados

- `supabase/functions/platform-invite-org-admin/index.ts`
- `supabase/functions/admin-update-user-password/index.ts`
- `supabase/functions/platform-complete-first-access/index.ts`
- `src/pages/ResetPassword.tsx`
- `src/App.tsx`
- `src/hooks/useAuth.tsx`
- `src/hooks/usePlataformaSaaS.ts`
- `src/pages/plataforma/PlataformaAdmins.tsx`
- `src/lib/saas/firstAccess.ts`
- `src/integrations/supabase/types.ts`
- `src/test/saas/d51-gate.test.ts`
- `src/test/saas/first-access.test.ts`
- `src/test/config/authProviderCallback.test.tsx`
- `src/test/config/edgeFunctionsJwtGate.test.ts`
- `roadmap.md`

## Testes e comandos

- `npx tsgo -p tsconfig.app.json` — exit 0.
- `npx vitest run src/test/saas src/test/config/authProviderCallback.test.tsx src/test/config/edgeFunctionsJwtGate.test.ts` — exit 0; 147/147.
- testes Deno `onboarding-cnpj-lookup` — exit 0; 11/11.
- `npx vite build` — exit 0; somente warnings preexistentes de chunks/imports e Browserslist.
- chamada da Edge Function com JWT inválido — HTTP 401, sem mutação.
- `npx vitest run` — exit 1; 5.275 aprovados, 4 ignorados e 6 falhas estáticas históricas:
  - 2 exigem que somente o webhook use `verify_jwt=false`, conflitante com funções que validam JWT explicitamente com `getClaims`;
  - 3 congelam um baseline antigo e rejeitam qualquer migration posterior;
  - 1 exige reconciliação do manifesto repo-only de migrations.

Essas seis falhas não exercitam comportamento D51, mas impedem declarar a suíte global verde.

## Advisors

O linter canônico retornou 492 achados preexistentes:

- 17 INFO: RLS habilitada sem policy;
- 2 WARN: SECURITY DEFINER executável por público;
- 472 WARN: SECURITY DEFINER executável por authenticated;
- 1 WARN: proteção contra senhas vazadas desativada.

Nenhum achado novo foi atribuído ao forward-fix. A triagem individual dos 491 objetos históricos está fora deste gate e deve ser feita antes de uma certificação ampla; proteção contra senhas vazadas deve ser habilitada manualmente no Auth.

## Rollback e forward-fix

Rollback destrutivo não é recomendado porque os novos campos suportam retomada e auditoria e podem já ter sido lidos pelo runtime. Estratégia segura: forward-fix versionado.

Se for necessário suspender o fluxo, revogar EXECUTE das RPCs D51 de `service_role` e desabilitar a Edge Function interrompe novas operações sem remover dados. Para reativar, reaplicar apenas os grants documentados depois de reconciliar o ledger. Não remover colunas, índices ou intenções existentes.

## Pendências e próximo gate

1. Reconciliar o ledger de migrations com os objetos canônicos sem reaplicação cega.
2. Atualizar os seis contratos estáticos globais para reconhecer migrations posteriores e o padrão JWT customizado documentado.
3. Triar os 492 advisors históricos, priorizando os dois grants públicos e os objetos authenticated ligados ao SaaS.
4. Habilitar proteção contra senhas vazadas no painel Auth.
5. Somente após nova autorização: executar E2E controlado com conta descartável, concorrência real, crash Auth↔DB, reenvio simultâneo, primeiro acesso/recovery e tenant A/B.
6. Continuar bloqueado para SMTP real, pedido real e D52 até revisão deste relatório.