# Validação — atualizada 18/11/2026

## Incidente 01:07:07Z — gap de criação direta reconhecido
QA HML 72/72 permanece prova real das operações efetivamente executadas, NÃO de claim→Auth→finish Financeiro (usuários eram aplicador→transição). CHECK do recibo faltava na fixture anterior.
Novo pacote `receipt-shape`: 71/71 PostgreSQL 17.12 descartável, 26 bindings reais ativos, 10 md5 reais; erro antigo e positivo pós-delta reproduzidos. AuthAdmin/JWT HTTP e schema public completo não reproduzidos; ver limites e achado adicional de compensação em `receipt-shape/README.md`. Migração não aplicada; validação hosted adicional pelo root pendente.
Regressão focada `bun run test -- src/test/b2b-finance --maxWorkers=2`: 5 arquivos/34 testes PASS, incluindo a nova bateria; build automático OK. Nenhuma mudança de runtime ou Edge.

## HML real (root) — ver README "Provas": 72/72 JWT/RLS/crédito/browser/CSV/revogação; limpeza QA_VERIFY zero.
## Produção: 02a+02b+02c success, 03-post POST_PASS (root). Edges `create-user` e `tenant-user-admin` implantadas pelo agente em 18/11.

## Liberação local (18/11/2026)
| Verificação | Resultado |
|---|---|
| `npx vitest run src/test/b2b-finance --maxWorkers=2` (UI/rotas/cadastro, bateria PG, regeneração, canônico == candidato) | 4 arquivos, 33/33 |
| Transições/cadastro/painel (vitest, maxWorkers=2) | 3 arquivos, 59/59 |
| Deno `scripts/user-edit-access-email-links-20261117/edge/handler_test.ts` | 20/20 |
| `deno check` create-user e tenant-user-admin canônicos | OK |
| `tsgo -b --noEmit` / `vite build` | exit 0 / exit 0 |

## Histórico — validação local 17/11/2026 (nenhuma escrita hospedada)

| Verificação | Comando | Resultado |
|---|---|---|
| Bateria PostgreSQL 17.12 descartável (auth sintética) | `python3 scripts/b2b-financeiro-role-20261117/test_local_pg.py` | 79/79 PASS (`evidence-local.json`) |
| Testes do recurso (UI/rotas/cadastro/guarda + bateria + regeneração) | `npx vitest run src/test/b2b-finance --maxWorkers=2` | 16/16 |
| Regressão config/portal/auth/rbac/navegação/b2b/segurança/multiportal | vitest, maxWorkers=2 | 164 arquivos, 2189/2189 |
| Regressão saas/comercial/financeiro/lib/ux/ui/pedidos | vitest, maxWorkers=2 | 205 arquivos, 2575/2575 (após registrar a rota no inventário) |
| Suíte completa | `npx vitest run --shard=N/8 --maxWorkers=2` (8 shards, todos exit 0) | 841 arquivos + 1 ignorado; 11.585 testes, 6 skips preexistentes |
| Typecheck | `tsgo -p tsconfig.app.json` / `tsconfig.node.json` | exit 0 / exit 0 |
| Build | `npx vite build` | exit 0 |
| Edge candidata | `deno check` da cópia candidata de create-user | OK |

Cobertos na bateria: dois financeiros de parceiros da mesma empresa e um de outro tenant isolados entre si; parceiro irmão/outro tenant/NULL negados;
técnico, combinado financeiro+técnico, revogado, perfil inativo, sem vínculo, vigência futura, papel de vínculo divergente negados; entitlement ausente;
JWT anterior à época de autorização negado; revogação, empresa suspensa, parceiro inativo e papel removido retiram acesso; leituras diretas de pedidos,
títulos, links e conta do parceiro retornam 0; inserção de pedido/link negada por RLS e atualização de título afeta 0 linhas; helper privado sem EXECUTE;
anon sem capacidade; gestor preservado (lê o próprio, nega irmão, pedidos diretos); provisionamento exclusivo/parceiro obrigatório/admin de outro tenant negado/
papel divergente ou nulo negado/service_role obrigatório; reversão recusa com papel ativo e restaura os quatro corpos por md5.

Limites (somente da validação local; cobertos depois pela HML real): auth sintética por GUC; políticas de `partner_accounts_self_select` e RLS de títulos aproximadas (helpers não capturados). Não prova JWT, PostgREST,
RLS, Storage ou Edge hospedados, nem uso real em navegador autenticado.
