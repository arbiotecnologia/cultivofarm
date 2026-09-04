# H8-C — Reconciliação definitiva das 59 migrations repo-only

**Fase:** H8-C (Ledger / reconciliação repo-only)
**Data:** 2026-09-04
**Commit inicial autoritativo:** `e081eba9230632cc0a0f408b162878bcee92b7d9`
**Commit de execução:** `edc4b9d8efeb61c86cf13d05d8c3837c6212a0fd` (descendente direto do inicial)
**Alvo exclusivo:** homologação `ikaauvsflpmamgxmkhoq`
**Produção `navfzbwgwzruipouyfnk`:** não consultada, não alterada, NO-GO mantido.
**Natureza da fase:** somente leitura de banco + documentação/guard. **Nenhum DDL, nenhuma migration nova, nenhum arquivo SQL das 59 alterado, movido ou renomeado.**

## 1. Baseline e binding

- Gate inicial detectou drift de binding: `.env` apontava para outro projeto. Restaurados **exclusivamente** os arquivos de binding (`.env`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`) a partir do baseline autorizado `6c08a8f8` → `ikaauvsflpmamgxmkhoq` (21.841 linhas de types).
- Ledger de homologação: **658** versões (confirmado por consulta read-only).
- H8-A (`20261001000000`, `20261001010000`, `20261001020000`) e H8-B1 (`20261002000000`): **4/4 presentes** no ledger.
- Manifesto `restoration/homologacao-h7/h7p-repo-only-manifest.json`: 59 entries, `ledger_versoes=658`, `apply_to_staging=false` em 59/59, `0` presentes no ledger.
- Distribuição confirmada: **36 REFLETIDA / 3 SUPERSEDED / 20 CONFLITANTE**.
- 4 entries `destructive`: `20260825000000`, `20260916000000`, `20260917000000`, `20260927000000`.

## 2. Método de reconciliação individual

Para cada uma das 59 migrations:

1. O SQL foi lido como **artefato não confiável**; nenhum trecho foi executado.
2. Extração estática dos objetos pretendidos (tabelas, ALTER TABLE, funções, policies, índices, triggers, views, enums, DROP/DELETE/TRUNCATE).
3. Comparação **somente por consulta read-only** ao catálogo da homologação (`information_schema`, `pg_proc`, `pg_policies`, `pg_indexes`, `pg_trigger`, `pg_class.relacl`, `pg_proc.proacl`, `pg_proc.proconfig`) e ao código atual.
4. Registro de cobertura objetiva (objetos presentes / objetos verificados) e das lacunas nominais.

Universo de comparação medido no catálogo de homologação: 249 tabelas, 950 funções, 537 nomes distintos de policy, 856 índices, 323 triggers, 24 views, 57 enums.

## 3. Tabela das 59 entries

| Version | Arquivo | SHA-256 (prefixo) | Classificação | Cobertura no catálogo | Objetos ausentes (evidência) | Decisão | Risco de replay |
|---|---|---|---|---|---|---|---|
| 20260812134101 | `20260812134101_604206f7-71a8-4fde-b41b-537f6479446a.sql` | `1b7e524691f017f4…` | CONFLITANTE | 7/8 | policies: Admins can manage fiscal settings | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134155 | `20260812134155_245d0079-9267-453c-8423-158f2fd81ce7.sql` | `2ad7458e42d615fa…` | CONFLITANTE | 0/1 | policies: Admins can manage fiscal settings | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134238 | `20260812134238_0b1155d2-e6ff-4811-8ed0-915706f54e56.sql` | `c104920a372bf712…` | CONFLITANTE | 10/12 | tables: evidencias; policies: Public read for system config | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134313 | `20260812134313_f3b6054d-f393-407b-a9d1-cfe5de019a32.sql` | `078042be6d37e597…` | CONFLITANTE | 18/19 | tables: evidencias | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134344 | `20260812134344_7efd6b71-d7e9-4630-b779-d4ea6f1b62ad.sql` | `8844343b38da865c…` | CONFLITANTE | 6/6 | — | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134417 | `20260812134417_9da45add-c5b2-47db-8aab-e55153a7ca11.sql` | `d379bb96611ce709…` | CONFLITANTE | 5/7 | tables: produto_anexos, esteira_producao_v2 | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134501 | `20260812134501_b23b4b9d-fbb7-4c16-b9fa-be78284f92b0.sql` | `a374115df93a0565…` | CONFLITANTE | 4/4 | — | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134547 | `20260812134547_e8fb7992-9708-4f53-90d9-35cfaba3fe6e.sql` | `6ab89f3846159b47…` | CONFLITANTE | 6/7 | funcs: rpc_generate_idempotency_key | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134640 | `20260812134640_8de48d83-c45e-4b00-bf5a-f92067012de8.sql` | `2873d13004239d21…` | CONFLITANTE | 6/7 | views: vw_schema_health | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134732 | `20260812134732_8ffaf385-2037-4c17-b5a2-8a180a282b70.sql` | `eea5a2beeb613f32…` | CONFLITANTE | 6/6 | — | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134822 | `20260812134822_438e288d-07e1-4991-bb89-563c8dba44d1.sql` | `b9dbc2eb491da8b8…` | CONFLITANTE | 4/4 | — | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812134916 | `20260812134916_e41eb879-11ae-4e93-bfed-d8d1b33b4e9b.sql` | `da4ff09a5b175fed…` | CONFLITANTE | 3/5 | tables: portal_notifications; alters: evidencias | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812135012 | `20260812135012_c2c8b2e7-36d8-461b-ba76-3488771ad5a4.sql` | `3222c462aba09dba…` | CONFLITANTE | 6/7 | tables: cliente_campos_extras | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812135124 | `20260812135124_08d0ab81-80cc-422a-b1a1-44de6d957250.sql` | `b46abdc8f33bb9ba…` | CONFLITANTE | 7/7 | — | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812135212 | `20260812135212_0bb0dddc-9f8c-47f9-b67b-8d88e6f469b1.sql` | `04a0a18cdb4a9f8c…` | CONFLITANTE | 4/6 | funcs: rpc_cockpit_criar_visita_v1, rpc_cockpit_finalizar_os_v1 | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812135306 | `20260812135306_435efc40-c569-4264-a950-274f97d7fbad.sql` | `6ab635aa2d075ff9…` | CONFLITANTE | 7/7 | — | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812135402 | `20260812135402_01cf0d55-1fc6-475b-9874-0b0858b00204.sql` | `23be7cecfb82e6dc…` | CONFLITANTE | 5/5 | — | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812135450 | `20260812135450_0d475ca3-9f1d-49e6-8b87-e9be40fd755b.sql` | `953f7688fae87790…` | CONFLITANTE | 4/6 | funcs: rpc_financeiro_conciliar_v1; views: vw_financial_settings_flat | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812135542 | `20260812135542_c1b2e104-40f1-48a4-8f85-bfb15802d199.sql` | `c6331cffa1641467…` | CONFLITANTE | 2/4 | alters: evidencias; funcs: rpc_financeiro_conciliar_v1 | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260812135640 | `20260812135640_16cf8527-ff57-4693-866c-b9cdba21c7dc.sql` | `9d2585c7e67b09f3…` | CONFLITANTE | 6/7 | policies: Authenticated access | QUARENTENA_PERMANENTE | Alto — objetos incompatíveis/ausentes |
| 20260824000000 | `20260824000000_matriz_fiscal_mestre_v1_microrganismos.sql` | `c1d21afd3336e4e2…` | REFLETIDA | 7/7 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260825000000 | `20260825000000_b3_conditional_block_ledger_acl.sql` | `22e03297148c6daf…` | REFLETIDA | 3/3 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260827000000 | `20260827000000_envase_acao_canonica.sql` | `224391e7987745bf…` | REFLETIDA | 1/1 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260828000000 | `20260828000000_os_e2e_entrega_lote_finalizacao.sql` | `e13294bcd30cd1b0…` | REFLETIDA | 7/8 | idx: ux_lotes_programacao_id | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260830000000 | `20260830000000_os_esteira_acl_hardening.sql` | `0c6c6eb6fe342141…` | REFLETIDA | sem DDL (ACL/patch de corpo) | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260831000000 | `20260831000000_os_e2e_fase5_idempotencia.sql` | `ceb79020bb4d3570…` | SUPERSEDED | 2/2 | — | BLOQUEADA_PERMANENTE_SUPERSEDED | Médio — replay regrediria o contrato vigente |
| 20260831010000 | `20260831010000_cq_desempate_determinismo.sql` | `2d0bef3b71a125bb…` | REFLETIDA | sem DDL (ACL/patch de corpo) | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260831020000 | `20260831020000_envase_cq_trigger_determinismo.sql` | `483b3caddc2f6702…` | SUPERSEDED | 1/1 | — | BLOQUEADA_PERMANENTE_SUPERSEDED | Médio — replay regrediria o contrato vigente |
| 20260831030000 | `20260831030000_finalizar_os_replay_idempotente.sql` | `b3b0b41e12626c05…` | REFLETIDA | sem DDL (ACL/patch de corpo) | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260901000000 | `20260901000000_cq_ordem_canonica.sql` | `828d4ef443df1eff…` | REFLETIDA | 4/4 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260902000000 | `20260902000000_os_guard_marker_canonico.sql` | `2c0e0d07090f5c1f…` | REFLETIDA | 1/1 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260903000000 | `20260903000000_comprovante_entrega_documento_v1.sql` | `feecd8ca45b7dfad…` | REFLETIDA | 2/2 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260903010000 | `20260903010000_comprovante_cepas_fix.sql` | `33df696f94d46970…` | REFLETIDA | 1/1 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260903020000 | `20260903020000_comprovante_tipo_canonico.sql` | `8d02886b686ec4b5…` | REFLETIDA | 1/1 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260903030000 | `20260903030000_comprovante_os_volume_v1.sql` | `f5e2d5590584f3f8…` | REFLETIDA | 2/2 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260903040000 | `20260903040000_comprovante_origem_pedido_v1.sql` | `e81b973b5e9bee6b…` | REFLETIDA | 1/1 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260905000000 | `20260905000000_hardening_digest_schema_v1.sql` | `56f9c1fafe69ad81…` | REFLETIDA | 14/14 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260908000000 | `20260908000000_h3_base_tecnica_catalogo_v1.sql` | `d91dac2cf890b0b8…` | REFLETIDA | 5/5 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260909000000 | `20260909000000_h3b_preco_canonico_fichas_v1.sql` | `b701c53b12752f13…` | REFLETIDA | 7/7 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260910000000 | `20260910000000_h4b_credit_approval_failclosed.sql` | `2655ff28d06f1a3c…` | REFLETIDA | 4/4 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260911000000 | `20260911000000_h5_reserva_atomica_idempotente.sql` | `d94e8be91b8efb81…` | REFLETIDA | 2/2 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260912000000 | `20260912000000_h5b_ctx_reserva_forcado.sql` | `f47119a15373553d…` | REFLETIDA | 2/2 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260913000000 | `20260913000000_h5b_concorrencia_cq_imutavel.sql` | `a09d6bad33aadb43…` | REFLETIDA | 4/4 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260914000000 | `20260914000000_h5c_cq_autoria_servidor.sql` | `7e6576897ec8d40a…` | REFLETIDA | 2/2 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260914010000 | `20260914010000_h5c_envase_material_imutavel.sql` | `c178dd48f78d648b…` | REFLETIDA | 2/2 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260916000000 | `20260916000000_h6b_financeiro_idempotencia_valor_canonico.sql` | `e99d175b1b2ee8c6…` | REFLETIDA | 13/13 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260917000000 | `20260917000000_h6c_financeiro_snapshot_b2b_credito.sql` | `45b7829e7850ba4d…` | REFLETIDA | 6/6 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260917010000 | `20260917010000_h6c_backfill_payment_terms_link.sql` | `051903ff512ed927…` | REFLETIDA | 2/2 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260918000000 | `20260918000000_h6c2_guard_integral_canonico.sql` | `8b9da17d459e5b49…` | REFLETIDA | 1/1 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260919000000 | `20260919000000_h7_fiscal_hardening_v1.sql` | `c14e984469acdba7…` | REFLETIDA | 12/12 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260919010000 | `20260919010000_h7_fiscal_preflight_marker_v1.sql` | `00c927242e751207…` | SUPERSEDED | 6/6 | — | BLOQUEADA_PERMANENTE_SUPERSEDED | Médio — replay regrediria o contrato vigente |
| 20260920000000 | `20260920000000_h7b_fiscal_idempotencia_ambiente_v1.sql` | `389ddf10a8c08fe2…` | REFLETIDA | 4/4 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260920010000 | `20260920010000_h7b_gate_xml_record_e_marcador_v1.sql` | `cfe498f480d00e50…` | REFLETIDA | 1/1 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260921000000 | `20260921000000_h6d_financeiro_delete_guard_snapshot_v1.sql` | `97888924570e2658…` | REFLETIDA | 12/13 | policies: %I | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260922000000 | `20260922000000_h6e_financeiro_trigger_acl_v1.sql` | `d31a41f0e505041c…` | REFLETIDA | sem DDL (ACL/patch de corpo) | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260926000000 | `20260926000000_h7g_transporte_evento_sefaz_v1.sql` | `5d83f2171dcdf8d9…` | REFLETIDA | 21/21 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260927000000 | `20260927000000_h7h_matriz_status_guard_v1.sql` | `cb13de81f3c6ef99…` | REFLETIDA | 1/1 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260928000000 | `20260928000000_h6c_fin_helpers_acl_v1.sql` | `3bd3dd8520e08936…` | REFLETIDA | sem DDL (ACL/patch de corpo) | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |
| 20260929000000 | `20260929000000_h7a_certificate_ref_guard_v1.sql` | `f27679318f387bfd…` | REFLETIDA | 4/4 | — | BLOQUEADA_PERMANENTE_REFLETIDA | Baixo — replay redundante |

### 3.1 Leitura das classificações

- **REFLETIDA (36)** — a intenção já existe no estado atual, eventualmente sob nome/implementação posterior. Casos com lacuna aparente foram resolvidos nominalmente:
  - `20260828000000` — `ux_lotes_programacao_id` não existe com esse nome, mas o catálogo tem `idx_lotes_programacao_id_unique` = `CREATE UNIQUE INDEX ... ON public.lotes (programacao_id) WHERE programacao_id IS NOT NULL`, **equivalente lógico exato**.
  - `20260921000000` — a “policy `%I`” é artefato do parser sobre `EXECUTE format(...)`; as policies reais existem (7 policies `*_select_financial` no catálogo).
  - `20260830000000`, `20260831010000`, `20260831030000`, `20260922000000`, `20260928000000` — sem DDL de objeto (ACL/patch de corpo). Evidência direta no catálogo: `vw_os_integridade_esteira` sem qualquer privilégio para `anon` (`authenticated=r`, `service_role=r`); `rpc_validar_integridade_esteira` e `rpc_cockpit_metricas_v1/v2` com `pg_temp` no `search_path`; as 5 trigger functions H6/H6d e os 3 helpers financeiros H6c com ACL restrita a `postgres`/`service_role`, sem PUBLIC/anon/authenticated; `rpc_avancar_esteira_laboratorio` trata `finalizar_os` e **não** depende mais de `ctid` (o desempate por `ctid` foi substituído por ordenação determinística no hardening E2E posterior — intenção preservada, implementação superior já vigente).
- **SUPERSEDED (3)** — `20260831000000`, `20260831020000`, `20260919010000`: objetos presentes, porém com definição posterior vigente (H7/H7N/H7O). Replay reintroduziria contrato antigo.
- **CONFLITANTE (20)** — todas com prefixo `20260812`, oriundas de backend estranho (Cloud sandbox). Sinais objetivos de origem divergente: nomes de policy inexistentes na homologação (`Admins can manage fiscal settings`, `Public read for system config`, `Authenticated access`), tabelas com contrato diferente (`evidencias`, `portal_notifications`, `produto_anexos`, `esteira_producao_v2`, `cliente_campos_extras`), funções/views ausentes (`rpc_generate_idempotency_key` do sandbox, `vw_schema_health`, `vw_financial_settings_flat`, `rpc_cockpit_criar_visita_v1`/`rpc_cockpit_finalizar_os_v1` em versão stub). Quarentena permanente.

## 4. As 4 migrations `destructive`

| Version | Operação destrutiva declarada | Estado atual comprovado no catálogo | Motivo do bloqueio permanente |
|---|---|---|---|
| `20260825000000` | `REVOKE ALL` em `rpc_regulatory_ncm_candidate_decide` e em `fiscal_matrix_load_ledger` (PUBLIC/anon) | `rpc_regulatory_ncm_candidate_decide` = `postgres=X, authenticated=X, service_role=X` (sem PUBLIC/anon); `fiscal_matrix_load_ledger` = `authenticated=rm`, `service_role=arwdDxtm` | Efeito já vigente; replay é redundante e o revoke em lote poderia derrubar grants concedidos por migrations posteriores. |
| `20260916000000` | `DROP TRIGGER trg_h6b_reconciliacao_valor_faturavel` + `DELETE FROM accounts_receivable_installments` (linhas derivadas) | Trigger presente e tabela presente, já no contrato H6b/H7 | Replay apagaria parcelas financeiras derivadas hoje válidas e recriaria trigger em versão antiga. Bloqueio permanente. |
| `20260917000000` | `DROP TRIGGER trg_h6c_entrega_ar_b2b_link` + `DELETE FROM accounts_receivable_installments` | Trigger presente; snapshot B2B/crédito vigente | Mesmo risco: perda de dados financeiros derivados e regressão do vínculo B2B. Bloqueio permanente. |
| `20260927000000` | `REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER` em `fiscal_tax_rules` para `authenticated`; `REVOKE ALL` para `anon` | `fiscal_tax_rules` = `authenticated=arwm` (sem `d`/`D`), `anon` ausente | Efeito já vigente; replay redundante sobre superfície fiscal sensível. |

Nenhuma das quatro é aplicável: em duas o efeito de ACL já está no catálogo e em duas o replay destruiria dados derivados atuais.

## 5. Prova de ausência no ledger

- Consulta read-only ao ledger da homologação com as 59 versões: **retorno vazio** (`H7P REPO-ONLY GATE: ledger verificado — nenhuma das 59 versões aplicada`).
- `select count(*) from supabase_migrations.schema_migrations` = **658** antes e depois da fase.
- Nenhuma migration criada nesta fase.

## 6. Integridade dos SQL das 59 (entrada × saída)

- Hash SHA-256 recalculado no início: **59/59 OK, 0 DRIFT**.
- Hash SHA-256 recalculado ao final, após todas as edições documentais: **59/59 OK, 0 DRIFT**.
- Nenhum dos 59 arquivos foi editado, movido, renomeado ou excluído.

## 7. Guard e testes

- `restoration/homologacao-h7/h7p-guard-repo-only.sh` fortalecido: além de hash/arquivo/ledger, agora falha se qualquer entry perder `decision`, `replay_prohibited`, `reviewed_at`, `reviewed_commit` ou `evidence_refs`; se `apply_to_staging` virar `true`; se `ledger_versoes` sair de 658; se o total sair de 59; ou se a distribuição sair de 36/3/20.
- `src/test/security/h7p-repo-only-migrations.static.test.ts`: +2 casos (decisão/evidência obrigatórias por entry; distribuição 36/3/20). Total 9/9 PASS.
- Manifesto passa a registrar, por entry: `decision`, `evidence_refs` (objetos casados/verificados, ausentes, fingerprint, fonte), `reviewed_at`, `reviewed_commit`, `reviewed_phase`, `replay_prohibited=true`, e no bloco `h8c` a regra permanente: **qualquer necessidade futura exige NOVA migration com versão posterior a `20261002000000`**.

## 8. Invariantes e advisors

Fase sem DDL: métricas devem permanecer estáveis em relação à H8-B — ledger 658, policies public 540, Advisor performance 512 (147 WARN + 365 INFO) e segurança 393 (383 WARN + 10 INFO + 0 ERROR), 648 SECURITY DEFINER, 0 sem `search_path`, 2 anon, 378 authenticated, 24 views / 23 `security_invoker`, 6 cron, fiscal `HOMOLOGATION / tpAmb=2 / production_enabled=false / DRAFT / NOT_READY`. Resultados medidos ao final da fase (consulta read-only, 2026-09-04):

| Verificação | Resultado |
|---|---|
| Binding | `H7d BINDING GATE: OK — staging ikaauvsflpmamgxmkhoq` (`.env`, `client.ts`, `config.toml`, `types.ts`) — restaurado do baseline `6c08a8f8` duas vezes durante a fase por drift do ambiente |
| Ledger | **658** (inalterado) |
| Repo-only guard | PASS — 59 íntegras, 0 no ledger |
| Postcheck H7O | **PASS** (todas as linhas) |
| Postcheck H7N | FAIL esperado e pré-existente desde H7O (allowlist 504→485 e wrappers privados 4→6) — postcheck vigente é o H7O |
| Harness H7O por perfis | **300/300 PASS** (ROLLBACK) |
| Harness H7N por perfis | **136/136 PASS** (ROLLBACK) |
| Typecheck | 0 erro |
| Build | OK (`build OK` no log de build) |
| Vitest completo | **3.339 PASS / 0 FAIL / 4 skip** (212 arquivos; +2 casos H8-C) |
| Scan de segredos | Nenhum segredo real; apenas fixtures de teste |
| Policies em `public` | **540** (inalterado) |
| `SECURITY DEFINER` | **648**, `0` sem `search_path`, **378** executáveis por `authenticated`, **2** por `anon` (por design) |
| Views | **24**, sendo **23** `security_invoker` + 1 interna sem grants |
| Tabelas com RLS e sem policy | **7** (fail-closed, inalterado) |
| Extensões em `public` | **2** (`btree_gist`, `pg_net`) — decisão H7O: não mover |
| Cron jobs | **6** |
| Fiscal | `HOMOLOGATION\|2\|false\|false\|false\|DRAFT\|NOT_READY` |
| Hash das 59 (entrada × saída) | 0 DRIFT nas duas medições |

Como a fase não executou DDL, todas as categorias do Advisor permanecem nos valores oficiais
da H8-B: performance **512** (0 ERROR / 147 WARN / 365 INFO) e segurança **393** (0 ERROR /
383 WARN / 10 INFO). Os contadores de catálogo acima reproduzem exatamente as bases dessas
categorias (378 `authenticated_security_definer_function_executable`, 2 `anon_...`,
2 `extension_in_public`), confirmando ausência de novo ERROR/WARN causado pela H8-C.

## 9. Arquivos alterados

- `restoration/homologacao-h8/03-h8c-ledger-reconciliation.md` (novo)
- `restoration/homologacao-h8/00-h8-abertura-diagnostico.md`
- `restoration/homologacao-h7/h7p-repo-only-manifest.json` (somente campos de decisão/evidência; 59 hashes preservados)
- `restoration/homologacao-h7/h7p-guard-repo-only.sh`
- `src/test/security/h7p-repo-only-migrations.static.test.ts`
- `roadmap.md`
- Binding restaurado ao baseline autorizado: `.env`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`

## 10. Pendências e riscos

- Bloqueios externos B1 (leaked-password protection), B3 (cadastro fiscal real) e B4 permanecem abertos — fora do escopo H8-C.
- Os 43 grupos locais / 117 finding-groups de `multiple_permissive_policies` **não** pertencem à H8-C; foram movidos para backlog de performance/RLS futuro.
- As 20 migrations de backend estranho permanecem fisicamente no repositório em quarentena; sua remoção só deve ocorrer sob autorização humana explícita.

## 11. Decisão

**GO H8-D (observabilidade e runbook) em homologação.**
**NO-GO produção** — `navfzbwgwzruipouyfnk` permanece proibida e intocada.
Critério atendido: 59/59 com evidência objetiva, hashes intactos, 0 no ledger, ledger 658, distribuição 36/3/20 coerente e nenhuma classificação INCONCLUSIVA.
