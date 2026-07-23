# Fase H2 — Certificação Runtime no Staging Temporário

> Status desta rodada: **EVIDÊNCIA RUNTIME AMPLIADA APROVADA NO STAGING.**
> Matriz RLS integral das demais tabelas, A1 sintético end-to-end, backfill,
> regeneração de `types.ts` e reconciliação histórica de migrations
> **PENDENTES**. H2 **não** está concluída; H3/produção continuam
> proibidas. Produção `navfzbwgwzruipouyfnk` intocada nesta rodada.


## 0. Ambiente e anti-produção

| Verificação                                | Resultado                                     |
|--------------------------------------------|-----------------------------------------------|
| Destino único autorizado                   | `ikaauvsflpmamgxmkhoq` (AR-Bio-TEMP)          |
| Marker `public._fiscal_staging_marker`     | ✅ retornou `STAGING` com project ref correto |
| Produção `navfzbwgwzruipouyfnk`            | ❌ NÃO tocada                                  |
| Escrita executada nesta rodada             | apenas transação de smoke (revertida)         |
| Segredos expostos                          | nenhum                                        |

A execução runtime foi feita **fora do sandbox Lovable**, com evidência
retornada por operador humano. Este documento registra e audita essa
evidência; não há credenciais de staging no sandbox.

## 1. Delta certificado no staging — APROVADO

Certificação executada diretamente em `ikaauvsflpmamgxmkhoq`:

- Dependências verificadas presentes: `public._fiscal_rtc_can_read(uuid)`,
  `public._fiscal_rtc_assert_payload(jsonb,text)`, `public.has_role`,
  colunas `ibs_cbs_configuration`, `updated_at`, `updated_by` em
  `service_fiscal_profiles`.
- Aplicadas transacionalmente as duas RPCs novas **exatamente** conforme
  `supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql`
  (linhas 370–426):
  - `public.rpc_fiscal_service_profile_ibs_cbs_get(uuid)` — `SECURITY
    DEFINER`, `STABLE`, `search_path=public`, leitura filtrada por
    `_fiscal_rtc_can_read(v_uid)` e `is_active = true`.
  - `public.rpc_fiscal_service_profile_ibs_cbs_save(uuid,jsonb,text)` —
    `SECURITY DEFINER`, `VOLATILE`, exige autenticação, papel
    `administrador` OU `financeiro`, valida payload via
    `_fiscal_rtc_assert_payload(payload,'item')`, faz concorrência
    otimista com `expected_revision`, retorna `FISCAL_CONFLICT` /
    `FISCAL_ITEM_NOT_FOUND`, e persiste `updated_by = v_uid` além de
    `updated_at = now()`.
- Grants estreitos aplicados via bloco `DO`: `REVOKE ALL … FROM PUBLIC`,
  `REVOKE ALL … FROM anon`, `GRANT EXECUTE … TO authenticated`.
- Smoke transacional aprovado:
  - Papel `financeiro`: `get` retornou payload atual; `save` gravou
    payload mínimo válido e atualizou `updated_by` para o UID do ator.
  - Papel sem autorização: recebeu `SQLSTATE 42501` (permission denied)
    conforme contrato.
- Fixture revertida na mesma transação. **Contagem residual = 0.**
- `supabase_migrations.schema_migrations` **não** recebeu inserção
  artificial da versão `20260727000000`, pois o histórico do staging
  não representa integralmente o estado real (objetos fiscais foram
  aplicados manualmente ao longo do tempo). Reparo artificial foi
  explicitamente evitado.

### 1.1 Auditoria de conformidade código ↔ evidência

Confirmado por leitura estática de
`supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql`:

| Requisito                                               | Linha(s) | Status |
|---------------------------------------------------------|----------|--------|
| `rpc_fiscal_service_profile_ibs_cbs_get(p_profile_id)`  | 370      | ✅     |
| `rpc_fiscal_service_profile_ibs_cbs_save(p_profile_id,payload,expected_revision)` | 387–388 | ✅ |
| Validação `_fiscal_rtc_assert_payload(payload,'item')`  | 397      | ✅     |
| Controle de revisão + `FISCAL_CONFLICT`                 | 402      | ✅     |
| `updated_by = v_uid` no UPDATE                          | 405      | ✅     |
| Grants estreitos (REVOKE PUBLIC/anon + GRANT authenticated) | 420–425 | ✅ |

Testes estáticos já cobrem exatamente esses pontos e não foram
duplicados nesta rodada:
- `src/test/fiscal/bloco5_service_profile_ibs_cbs.test.ts`
- `src/test/fiscal/correcao_cirurgica_final.test.ts`

## 2. Gates locais executados nesta rodada

| Gate                                              | Resultado |
|---------------------------------------------------|-----------|
| `bun run typecheck` (`tsc --noEmit`)              | ✅        |
| `bun run build` (SW gerado, 20 entries)           | ✅        |
| `bunx vitest run src/test/fiscal` (44 arquivos)   | ✅ 992 passed / 3 skipped |
| `scripts/fiscal-secrets-scan.sh`                  | ✅        |
| `scripts/fiscal-integration-scan.sh`              | ✅        |
| `scripts/verify-fiscal-types.ts`                  | ✅ 9 tabelas / 5 views / 2 RPCs |
| Suíte Vitest completa (fora deste escopo)         | ⏭ não re-executada; referência H1 = 1341/1341 |
| Lint dedicado                                     | ⚠ script `lint` ausente (gate documentado em H1) |

## 3. Pendências explícitas para concluir H2

Itens executados nesta rodada e registrados em §11 abaixo:

