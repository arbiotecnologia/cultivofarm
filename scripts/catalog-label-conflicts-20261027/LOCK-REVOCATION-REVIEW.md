# Revogação antes/depois do lock — rótulos do catálogo

## Achado (corpos LIVE `75eaa1d0…` / `561d3175…`)
Ordem LIVE: `catalog_metadata_require_actor()` → `catalog_entity_replay` (advisory xact lock) → `SELECT … FOR UPDATE` → UPDATE → auditoria.
Autoridade avaliada uma única vez, antes das esperas; sem gate `cf_user_guards_v1.state`, sem revalidação pós-lock, sem `lock_timeout` próprio.
Reproduzido localmente (`revocation-gate/results-gate-local.json`, checks "LIVE … VULNERÁVEL"): revogação de superadmin ou desativação de perfil
commitada enquanto a chamada aguarda lock de linha ou advisory lock NÃO impede a gravação.

No lote PT409 original o limite foi um recorte técnico do escopo (só os RAISE de conflito), não falta de autorização. A correção está agora em
`revocation-gate/` como candidato adicional, INATIVO, que substitui o PT409 isolado.

## Writers de revogação (inventário LIVE read-only)
Entradas de autoridade de `catalog_metadata_require_actor`: `user_roles` (has_role/is_platform_superadmin), `profiles` (ativo/senha_provisoria),
`platform_org_admin_invites` (processing/access_valid_after), JWT iat/exp da sessão. Todos os writers dessas tabelas passam por triggers de statement:
`a00_cf_user_gate` (`acquire_gate`, UPDATE na linha do gate) em `user_roles`/`profiles` e `a00_cf_invitation_gate` (`acquire_invitation_gate`, FOR UPDATE NOWAIT).
Portanto a revogação PLATAFORMA coopera com o gate; nenhuma dependência adicional foi necessária e nenhum helper compartilhado foi alterado.

## Candidato (`revocation-gate/`)
gate FOR UPDATE → require_actor fresco → advisory da mesma chave do replay (reentrante) → require_actor fresco → replay → linha FOR UPDATE →
require_actor fresco → CAS/UPDATE/auditoria. `SET lock_timeout TO '3s'` na função. Cada revalidação é um statement novo da função VOLATILE
(snapshot novo em READ COMMITTED); o helper STABLE é avaliado nesse snapshot, sem reaproveitar resultado anterior.

## Semântica provada (sintético) e limites
- Revogação commitada antes do gate → 42501, sem escrita.
- Revogação iniciada enquanto a operação já detém o gate (inclusive aguardando advisory ou linha): a revogação fica BLOQUEADA atrás da operação
  (pg_blocking_pids) e só commita depois; a operação conclui com a autoridade vigente no gate. A revogação NÃO "vence" nesse caso; a chamada seguinte é 42501.
  Logo, "revogação commitada durante a espera de advisory/linha" deixa de ser possível para writers que passam pelos triggers.
- Riscos residuais: (1) gate global serializa rótulos com todos os writers de usuários/papéis/vínculos pela duração curta da transação;
  (2) writers de convite usam NOWAIT e falham 55P03 imediatamente se coincidirem com uma operação de rótulo; (3) espera > 3s → 55P03 sem escrita
  (UI mostra "ocupado", sem retry automático); (4) writer com bypass de triggers (superusuário com `session_replication_role=replica`, ALTER TABLE DISABLE TRIGGER)
  não coopera — fora do modelo; (5) expiração de JWT só é verificada contra `statement_timestamp`; (6) `catalog_entity_replay` segue 40001.
- Testes usam Auth sintética e schema reduzido; nenhuma homologação real de JWT/RLS ou de espera em produção foi feita pelo agente.

## Status
Implantado pelo auditor em 2026-10-27 (`catalog_labels_revocation_gate_pt409_20261027`). Revogação real de Superadmin durante espera ainda NÃO homologada (pendente login IAB14).
