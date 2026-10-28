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