- RLS das três tabelas de perfis fiscais (`product_fiscal_profiles`,
  `service_fiscal_profiles`, `customer_fiscal_profiles`) com migration
  `20260728000000` aplicada no staging.
- RPCs de IBS/CBS para perfis de serviço e produto.
- `rpc_fiscal_homologation_readiness_v2`.
- `mask_sensitive_jsonb`.
- Verificações de segurança de ambiente e de certificados digitais.

Itens que permanecem pendentes para concluir H2:

1. **Matriz RLS integral das demais tabelas fiscais** com owner A/B,
   roles `administrador`, `gestor`, `financeiro`, `cliente_produtor`,
   `parceiro_b2b`, `authenticated` sem papel — em `fiscal_*`,
   `company_fiscal_settings` e views `v_fiscal_*`.
2. **Certificado A1 sintético end-to-end** — upload, verificação de
   não-persistência de PFX/senha, revogação, cleanup.
3. **Backfill sintético + smoke SQL + contagens antes/depois.**
4. **Regeneração de `src/integrations/supabase/types.ts`** a partir do
   staging (`SUPABASE_ACCESS_TOKEN` externo).
5. **Reconciliação histórica do `schema_migrations` do staging** —
   divergente por aplicação manual. Não reparar artificialmente; exige
   decisão humana sobre baseline.


## 4. Histórico de migrations do staging

Divergente/incompleto: o staging teve objetos fiscais aplicados
manualmente ao longo do tempo e `schema_migrations` **não** reflete
todo esse estado. Decisão desta rodada: **não** inserir versões
artificialmente. Reconciliação real deve ser um item explícito de H3
sob autorização humana, com baseline auditado.

## 5. Riscos residuais

- Cobertura RLS por resultado real ainda não medida no staging — item
  #1 acima é o maior gap para fechar H2.
- `types.ts` continua dependendo de regeneração externa (H1 §J).
- Ausência de `lint` local mantém gate de estilo manual.
- Falha transitória rara de Vitest em execuções paralelas pesadas
  observada em H1; não observada nesta rodada.

## 6. Créditos consumidos

Acumulado desta fase H2: ~17 créditos (audit estático, gates locais,
relatórios e atualizações de relatório). Nenhuma escrita em banco a
partir do sandbox; execução runtime ocorreu fora do sandbox em
transações com `ROLLBACK`.


## 7. Próxima barreira objetiva

Executar, **fora do sandbox** e no staging temporário, a **matriz RLS
integral das demais tabelas fiscais** (`fiscal_*`,
`company_fiscal_settings`, `v_fiscal_*`) com owner A/B e todas as
roles. Retornar contagens SELECT/INSERT/UPDATE/DELETE por role +
evidence de negação onde esperada. Complementar com A1 sintético
end-to-end, backfill sintético, regeneração de `types.ts` e
reconciliação histórica de `schema_migrations`. Sem isso H2 não pode
ser declarada concluída, e H3/produção permanecem proibidas.


## 8. Status final

**PARCIAL — evidência runtime ampliada APROVADA no staging; H2 ainda
NÃO concluída.** Homologação completa **não** declarada. Produção
**não** apta. H3 **não** iniciada. Frontend **não** deployado.


---

## 9. Achado runtime — RLS ambígua em perfis fiscais

**Origem:** verificação no staging `ikaauvsflpmamgxmkhoq` das policies de
`product_fiscal_profiles`, `service_fiscal_profiles` e
`customer_fiscal_profiles`. Produção `navfzbwgwzruipouyfnk` intocada.

**Evidência:**

- Cada tabela possui policy permissiva `<tabela>_write FOR ALL` para
  administrador/financeiro (migration `20260721000000_fiscal_fase2_fundacao.sql`).
- Cada tabela também possui policy `<tabela>_delete FOR DELETE USING (false)`
  (migration `20260722000000_fiscal_fase3_0_1_integridade.sql`).
- Policies permissivas são combinadas por **OR**: o ramo DELETE da policy
  `FOR ALL` continua ativo no plano RLS; a policy DELETE=false **não** o
  neutraliza.
- Hoje `authenticated` não tem privilégio DELETE nessas tabelas (REVOKE
  aplicado em 20260722000000), então a exclusão direta é bloqueada pela
  camada de GRANT — não pela RLS. A modelagem RLS é inconsistente e
  depende de uma segunda camada de defesa.

## 10. Correção canônica — versionada, pendente de aplicação em banco

**Fonte canônica versionada:**
`supabase/migrations/20260728000000_fiscal_rls_perfis_split_write.sql`

O arquivo foi criado diretamente no diretório canônico de migrations.
Versionar SQL em `supabase/migrations/` **não** aplica migration, não
conecta banco e não toca produção — é apenas registro da fonte. A
aplicação em banco ocorre em canal externo autorizado, exclusivamente no
staging temporário `ikaauvsflpmamgxmkhoq`. Produção
`navfzbwgwzruipouyfnk` permanece intocada.

**Regras aplicadas (aditivas, sem alteração de comportamento legítimo):**

Para cada uma das três tabelas de perfis fiscais:

1. `DROP POLICY IF EXISTS <tabela>_write` — remove a policy FOR ALL.
2. `CREATE POLICY <tabela>_insert FOR INSERT TO authenticated WITH CHECK
   (administrador OR financeiro)`.
3. `CREATE POLICY <tabela>_update FOR UPDATE TO authenticated USING (...)
   WITH CHECK (...)` — mesmos papéis.
