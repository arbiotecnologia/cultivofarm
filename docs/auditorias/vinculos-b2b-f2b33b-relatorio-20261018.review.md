# F2-B3.3-B — Mandato, receipts e writers/revokers (somente preparação)

Base: commit 0df525bc. Destino de leitura: Supabase canônico `swzpzcwiasxmjutrmvkm` (cliente configurado; SELECT-only). Nenhum DDL/DML, nenhuma publicação, containment PUC e 29 policies intactos.

## 1. Fatos verificados hosted (read-only, 2026-10-18)
- `has_function_privilege('authenticated'|'anon', ...)` = **false** para `assign_b2b_user_client_secure`, `unassign_b2b_user_client_secure`, `get_b2b_partner_clients_for_assignment_secure`. Resolve a divergência de ACL anotada na B3.3-A: fechadas por ACL **e** por corpo.
- Único writer SQL de PUC/PTC: `sync_puc_to_ptc_fn()` (DEFINER, `search_path=public`, sem EXECUTE para clientes). Writer direto restante: tela `TecnicosProdutores` (INSERT/UPDATE PTC via policies `ptc_*`). Nenhum revoker dedicado existe.
- Leitores PUC/PTC com EXECUTE authenticated: `can_user_access_cliente(uuid)`, `can_user_access_cliente(uuid,uuid)`, `get_b2b_technician_client_detail_secure`, `get_b2b_technician_clients_secure`, `get_b2b_user_client_detail_secure`, `get_b2b_user_client_simulations_secure`, `get_b2b_user_clients_secure`, `platform_private.b2b_save_technical_simulation`.
- Triggers: PUC `trg_validate_puc` (BEFORE), `trg_sync_puc_to_ptc` (AFTER), `trg_puc_updated`; PTC só `trg_ptc_updated_at`.
- `partner_audit_logs`: 11 linhas; colunas nullable (`partner_id`, `usuario_id`), sem chave de idempotência, sem hash, sem trigger de imutabilidade; só policy SELECT admin/gestor_comercial; escrita por `partner_audit_trigger`, `archive_partner_simulation_secure`, `send_partner_simulation_to_manager_secure`.
- Estruturas privadas existentes: `authz_tickets` (txid/scope/target), `b2b_provisioning_receipts` (provisionamento de usuários, fence/lease), receipts SMTP, `cf_user_guards_v1.state`.

## 2. Decisão
- **Não estender `partner_audit_logs`** como receipt: não é imutável, não tem chave/hash, campos nullable e uso misto; alterar mudaria contrato de log existente.
- **Não reutilizar `b2b_provisioning_receipts`/`authz_tickets`**: semântica diferente (provisionamento; ticket por txid sem conteúdo).
- **Estrutura mínima auditável nova e privada**: `platform_private.b2b_assignment_receipts` (candidata B1), sem GRANT a cliente, RLS sem policies, imutável. Não concede acesso — grant continua sendo PUC/PTC; sem duplicar grants.

## 3. Plano sequencial (cada passo com gate próprio)
| Fase | Conteúdo | Status |
|---|---|---|
| B0 | Preflight B3.2+B3.3-A, backup/restore **ensaiado** e comprovado | NO-GO (backup ausente) |
| B1 | Tabela de receipts privada isolada (arquivo candidato) | PASS preparação / NO-GO instalação |
| B2 | Core DEFINER privado: mandato do ator (auth.uid, tenant, papel admin/gestor, entitlement), alvo por vínculo ativo, lock advisory por (partner,user,cliente), CAS por versão, idempotência chave+hash, abort em PTC direct/unknown | desenho + simulação |
| B3 | Validator com ramo cleanup (não exige elegibilidade atual) + sync sem adoção por chave | desenho |
| B4 | Readers fail-closed (vínculo não revogado, papel, owner) coordenados, sem mudar as 29 policies em massa | desenho |
| B5 | JWT/RLS A/B real, legado, concorrência, browser | pendente |
| B6 | Reabrir assign/unassign, migrar writer TecnicosProdutores | pendente, autorização específica |

## 4. Testes locais (PostgreSQL descartável, sintético)
`scripts/tests/b2b-f2b33b-receipt-local.{sql,py}` + `src/test/saas/b2b-f2b33b-receipt-postgres.test.ts`: **17/17 PASS** — ator≠alvo, replay idempotente, mesma chave/payload diferente, CAS obsoleto, cross-tenant B→A, sem entitlement, técnico sem mandato, alvo não se autoautoriza, parceiro sem owner fail-closed, `legacy_partner_tenant` preservado, colisão direct aborta e preserva, reader fecha após revogação, cleanup com alvo inelegível, regrant impossível, cleanup monotônico, receipt imutável, contagem exata. Vitest: 2 arquivos/2 testes passaram (com B3.3-A); ESLint focado exit 0.
Falha local corrigida: inicialização do banco pendurava por pipe aberto do `pg_ctl` (passou a usar `-l`).
**Limite:** atores são linhas de tabela, não JWT; nada aqui prova RLS, Storage ou sessões reais.

## 5. Pendências concretas
1. Backup/restauração comprovados (bloqueia B1).
2. Revisão externa da candidata B1 e do preflight combinado.
3. Corpo real do core B2 com `auth.uid()` e integração com `cf_user_guards_v1` (ordem de locks).
4. Fechamento coordenado de readers listados acima e `can_user_access_cliente(uuid,uuid)` (lê `partner_users` sem `revoked_at`).
5. Provas JWT/RLS A/B e superadmin em ambiente fiel.

**Status:** PASS preparação B3.3-B; NO-GO instalação.
