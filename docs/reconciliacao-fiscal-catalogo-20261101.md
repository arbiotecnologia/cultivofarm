# Reconciliação fiscal/catálogo — 01/11/2026 (NO_GO)

Cópia isolada apenas. Nenhum SQL/API hosted, deploy, publicação, emissão fiscal, cobrança, automação, grant ou gate executado.
Classes de evidência: **PG_DISPOSABLE** (PostgreSQL 17.11 local descartável), **PG_SEAM_STUB_PIN** (stub sintético com pin local),
**STATIC** (texto/hash), **CAPTURE_READ_ONLY** (dados recebidos do proprietário), **HOSTED/JWT real: NÃO EXECUTADO**.

## 1. Fontes e hashes
- Anexo original 80c64c38 materializado em `docs/auditorias/evidencias/reconciliacao-fiscal-catalogo-20261101/original-80c64c38/` (SHA256SUMS).
- Fundação rbac-audit: 12/12 arquivos do manifesto com sha256 iguais; fase 07 separada e não aplicável.
- Captura de pins da fundação (complemento 14:19 UTC): `foundation-live-pins-20261101/live_foundation_pins.json`. Os 3 corpos capturados reproduzem o próprio md5 (STATIC) e, recriados no PG local, reproduzem o md5 live (F-01, PG_DISPOSABLE).

## 2. Comparação dos 17 pins da fundação
| Arquivo | Função | Original | Live | Resultado |
|---|---|---|---|---|
| 05 | platform_wipe_global_product_catalog | 05bfc175… | igual | inalterado |
| 06 | fn_fiscal_scenario_coverage | 962230c7… | igual | inalterado |
| 06 | rpc_fiscal_nfe_readiness_v1 | 75487176… | igual | inalterado |
| 06 | rpc_microorganism_regulatory_overview | a5763623… | igual | inalterado |
| **09** | **rpc_cc_validate_matrix** | **e3b94ad4…** | **21ab73c3…** | **DIVERGENTE → 09r** |
| 10 | partner_apply_default_discount | c33a6674… | igual | inalterado |
| 10 | rpc_commercial_simulator | 4e324b17… | igual | inalterado |
| 10 | fn_resolve_commercial_price | 0df0d900… | igual | inalterado |
| 10 | fn_b2b_resolve_base_unit_price | 60651fe8… | igual | inalterado |
| 10 | fn_resolve_b2b_cart | c8b45844… | igual | inalterado |
| 10 | b2b_save_technical_simulation | daad3c15… | igual | inalterado |
| 10 | rpc_associate_microorganism_fiscal_product | da0d6797… | igual | inalterado |
| 10 | rpc_regulatory_dossier_ensure_draft | 56076bcc… | igual | inalterado |
| **10** | **rpc_fiscal_draft_save** | **5e364c8f…** | **224ab794…** | **DIVERGENTE → 10r** |
| 11 | rpc_regulatory_presentation_upsert | 74f45dd6… | igual | inalterado |
| 12 | rpc_upsert_recomendacao_visita | 42f87a90… | igual | inalterado |
| **13** | **catalog_tenant_set_visibility_core** | **806751ac…** | **c890b49c…** | **DIVERGENTE → 13r** |

Tabela completa com hashes integrais: `scripts/fiscal-tenant-catalog-reconciled-20261101/foundation-delta/foundation-pins.json`.
Os 14 iguais só provam aquele pin; a fundação completa (tabelas, policies, triggers, ACL fora destes 17) continua sem prova.

## 3. Achado crítico: os candidatos originais regrediriam o endurecimento atual
Diff candidato original × definição live (STATIC, reproduzido em PG):
- **09**: o original não tem `c2p1_assignment_allowed` (C2P1_FORBIDDEN) nem `c2p1_item_allowed` nas três consultas. Aplicá-lo removeria o isolamento C2-P1.
- **10 / rpc_fiscal_draft_save**: o original perde a reautorização após `FOR UPDATE` (h15 staff/invoice/role), volta a `draft_version <> expected` com SQLSTATE 40001 (NULL passaria), e o `UPDATE` perde `company_settings_id`/`h15_company_access`/`draft_version` + `IF NOT FOUND`.
- **13**: o original troca PT409 por 40001 nos conflitos de versão.

Portanto "trocar só o hash esperado" seria uma regressão. Contraprova CF-09: aplicar o corpo original com o pós-guard aborta (`ownership09r_post_hardening_lost`) e o rollback mantém o md5 live.