4. `CREATE POLICY <tabela>_read FOR SELECT TO authenticated USING
   (administrador OR gestor OR financeiro)` — recriação idempotente.
5. `CREATE POLICY <tabela>_delete FOR DELETE TO authenticated USING (false)`
   — recriação idempotente.
6. `REVOKE DELETE ON public.<tabela> FROM authenticated` — defesa em
   profundidade preservada.

**Não coberto nesta fase:** DELETE via RPC. Desativação continua por
`is_active=false` / RPC existente.

**Teste estático canônico:**
`src/test/fiscal/rls_perfis_split_write.test.ts` (6 asserts) — lê a
fonte canônica em `supabase/migrations/`, falha se voltar a existir
`CREATE POLICY ... FOR ALL` nessas tabelas e confirma INSERT/UPDATE
separados, DELETE=false e REVOKE DELETE.

**Status:** migration **versionada** no caminho canônico e **aplicada**
com sucesso no staging `ikaauvsflpmamgxmkhoq`. Resultado real
registrado em §11. Produção `navfzbwgwzruipouyfnk` permanece intocada.

## 11. Evidência runtime executada no staging `ikaauvsflpmamgxmkhoq`

Toda a execução ocorreu **fora do sandbox**, em transações com
`ROLLBACK`; produção `navfzbwgwzruipouyfnk` intocada. Resíduos
sintéticos = 0.

### 11.1 Migration `20260728000000` aplicada

- `supabase/migrations/20260728000000_fiscal_rls_perfis_split_write.sql`
  aplicada com sucesso no staging temporário.
- Produção `navfzbwgwzruipouyfnk` não foi alterada.

### 11.2 RLS das tabelas de perfis fiscais

Nas três tabelas (`product_fiscal_profiles`,
`service_fiscal_profiles`, `customer_fiscal_profiles`):

| Verificação | Count / Resultado |
|-------------|-------------------|
| `*_write` (FOR ALL) | 0 — removida |
| `*_insert` | 1 — `WITH CHECK (administrador OR financeiro)` |
| `*_update` | 1 — `USING (...) WITH CHECK (administrador OR financeiro)` |
| `*_read` | 1 — `USING (administrador OR gestor OR financeiro)` |
| `*_delete` | 1 — `USING (false)` |
| `REVOKE DELETE FROM authenticated` | aplicado — defesa em profundidade |

### 11.3 Permissões por papel — tabelas de perfis

- `service_fiscal_profiles`:
  - `financeiro`: INSERT ✅, UPDATE ✅, SELECT ✅
  - `gestor`: SELECT ✅, UPDATE retornou 0 linhas afetadas, INSERT retornou `SQLSTATE 42501`
  - `gestor_comercial`: SELECT retornou 0 linhas, INSERT retornou `SQLSTATE 42501`
- `product_fiscal_profiles` e `customer_fiscal_profiles`:
  - `financeiro`: INSERT ✅, UPDATE ✅, SELECT ✅

### 11.4 RPCs de perfis de serviço (IBS/CBS)

- `rpc_fiscal_service_profile_ibs_cbs_get` ✅
- `rpc_fiscal_service_profile_ibs_cbs_save` ✅
- `updated_by` persistido corretamente ✅
- Papel sem autorização: `SQLSTATE 42501` ✅
- Conflito de revisão obsoleta: `SQLSTATE 40001` / `FISCAL_CONFLICT` ✅
- Perfil inativo: invisível na leitura ✅

### 11.5 RPC produto IBS/CBS

- `rpc_fiscal_product_ibs_cbs_get` / `rpc_fiscal_product_ibs_cbs_save` aprovadas ✅

### 11.6 Readiness v2

- `rpc_fiscal_homologation_readiness_v2` autorizado retornou objeto válido ✅

### 11.7 Máscara de JSON sensível

`mask_sensitive_jsonb` aprovou:

- aninhamento ✅
- arrays ✅
- case-insensitive ✅
- `accessToken`, `private_key`, `client_secret` ✅
- `null` ✅
- idempotência ✅

### 11.8 Segurança de ambiente

| Verificação | Resultado |
|-------------|-----------|
| Provider | `NONE` |
| Ambiente | `NOT_CONFIGURED` |
| Status | `DRAFT` |
| NF-e habilitado | `false` |
| NFS-e habilitado | `false` |
| `production_enabled` | `false` |

### 11.9 Certificados digitais

- Tabela de certificados: 0 registros.
- Nenhuma coluna de senha, PFX ou chave privada presente.
- Bucket privado: 10 MiB, 0 objetos.




## 12. Correção preparada — hard delete em `financial_documents`

**Achado runtime (staging `ikaauvsflpmamgxmkhoq`, produção intocada):**

- `public.financial_documents` possui duas policies permissivas `FOR ALL`
  combinadas por OR: `"Financial staff full access"` e `"fd_staff_all"`.
- O papel `authenticated` mantém privilégio `DELETE` na tabela.
- Consequência: hard delete físico está tecnicamente autorizado, o que
  ameaça XML, DANFE e trilha de auditoria financeira.
- `src/components/financeiro/DocumentosPanel.tsx` executa exclusivamente
  soft delete via `UPDATE` de `deleted_at`, `deleted_by` e
  `delete_reason`; portanto o ramo DELETE é desnecessário.

**Migration versionada (não aplicada nesta rodada):**
`supabase/migrations/20260729000000_fiscal_financial_documents_no_hard_delete.sql`.

Conteúdo:

1. `DROP POLICY IF EXISTS "Financial staff full access"` e
   `DROP POLICY IF EXISTS "fd_staff_all"` em
   `public.financial_documents`.
