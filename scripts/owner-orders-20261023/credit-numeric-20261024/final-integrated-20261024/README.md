# Pacote FINAL integrado — INATIVO, somente revisão

## Recomendação única para instalar o estado composto
Promover somente este pacote: origem reconciliada **e** wrapper row-before-receipt são instalados na mesma transação, com PRE e POST completos. Os candidatos históricos de origem sem wrapper corrigido não devem ser promovidos isoladamente. Nenhum histórico foi sobrescrito.

## Base e preservação
Reutiliza a captura canônica somente leitura de 24/10 01:53–01:54 UTC em `capture/`, com 78 funções e 44 triggers; as consultas não formam snapshot único. O auditor deve reexecutar PRE integral no ref `swzpzcwiasxmjutrmvkm`.
- PRE wrapper LIVE: `9c8c8a736bcd1d77ee2f237a8a59b4ce`; POST e contenção: `31eeb54e4b69d97c311629a37e553faf`.
- PRE aprovação: `31bbe8f7d3c940eb9862bf7c7b7fad20`.
- Crédito LIVE preservado: `213ac31f3a30816ead75365b0d1fed18`.
- Writer permanece false: `a0417d6727d78412849916a95b250bde`.
- Parcelas PRE LIVE `9c6ef883bb4a97928a5179bc63e9ca31`; ramo contratual composto `de469bfc11719e288cd0970411c57c97` conserva rejeição de tenant NULL e propagação de organization_id.
Owners, ACLs, RLS/policies e triggers capturados são guardados integralmente. Não há concessão de autoridade nem reabertura do writer.

## Caminhos para revisão independente
1. `origin/preflight.sql`: estrutural READ ONLY sobre base LIVE atual.
2. `origin/preflight-accounting.sql`: gate humano obrigatório, READ ONLY; A DRAFT continua bloqueado com 42501/C2_ACCOUNTING_PREREQUISITE_BLOCKED.
3. `origin/candidate.sql.review`: sete corpos compostos, PRE/POST completos dentro de uma transação, incluindo CREATE do wrapper corrigido e POST 31eeb.
4. `origin/postflight.sql`: POST integral READ ONLY.
5. `origin/containment.sql.review`: PRE/POST integrais, fecha create e aprovação/cobrança externas, preserva wrapper corrigido, snapshots, histórico e branches internos. `origin/rollback.sql.review` é cópia idêntica de contenção, **não reversão de código**. Exige drenar escritores; não cancela chamadas in-flight.
6. `origin/assemble.py`: geração local; remove somente delimitadores externos ao normalizar os comandos.

## Uma suíte focal
Comando: `bun run test -- src/test/saas/c2-final-integrated-postgres.test.ts --maxWorkers=1 --no-file-parallelism`.
Rodada final: **1/1 PASS**, 74,69s teste (76,37s total). Nenhuma suíte não afetada foi reexecutada.
- PostgreSQL descartável, mesma cadeia capturada e fixtures: aprovação segura linha e aguarda barreira de crédito; wrapper LIVE segura receipt e aguarda linha, reproduzindo SQLSTATE **40P01** no estado composto.
- Mesma barreira após fix: geração aguarda linha sem receipt; ambas chamadas concluem; exatamente um título, três parcelas tenant A e um vínculo.
- A/B positivos com títulos/parcelas próprios; NULL título/parcela 23514/FINANCIAL_TENANT_REQUIRED e parcela B→título A 23514/FINANCIAL_RECEIVABLE_TENANT_MISMATCH.
- Negativas de create/approve/revogação exigem SQLSTATE/mensagem de autorização e snapshot sem efeitos; na_entrega nega cobrança antes entrega com 42501/C2_EXTERNAL_DELIVERY_REQUIRED.
- Comandos completos candidate/containment com falha deliberada depois do POST: catálogo de corpos/owners/ACL e hash wrapper anterior preservados; checkpoints de DO/DDL compartilham um txid por comando. PRE/POST READ ONLY completos executados; contenção completa bem-sucedida preserva wrapper 31eeb.
- Auth sintética e réplica parcial; a substituição temporária do helper por seu corpo revisado e atestados VALIDATED existem somente nas fixtures descartáveis. Não certifica JWT/RLS hosted, contabilidade real ou pós-entrega na_entrega.

## Bloqueios e estado
Contabilidade real A DRAFT, revisão independente e homologação hosted permanecem pendentes. PRE estrutural PASS não libera implantação. Sem SQL hosted mutante, publicação, mudança de sessões/dados reais ou abertura writer. Build automático observado OK; não houve build/typecheck manual.
