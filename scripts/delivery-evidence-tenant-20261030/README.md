# Barreira de empresa — evidências irmãs da entrega (preparação, NÃO aplicado)
Tabelas: entrega_checklist, entrega_ocorrencias, entrega_documentos, entrega_conferencia_itens, entrega_reconciliacoes, entrega_etiquetas.
Delta: 1 política RESTRICTIVE ALL por tabela (USING + WITH CHECK: entrega pai visível pela RLS de `entregas` do chamador) + REVOKE TRUNCATE de PUBLIC/anon/authenticated nessas 6. entrega_termos e entrega_comprovantes intocadas aqui.
Ordem: release-combined (a566faa4, aplicado) → install-v2 (4390ef16, aplicado) → proof-select-tenant → este install.sql.review → postflight.sql.review.
Rollback: rollback.sql.review (narra para false; nunca DROP nem re-GRANT TRUNCATE).
Evidência local (PG descartável, claims sintéticos): test-results.json 30 PASS/0 FAIL; matriz de gravação antes/depois em raw-write-matrix.log.
Não é prova JWT/RLS hosted: repetir GET real FSF para checklist a8e51d9d… após aplicar.

## Vínculos de etiqueta (revisão 19:04)
- Ensaio comprovou: antes, entrega própria + etiqueta estrangeira (IDs válidos) e troca de etiqueta entre empresas eram aceitas; erro de FK só para ID inexistente (não é prova de RLS).
- Linhagem avaliada: `produto_etiquetas` não tem organization_id; lote/envase/estoque/entrega/cliente são todos anuláveis — não há raiz autoritativa obrigatória. Por isso a gravação direta de `entrega_etiquetas` (INSERT/UPDATE) fica FECHADA para clientes por 2 políticas restritivas `false`, até um pacote de linhagem revisado separado. Leitura e writers DEFINER/serviço intactos; nenhum caminho do app grava esse vínculo.
- BLOQUEIO EM ABERTO (upstream): leitura direta de `produto_etiquetas` não tem isolamento por empresa (helper retorna true para papéis internos). Não alegar domínio de etiquetas isolado.
- Resultado atual: 30 PASS/0 FAIL (harness estrito por SQLSTATE: só 42501, 23514 documentado do trigger de reparent, ou 0 linhas; FK/unique/outros reprovam; rótulos semeados válidos; assinatura+anexo+replay incluídos). Instalador inalterado.