2. `CREATE POLICY "fd_staff_insert" FOR INSERT TO authenticated
   WITH CHECK (public.is_financial_staff(auth.uid()))`.
3. `CREATE POLICY "fd_staff_update" FOR UPDATE TO authenticated
   USING/WITH CHECK (public.is_financial_staff(auth.uid()))` — cobre o
   soft delete legítimo do painel.
4. `CREATE POLICY "fd_no_hard_delete" FOR DELETE TO authenticated
   USING (false)` (recriação idempotente).
5. `REVOKE DELETE ON public.financial_documents FROM authenticated`.
6. Policies `SELECT` existentes (staff em documentos não deletados;
   produtor sobre documento próprio) preservadas integralmente. GRANTs
   `SELECT/INSERT/UPDATE` inalterados.

**Teste canônico adicionado:**
`src/test/fiscal/rls_financial_documents_no_hard_delete.test.ts`
(6 asserts): remoção nominal das duas policies antigas, ausência de
`FOR ALL`, criação separada de `fd_staff_insert`/`fd_staff_update`,
persistência de `fd_no_hard_delete USING(false)`, `REVOKE DELETE` e
comprovação de que `DocumentosPanel` usa `.update({ deleted_at: ... })`
e nunca `.delete()` sobre `financial_documents`.

**Status:** migration `20260729000000` **aplicada e validada no staging**
`ikaauvsflpmamgxmkhoq`: hard delete físico bloqueado (sem GRANT), INSERT
e UPDATE comuns pelo staff financeiro aprovados. O ramo `DELETE FOR ALL`
foi eliminado; produção `navfzbwgwzruipouyfnk` intocada.

**Gate parcial:** o teste runtime de soft delete via `UPDATE` direto de
`deleted_at`/`deleted_by`/`delete_reason` retornou `SQLSTATE 42501`
porque a policy `SELECT` vigente oculta a linha após o soft delete
(`deleted_at IS NULL`). Reabrir `SELECT` sobre documentos apagados
exporia excluídos nas listagens normais; reabrir `DELETE` reintroduziria
o hard delete recém-bloqueado. Correção deste gap está descrita na
seção 13.

## 13. Correção preparada — RPC `rpc_financial_document_soft_delete`

**Migration versionada (não aplicada nesta rodada):**
`supabase/migrations/20260730000000_fiscal_financial_documents_soft_delete_rpc.sql`.

Conteúdo:

1. `CREATE OR REPLACE FUNCTION public.rpc_financial_document_soft_delete(p_document_id uuid, p_reason text) RETURNS uuid`
   `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`.
2. Exige `auth.uid()` (`42501` para anônimo) e `public.is_financial_staff(v_uid)` (`42501` para papel sem autorização).
3. Motivo sanitizado com `btrim(coalesce(...,''))`, obrigatório e limitado a 500 caracteres (`22023`).
4. Documento inexistente → `P0002`; segunda exclusão → `40001`.
5. `UPDATE ... SET deleted_at = now(), deleted_by = v_uid, delete_reason = v_reason WHERE id = p_document_id AND deleted_at IS NULL`.
   Cliente nunca informa `deleted_by`/`deleted_at`; a assinatura só aceita `p_document_id` e `p_reason`.
6. `REVOKE ALL ... FROM PUBLIC`, `REVOKE ALL ... FROM anon`, `GRANT EXECUTE ... TO authenticated`.
7. `SELECT` sobre documentos apagados **não** é ampliado; listagens continuam filtrando `deleted_at IS NULL`. Nenhuma RLS/RPC não relacionada é alterada. Nenhum `GRANT DELETE` físico concedido.

**Frontend:** `src/components/financeiro/DocumentosPanel.tsx` deixou de
executar `UPDATE` direto e agora chama a RPC. Mensagens pt-BR, loading,
erro e invalidação da lista preservados.

**Teste canônico adicionado:**
`src/test/fiscal/rpc_financial_document_soft_delete.test.ts` (9 asserts):
assinatura/SECURITY DEFINER/search_path, rejeição de anônimo e sem
papel, motivo `btrim`/vazio/`>500`, preenchimento server-side (nenhum
`p_deleted_*`), `P0002`/`40001`, grants (`REVOKE PUBLIC/anon`,
`GRANT EXECUTE authenticated`), ausência de `FOR ALL`/`GRANT DELETE`,
manutenção do `REVOKE DELETE` da migration `20260729000000`, e
comprovação de que o painel usa `supabase.rpc('rpc_financial_document_soft_delete')`
sem `.update({ deleted_at })` nem `.delete()`.

**Status:** migration/RPC **aplicada no staging `ikaauvsflpmamgxmkhoq`**;
testes runtime **sequenciais passaram com zero resíduos** (anônimo, sem
papel, motivo vazio, inexistente, soft delete legítimo, segunda exclusão
e verificação de autoria server-side — todos com os SQLSTATE esperados;
rollback confirmado). Auditoria posterior identificou **condição de
corrida** no `SELECT` sem lock: duas chamadas simultâneas podiam ambas
aprovar a checagem de `deleted_at IS NULL` e a segunda retornar sucesso
atualizando 0 linhas. Correção aplicada **somente na migration
versionada** `20260730000000` — `SELECT ... FOR UPDATE` antes da
validação e `GET DIAGNOSTICS ... ROW_COUNT` com conversão de 0 linhas em
`40001` — preservando assinatura, `P0002`/`40001`, grants e demais
regras. **Teste concorrente runtime fica PENDENTE** até a definição
corrigida ser reaplicada no staging.

