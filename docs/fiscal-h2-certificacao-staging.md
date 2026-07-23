# Fase H2 — Certificação Runtime no Staging Temporário

> Status desta rodada: **DELTA DE PERFIS DE SERVIÇOS APROVADO NO STAGING.**
> Suíte RLS completa, backfill, regeneração de `types.ts` e testes externos
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

Nenhum destes itens foi executado nesta rodada; nenhum pode ser
declarado aprovado:

1. **Suíte RLS completa** no staging cobrindo owner A/B, roles
   `administrador`, `gestor`, `financeiro`, `cliente_produtor`,
   `parceiro_b2b`, `authenticated` sem papel — em todas as tabelas
   fiscais (`fiscal_*`, `product_fiscal_profiles`,
   `service_fiscal_profiles`, `customer_fiscal_profiles`,
   `company_fiscal_settings`) e views `v_fiscal_*`.
2. **RPCs restantes**: evento manual, CRUD/deactivate de perfis,
   readiness v2, RTC empresa/produto, `mask_sensitive_jsonb`.
3. **Certificado A1 sintético** — upload, verificação de
   não-persistência de PFX/senha, revogação, cleanup.
4. **Backfill sintético + smoke SQL + contagens antes/depois.**
5. **Regeneração de `src/integrations/supabase/types.ts`** a partir do
   staging (`SUPABASE_ACCESS_TOKEN` externo).
6. **Teardown completo** de qualquer usuário `FISCAL_TEST_H2_*` que
   venha a ser criado.
7. **Reconciliação do `schema_migrations` do staging** — divergente
   por aplicação manual histórica. Não reparar artificialmente; exige
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

Esta rodada: ~4 créditos (audit estático + gates locais + relatório).
Nenhuma escrita em banco a partir do sandbox.

## 7. Próxima barreira objetiva

Executar, **fora do sandbox** e no staging temporário, a **suíte RLS
completa por resultado real** cobrindo todas as tabelas/views fiscais e
todas as roles listadas em §3.1. Retornar contagens SELECT/INSERT/
UPDATE/DELETE por role + evidência de negação onde esperada. Sem isso,
H2 não pode ser declarada concluída, e H3/produção permanecem
proibidas.

## 8. Status final

**PARCIAL — delta de perfis de serviços APROVADO no staging; H2 ainda
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

**Status:** migration **versionada** no caminho canônico, **NÃO
aplicada** em banco. Aguarda aplicação externa no staging, seguida de
reprodução da suíte RLS §3.1 por resultado real. Produção proibida.

