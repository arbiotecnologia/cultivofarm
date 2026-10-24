# Reconciliação da base atual — revisão inativa

## Captura e preservação
- SELECTs de metadados/corpos no Supabase externo configurado `swzpzcwiasxmjutrmvkm`, 24/10/2026 01:53–01:54 UTC. Não houve DDL/DML hosted, publicação ou alteração de sessão.
- `capture/functions.json`: 78 corpos, assinaturas, owners e ACLs. `capture/structure.json`: 44 triggers, policies e RLS. Capturas em consultas separadas, não snapshot REPEATABLE READ único; PRE integral deve ser reexecutado pelo auditor.
- Base confirmada: aprovação `31bbe8f7d3c940eb9862bf7c7b7fad20`, wrapper `9c8c8a736bcd1d77ee2f237a8a59b4ce`, crédito `213ac31f3a30816ead75365b0d1fed18`, writer false `a0417d6727d78412849916a95b250bde`.
- Parcelas LIVE `9c6ef883bb4a97928a5179bc63e9ca31`, postgres, ACL postgres/service_role. NULL falha `23514/FINANCIAL_TENANT_REQUIRED`; INSERT propaga tenant do título. O corpo reconciliado conserva esses bytes e acrescenta apenas o ramo contratual já revisado. Seu hash composto é `de469bfc11719e288cd0970411c57c97`: não é hash da base LIVE, nem autorização para simplesmente trocar hashes.
- Históricos fora deste novo diretório não foram sobrescritos. O inventário herdado já continha o corpo LIVE de parcelas; a diferença adicional contra a nova captura foi exclusivamente crédito LIVE. O POST de parcelas verifica o corpo composto, não restaura versão vulnerável.

## Scripts de origem (dependentes da contabilidade)
1. `origin/preflight.sql`: READ ONLY, corpos/owners/ACL, triggers, conjunto de policies/RLS; não libera implantação sozinho.
2. `origin/preflight-accounting.sql`: gate humano obrigatório, real A DRAFT permanece bloqueado.
3. `origin/candidate.sql.review`: composição de origem, INATIVA; writer false. PRE e POST completos estão na mesma transação.
4. `origin/postflight.sql`: READ ONLY assertivo.
5. `origin/rollback.sql.review`: contenção de create/approve/generate externos existentes; não reversão de código, não cancela in-flight; drenar escritores antes. PRE/POST guardados na mesma transação, preservando tenant/ACL/crédito/histórico.

## Recorte wrapper independente: NO-GO demonstrado
`test-current-base.py` instala somente corpos/triggers/RLS atuais capturados, **sem composição nem reabertura do helper**. Create interno canônico positivo A e B em fixtures sintéticas; aprovação retorna `42501/B2B_INTERNAL_DOWNSTREAM_UNVERIFIED` porque tenta readiness=true. Wrapper retorna o mesmo erro para origem interna **antes de row/receipt**. Duas conexões com row segurada confirmam que a geração termina nessa negação, sem aguardar lock.

Assim não foi reproduzido o deadlock funcional approve/generate nessa base protegida: origem interna é contida; NULL legado não autoriza aprovação; origem externa composta não está instalada. Não emitimos candidate/rollback independente “pronto” sem prova, nem removemos trigger/limpamos JWT para fabricar sucesso. O deadlock anterior pertence ao estado composto testado, não certifica essa base hosted.

## Evidências locais
- `bun run test -- src/test/saas/c2-current-base-reconciliation-postgres.test.ts --maxWorkers=1 --no-file-parallelism`: 2/2 PASS, 99,80s; cadeia reconciliada **91 checks**, base independente **8 checks**.
- `bun run test -- src/test/saas/c2-credit-numeric-postgres.test.ts --maxWorkers=1 --no-file-parallelism`: 1/1 PASS, 49,10s; crédito/cadeia histórica **123 checks**.
- Execução paralela inicial: 3 testes passaram, mas executor reportou timeout onTaskUpdate e saída 1; não contamos essa rodada como PASS. Reexecuções isoladas sem erro.
- Candidate completo com falha deliberada após POST preserva catálogo baseline; contenção/rollback completo falho preserva catálogo composto. Notices em todos DO/DDL/checkpoints verificam um único txid por comando. PRE/POST READ ONLY completos também executados; contenção completa bem-sucedida executada no final da cadeia.
- A título/3 parcelas tenant A, B título/3 parcelas tenant B; NULL título/parcela `23514/FINANCIAL_TENANT_REQUIRED`; parcela B→título A `23514/FINANCIAL_RECEIVABLE_TENANT_MISMATCH`; negações de create/approve/revogação exigem SQLSTATE/mensagem específicos e snapshot sem efeitos.
- `na_entrega`: aprovação comercial sem título; cobrança antecipada `C2_EXTERNAL_DELIVERY_REQUIRED`; operação/pós-entrega continuam fechadas. Não simula homologação pós-entrega.

## Limites
Auth sintética e réplica parcialmente reconstruída, não JWT/RLS hosted. Fixtures contábeis VALIDATED são exclusivamente locais, não atestado real. Sem typecheck/build manual; build automático observado OK. Contabilidade real, revisão transacional independente e homologação hosted continuam bloqueios. Writer e sessões reais intactos.