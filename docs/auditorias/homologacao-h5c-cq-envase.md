# H5c — Autoria de CQ no servidor e fechamento do bypass de envase

**Ambiente:** staging `ikaauvsflpmamgxmkhoq` (exclusivo). Produção `navfzbwgwzruipouyfnk` não foi tocada.
**Migrations:** `20260914000000_h5c_cq_autoria_servidor.sql`, `20260914010000_h5c_envase_material_imutavel.sql`
**Kit:** `restoration/homologacao-h5/38..43`

## Correções

| ID | Descrição | Correção |
|----|-----------|----------|
| H5-003 | `responsavel_id` do CQ vinha do cliente e podia ser forjado | Gatilho `fn_cq_autoria_servidor` resolve o perfil de `auth.uid()` (FK é `profiles(id)`, não `profiles(user_id)`), impõe autoria no INSERT, rejeita valor divergente e torna `responsavel_id`/`created_at`/`seq`/`lote_id` imutáveis |
| H5-002 (item 7) | `fn_validate_envase_volume` só roda em INSERT; políticas de UPDATE permitiam aumentar quantidade/volume ou trocar o lote sem revalidar saldo | Gatilho `fn_envase_material_imutavel` (BEFORE UPDATE OR DELETE) fail-closed: lote/quantidade/volume_por_unidade imutáveis e DELETE bloqueado; correção exige novo registro/estorno |
| H5-001 / H5-B01..B03 | Já corrigidos em H5/H5b | Reverificados sem regressão |
| H5-004 | Validação pública de comprovante/rastreio | `rpc_validar_comprovante_entrega` e `rpc_validar_rastreio_produto` permanecem com EXECUTE para `anon` e `search_path` fixado (exceção pública mantida deliberadamente) |

Bypass de manutenção (`app.cq_purge_fixture`, `app.estoque_purge_fixture`) fechado para `anon`/`authenticated`; `anon` sem EXECUTE nas novas funções.

## Evidências

- `restoration/homologacao-h5/40-h5c-cq-postcheck.sql` → **13 PASS / 0 FAIL** (`PASS_H5C_POSTCHECK`), transacional com ROLLBACK: autoria imposta pelo servidor, autoria forjada rejeitada, resultado e autoria imutáveis, DELETE bloqueado, reanálise append-only e gate pela última análise.
- `restoration/homologacao-h5/43-h5c-envase-postcheck.sql` → **8 PASS / 0 FAIL** (`PASS_H5C_ENVASE_POSTCHECK`): UPDATE de quantidade/volume e DELETE bloqueados, UPDATE não material e envase dentro do saldo continuam funcionando.
- Regressão concorrente real `restoration/homologacao-h5/35-h5b-concorrencia.mjs` → **19/19 PASS** (`PASS_H5B_CONCORRENCIA`).
- Postchecks anteriores reexecutados: `37` → **7/7 PASS**, `32` → **12/12 PASS**.
- Rollbacks: `39-rollback-h5c-cq-autoria.sql`, `42-rollback-h5c-envase-imutavel.sql`.

## Gate

**H5c — APROVADA.** H6 não iniciada.
