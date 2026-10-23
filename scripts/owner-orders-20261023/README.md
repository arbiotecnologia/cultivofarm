# C2-ORD v3 — rebase sobre o recorte instalado 20261023192728 (REVIEW, restante inativo)

## Já instalado em produção (pelo auditor, via MCP) — não reaplicar
`applied/20261023192728_c2_orders_tenant_notifications_atomic_approval.sql` é a cópia byte-exata de
`supabase_migrations.schema_migrations` (md5 `5744e639…`, SHA-256 `40ec89d6…`). Contém só (G) destinatários
e (E) aprovação atômica. Hashes pós conferidos READ ONLY: create `624f6e3d…`, approve `09eb9e74…`,
tg `0f679538…`, helpers `d4936c87…`/`70b38109…` (ACL postgres-only). Não copiado para `supabase/migrations/`:
esse diretório é gerido pela ferramenta de migração da plataforma (não há CLI no sandbox) e gravar lá
arrisca reexecução; a cópia fica aqui como registro auditável.
Contenção do instalado: `rollback-installed-containment.sql.review` (helpers → `SELECT NULL::uuid WHERE false`,
ACL e aprovação atômica preservadas, sem reabrir vazamento).

## Restante (candidate.sql.review v3)
A guard/autoridade, B **wrapper** `c2_order_actor_scope` (substitui a mudança no assert: `assert_b2b_partner_scope`
fica byte-exato e os callers legados — crédito, preços, conversão — continuam negando o técnico cumulativo),
C create/simulate, D título, F projeção. Conversão de simulação (`convert_*`) chama o assert antes de create,
logo continua fechada para o cumulativo (não ampliada).

## Auditoria fiscal real (`fn_fiscal_requirement_resolve`, md5 `8bb99a3c…`)
- SECURITY DEFINER, EXECUTE para authenticated; lê `fiscal_requirement_exemptions` (scope_type/scope_id) e
  `fiscal_operation_policies` (canal/operação/UF) — ambos **globais**, sem tenant; sem uso de auth.uid().
- Hosted: 0 políticas ativas e 0 isenções ⇒ retorno fail-closed `required=true / PENDING_PARAMETRIZATION`;
  o título nasce marcado como pendente fiscal, nada é emitido.
- teste4 sem `uf` ⇒ só políticas sem UF casariam. Achado menor: qualquer autenticado pode sondar se um UUID
  tem isenção (revela id/motivo/approved_by). Não corrigido; registrar para recorte fiscal.

## Fixture teste4 (`fixture-teste4.sql.review`, NÃO executado)
Atribui o plano existente AUDIT-C2-20261023 ao parceiro 7e52de9a… e troca só a forma de pagamento desse
parceiro para o método existente de auditoria (evita criar `pix` global). billing_trigger continua `na_entrega`.
Cliente b2bd6b53… já está no tenant dono 007bb519 (ok para `B2B_CUSTOMER_TENANT_MISMATCH`).

---
# C2-ORD v2 — compra do cliente comercial pelo fluxo canônico (REVIEW, inativo)

Autoria: agente Lovable, a partir de 10ae3078. Leitura hosted somente `SELECT`/`pg_get_functiondef`.
Nada aplicado, publicado ou implantado. Nenhum pedido, título, fiscal, fixture ou papel criado/alterado.

