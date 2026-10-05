# D51.4 — usuários, onboarding e auditoria multi-tenant

## Resultado

- **Gate 1: PASS.** A gestão de usuários usa organização derivada de `auth.uid()` no servidor. A prova transacional A/B passou com administradores reais de organizações distintas, sem criar usuários nem preservar mutações. Superadmin não participa deste fluxo. Vínculos de cliente/parceiro sem ownership determinístico permanecem removidos da tela e bloqueados no backend.
- **Gate 2: PASS técnico.** Telefone, e-mail, fuso e regime tributário são normalizados e validados nas duas camadas. Perfil pessoal e Perfil da empresa ficam separados; ambos usam suas fontes canônicas existentes.
- **Gate 3: NO-GO.** A auditoria horizontal comprovou exposições cross-tenant fora dos dois primeiros gates.

## Banco e segurança

Migrations canônicas aplicadas no ref `swzpzcwiasxmjutrmvkm`:

- `20261005192442_ec81894c-cd02-412a-9a20-3de055b56307.sql`
- `20261005192534_d3208b29-c579-4309-ac0f-29841ef48126.sql`
- `20261005192840_1e060a1c-1817-4218-8fcf-bc58d91c0658.sql`
- `20261005192901_7f7ef56a-73a7-48e9-a875-c935b62eb704.sql`
- `20261005194435_b6e4bda4-745c-4f51-a916-b76777281391.sql`
- `20261005194512_9a63a46f-dba0-4861-bd0c-62e432e23671.sql`
- `20261005194622_91711015-fd68-40ef-a008-24d14cb3be1c.sql`
- `20261005194639_4395c11d-a774-4ba4-bec9-55ab15b2db25.sql`

Controles aplicados: helpers tenant privados; RLS em `profiles`, `user_roles`, `user_clientes` e `partner_users`; listagem paginada `tenant_admin_list_users`; status via `tenant_admin_set_user_active`; edição transacional; redefinição de senha vinculada ao JWT real do ator. Não houve backfill, exclusão ou alteração de dados operacionais.

## Gate 1 — evidências

- A tela não usa mais leituras globais de profiles, papéis, clientes ou parceiros.
- Cache inclui organização e identidade; mudança de usuário limpa todo o cache.
- Deep-link só abre um usuário devolvido pela RPC tenant-scoped.
- `create-user` deriva organização do perfil ativo do ator, proíbe Superadmin, rejeita vínculos sem tenant e compensa criação parcial.
- `admin-update-user-password` valida escopo com a sessão autenticada, não com service-role.
- A política legada de autoedição foi removida; trigger compara `OLD/NEW` e impede que até um administrador altere diretamente seu tenant ou campos estruturais.
- A/B canônico: A e B listaram somente suas organizações; leitura de profile/role cruzada retornou zero; edição, status, senha, Superadmin e troca direta de tenant foram negados. A prova rodou dentro da migration e não deixou mutações.

Smoke visual autenticado no navegador: **NOT RUN**, pois o Supabase é externo e não fornece sessão automatizada ao preview. A matriz server-side A/B obrigatória foi executada no banco canônico com quatro organizações administrativas disponíveis e passou sem persistir alterações.

## Gate 2 — evidências

- Telefone formatado ou em dígitos é persistido com 10/11 dígitos.
- E-mail usa campo próprio, trim/lowercase e validação.
- Fuso usa seis opções IANA brasileiras; valor IANA existente permanece preservado.
- Regime tributário usa catálogo canônico; legado desconhecido não sofre migração automática.
- Conclusão continua idempotente e transacional sob lock/ticket e persiste `organizations.onboarding_dados`.
- A aba Perfil da empresa lê `org_onboarding_state`, a mesma fonte do onboarding.

## Gate 3 — achados bloqueadores

1. **P0 Financeiro:** relatórios e regras de recibos autorizam por papel global sem filtro de organização.
2. **P0 Storage:** documentos financeiros e de clientes são autorizados por papel sem organização no caminho/registro.
3. **P0 Catálogo:** `admin-wipe-produtos-catalog` permite limpeza global a administrador tenant.
4. **P0 Portal:** `list-portal-users` aceita `cliente_id` sem provar vínculo com a organização do ator.
5. **P1 Fiscal:** configuração fiscal possui escrita por papel global sem vínculo tenant comprovado.
6. **P1 sistêmico:** `user_roles` é global por usuário; `has_role()` sozinho não estabelece isolamento tenant.

Inventário detalhado: `docs/auditorias/gate3-d51-4-inventario-modulos-tenant.md`.

## Validação e riscos

- Testes focados do Gate 1: PASS.
- Suíte global: **5.433 PASS / 4 skipped**.
- Typecheck: PASS.
- Build da prévia: PASS.
- Scanner de segurança: 10 achados informativos, zero P0/P1 detectado automaticamente; os P0 tenant acima vieram da auditoria manual de fluxo e autorização.
- Supabase linter: baseline de 492 achados preexistentes, sem novos achados das migrations do Gate 1.
- Edges `create-user` e `admin-update-user-password`: implantadas.
- Testes Deno: inexistentes nessas funções; contratos cobertos por Vitest estático.

