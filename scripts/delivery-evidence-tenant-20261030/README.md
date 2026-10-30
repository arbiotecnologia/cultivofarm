# Barreira de empresa — evidências irmãs da entrega (preparação, NÃO aplicado)
Tabelas: entrega_checklist, entrega_ocorrencias, entrega_documentos, entrega_conferencia_itens, entrega_reconciliacoes, entrega_etiquetas.
Delta: 1 política RESTRICTIVE ALL por tabela (USING + WITH CHECK: entrega pai visível pela RLS de `entregas` do chamador) + REVOKE TRUNCATE de PUBLIC/anon/authenticated nessas 6. entrega_termos e entrega_comprovantes intocadas aqui.
Ordem: release-combined (a566faa4, aplicado) → install-v2 (4390ef16, aplicado) → proof-select-tenant → este install.sql.review → postflight.sql.review.
Rollback: rollback.sql.review (narra para false; nunca DROP nem re-GRANT TRUNCATE).
Evidência local (PG descartável, claims sintéticos): test-results.json 26 PASS/0 FAIL; matriz de gravação antes/depois em raw-write-matrix.log.
Não é prova JWT/RLS hosted: repetir GET real FSF para checklist a8e51d9d… após aplicar.
