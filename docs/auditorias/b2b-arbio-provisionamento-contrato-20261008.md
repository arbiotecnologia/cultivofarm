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