## Rollback / forward-fix

- Rollback somente por restauração das definições anteriores caso haja indisponibilidade, mantendo superfícies globais bloqueadas.
- Não reintroduzir a política legada de autoedição. Se houver regressão operacional, o forward-fix seguro é criar uma RPC de perfil pessoal com allowlist de campos, mantendo tenant e identidade imutáveis.
- Forward-fix: adicionar ownership tenant determinístico por módulo, backfill somente auditável, RLS/RPC/Storage por organização, índices compostos e matriz A/B transacional antes da reabertura.

**Decisão final: NO-GO multi-tenant geral.** O vazamento conhecido em Configurações → Usuários foi contido, mas os P0 horizontais impedem homologação completa.

## D51.5 — remediação dos bloqueios horizontais

### Resultado por módulo

- **Financeiro/Storage: FAIL-CLOSED.** As raízes e artefatos financeiros receberam `organization_id`, índice, trigger server-side imutável e policy restritiva por `h15_actor_organization()`. Registros legados sem vínculo determinístico permanecem invisíveis. As RPCs `SECURITY DEFINER` de relatórios, fluxo, DRE e registro de exportação perderam `EXECUTE` de `authenticated` até que todas as fontes possam ser filtradas com ownership comprovado.
- **Catálogo global: PASS de autorização.** Wipe e auditoria de órfãos agora exigem `is_platform_superadmin` server-side; o wipe também exige frase de confirmação. O fallback destrutivo do navegador foi removido. Nenhuma limpeza foi executada.
- **Portal: PASS estrutural.** `list-portal-users` deriva o tenant pela sessão, valida o cliente nesse tenant antes de usar service role, filtra profiles pela mesma organização, usa CORS allowlist e não devolve erro bruto.
- **Produção: FAIL-CLOSED.** Ordens, programação, lotes, envase e CQ receberam ownership explícito e policy restritiva. As linhas legadas que não puderam ser relacionadas deterministicamente não foram alteradas e ficam bloqueadas a tenant users.
- **Fiscal: FAIL-CLOSED.** Invoices, eventos e documentos agora exigem organização explícita correspondente à sessão. Legado sem vínculo comprovado permanece bloqueado.
- **RBAC horizontal: PASS estrutural no escopo alcançado.** Policies antigas baseadas somente em papel continuam existindo para compatibilidade, mas são intersectadas por policy `RESTRICTIVE`, eliminando o efeito global para usuários autenticados.
- **Configuração global legada: preservada.** O singleton comprovadamente global não recebeu vínculo tenant artificial.

### Evidências

- Banco canônico confirmado: `swzpzcwiasxmjutrmvkm`.
- 19 tabelas operacionais têm `organization_id`, índice, trigger de guarda e policy restritiva `tenant_isolation_d51_5` no estado vivo.
- Treze RPCs financeiras elevadas estão sem execução para `authenticated` no estado vivo.
- Backfill foi feito somente onde perfil, cliente ou registro-pai fornecia associação única; nenhum dado foi excluído. Linhas ambíguas foram preservadas sem vínculo.
- Três Edge Functions foram implantadas: catálogo destrutivo, auditoria do catálogo e usuários do portal.
- Testes focados: **26 PASS**. Suíte global: **5.436 PASS / 4 skipped**. Typecheck e build: **PASS**. Scanner: **10 Info, zero P0/P1**. Supabase linter: **479 achados preexistentes**, sem novo achado atribuído às migrations D51.5.
- Publicação frontend foi solicitada uma vez. Smoke passivo oficial: HTTP 200, rota `/auth` renderizada, zero erro de página; duas respostas 401 esperadas sem sessão. Nenhuma autenticação, deleção, emissão fiscal ou mutação destrutiva foi executada.

### Matriz A/B e decisão

A prova estrutural confirma que A não pode obter linha B quando a linha possui tenant: a policy restritiva exige igualdade com a organização derivada de `auth.uid()`, e o trigger rejeita organização enviada pelo cliente ou troca de tenant. Usuário inativo/sem organização e Superadmin sem tenant recebem escopo nulo e falham fechados.

A matriz A/B autenticada de runtime ficou **NOT RUN** nesta execução: o projeto Supabase externo não disponibilizou sessões automatizadas e nenhum usuário real foi impersonado. Por isso, apesar da contenção P0/P1 e das validações verdes, a decisão formal é **NO-GO de homologação final / GO de segurança fail-closed** até executar a matriz A/B autenticada. Relatórios financeiros e linhas legadas sem vínculo permanecem indisponíveis, nunca globais.

### Rollback / forward-fix

- Rollback emergencial: restaurar grants das RPCs somente depois de restaurar suas definições tenant-scoped; remover a policy restritiva isoladamente é proibido porque reabre políticas globais antigas.
- Forward-fix: modelar as cadeias determinísticas faltantes, fazer backfill auditável por lote, adaptar RPCs financeiras para filtrar pelo tenant server-side e então reabrir cada função após teste A/B.