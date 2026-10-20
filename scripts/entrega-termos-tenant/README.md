# entrega_termos — isolamento por empresa (REST/RPC) — candidata NÃO aplicada

Projeto obrigatório: `swzpzcwiasxmjutrmvkm` (PG 17.6). Nada aqui está em `supabase/migrations/`; nada foi aplicado.
Leitura somente leitura em 19/10/2026 23:45 UTC.

## Defeitos confirmados (LIVE)
1. `entrega_termos_select` libera staff de entrega/financeiro **sem comparar empresa** (helpers só checam uid/papel).
2. `rpc_entrega_gerar/assinar/cancelar_termo_v1` (SECURITY DEFINER) não validam a empresa da entrega/cliente.
3. `rpc_entrega_registrar_pdf_termo_v1` tem **EXECUTE para authenticated** (deveria ser service-only): qualquer
   usuário autenticado podia registrar `pdf_path/pdf_hash` arbitrário em termo assinado de qualquer empresa.
4. `fn_entrega_build_snapshot_v1` / `fn_entrega_cobertura_v1` (DEFINER, sem tenant) também chamáveis por authenticated
   → snapshot de entrega de outra empresa por chamada direta.
5. `authenticated` tem `TRUNCATE, REFERENCES, TRIGGER, MAINTAIN` em `entrega_termos` (TRUNCATE ignora RLS).

Produção tem **0 termos** e 0 entregas com `organization_id` nulo (leitura de contagem, sem conteúdo).

## Baseline atualizado (20/10/2026 00:46 UTC)
Produção já recebeu `termo_pdf_registration_acl_containment` (23:52 UTC): EXECUTE do registrar só postgres/service_role e
`authenticated=arwdxtm` na tabela (sem TRUNCATE). Conferido read-only: corpos/md5 e policy inalterados. Preflight agora
**exige** esse estado contido (o estado antigo falha fechado) e o rollback **não regrava** EXECUTE do registrar nem TRUNCATE;
reabre apenas o restante da baseline (snapshot/cobertura e REFERENCES/TRIGGER/MAINTAIN). Testes locais 64/64.

## Correção da revisão 5ed365 (20/10 00:49 UTC)
A policy restritiva antiga fazia `EXISTS entregas` sob a RLS do usuário: `operador_onfarm` (staff de entrega, sem SELECT LIVE em
`entregas`) perdia leitura legítima, e só a empresa da entrega era comparada. Agora a policy usa o MESMO predicado privado das
RPCs, `platform_private.entrega_termo_tenant_ok(entrega_id)` (DEFINER, `search_path ''`, ator h15 = entrega = cliente).
EXECUTE: postgres + authenticated (necessário para avaliar a policy); anon/PUBLIC/service_role sem. Retorna só boolean do próprio
escopo: outra empresa, incoerência ou ID inexistente = false (sem oráculo). Pre/postflight conferem USAGE do schema, ACL e
texto exato do predicado. Harness agora reproduz as 5 policies LIVE de `entregas`; inclui operador, leitura de entrega A/cliente B
e RPC. 71/71 locais (sintético, não JWT real).

## Mudança mínima (`candidate.sql.review`)
- Preflight estrito embutido (falha fechado): md5 LIVE das 4 RPCs, snapshot, cobertura, `h15_actor_organization`,
  `is_delivery_staff`; ACL exata das 6 funções e da tabela; RLS ligada; texto exato da policy existente; conjunto de
  policies; helper novo ausente; dono `postgres`/DEFINER/sem sobrecarga.
- Helper `platform_private.entrega_termo_tenant_ok(uuid)` (DEFINER, `search_path ''`, EXECUTE só postgres): ator
  canônico `h15_actor_organization()` (perfil ativo, empresa ativa, ator pronto) = `entregas.organization_id` =
  `clientes.organization_id` do cliente da entrega. Reusa h15; não duplica regras de papel.
- `gerar`: após o lock consultivo, revalida `is_delivery_staff` + tenant → `sem_permissao` (mesma mensagem; entrega
  inexistente também, sem oráculo).
- `assinar`: tenant antes do lock e, após o `FOR UPDATE`, revalida staff + tenant → `termo_nao_encontrado`
  (outra empresa não descobre estado). Replay/fingerprint/`idempotency_key`/auditoria inalterados.
- `cancelar`: após `FOR UPDATE`, tenant → `termo_nao_encontrado`, e revalida o mesmo trio de papéis.
- `registrar_pdf`, snapshot e cobertura: `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` (ficam postgres/service_role;
  as RPCs DEFINER e a Edge com service role continuam funcionando).
- Tabela: `REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN FROM authenticated` (SELECT/INSERT/UPDATE/DELETE mantidos;
  sem policy permissiva de escrita, RLS já nega). service_role intacto.
- Policy `entrega_termos_tenant_isolation` RESTRICTIVE FOR ALL TO authenticated: a entrega do termo deve ser da empresa
  do ator (mesmo predicado da `tenant_isolation_d51_5` de `entregas`). A policy permissiva existente não é alterada.
- Postflight embutido: md5 pós (`post-hashes.json`), ACL exatas, policy restritiva, helper.

Papéis preservados: staff de entrega gera/assina; admin/gestor/administrativo cancela; financeiro e cliente vinculado leem.
Vínculo cliente/produtor continua pelo `get_cliente_ids_for_user` da policy existente.

## Rollback (`rollback.sql.review`)
Pré-check do estado candidato → DROP da policy → corpos baseline byte-exatos → DROP helper → GRANTs baseline exatos
→ pós-check = preflight baseline. **Reabre a exposição**; uso só em emergência. Repetição falha fechado.

## Evidência local (`test-local.py`, PG 17 descartável; GUC sintético ≠ JWT/RLS real) — 61/61
Baseline local reproduz md5 LIVE de 6 funções e o deparse da policy. Baseline reproduz as 6 exposições (os testes
podem falhar). Candidata: A não lê/gera/assina/cancela termo de B; incoerência entrega A/cliente B nega; perfil ou
empresa inativos negam; financeiro e cliente vinculado leem só A; TRUNCATE/registrar/snapshot/cobertura/helper negados
a authenticated; service_role registra; idempotência de gerar/assinar e auditoria preservadas; rollback restaura md5/ACL
e a reaplicação funciona. Cada cenário em `BEGIN … ROLLBACK`.

## Pré-requisitos de implantação (após revisão independente)
1. Reexecutar `preflight-readonly.sql` hosted (só leitura). Se falhar, parar.
2. Aplicar a candidata pelo canal de migração autorizado; conferir `postflight-readonly.sql`.
3. Homologação real A/B sem assinar termo real: leitura REST cruzada = 0; RPCs cruzadas negadas; Edge `entrega-termo-pdf`
   (pacote `scripts/termo-pdf-download/`) depois.
4. Não depende do frontend; a Edge candidata já valida tenant de forma independente.
