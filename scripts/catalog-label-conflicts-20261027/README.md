# catalog-label-conflicts-20261027 — INATIVO (review only)

Alvos LIVE (captura read-only 2026-10-27 16:20 UTC, ref `swzpzcwiasxmjutrmvkm`):

| função | OID | LIVE md5 | candidato md5 |
|---|---|---|---|
| `platform_update_catalog_label(uuid,timestamptz,text,text,uuid)` | 120766 | `75eaa1d0307e9033a6f3ba8e208ee488` | `fdf3adc335996bc4ff90f7a57b8f4370` |
| `platform_set_catalog_label_active(uuid,timestamptz,boolean,text,uuid)` | ver `live-functions.json` | `561d3175812dba477a538992d5d02a01` | `55493f9699ec039057915656355e35ae` |

ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`, owner postgres, SECURITY DEFINER, `search_path=""` — inalterados.

## Delta (`delta-sql.diff`)
Em cada corpo, só dois RAISE mudam `40001 → PT409`: `catalog_label_conflict` (CAS `updated_at` stale) e `catalog_label_confirmation_failed`
(pós-condição do UPDATE). Nada muda em locks, autorização, RLS, ACL, dados ou auditoria.

## Dependência residual
`platform_private.catalog_entity_replay` (md5 `bc194d354de83bb0a362bddd0ceb66e6`) segue `40001 catalog_entity_conflict` para chave reutilizada
com outro pedido. Não alterado (helper compartilhado). O cliente trata 40001 e PT409 com a mesma mensagem de conflito.

## Arquivos
- `live-functions.json` / `live-extra.json`: fontes LIVE e pinos de dependências/tabelas (fingerprints de triggers/policies).
- `preflight-readonly.sql` / `postflight-readonly.sql`: guardas compactas (md5 + OID/ACL/owner/config/definer, sem repetir corpos). Não executados pelo agente.
- `candidate.sql.review`: transação com preflight → CREATE OR REPLACE → postflight. `rollback-conditioned.sql.review`: só candidato exato → LIVE exato.
- `test-local.py` / `results-local.json`: PostgreSQL descartável, 52 checks.
- `delta-frontend.diff`: `labelError` mapeia PT409 para conflito + teste.
- `LOCK-REVOCATION-REVIEW.md`: achado separado de revogação durante a espera.

## Evidência
- PG local (Auth SINTÉTICA, schema reduzido, corpos/helpers LIVE exatos): stale, no-op 22023, replay idempotente sem nova auditoria, chave reutilizada → 40001 residual,
  duas conexões (espera de lock observada; 1 vence, 1 conflito), rollback de pós-condição por trigger injetado localmente, negação admin tenant A/B (42501), anon sem EXECUTE, rollback reinstalável — LIVE (40001) e candidato (PT409).
- Frontend: sem retry automático após conflito (uma única chamada); revisão antiga enviada intacta; botão “Atualizar dados” manual; chaves de idempotência derivadas de `updated_at`.
- NÃO há homologação real JWT/RLS. Aplicação/publicação ficam com o auditor.