## Blockers da revisão independente → correção
| # | Achado (hosted) | Correção no candidato |
|---|---|---|
| 1 | `assert_b2b_partner_scope` nega qualquer `parceiro_b2b_tecnico` antes do ramo gestor; projeção v1 excluía técnico | Técnico negado só quando **não** tem `parceiro_b2b`; cumulativo segue ramo gestor (singleton + parceiro). Novo `platform_private.c2_owner_order_guard` chamado por `create_partner_order_secure` e `simulate_b2b_payment_plan_secure` logo após o assert (convert_* reutiliza create) |
| 1b | create/simulate só checavam `fn_b2b_plan_selectable` (global): parceiro podia enviar plano ativo não atribuído | Guard exige atribuição `published`/`partner`/vigente do plano ao parceiro (`c2_owner_plan_assigned`) |
| 2 | Impl escolhia categoria qualquer (fallback tipo/inativa) e forma de pagamento silenciosa (`NULL` se ausente) | `RECEITA` ativa estrita, forma ativa e **única** pelo nome configurado, `client_id` no mesmo tenant; erros `B2B_REVENUE_CATEGORY_NOT_CONFIGURED`, `B2B_PAYMENT_METHOD_NOT_CONFIGURED`, `B2B_CUSTOMER_TENANT_MISMATCH` |
| 2b | Tenant do título só via `organizations.partner_account_id` (0 para clientes comerciais) | Fallback ao tenant dono ativo; emissor interno validado por `h15_actor_organization() = tenant` (o assert de parceiro negava admin interno sem `org_partner`) |
| 3 | `tg_auto_b2b_receivable` engolia falha (`financeiro_auto_falhou`) ⇒ aprovado sem título | Com `billing_trigger='na_aprovacao'`, falha relança `B2B_APPROVAL_BILLING_FAILED` e desfaz a aprovação; `na_producao_finalizada`/`na_entrega` mantêm semântica atual |
| 5 | `create_partner_order_secure` notificava **todo** `administrador`/`gestor_comercial` (sem tenant/perfil ativo) com número e total | Destinatários = `platform_private.c2_order_internal_recipients`: só admin/gestor_comercial com perfil ativo no tenant dono ativo; parceiro sem dono ⇒ ninguém |
| 6 | `approve_partner_order` notificava `partner_users` sem filtrar revogação/perfil | `c2_order_partner_recipients`: vínculo vigente, perfil ativo no tenant do vínculo e `is_valid_b2b_partner_user`; `approve_partner_order` entra no hash guard (`8e266945…`) |
| 4 | Preflight/rollback fracos | Preflight assertivo (11 hashes + ACL + gatilho + schema global + conflito org) e rollback que fecha o writer no servidor |

Observação estrutural: `financial_categories` e `payment_methods` **não têm `organization_id`** no schema canônico
(catálogos globais, RLS `is_financial_staff`). Esse é o desenho correto: **não** se cria coluna nem migração de
tenant nesses cadastros. A correção limita-se à seleção determinística (receita ativa por `created_at, id`;
forma ativa única pelo nome configurado), sem fallback. O preflight só alerta se o schema mudar.

**Correção da hipótese inicial (v1 deste README):** foi afirmado que a impl escolhia categoria/forma "sem filtro
de tenant" e que `d51_5_validate_tenant_links` poderia recusar o título por isso. Errado: `d51_5` valida apenas
`customer_id → clientes.organization_id` e o tenant de parcelas/pagamentos, nunca categoria/forma. O tenant é
verificado onde existe ownership: tenant do título (dono), cliente do título (`client_id` no mesmo tenant),
emissor interno (h15) e destinatários de notificação.

## Autoridade do writer (`c2_owner_order_create_allowed`)
`uid = auth.uid()` · `parceiro_b2b` vigente em `user_roles` · contexto `C2_MULTIPROFILE_V1`/`commercial_owner`,
`manager=true`, `partner_id` igual · parceiro sem org própria · `b2b_phase1_partner_visible` · vínculo não
revogado, perfil ativo, `profile.org = pu.tenant = owner = contexto.tenant` · entitlements `pedidos_b2b` e
`catalogo_precos`. Sem ACL para PUBLIC/anon/authenticated. A projeção usa a mesma função (`order_capabilities`).

## Rollback (`rollback.sql.review`)
`c2_owner_order_create_allowed` → `false` (guard nega todo cliente comercial externo; projeção false) e assert
volta byte-exato (md5 `f86f43f9…`). **Mantém** aprovação atômica, resolução estrita e escopo do título.
Também mantém os destinatários restritos (não reabre o vazamento). Atenção: fecha também a compra direta de cliente comercial via RPC que hoje já existia sem menu.