**Gates locais nesta rodada:** typecheck ✅, build ✅, focal ✅
(`rpc_financial_document_soft_delete.test.ts` com novo assert
`FOR UPDATE` + `ROW_COUNT`).


### 13.1 Roteiro SQL mínimo do teste runtime (com rollback)

```sql
BEGIN;
-- Prep: obter um documento ativo qualquer
--   SELECT id FROM public.financial_documents WHERE deleted_at IS NULL LIMIT 1;

-- 1. Sessão anônima → 42501
SET LOCAL role anon;
SELECT public.rpc_financial_document_soft_delete('00000000-0000-0000-0000-000000000000'::uuid, 'x');
-- ERRO esperado: 42501

-- 2. Autenticado sem papel financeiro → 42501
RESET role;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claim.sub" TO '<uuid_usuario_sem_papel>';
SELECT public.rpc_financial_document_soft_delete('<uuid_doc_ativo>'::uuid, 'motivo');
-- ERRO esperado: 42501

-- 3. Motivo vazio → 22023
SET LOCAL "request.jwt.claim.sub" TO '<uuid_financeiro>';
SELECT public.rpc_financial_document_soft_delete('<uuid_doc_ativo>'::uuid, '   ');
-- ERRO esperado: 22023

-- 4. Documento inexistente → P0002
SELECT public.rpc_financial_document_soft_delete(gen_random_uuid(), 'motivo válido');
-- ERRO esperado: P0002

-- 5. Soft delete legítimo
SELECT public.rpc_financial_document_soft_delete('<uuid_doc_ativo>'::uuid, 'Removido em teste H2');
-- OK; retorna o uuid

-- 6. Segunda exclusão → 40001
SELECT public.rpc_financial_document_soft_delete('<uuid_doc_ativo>'::uuid, 'novamente');
-- ERRO esperado: 40001

-- 7. Confirmar autoria server-side
SELECT id, deleted_at, deleted_by, delete_reason
  FROM public.financial_documents WHERE id = '<uuid_doc_ativo>';

ROLLBACK;
```

## 14. Achado runtime — privilégios estruturais em tabelas fiscais

**Origem:** auditoria runtime no staging `ikaauvsflpmamgxmkhoq`. O papel
`authenticated` (e `anon`, quando presente) mantém `TRUNCATE`,
`REFERENCES` e `TRIGGER` nas tabelas fiscais críticas. RLS não protege
essas operações — `TRUNCATE` esvazia fisicamente ignorando policies e
`REFERENCES`/`TRIGGER` permitem anexar dependências indevidas. Além
disso, `fiscal_idempotency_keys` deve aceitar gravação apenas
server-side/`service_role`; qualquer INSERT/UPDATE/DELETE por
`authenticated`/`anon` viola o contrato de idempotência.

**Migration versionada (não aplicada nesta rodada):**
`supabase/migrations/20260731000000_fiscal_revoke_structural_privileges.sql`.

Conteúdo aditivo e idempotente:

1. `DO $$ ... $$` com `ARRAY[...]` das 10 tabelas alvo — `company_fiscal_settings`,
   `product_fiscal_profiles`, `service_fiscal_profiles`,
   `customer_fiscal_profiles`, `fiscal_invoices`, `fiscal_invoice_items`,
   `fiscal_events`, `fiscal_idempotency_keys`, `fiscal_audit_log`,
   `financial_documents` — executando via `format('%I', t)`:
   - `REVOKE TRUNCATE, REFERENCES, TRIGGER ... FROM authenticated`
   - `REVOKE TRUNCATE, REFERENCES, TRIGGER ... FROM anon`
2. Hardening extra da idempotência:
   - `REVOKE INSERT, UPDATE, DELETE ON public.fiscal_idempotency_keys FROM authenticated`
   - `REVOKE INSERT, UPDATE, DELETE ON public.fiscal_idempotency_keys FROM anon`
3. **Nada mais é alterado**: policies, RLS, funções, DML legítimo das
   demais tabelas, grants de `service_role` e o `SELECT` administrativo
   preservado em `20260721000000_fiscal_fase2_fundacao.sql`
   (`GRANT SELECT ON public.fiscal_idempotency_keys TO authenticated`,
   `GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_fiscal_settings TO authenticated`, etc.)
   permanecem intactos.

**Teste canônico:** `src/test/fiscal/revoke_structural_privileges.test.ts`
(7 asserts) — cobre as 10 tabelas alvo, presença de REVOKE
TRUNCATE/REFERENCES/TRIGGER para `authenticated` e `anon`, hardening
INSERT/UPDATE/DELETE em `fiscal_idempotency_keys`, ausência de qualquer
GRANT estrutural ou reintrodução DML, preservação de policies/RLS/
funções/`service_role`/`SELECT`, e verificação de que os GRANTs base da
migration `20260721000000` continuam declarados e não são revogados.

**Status:** correção **preparada e versionada**; **pendente de aplicação
runtime no staging** `ikaauvsflpmamgxmkhoq`. Produção
`navfzbwgwzruipouyfnk` intocada.

**Gates locais nesta rodada:** typecheck ✅, build ✅, focal ✅
(`revoke_structural_privileges.test.ts`), suíte fiscal completa ✅
(1021 passed, 3 skipped).

### 14.1 SQL de auditoria pós-aplicação (staging)

