# Recuperação mínima — Gerar Lote (`rpc_cockpit_gerar_lote_v1`)

REVISÃO SOMENTE. Nada foi aplicado no Supabase hospedado nem publicado pelo agente.
Ref canônico obrigatório: `swzpzcwiasxmjutrmvkm` (guarda via `fiscal_environment_marker`).

## Situação capturada (READ ONLY, 2026-10-19 16:04Z)
- Corpo atual md5 `d37a0e478e01277ba61f70397b1d44f9`, ACL `{postgres=X/postgres,service_role=X/postgres}` → passo fechado para usuários.
- Corpo atual só testa papel global (`fn_cockpit_assert_operador_origem`): sem tenant, perfil ativo, readiness, SaaS, revalidação pós-lock; aceita onfarm/B2B; replay devolve lote existente sem comparar dados. Por isso NÃO foi reaberto como está.
- OS B `18ea0531…` programada, programação `158a7488…` aguardando, 0 lotes, volume 100 mL (0,1 L). Nenhum dado tocado.

## Candidata (`rpc.sql.review`)
- Mesma assinatura, `SECURITY DEFINER`, `search_path ''`, `lock_timeout 3s`, somente READ COMMITTED.
- Cadeia viva antes e depois dos locks: `auth.uid`, `technical_actor_ready` (JWT iat, perfil/empresa ativos, readiness), `h15_actor_organization`, SaaS `ordens_producao` + `lotes_qualidade`, papel administrador/gestor/producao, escopo `h7n_esteira_laboratorio`.
- Mesmo conjunto de cercas da programação já revisada (convites, onfarm, catálogo SaaS em SHARE; OS/organização FOR UPDATE; perfil/papéis/assinaturas/overrides/cadastros FOR SHARE; programação FOR UPDATE + advisory).
- Só OS manual programada, programação `aguardando`, responsável nulo, item fabricável, sem B2B/links/entregas/aplicações. IDs divergentes/outro tenant → mesma negação `42501`.
- Payload fechado: `volume_produzido` (número em mL, >0, ≤100.000 L, 3 casas), `tanque`, `responsavel_producao`, `observacoes_tecnicas`. Código, produto, microrganismo, tenant, custo e data rejeitados.
- Replay: só idêntico (mesmos dados, lote em produção, sem CQ, um evento) devolve o mesmo lote; divergente → `success:false`, nada alterado.
- Não avança OS/programação, não cria CQ/envase/estoque nem resultado laboratorial.
- ACL candidata: `{postgres=X/postgres,authenticated=X/postgres}`.

## Arquivos
- `preflight-readonly.sql` / `postflight-readonly.sql`: guardas de alvo, 20 helpers, 5 triggers, 9 índices, 7 policies, RLS e eventos.
- `candidate.sql.review`: PRE → função → ACL → POST, numa transação.
- `rollback.sql.review`: exige POST exato, restaura definição baseline byte-a-byte (`rollback/rpc.sql.review`, sem TEMP) e ACL original, termina com guarda PRE.
- `rollback/src/**.review`: frontend do commit publicado `3eeb3212` para desfazer.
- `test-real-local.py`: PostgreSQL local descartável com corpos reais capturados e triggers reais (48 verificações). Auth/JWT sintéticos — não é homologação.

## Limites conhecidos (não resolvidos aqui)
- Policies `Admin/Gestor/Producao access on lotes` (ALL) e `OnFarm scoped insert lotes` ainda permitem escrita direta na tabela fora do RPC; precisam de revisão própria.
- O trigger existente faz REFRESH global da view materializada a cada INSERT em lotes.
- Cockpit continua em modo consulta; o botão foi colocado no detalhe da OS reaproveitando o formulário existente.
- CQ, envase, estoque, anexos e contratos continuam fechados.
