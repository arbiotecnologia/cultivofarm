# Tentativa 13 — corpos LIVE atuais + fixture com planos exclusivos por empresa (PG17.11 descartável)

Resultado: harness 304/304, CCR2 95/95, exit 0. Tentativas 11 (301/304) e 12 (304/304, rótulo de diagnóstico superestimado) preservadas.
Classificação: DISPOSABLE_PG_REAL_WRITERS_DECLARED_SEAMS_NOT_HOSTED_PROOF. Não prova JWT/RLS/PostgREST/Storage hospedados.

## Correções
- Fixture (somente cópia temporária, diff em harness-patch.diff, gerada por tenant_fixture.py com contagens exatas):
  F recebe planos próprios PLDF/PLQF (mesma economia, id/código distintos); A mantém PLD/PLQ/P3. Nenhum plano compartilhado.
  commercial_plan_partner_visible/admin_allowed e demais corpos LIVE inalterados.
- payment_choice_required (tentativa 10): família compartilhada -> backfill ambíguo -> organization_id NULL -> nenhuma opção ->
  escolha vazia. Com fixture exclusiva: controle positivo P/PLD com opção e cart_hash; controle negativo sem escolha -> payment_choice_required.
  Reprodução direta pós-instalação é impossível (organization_id imutável: COMMERCIAL_PLAN_TENANT_IMMUTABLE).
- Cross-tenant no espelho (11 casos): listagem expõe zero opções (contrato LIVE nega por lista vazia, não por erro);
  simulação, criação, publicação, atribuição e aposentadoria cruzadas falham; delta zero em pedidos/snapshots/idempotência/versões/atribuições/planos.
- Rollback 81/reinstall sobre a pilha atual: md5 dos 25 corpos POSPLANOS e dados idênticos antes/depois do rollback, reinstall e rollback final.
- Rollback B3 04: NOT_RUN no modo LIVE (fixado ao publish pré-cc1f6cc). Não repinado nem alterado; precisa de pacote próprio.
- after_denied mantido: revogação e aposentadoria -> ERROR payment_condition_unavailable com hash válido pré-operação e nova chave, deltas zero; mutações injetadas reprovam.

## Hashes LIVE
- Writers informados pelo auditor: create fe82f538…, condition e86385fe… = espelho.
- 25/25 corpos POSPLANOS = pins do POST cc1f6cc (POST PASS relatado pelo auditor; não é leitura direta).
- 70 assinaturas exercitadas sem md5 LIVE confirmado: live-hash-request.json (inclui options_secure, activation_set, b2b_condition_mode/required_check,
  gatilhos de partner_orders, helpers commercial_plan_*). Auditor deve ler md5(pg_get_functiondef) no ref canônico.

## Veredito 81
Ainda NÃO APROVADA: depende da leitura LIVE dessas assinaturas e da revisão independente. Nada hospedado, publicado ou ativado.

## sha256
b2185b5f8c64478250834f06ebcfb3b1a2a45abe526920cc5bead5499090fb3f  ccr2_hook.py
d3a4c0387cb01b0335a8603c054c4fb85896833791a34db378794a206e339089  run_ccr2.py
0d49e9ab9afb9586ec57eb7a2e62c6dcf45c5fcf7f7ce2d670b4d3099807e986  tenant_fixture.py
728b66199283e23a1106d06b89686b5493b60bdd3fe6fba2711e7bac6b41e6f9  live_bodies.py
9148ba8659fbc9efacde6e9ae78dcac13e3d440ac7e04b675970c3bc18355738  80-ccr2-pre.sql.readonly
6b483d3af96875156e61e8161cebecf44027793cb56b1cc01176dd03e772e03e  81-ccr2-install.sql.review
084ab4127981a8abcd4dd87330f1b2549712ee91a73863ae086984e4f4709887  82-ccr2-post.sql.readonly
56504e4c847b259e72a2370fd398e9f2350cd47d692826ad0db0a90ef4494bf1  96-ccr2-rollback.sql.review
264f332cc0e5eaa71b11a9bd8f4f26c9a46371403d3b9eb319a7ef0221ada8c5  evidence/attempt-13/ccr2-checks.json
ff7eacd2ceeecd11a14520c11a9ab3c8b30dac83423dd2f76112256b1ed9eec5  evidence/attempt-13/harness-evidence.json
9e9f9f6abda88a9fce99641984b3648403b5fa72e61e1e398c2b71539b248d43  evidence/attempt-13/hook-results.json
89157c90debd04af14c22a5cc1e1ca81bf191cdd03230e627d74ef2ba90bfe8c  evidence/attempt-13/live-hash-request.json
c808a3221762763ef2707c60f2b55ab1701621ac729c6fe337e1e2a5935bb70f  evidence/attempt-13/pins.json
1637619f6d6bfe62557c782cb255dd3d7c691937ed0d8e8b199c9a0d9715d371  evidence/attempt-13/run.json
b2f0442e727b0a482dea07f66421b50e5c7b612b5d04bb17d17363281b21853b  evidence/attempt-13/harness-patch.diff
91815bc123b7390403d095e40b197aade4d1e2c4a7aa700f109c1c959f14968d  evidence/attempt-13/stdout.txt