## 4. Reconciliação 09r/10r/13r (delta mínimo)
Gerador: `foundation-delta/build.py`. Corpo = definição live capturada + somente o filtro de propriedade global:
- 09r: `p.owner_organization_id IS NULL` e `m.owner_organization_id IS NULL` nas duas listas de itens faltantes.
- 10r: `pr.owner_organization_id IS NULL` na verificação de `source_item_id` (somente a seção desta função; as outras 8 funções do 10 ficam byte a byte iguais).
- 13r: `owner_organization_id IS NULL` nas três buscas de item.

Cada âncora precisa ocorrer exatamente uma vez, senão o gerador aborta. O pin anterior ao replace é o md5 live; depois do `CREATE OR REPLACE`, um bloco `DO $post$` confere se todos os trechos de endurecimento atuais (C2P1, h15, CAS/PT409, advisory locks, ledger, ator) **e** o novo filtro estão presentes. Fontes originais e RED ficam intactos em `scripts/rbac-audit/`.
md5 pós-replace no PG 17.11 local (informativo, varia conforme a versão): 09 `0a1ee9a8…`, 10 `1d3530fc…`, 13 `c140bebc…`.

## 5. PRE GLOBAL (`00-pre-global-foundation.sql.review`)
O runbook antigo roda 12 arquivos em sequência, cada um com seu próprio COMMIT, e 09/10/13 só abortariam depois de 01–08 já gravados. O PRE novo:
- roda em `BEGIN TRANSACTION READ ONLY`, então não consegue gravar nada (F-04);
- confere os 17 pins (inexistência ou drift), recusa estado parcial (`catalog_ownership_enabled()` presente ou `owner_organization_id` em produtos/microrganismos/culturas), confere dependências (c2p1 helpers, catalog_tenant_actor, h15_company_access, 8 tabelas);
- devolve num único erro todos os itens que falharam.
Fica o requisito para uma aplicação futura (ainda NO_GO): rodar o PRE antes do 01 e parar no primeiro erro. O ideal é que o pacote inteiro rode numa transação única, com os BEGIN/COMMIT internos removidos por um orquestrador revisado. Esse orquestrador **não** foi gerado.

## 6. Resultados
| Rodada | Resultado | Classe |
|---|---|---|
| foundation-delta-final (PRE + 09r/10r/13r) | 33 PASS / 0 FAIL | PG_DISPOSABLE (+ F-02/F-05/F-08 PG_SEAM_STUB_PIN) |
| fiscal reconciliado pg-final | 88 PASS / 3 FAIL (3 RED esperados do pacote original: PRE por contagem, ACL default real e positivo a10) | PG_DISPOSABLE |
| TS parser recibos | RED 22/9 → GREEN 31/0 | Vitest |
| B2B PostgreSQL (origem/parcial/servidor) | 134 PASS / 0 FAIL | PG_DISPOSABLE |
| Vitest financeiro/pedidos/comercial/homolog/fiscal (maxWorkers=2) | 3374 PASS / 2 FAIL | Vitest |

Destaques do foundation-delta: F-05 detecta drift silencioso (mesma quantidade de funções); F-06/F-07 mostram que um drift no 13 aborta antes de qualquer DDL, sem `owner_organization_id`; RED-09/10/13 confirmam que os guards originais abortam contra o live; B09 lista só itens globais e mantém C2P1; B13 nega item próprio, aceita replay e mantém PT409; B10 nega origem própria, mantém PT409 para versão velha ou NULL, aplica h15 entre tenants e faz o CAS correto.

As 2 falhas do Vitest (`h7i.ingestaoCertificado.static`, `h7j.deleteGuard.static`) exigem que o cliente aponte para o ref de produção. Esta cópia aponta de propósito só para a homolog `vrlcdwmlytukrjezrrnf` (preparação isolada anterior). A divergência é conhecida, não foi causada por esta rodada, e os asserts foram mantidos.

Typecheck/build manual não foram executados: o harness do ambiente cuida disso.

## 7. O que depende de ação externa (NO_GO)
1. Recapturar READ ONLY, no momento da aplicação, os 17 pins e os pins de policies/ACL/triggers da fundação completa, porque os 14 iguais não provam o resto.
2. Revisão do proprietário de 09r/10r/13r e do PRE; gerar e revisar o orquestrador de transação única.
3. Prova real com JWT/RLS por A/B/gestor/SA depois de uma instalação autorizada (não executada).
4. Atestação fiscal real e INSERT de origens reais continuam ausentes, então emissão e título real seguem fechados.

## 8. Comandos
```
python3 scripts/fiscal-tenant-catalog-reconciled-20261101/foundation-delta/build.py
python3 scripts/fiscal-tenant-catalog-reconciled-20261101/foundation-delta/harness.py docs/auditorias/evidencias/reconciliacao-fiscal-catalogo-20261101/runs/foundation-delta-final
```
Hashes dos artefatos: `foundation-delta/SHA256SUMS`.
