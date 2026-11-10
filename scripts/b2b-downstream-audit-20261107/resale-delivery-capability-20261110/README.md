# Capability de revenda B2B para reserva/criação de entrega (candidato INATIVO)

Revisor: agente Codex (não é revisão pessoal do usuário). Sem produção, sem publicação, sem concessão, sem fiscal/cobrança/envio. PB-001039 e contabilidade intocados.

## SQL (ordem)
1. `01-pre.sql.readonly` — alvo ausente; corpo de `resale_pilot_scope_v1` pinado (md5 `63f49feea167f6865fd7840cde7dc63b`, estágio INTERMEDIÁRIO 61-pilot-containment); dono/ACL privada de `delivery_actor_20261030`, `b2b_resale_os_operational_valid_v1`, `resale_pilot_scope_v1`; gate logístico fechado. Corpos LIVE de delivery_actor/fn_estoque_pode_operar/os_operational não pinados aqui: auditor confirma readonly.
2. `02-install.sql.review` — cria `public.rpc_b2b_resale_delivery_capability_v1(uuid,uuid[])` (DEFINER, search_path vazio, sem escrita, sem locks), EXECUTE só `authenticated`.
3. `03-post.sql.readonly` — corpo md5 `ae4e259ddf5b4005a7be9320e29117ef`, ACL sem grant option, writer manual sem EXECUTE, gate fechado.
4. `04-rollback-deny.sql.review` — revoga EXECUTE; corpo e concessões/históricos mantidos.

## Testes
- Banco descartável: `db_capability_test.py` → `evidence/db-stdout.txt`, `db-exitcode.txt`, `db-results.json` (25/25). Seams declarados em `db-results.json`.
- Tela: `src/test/entregas/b2bResaleDeliveryFlow.test.ts` + 6 suítes de entrega existentes → `evidence/vitest-stdout.txt` (176/176).

## Limites / pendências reais
- Reserva: o writer não tem chave idempotente; a reconciliação adota só delta exato e, se incerto, bloqueia nova reserva da OS (sem redispatch). Não há botão de reserva B2B na tela; adicionar é decisão posterior.
- O diálogo de registro pode não listar OS B2B; o caminho de criação B2B está pronto mas depende disso e de concessão real.
- Sem prova JWT/RLS/Storage; gates e concessões continuam fechados em produção.