```sql
-- 1) Privilégios estruturais devem estar ausentes para authenticated/anon
SELECT grantee, table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('authenticated','anon')
   AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
   AND table_name IN (
     'company_fiscal_settings','product_fiscal_profiles',
     'service_fiscal_profiles','customer_fiscal_profiles',
     'fiscal_invoices','fiscal_invoice_items','fiscal_events',
     'fiscal_idempotency_keys','fiscal_audit_log','financial_documents'
   )
 ORDER BY table_name, grantee, privilege_type;
-- Esperado: 0 linhas.

-- 2) fiscal_idempotency_keys: authenticated/anon só podem manter SELECT
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name = 'fiscal_idempotency_keys'
   AND grantee IN ('authenticated','anon')
 ORDER BY grantee, privilege_type;
-- Esperado: no máximo SELECT para authenticated (conforme fase 2); nada para anon.

-- 3) service_role permanece com privilégios necessários (sanidade)
SELECT privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee = 'service_role'
   AND table_name = 'fiscal_idempotency_keys';
-- Esperado: privilégios prévios preservados (não devem ter sido tocados).
```

## 15. Evidência runtime — 20260731 aplicada + entrega 20260801

**Runtime 20260731000000 no staging `ikaauvsflpmamgxmkhoq`:** migration
aplicada com sucesso. Auditoria pós-aplicação confirmou
`structural_privileges_remaining = 0` para `authenticated` e `anon` nas
10 tabelas alvo, e `fiscal_idempotency_keys` ficou **somente SELECT**
para roles não-service. Produção `navfzbwgwzruipouyfnk` intocada.

**Nova migration versionada (pendente de aplicação):**
`supabase/migrations/20260801000000_fiscal_revoke_anon_table_privileges.sql`
executa `REVOKE ALL PRIVILEGES ON TABLE public.<t> FROM anon` sobre as
10 tabelas fiscais (loop `format('%I')`). Não altera `authenticated`,
`service_role`, policies, RLS, funções, DML legítimo ou frontend.

**Teste canônico:** `src/test/fiscal/revoke_anon_table_privileges.test.ts`
(4 asserts) — 10 tabelas no array, REVOKE ALL via loop, ausência de
alteração em authenticated/service_role/policies/RLS/funções e ausência
de qualquer GRANT/DDL/DML.

**Gates locais:** typecheck ✅, build ✅, focal ✅, suíte fiscal
1025/1028 (3 skipped) ✅.

### 15.1 SQL de auditoria pós-aplicação (staging)

```sql
-- 1) anon NÃO deve possuir nenhum privilégio nas 10 tabelas fiscais
SELECT table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee = 'anon'
   AND table_name IN (
     'company_fiscal_settings','product_fiscal_profiles',
     'service_fiscal_profiles','customer_fiscal_profiles',
     'fiscal_invoices','fiscal_invoice_items','fiscal_events',
     'fiscal_idempotency_keys','fiscal_audit_log','financial_documents'
   )
 ORDER BY table_name, privilege_type;
-- Esperado: 0 linhas.

-- 2) authenticated permanece com o DML legítimo declarado nas fases
--    anteriores (sanidade — nada foi tocado nesta migration)
SELECT table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee = 'authenticated'
   AND table_name = 'company_fiscal_settings'
 ORDER BY privilege_type;
-- Esperado: SELECT + INSERT + UPDATE + DELETE (fase 2 fundação).
```

## 16. Auditoria somente-leitura — ciclo de edição de `fiscal_invoice_items`

Escopo: mapear mutações do item fiscal no código atual, correlacionar
com o estado do pai `fiscal_invoices` e apontar risco antes de qualquer
mudança de política/trigger. **Nenhum código, RLS ou banco foi alterado
nesta rodada.**

### 16.1 Superfícies de mutação encontradas

| Origem                                                                 | Operação                | Autoria/Autenticação                            |
|------------------------------------------------------------------------|-------------------------|--------------------------------------------------|
| `src/hooks/useFiscalDocuments.ts:156`                                  | `SELECT` apenas         | cliente PostgREST autenticado (RLS `_read`)      |
| Nenhum outro `.from("fiscal_invoice_items")` no frontend/edge          | —                       | grep confirma zero mutação client-side           |
| `supabase/migrations/20260724000000_fiscal_fase3_16_...sql:653-655`   | `DELETE` + `INSERT`     | RPC `rpc_fiscal_document_substitution` (server)  |
| `restoration/backfill-fiscal-fase3/99-cleanup.sql` e fixtures          | `DELETE`/`INSERT` fixture| scripts operacionais fora do runtime da app     |
| `restoration/fiscal_fase2_fundacao.sql` (histórico)                    | GRANT DML + policy FOR ALL| baseline aplicado nas fases 2/2.1                |

Conclusão: **a única mutação client-side possível hoje passa direto pelo
PostgREST**, autorizada pela policy `fiscal_invoice_items_write`
(`FOR ALL TO authenticated USING/CHECK administrador|financeiro`). Não
há hook/serviço/edge função que faça `insert/update/delete` em
`fiscal_invoice_items` — a UI atual do fiscal só lê a tabela via
`useFiscalDocumentItems`.

### 16.2 Estados do pai `fiscal_invoices` conhecidos pelo sistema

- Domínio canônico do CHECK (`NORMALIZED_STATUS_CANONICAL`,
  `src/lib/fiscal/documentWorkflowValidation.ts:76-89`):
  `LEGACY_RECORDED, DRAFT, VALIDATING, READY, QUEUED, PROCESSING,
  AUTHORIZED, REJECTED, ERROR, CANCEL_REQUESTED, CANCELED, SUBSTITUTED`.
- UI manual restringe-se a `LEGACY_RECORDED` e `DRAFT`
  (`NORMALIZED_STATUS_MANUAL`).
