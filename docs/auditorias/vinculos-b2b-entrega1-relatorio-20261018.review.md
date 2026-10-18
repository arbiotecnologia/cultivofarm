# ENTREGA OPERACIONAL 1 — Endurecimento de `can_user_access_cliente(uuid,uuid)` (candidata revisável, NÃO instalada)

Base: commit dafd9abd (pós F2-B3.3-B). Destino de leitura: Supabase canônico `swzpzcwiasxmjutrmvkm` (ACTIVE_HEALTHY, PG17, branch main). Nenhum DDL/DML hosted, nenhuma publicação. Containment PUC (`bf02_assignment_contract_containment` RESTRICTIVE false) e as 12 policies dependentes intactos.

## 1. Fatos verificados hosted (read-only, 2026-10-18)

- Corpo hospedado de `public.can_user_access_cliente(uuid,uuid)` confere com o baseline instalado em 2026-10-16: `md5 = c610786fc9f6d6a44453b9e63c91e974` (ramo `user_clientes` já endurecido com `revoked_at IS NULL` pela migration 20261016234052).
- **Brechas confirmadas no corpo atual:**
  1. Ramo `parceiro_b2b`: junta `partner_clients` × `partner_users` sem `pu.revoked_at IS NULL`, sem validar `partner_accounts.ativo`/`deleted_at` e sem coerência de tenant.
  2. Ramo `parceiro_b2b_tecnico`: PUC sem `revoked_at` e sem vínculo/parceiro vigente; PTC autoriza **sem qualquer vínculo `partner_users`** — uma linha PTC direta órfã concede acesso.
- ACL da função: `postgres, service_role, authenticated` com EXECUTE; `SECURITY DEFINER`, `search_path=public`. Overload `(uuid)` existe separado e não é tocado.
- **12 policies** referenciam o overload `(uuid,uuid)`: aprovacoes_tecnicas, clientes, fazendas, ordens_servico_onfarm_status_history, registros_consultor (SELECT+UPDATE), registros_consultor_arquivos, registros_consultor_recomendacoes, solicitacoes_atribuicoes, visita_diagnosticos, visitas_checkin, visitas_logs.
- Estado de dados: `partner_users` = 1 vínculo, não revogado, **elegível** (tenant_id = owner do parceiro, parceiro ativo); PUC = 0, PTC = 0. Ou seja: o endurecimento **não corta nenhum acesso legítimo existente hoje**.

## 2. Decisão de desenho

- **Não impor self-only**: o overload autoriza ALVO terceiro por desenho (callers internos e policies passam `_user_id` arbitrário). Endurecer por vínculo do alvo, nunca por `auth.uid()`.
- **Ramo `parceiro_b2b`**: exige `pu.revoked_at IS NULL`, `pa.ativo AND pa.deleted_at IS NULL`, e coerência de tenant `pu.tenant_id = pa.commercial_owner_organization_id` **quando o owner existe**; parceiro sem owner (`legacy_partner_tenant`) permanece autorizado — decisão consciente para não cortar o fluxo legado comprovado (regularização fica para F2).
- **Ramo `parceiro_b2b_tecnico`**: PUC exige `puc.revoked_at IS NULL` + vínculo `partner_users` do próprio técnico não revogado + parceiro ativo; PTC exige vínculo `partner_users` vigente do técnico + parceiro ativo. PTC direto **sem vínculo deixa de autorizar** (fecha a brecha 2).
- Mesmo padrão operacional da correção já instalada (20261016234052): transação única, guarda de hash do corpo, substituição de marcador exato com contagem = 1, pós-condição read-only. Assinatura, owner, ACL e search_path inalterados; CREATE OR REPLACE preserva dependências das 12 policies.

## 3. Arquivos entregues

| Arquivo | Conteúdo |
|---|---|
| `docs/auditorias/vinculos-b2b-entrega1-preflight-readonly-20261018.sql` | 6 blocos SELECT-only: hash, ACL, colunas, estado de dados, policies, callers |
| `docs/auditorias/vinculos-b2b-entrega1-candidato-20261018.sql` | Migração candidata transacional com guarda de hash + marcadores + pós-condição |
| `docs/auditorias/vinculos-b2b-entrega1-rollback-20261018.sql` | Rollback que restaura o corpo baseline exato, com guarda anti-drift e pós-condição de hash |
| `scripts/tests/entrega1-client-access-local.sql` | Harness sintético: espelha o corpo baseline, aplica a candidata por marcador, prova comportamentos |
| `scripts/tests/entrega1-client-access-local.py` | PostgreSQL descartável em /tmp (porta 55498), cleanup garantido |
| `src/test/saas/entrega1-client-access-postgres.test.ts` | Wrapper vitest |

## 4. Testes locais (PostgreSQL descartável, sintético) — 4 fases PASS

- **Fase 1 (brecha reproduzida no baseline):** vínculo revogado autoriza, parceiro inativo autoriza, PTC sem vínculo autoriza — confirmando que o risco é real no corpo atual.
- **Fase 2:** candidata aplicada por substituição de marcador (mesmo algoritmo do SQL real), marcadores únicos encontrados.
- **Fase 3 (endurecido):** legítimos A e B preservados; revogado bloqueado; parceiro inativo bloqueado; tenant divergente do owner bloqueado; legacy sem owner preservado; cross-parceiro bloqueado; técnico com PUC vigente preservado; técnico só com PTC direto sem vínculo bloqueado; admin inalterado.
- **Fase 4 (dinâmico):** revogação fecha acesso imediatamente (função é STABLE, sem cache de sessão); revogação do próprio vínculo do técnico fecha sua PUC; restauração reabre.
- Vitest: `entrega1-client-access-postgres.test.ts` + `b2b-f2b33b-receipt-postgres.test.ts` — **2 arquivos/2 testes passaram**.

**Limite:** atores são linhas de tabela em schema `lab`, não JWT; nada aqui prova RLS, Storage ou sessões reais. O harness replica o corpo da função, não o banco inteiro.

## 5. Status e pendências

- **PASS:** preparação completa — candidata funcional, rollback exato, preflight, evidência de brecha e de correção em banco descartável.
- **NO-GO instalação:** backup/restauração de produção não comprovados; provas JWT/RLS A/B reais pendentes. Instalação exige: (1) preflight read-only executado e conferido, (2) backup comprovado, (3) autorização específica.
- **Pendências concretas:**
  1. Backup/restauração ensaiados (gate de qualquer instalação).
  2. Prova JWT/RLS real pós-instalação: usuário B2B revogado perde acesso a cliente/fazenda/registros; legítimo mantém.
  3. Regularização do fluxo `legacy_partner_tenant` (parceiro sem owner) — fora deste escopo, F2.
  4. Overload `(uuid)` e demais readers PUC/PTC permanecem com lacunas conhecidas (relatórios F2-B3.x) — recortes futuros.
