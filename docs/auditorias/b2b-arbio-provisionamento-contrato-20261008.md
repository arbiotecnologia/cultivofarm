# Provisionamento B2B — preparação do contrato, mesma auditoria

## Matriz integrada e gates

| Elo | Fonte/caminho existente | Evidência e limite | Gate para restauração |
|---|---|---|---|
| Administrador A | Configurações/create-user; ator ativo, papel e tenant derivados | Allowlist interna exclui B2B; vínculos negados antes de Auth | Autorizar operação específica, sessão vigente e plano sem ampliar papéis |
| Owner comercial | partner_accounts.commercial_owner_organization_id | Único parceiro fixture owner AR Bio confirmado Codex | Preservar owner; não inferir por CNPJ, cliente opcional ou legado NULL |
| Identidade P | profiles.organization_id | Tenant do futuro usuário ainda não provisionado | Identidade P explicitamente comprovada, sem assumir P=A ou mandato |
| Papel | public.user_roles | Dois papéis B2B existentes; não habilitados neste recorte | Papel mínimo protegido, sem roles extras; separação gestor/técnico |
| Vínculo | partner_users / usePartnerUsers / link_partner_user | UI e mutações fechadas; SELECT administrativo escopado | Cadeia owner→identidade→parceiro autoritativa e atomicidade/compensação |
| Primeiro acesso | Fluxos existentes de convite/definição de senha | Não executados; nenhum Auth/credencial/convite criado | Titular define senha, ação humana e efeitos externos controlados |
| Portal | get_my_available_portal_contexts / b2b_actor_scope / B2BRouteGuard | organizations.partner_account_id deve coincidir com vínculo único | Resolver compartilhado seguro, sem acesso geral entre A e P |
| Financeiro | internal_origin_snapshot / generate_b2b_receivable_secure | B2B_INTERNAL_DOWNSTREAM_UNVERIFIED permanece | Credor/emissor e cadeia downstream determinísticos; zero cobrança real |

**Não existe autorização integrada comprovada que permita simplesmente acrescentar B2B ao dropdown.** Não editar Auth, roles, grants, RPCs ou resolver para passar neste recorte. Os testes de proposta são uma especificação local de pré-condições para revisão, não uma implementação de autorização e não prova de servidor. A/P distintos no modelo de revisão não autorizam interação cross-tenant.

## Casos executáveis e procedência

`src/test/config/b2bProvisioning.proposal.test.ts` prepara 15 casos locais: candidato próprio escopado com P explicitamente revisado; parceiro alheio/órfão/inativo; ator inativo; usuário alheio/inativo; papel extra/reservado; duplicidade de vínculo; sessão antiga; plano ausente; cancelamento; falha parcial e evidência de compensação. Não há chamadas remotas nem importação pelo aplicativo. Compensação é pré-condição proposta, não afirmação de que já existe no fluxo B2B vivo.

`partnerUsers.session.test.tsx` executa hooks reais com Supabase mockado e conserva zero chamadas nas três mutações bloqueadas. `create-user-edge-handler.test.ts` executa handler real com SDK/Auth isolados: negativas de role/vínculo e compensação existentes, sem tratar mock como JWT real. Formulário real testado com mutações mockadas preserva razão social vazia como string para validação obrigatória e mantém opcionais nulos, CNPJ repetido rejeitado, draft/ID e lock atuais.

## Fixture, efeitos e rollback

Continuar somente com `7e52de9a-4bed-4d1e-8200-3255a805465c`, criado via UI por Codex; não duplicar nem limpar nesta rodada. Manifesto mantém owner, autor, data, 1 audit, 0 pedidos e ausência de Auth. Flags globais não demonstram envio por cadastro; verificar efeitos da próxima ação. Rollback desta correção local limita-se à normalização do formulário; nunca reabre RPCs executivas/financeiras nem altera dados persistidos.

**GO preparação e correção focal local; NO-GO provisionamento/login/faturamento e auditoria integral.** Executivo19 e DRIFT-EMAILv9 preservados. Sem nova fase ou publicação automática.