- Bloqueio pós-emissão do próprio invoice é feito por `locked_at`
  (`src/hooks/useFiscalDocuments.ts:243,251` — `throw InvoiceLockedError`
  no update do invoice) e pela guarda `IF v_row.locked_at IS NOT NULL`
  em `rpc_fiscal_document_substitution` (fase 3.16, linha 614).

### 16.3 Matriz estado x operação (`fiscal_invoice_items` hoje)

| `fiscal_invoices.normalized_status` do pai | INSERT item      | UPDATE item      | DELETE item      |
|--------------------------------------------|------------------|------------------|------------------|
| `DRAFT`, `LEGACY_RECORDED`                 | permitido        | permitido        | permitido        |
| `VALIDATING`, `READY`, `QUEUED`, `PROCESSING` | permitido¹    | permitido¹       | permitido¹       |
| **`AUTHORIZED`**                            | **permitido¹**   | **permitido¹**   | **permitido¹**   |
| `REJECTED`, `ERROR`, `CANCEL_REQUESTED`     | permitido¹       | permitido¹       | permitido¹       |
| **`CANCELED`**                              | **permitido¹**   | **permitido¹**   | **permitido¹**   |
| **`SUBSTITUTED`**                           | **permitido¹**   | **permitido¹**   | **permitido¹**   |

¹ Permitido no nível de RLS/GRANT desde que o chamador tenha papel
`administrador` ou `financeiro`. A policy `fiscal_invoice_items_write`
**não consulta o `normalized_status`, `locked_at` ou `locked_by` do pai
em nenhum ramo `USING`/`WITH CHECK`.** A UI atual não expõe essas
operações, mas qualquer cliente autenticado com papel admin/financeiro
pode executá-las diretamente via PostgREST/SQL.

### 16.4 Risco

- **Alto/estrutural:** itens de notas em estados terminais (`AUTHORIZED`,
  `CANCELED`, `SUBSTITUTED`) podem ser mutados/apagados fora do fluxo
  server-side (`rpc_fiscal_document_substitution`), quebrando a
  auditabilidade fiscal e a paridade com o XML/DANFE já emitido.
- **Médio:** itens de notas com `locked_at IS NOT NULL` continuam
  editáveis porque o lock só cobre o invoice pai.
- **Baixo (hoje):** exploração via UI oficial exigiria rota inexistente;
  o vetor real é PostgREST direto por conta autenticada com papel
  financeiro/admin.

### 16.5 Recomendação (não implementar nesta rodada)

Adicionar, em migration futura dedicada, uma **guarda a nível de banco**
que subordine `INSERT`/`UPDATE`/`DELETE` em `fiscal_invoice_items` ao
estado do pai. Duas alternativas mutuamente exclusivas, ambas viáveis
com o schema atual:

1. **Policy composta** — recriar `fiscal_invoice_items_write` dividida em
   `INSERT`/`UPDATE`/`DELETE` com `WITH CHECK`/`USING` exigindo
   `EXISTS (SELECT 1 FROM public.fiscal_invoices p
     WHERE p.id = fiscal_invoice_id
       AND p.locked_at IS NULL
       AND p.normalized_status NOT IN
           ('AUTHORIZED','CANCELED','SUBSTITUTED','CANCEL_REQUESTED'))`.
   Preserva `rpc_fiscal_document_substitution` porque a RPC roda como
   `SECURITY DEFINER` (RLS não se aplica).
2. **Trigger BEFORE INSERT/UPDATE/DELETE** com a mesma checagem e
   exceção `40001` para conflito ou `P0001` para violação de workflow,
   permitindo bypass explícito para `session_user = 'postgres'` /
   `current_setting('request.jwt.claim.role', true) = 'service_role'`.

Ambos os caminhos ficam **fora do escopo desta rodada** e requerem nova
autorização com validação runtime dedicada em staging.

**Gates locais desta rodada:** typecheck ✅, build ✅, focal
`revoke_anon_table_privileges.test.ts` ✅, suíte fiscal 1025/1028
(3 skipped) ✅.

## 17. Runtime 20260801 aplicada + entrega 20260802 (imutabilidade de itens)

**Runtime 20260801000000 no staging `ikaauvsflpmamgxmkhoq`:** aplicada
com sucesso. Auditoria pós-aplicação confirmou
`anon_privileges_remaining = 0` nas 10 tabelas fiscais. Produção
`navfzbwgwzruipouyfnk` intocada.

**Nova migration versionada (pendente de aplicação):**
`supabase/migrations/20260802000000_fiscal_invoice_items_state_guard.sql`.
Cria trigger `BEFORE INSERT OR UPDATE OR DELETE` em
`public.fiscal_invoice_items` que resolve o pai via `NEW`/`OLD`, trava
a linha com `SELECT ... FOR UPDATE` e restringe mutação a uma
whitelist de estados.

**Compatibilidade validada por leitura de código:** a RPC canônica
`rpc_fiscal_draft_save` (fase 3.16, linhas 611-676) só executa
`DELETE`+`INSERT` de itens após validar o pai em `DRAFT` — estado
permitido pela trigger, portanto o fluxo de rascunho/substituição
segue funcional. `grep` em `src/` e `supabase/migrations/` confirmou
zero outra RPC/edge/hook que mute `fiscal_invoice_items`. Nenhuma RPC
`rpc_fiscal_document_substitution` existe no repositório — a auditoria
anterior fez referência ao nome, mas o comportamento equivalente vive
em `rpc_fiscal_draft_save` e é compatível.

### 17.1 Matriz final estado × operação após 20260802

