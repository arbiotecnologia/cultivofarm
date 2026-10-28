# Entrega + estoque/envase + cobrança — pacote composto INATIVO

Destino único `swzpzcwiasxmjutrmvkm`. Nada aplicado, publicado ou alterado em produção; sem dados, sessões ou fixtures. Premissa: estoque/envase **não** está aplicado; este pacote compõe os três candidatos revisáveis numa única transação para instalação futura pelo auditor.

## Arquivos
- `assemble.py`: composição offline, fail-closed se algum trecho-fonte divergir em contagem.
- `candidate.sql.review`: estoque/envase (`stock-envase-recovery-20261027`) + cobrança (`delivery-billing-scope-20261027`) + entrega transformada; sem GRANT de cliente.
- `composed-delivery.sql.review`: só a parte de entrega transformada (usada no teste).
- `release.sql.review`: barreira que recusa liberação. `test-local.py`, `results.txt`, `SHA256SUMS`.
- PRE/POST: reutilizar os preflights dos três pacotes de origem (hashes LIVE já pinados); `local` pós-hashes devem ser recapturados após revisão. Contenção: deny-only dos pacotes de origem, nunca restaurar o escape GUC do envase.

## Riscos fechados
1. **Deadlock SHARE×EXCLUSIVE**: entrega passa a usar `cf_user_guards_v1.state FOR UPDATE` (o mesmo modo do motor e da cobrança). Baseline reproduziu `40P01`; composto serializa cancelar/cancelar, cancelar/confirmar e confirmar/cancelar sem deadlock.
2. **Escrita direta de estoque na confirmação**: substituída pelo motor canônico `rpc_estoque_operar_v1('expedicao')` com chave determinística `entrega-confirm-expedicao:<id>`; nenhum INSERT direto no livro.
3. **Reserva parcial**: rejeitada com PT409 `ENTREGA_RESERVA_PARCIAL_NAO_SUPORTADA` antes de qualquer escrita.
4. **B2B/onfarm**: continuam fechados.
5. **Revogação**: writers canônicos de perfis/papéis/convites cooperam via gatilhos `a00_cf%gate` (registro do pacote de rótulos implantado). Revogação commitada durante espera do gate nega a confirmação sem escrita.
6. **Cobrança**: chave advisory unificada (`hashtextextended('entrega_faturar:'||id,0)`); antes `hashtext` vs `hashtextextended` nunca conflitavam.
Timeout de gate limitado a 3s (55P03); falha do motor/livro reverte entrega e eventos.

## Testes
`python3 assemble.py && python3 test-local.py` → **31/31** PostgreSQL 17.9 descartável. Corpos LIVE exatos de entrega verificados por hash; **motor, cobrança, avanço de esteira, Auth e schema são stubs sintéticos** que reproduzem apenas os modos de lock. Não é integração completa do livro nem homologação JWT/RLS.

## NO-GO restante (liberação continua bloqueada)
- Conclusão do envase segue `ENVASE_TRANSITION_REVIEW_PENDING`: sem contrato de transição canônico revisado não se emite ticket CQ nem se contorna guards.
- Gate exclusivo serializa globalmente operações de estoque/entrega: exige revisão de custo pelo auditor.
- Teste integrado com motor real + guards de estoque + cobrança real, e homologação A/B real com revogação durante espera.
- Contabilidade real, emissão fiscal e SU-518022 permanecem pendentes.

## Rodada 28/10 — delta implementável INATIVO

Relatório completo: `docs/auditorias/etapas5-6-contratos-os-entrega-estoque-20261028.md`.
O composto histórico agora aborta explicitamente com `HISTORICAL_BILLING_COMPOSITION_A2_REBASE_REQUIRED`; sua cobrança anterior **não pode substituir A2/parcelas**. O gerador preserva os três candidatos originais e produz a parte entrega para testes; não houve instalação.

- `delivery-only-delta.sql.review`: três corpos existentes, transação única, PRE/POST embutidos (OID/hash/owner/ACL/config), dependências de motor/cancelamento/helper pinadas. Sem criação de helper, tabela, GRANT ou replay de cobrança. Recusa no LIVE atual por dependências não instaladas.
- `current-{functions,extra,tables}-20261028.json`: metadados somente leitura, ref canônico e timestamp. `current-preflight.sql` / `current-postflight.sql`: pinos de captura e estado hipotético somente da entrega; não são POST do composto stock/A2.
- `build-current-checks.py`: geração offline dos pinos e delta. `containment.sql.review`: rollback deny-only dos cinco entrypoints/engine; não reverte corpo/guard/histórico.
- Confirmação recusa estoque expedido preexistente sem prova de titularidade (PT409); replay de entrega já confirmada continua anterior. ACK `ok` do motor é obrigatório; cancelamento exige `ok` do estorno e `success` da liberação, reautoriza depois dos filhos.
- Teste composto **48 PASS**: motor/financeiro/avanço/Auth/schema ainda stubs. Inclui falha POST que reverte DDL, drift OID que aborta, ACK negativo/NULL, expedição ambígua e contenção. Não certifica o delta como instalável.
- Testes de estoque do módulo existente usam motor/ledger/P1/volume/CQ capturados e a função interna `reservar_estoque_item` capturada nesta rodada; Auth/SaaS/schema/hash continuam sintéticos e triggers de transição/refresh/financeiro omitidos explicitamente.

Não migrar consumidores nem fechar DML com base neste pacote. CAS observado, criação manual/grupo, retorno logístico, transição envase e autoridade B2B/onfarm continuam gates independentes.