## Matriz demanda → pedido → financeiro
| Etapa | Caminho canônico | Título |
|---|---|---|
| Carrinho/simulação | `simulate_b2b_payment_plan_secure` (assert + guard, preço `fn_resolve_b2b_cart`) | nenhum; devolve `cart_hash` |
| Envio | `create_partner_order_secure` (assert + guard, `cart_hash` recomputado, lock `b2b_idem:partner:key`, fingerprint) | nenhum; cria termos + cronograma snapshot |
| Mesmo key | replay do `result_snapshot`; hash diferente ⇒ conflito | nenhum |
| Aprovação | `approve_partner_order` → UPDATE status → `tg_auto_b2b_receivable` | **nasce aqui** se `na_aprovacao`; falha ⇒ aprovação abortada |
| Produção/entrega | mesmo gatilho | nasce em `produzido`/`entregue` conforme configuração; falha só registrada (inalterado) |
| Duplicidade | lock `b2b_receivable:<pedido>` + `partner_order_financial_links` | 2ª chamada `duplicado=true` |
| Parcelas | gatilho genérico + cronograma | soma = cronograma |
| Cancelamento/estorno | `cancel_b2b_receivable_secure` | FECHADO |

## Preflight hosted READ ONLY executado (23/10 ~19:15Z, ref swzpzcwiasxmjutrmvkm)
11 hashes e ACLs = esperado; candidato não instalado; 0 parceiros com dono + org própria; 1 categoria
RECEITA ativa; **5/5 configurações ativas com forma de pagamento não resolvível** (`pix` inexistente; só
existe método de auditoria); 3 parceiros comerciais sem atribuição de plano; 0 pedidos comerciais em 90d;
0 `financeiro_auto_falhou`; 0 aprovados sem vínculo. Todas as 5 configurações são `na_entrega`.
Consequência após instalar: geração passará a falhar explicitamente até cadastrar a forma de pagamento; em
`na_entrega` a entrega segue e a falha é registrada (semântica atual).

## Testes (`test-local.py`) — PostgreSQL 17 descartável, auth sintético, dependências stub
49/49 PASS (inclui 8 negativos A/B de notificação): fidelidade md5 local = hosted dos 7 corpos; blocker 1 reproduzido no baseline; candidato com
hashes reais; ACL; gestor/cumulativo/técnico/A→B/uid forjado; plano não atribuído; create/simulate usam guard;
revogação de papel, vínculo e entitlement; projeção; categoria/método/cliente/tenant interno; 1 título no
tenant dono com 3 parcelas = 300; duplicidade; parceiro não emite; `na_entrega` preservado; `na_aprovacao`
atômico; rollback byte-exato, writer fechado, dados preservados, sem aprovação sem cobrança.

Hosted READ ONLY (19:20Z): hoje há 3 destinatários internos ativos em 3 empresas distintas — um pedido
de qualquer empresa notificaria as outras 2; 0 notificações `pedido_b2b_*` já emitidas; 0 vínculos revogados.

## Pendência: sessão A financeiro verificando→vazio→pausada
Candidato SQL **não instalado** (confirmado hosted) e frontend sem mudança nesta rodada ⇒ não é efeito do
candidato. Telemetria local da sessão sem eventos relevantes; não reproduzido. Pausas fail-closed e intervalo
de verificação preservados; investigação segue aberta.

## Limites exatos
- Execução completa de create/approve com notificações reais não ocorreu no harness: helpers testados direto
  e substituição conferida no corpo instalado.
- Não é prova hosted/JWT/RLS/PostgREST nem homologação. Stubs: `b2b_actor_scope`, contexto, entitlements,
  eligibility, fiscal, wrapper do título, gatilhos de parcelas e d51.
- Idempotência concorrente e alteração de preço/hash: corpos de create intactos (lock e comparação de hash
  só verificados estaticamente); não executados com carrinho real no harness.
- Fiscal: `fn_fiscal_requirement_resolve` não recebe tenant; não auditado além do vínculo de cliente.
- `rpc_b2b_list_selectable_payment_plans` não filtra `pu.revoked_at` (listagem apenas; o guard bloqueia o envio).
- Frontend sem mudança nesta rodada: `useMyPartner` já usa só `order_capabilities` para `parceiro_b2b`
  (cumulativo incluso); teste `ownerOrderAccess` 3/3.
- Pendências antigas, cancelamento/estorno, multiperfil B e estabilidade do monitor seguem abertas.

## SHA-256
Ver `SHA256SUMS`.