| `fiscal_invoices.normalized_status` | INSERT | UPDATE | DELETE |
|-------------------------------------|:------:|:------:|:------:|
| `DRAFT`                             | ✅ | ✅ | ✅ |
| `VALIDATING`                        | ✅ | ✅ | ✅ |
| `READY`                             | ✅ | ✅ | ✅ |
| `REJECTED`                          | ✅ | ✅ | ✅ |
| `ERROR`                             | ✅ | ✅ | ✅ |
| `NULL`                              | ⛔ P0001 | ⛔ P0001 | ⛔ P0001 |
| `LEGACY_RECORDED`                   | ⛔ P0001 | ⛔ P0001 | ⛔ P0001 |
| `QUEUED`                            | ⛔ P0001 | ⛔ P0001 | ⛔ P0001 |
| `PROCESSING`                        | ⛔ P0001 | ⛔ P0001 | ⛔ P0001 |
| `AUTHORIZED`                        | ⛔ P0001 | ⛔ P0001 | ⛔ P0001 |
| `CANCEL_REQUESTED`                  | ⛔ P0001 | ⛔ P0001 | ⛔ P0001 |
| `CANCELED`                          | ⛔ P0001 | ⛔ P0001 | ⛔ P0001 |
| `SUBSTITUTED`                       | ⛔ P0001 | ⛔ P0001 | ⛔ P0001 |
| pai inexistente                     | ⛔ P0002 | ⛔ P0002 | ⛔ P0002 |

Mensagens em pt-BR, sem UUIDs/valores literais no corpo do erro.

### 17.2 Roteiro BEGIN/ROLLBACK para validação runtime (staging)

Executar como `authenticated` com papel `administrador` ou `financeiro`
(a trigger é `SECURITY INVOKER` e o `service_role` bypass RLS mas não
bypass triggers — se rodar como service_role, o guard permanece
ativo, o que é o comportamento desejado).

```sql
-- Pré-requisito: um invoice DRAFT com pelo menos 1 item conhecido
-- (v_draft_id, v_item_id) e um invoice AUTHORIZED (v_auth_id) com
-- item (v_auth_item_id). Não usar dados de produção.

-- 1) Estado permitido — mutação passa
BEGIN;
UPDATE public.fiscal_invoice_items
   SET description = description
 WHERE id = :v_item_id;                     -- esperado: 1 linha
ROLLBACK;

-- 2) Estado AUTHORIZED — INSERT bloqueado (P0001)
BEGIN;
INSERT INTO public.fiscal_invoice_items (
  fiscal_invoice_id, item_sequence, item_kind, description,
  quantity, commercial_unit, unit_value, gross_value,
  discount_value, net_value
) VALUES (
  :v_auth_id, 999, 'MERCADORIA', 'teste guard',
  1, 'UN', 1, 1, 0, 1
);
-- esperado: ERROR P0001 "Operacao bloqueada: itens fiscais ..."
ROLLBACK;

-- 3) Estado AUTHORIZED — UPDATE bloqueado (P0001)
BEGIN;
UPDATE public.fiscal_invoice_items
   SET description = 'teste guard'
 WHERE id = :v_auth_item_id;
-- esperado: ERROR P0001
ROLLBACK;

-- 4) Estado AUTHORIZED — DELETE bloqueado (P0001)
BEGIN;
DELETE FROM public.fiscal_invoice_items WHERE id = :v_auth_item_id;
-- esperado: ERROR P0001
ROLLBACK;

-- 5) Pai inexistente (P0002)
BEGIN;
INSERT INTO public.fiscal_invoice_items (
  fiscal_invoice_id, item_sequence, item_kind, description,
  quantity, commercial_unit, unit_value, gross_value,
  discount_value, net_value
) VALUES (
  '00000000-0000-0000-0000-000000000000', 1, 'MERCADORIA', 't',
  1, 'UN', 1, 1, 0, 1
);
-- esperado: ERROR P0002 "Operacao bloqueada: nota fiscal pai nao encontrada."
ROLLBACK;

-- 6) Lock concorrente (2 sessões)
-- sessão A:
BEGIN;
UPDATE public.fiscal_invoice_items
   SET description = description
 WHERE id = :v_item_id;
-- (não commit)
-- sessão B (deve aguardar o SELECT ... FOR UPDATE da trigger):
BEGIN;
UPDATE public.fiscal_invoices SET normalized_status = 'AUTHORIZED'
 WHERE id = :v_draft_id;
-- esperado: B espera A liberar; ao commit de A, B prossegue.
COMMIT;  -- em A
-- em B: ROLLBACK para não alterar dados reais
ROLLBACK;

-- 7) Sanidade: RPC de rascunho continua funcional
SELECT public.rpc_fiscal_draft_save(
  :v_draft_id,
  :v_invoice_json,
  :v_items_json,
  :v_expected_version
);
-- esperado: retorno com id/draft_version/total_amount, sem P0001.
```

### 17.3 Teste focal e gates

- Focal: `src/test/fiscal/invoice_items_state_guard.test.ts` (11
  asserts) cobre contrato do trigger, whitelist estrita, bloqueio
  explícito de NULL, SQLSTATE `P0001`/`P0002`, mensagens pt-BR sem
  dados sensíveis, ausência de mudanças em RLS/grants/audit trigger,
  `SECURITY INVOKER` + `search_path` + `REVOKE PUBLIC`, e
  compatibilidade textual com `rpc_fiscal_draft_save`.
- Gates locais: typecheck ✅, build ✅, suíte fiscal 1042/1045
  (3 skipped) ✅.
