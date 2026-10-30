# Isolamento de produto_etiquetas + autorização checklist/ocorrência (preparação, NÃO aplicado)
Ordem sobre a composição aplicada (a566faa4 → 4390ef16 → proof-select → evidence 36b238e9):
1. `install.sql.review` deste diretório (etiquetas) → `postflight.sql.review`
2. `../delivery-checklist-occurrence-authz-20261030/install.sql.review` → `postflight.sql.review` (PRE = POST do item 1)
Rollbacks: cada `rollback.sql.review` (etiquetas: política vira false; checklist: revoga EXECUTE de clientes, mantém corpos endurecidos).

Dono da etiqueta = empresa do lote (lote_id imutável por trigger existente; lotes.organization_id protegido por guard de tenant).
Envase, item de estoque, embalagem, entrega, cliente e fazenda, quando informados, precisam concordar; sem lote, lote sem empresa ou conflito → negado.
Hosted (leitura agregada): 0 etiquetas → nenhum reparo de dados necessário.
Achado: rpc_atualizar_checklist_entrega / rpc_registrar_ocorrencia_entrega (usadas por EntregaChecklistPanel.tsx:39 e EntregaOcorrenciasPanel.tsx:84)
funcionam sob a barreira (DEFINER), mas aceitavam empresa alheia; corrigidas sem abrir DML de entregas.
Ensaio: test-results.json 28 PASS/0 FAIL, SQLSTATE exatos (raw-matrices.log, raw-sqlstates.log). Sintético; não é prova JWT hosted.
Pendências fora deste pacote: rpc_dispensar_assinatura_entrega não auditada aqui; vínculos entrega_etiquetas continuam fechados; financeiro/fiscal/automação bloqueados.

## Revisão aef5b69 → atual
- `envase_item_id`/`entrega_item_id` não têm tabela referenciada (opacos): valor não nulo nega (não é ignorado).
- `produto_id` deve coincidir com `lotes.produto_id` quando ambos existem; produto é catálogo global, sem tenant.
- `substitui_etiqueta_id`/`substituida_por_id`: a etiqueta referenciada deve ter lote da mesma organização (leitura direta de um nível dentro do helper DEFINER; sem recursão de policy/helper).
- Ensaio: 33/33 PASS, negativos exatos 42501 com IDs válidos (sem falso positivo por FK).
