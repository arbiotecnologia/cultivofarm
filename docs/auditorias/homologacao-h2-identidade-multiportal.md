# FASE H2 — Identidade, RBAC, Multiportal e Isolamento

Ambiente auditado: **staging `ikaauvsflpmamgxmkhoq`** (produção `navfzbwgwzruipouyfnk` intocada).
Baseline de repositório: `c75bb87f`. Data da auditoria: **2026-08-18**.

> Nota de convenção: nomes de migration com prefixo `202609xx` seguem a numeração histórica do repositório e **não** representam a data real de execução desta auditoria.

## 1. Identidade e papéis

- 13 papéis canônicos em `AppRole` (`src/lib/permissions.ts`).
- `useAuth.tsx` resolve sessão → `profiles` (checa `ativo`) → `user_roles` (lista completa).
- `primaryRole` é derivado por ordem determinística (`src/lib/portalContext.ts`) e usado **apenas** em fluxos legados de home/UX.

## 2. Guards de rota (frontend)

| Guard | Escopo | Fonte de autorização |
|---|---|---|
| `ProtectedRoutes` + `RoleGuard` | `/` interno | sessão + `ACCESS_MAP` (`canAccess`) |
| `PortalGuard` | `/portal/*` | `roles[]` (`cliente_produtor`, admin legado) |
| `AppPortalGuard` / `TechnicalFeatureGuard` | `/app/*` | RPC `get_my_available_portal_contexts()` |
| `ProducerFeatureGuard` | `/app/*` produtor | `roles[]` |
| `B2BRouteGuard` | `/portal-parceiro/*` | RPC (`has_b2b_access`) + bypass admin/gestor_comercial |

Nenhum guard confia em `localStorage`/`sessionStorage`/query string. Confirmado.

## 3. Achados

| ID | Sev | Achado | Status |
|---|---|---|---|
| H2-001 | **P1** | Bucket legado `visit-pdfs`: `SELECT`/`INSERT` liberados a **qualquer** autenticado (inclusive produtor e parceiro B2B), sem vínculo com cliente/visita. Bucket vazio e sem uso no código (o fluxo atual usa `visitas-pdf`). | **CORRIGIDO** — migration `20260907000000_h2_storage_visit_pdfs_hardening_v1.sql` |
| H2-002 | P2 | `RoleGuard` avalia apenas `primaryRole`; usuários multipapel podem ver rota bloqueada mesmo com papel secundário autorizado. Efeito é **restritivo** (não há escalonamento). | Aceito nesta fase — UX, sem risco |
| H2-003 | P3 | `financial_settings` legível por qualquer autenticado — contém apenas 2 flags booleanas de política de recibo, sem PII. | Aceito |
| H2-004 | P3 | Tabelas de referência (`produtos`, `microrganismos`, `culturas`, `catalogo_*`, `sla_configuracoes`, `configuracoes_sistema`) com `SELECT true` para autenticados — catálogo institucional. | Aceito |

## 4. Isolamento multi-tenant (verificado por policy)

- **Produtor**: `ordens_servico`, `entregas`, `aplicacoes`, `clientes`, `fazendas`, `talhoes` escopados por `get_cliente_ids_for_user()` / `can_user_access_cliente()` / `can_user_access_fazenda()`.
- **Parceiro B2B**: `partner_orders`, `partner_simulations`, `partner_clients` escopados por `get_user_partner_id()`; staff comercial e admin com acesso explícito.
- **Organizações**: `organizations_select_scoped` limita a `profiles.organization_id`.
- Nenhuma policy `USING (true)` em tabelas núcleo (validado no postcheck H2-006).

## 5. Superfície `anon`

- 0 tabelas sem RLS; 0 funções SECDEF sem `search_path`.
- Apenas 2 SECDEF executáveis por `anon`: `rpc_validar_comprovante_entrega` e `rpc_validar_rastreio_produto` (validação pública por token opaco) — intencional.
- Único bucket público: `logos`.

## 6. Artefatos

- `restoration/homologacao-h2/10-migration-20260907000000_h2_storage_visit_pdfs_hardening_v1.sql` (aplicada em staging; mantida no kit de restauração, mesma convenção da H1 — ver pendência H1-015)
- `restoration/homologacao-h2/20-postcheck.sql` — **6/6 OK**
- `restoration/homologacao-h2/90-rollback-20260907000000.sql`

## 7. GATE H2

**H2 APROVADA** — P1 corrigido e reverificado; remanescentes são P2/P3 aceitos e documentados.
Pendências herdadas: H1-015 (sincronização repo × banco de migrations), H1-013 (transacionalidade da UI de estoque). Não iniciar H3 sem nova autorização.
