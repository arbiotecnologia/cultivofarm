# D51.4 — usuários, onboarding e auditoria multi-tenant

## Resultado

- **Gate 1: PASS técnico condicionado.** A gestão de usuários passou a usar organização derivada de `auth.uid()` no servidor. Superadmin não participa deste fluxo. Vínculos de cliente/parceiro sem ownership determinístico foram removidos da tela e bloqueados no backend.
- **Gate 2: PASS técnico.** Telefone, e-mail, fuso e regime tributário são normalizados e validados nas duas camadas. Perfil pessoal e Perfil da empresa ficam separados; ambos usam suas fontes canônicas existentes.
- **Gate 3: NO-GO.** A auditoria horizontal comprovou exposições cross-tenant fora dos dois primeiros gates.

## Banco e segurança

Migrations canônicas aplicadas no ref `swzpzcwiasxmjutrmvkm`:

- `20261005192442_ec81894c-cd02-412a-9a20-3de055b56307.sql`
- `20261005192534_d3208b29-c579-4309-ac0f-29841ef48126.sql`
- `20261005192840_1e060a1c-1817-4218-8fcf-bc58d91c0658.sql`
- `20261005192901_7f7ef56a-73a7-48e9-a875-c935b62eb704.sql`
- migration posterior de validação canônica do onboarding.

Controles aplicados: helpers tenant privados; RLS em `profiles`, `user_roles`, `user_clientes` e `partner_users`; listagem paginada `tenant_admin_list_users`; status via `tenant_admin_set_user_active`; edição transacional; redefinição de senha vinculada ao JWT real do ator. Não houve backfill, exclusão ou alteração de dados operacionais.

## Gate 1 — evidências

- A tela não usa mais leituras globais de profiles, papéis, clientes ou parceiros.
- Cache inclui organização e identidade; mudança de usuário limpa todo o cache.
- Deep-link só abre um usuário devolvido pela RPC tenant-scoped.
- `create-user` deriva organização do perfil ativo do ator, proíbe Superadmin, rejeita vínculos sem tenant e compensa criação parcial.
- `admin-update-user-password` valida escopo com a sessão autenticada, não com service-role.

Smoke autenticado A/B com fixtures transacionais: **NOT RUN**, pois não havia duas identidades tenant seguras disponíveis sem criar dados permanentes. Portanto o PASS é técnico/estrutural, não homologação A/B completa.

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

- 92 testes focados: PASS.
- Suíte global: **5.433 PASS / 4 skipped**.
- Typecheck: PASS.
- Build da prévia: PASS.
- Scanner de segurança: 10 achados informativos, zero P0/P1 detectado automaticamente; os P0 tenant acima vieram da auditoria manual de fluxo e autorização.
- Supabase linter: baseline de 492 achados, sem novos achados finais.
- Edges `create-user` e `admin-update-user-password`: implantadas.
- Testes Deno: inexistentes nessas funções; contratos cobertos por Vitest estático.

## Rollback / forward-fix

- Rollback somente por restauração das definições anteriores caso haja indisponibilidade, mantendo superfícies globais bloqueadas.
- Forward-fix: adicionar ownership tenant determinístico por módulo, backfill somente auditável, RLS/RPC/Storage por organização, índices compostos e matriz A/B transacional antes da reabertura.

**Decisão final: NO-GO multi-tenant geral.** O vazamento conhecido em Configurações → Usuários foi contido, mas os P0 horizontais impedem homologação completa.