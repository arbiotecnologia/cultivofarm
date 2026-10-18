# Entrega 1 — Registro PÓS-IMPLANTAÇÃO em PRODUÇÃO (2026-10-18)

**Escopo:** registro verificável da aplicação real da candidata revisão 1.2 em
produção (ref `swzpzcwiasxmjutrmvkm`), executada pelo auditor externo — não por
este agente. Este documento registra evidências reportadas e limites do que foi
comprovado.

## 1. Migração aplicada (evidência do auditor externo)

- **Nome:** `cultivofarm_b2b_entrega1_client_access_hardening_prod_20261018`
- **Fonte:** `docs/auditorias/vinculos-b2b-entrega1-candidato-20261018.sql` (revisão 1.2, fail-closed owner NULL)
- **Resultado:** aplicada com sucesso via `apply_migration` do Supabase.

## 2. Pós-auditoria reportada (read-only, produção)

| Item | Evidência reportada |
|---|---|
| Corpo novo da função | `md5(pg_get_functiondef) = 4e0c374caa04bb9bf9fac9cc4e6723f1` (baseline anterior: `c610786fc9f6d6a44453b9e63c91e974`) |
| Filtros de revogação | `pu.revoked_at`, `pu2.revoked_at`, `pu3.revoked_at` presentes |
| Guarda de owner | `commercial_owner_organization_id IS NOT NULL` + coerência `tenant_id = owner` nos 3 ramos B2B |
| Policies dependentes | 12 preservadas, nenhuma alterada |
| Atributos da função | `SECURITY DEFINER` true; ACL `postgres, service_role, authenticated` inalterada; owner `postgres`; `search_path=public` |
| Estado de dados | 1 vínculo `partner_users`; PUC = 0; PTC = 0; vínculos ativos sem owner = 0 |
| Execução booleana | id inexistente → false; NULL → false |

## 3. O que está comprovado vs. NÃO comprovado

**Comprovado:**
- Endurecimento do corpo instalado e íntegro (hash novo, marcadores presentes).
- Nenhum acesso legítimo existente cortado (o único vínculo ativo é elegível:
  owner presente, tenant coerente, não revogado).
- Laboratório local (PostgreSQL descartável, paridade de colunas live) validou:
  brechas do baseline, fail-closed owner NULL, revogação dinâmica, modo legado
  real (tenant = owner com perfil divergente), carteira cross-org válida,
  rollback exato e anti-drift.

**NÃO comprovado (pendências explícitas):**
- **JWT/RLS real em sessões de tenants A/B não foi testado** — homologação de
  acesso real NÃO está concluída e não deve ser afirmada.
- **Backup/restauração de produção não comprovados** — responsabilidade do
  usuário; recomenda-se comprovar antes de qualquer próxima migração.
- Comportamento sob concorrência real e cache de plano de sessões existentes
  não exercitado (função é STABLE; avaliar `DISCARD PLANS`/nova sessão se
  suspeita de plano cacheado).

## 4. Rollback manual (sob avaliação — NÃO executar automaticamente)

Arquivo: `docs/auditorias/vinculos-b2b-entrega1-rollback-20261018.sql`.
Restaura o corpo baseline exato (`c610786f...`) com guarda de hash do corpo novo
(`4e0c374c...`) e anti-drift. **Decisão de reverter é do usuário/auditor**;
nenhuma indicação de necessidade no momento — o endurecimento não corta acesso
legítimo existente.

## 5. Próximo recorte (READ-ONLY, sem DDL/DML hosted, sem publicar)

Auditoria ordenada por impacto dos pontos remanescentes de revogação B2B:

1. **Helpers escalares** `get_user_partner_id()` / `get_partner_papel(uuid)` —
   `LIMIT 1` sem `revoked_at`/owner/tenant; fail-closed em 0 ou 2+ vínculos.
2. **Contexto do portal** `platform_private.b2b_commercial_context` — verificar
   se lê vínculo revogado ou sem owner.
3. **Overload `can_user_access_cliente(uuid)`** — verificar ramos e paridade com
   o endurecimento do overload `(uuid,uuid)`.
4. **Leitores diretos de `partner_users` e PTC** — policies e funções que ainda
   não filtram `revoked_at`/owner (inventário F2-B1: 31 funções lexicais,
   6 policies diretas, 29 via helpers).
5. **PTC direct** — grant independente sem vínculo vigente (já bloqueado no
   overload `(uuid,uuid)`; verificar demais leitores).

Cada fix será preparado como SQL candidato funcional por fase + testes locais em
PostgreSQL descartável, com preflight e rollback. **Não reabrir RPCs fechadas,
não alterar containment PUC (RESTRICTIVE false), não tocar as 12 policies.**

## 6. Blockers de testes reais

- Sessões autenticadas JWT/RLS A/B indisponíveis neste ambiente
  (`external_unmanaged`); exigem execução pelo auditor externo ou usuário.
- Backup/restore de produção não comprovado.
- Homolog (`vrlcdwmlytukrjezrrnf`) não é paridade (279 vs 286 tabelas, guards
  parciais) — não serve para atestar comportamento de produção.
