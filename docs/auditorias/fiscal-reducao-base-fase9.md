# Fase 9 — Homologação com NF-e sintética (redução da base de cálculo)

Banco: projeto canônico Cultivo Farm (`swzpzcwiasxmjutrmvkm`). Ambiente: homologação (tpAmb=2).
Execução em transação com `ROLLBACK` final — nenhum dado permanente foi criado ou alterado.

## Escopo executado

Cenário sintético ponta a ponta montado dentro da transação:

- marcador de ambiente fiscal `STAGING` (emissão produtiva bloqueada);
- emitente CRT 3 em SC, completo (CNAE, regime PIS/COFINS, endereço, IE com DV válido, série, credenciamento, certificado de homologação sintético, validação contábil);
- destinatário PJ contribuinte em SC, endereço fiscal completo e IE válida;
- pedido B2B aprovado (itens inseridos antes da aprovação, respeitando o guard de imutabilidade), 1 item de R$ 10.000,00;
- política de operação publicada (modelo 55, OUT, SC→SC, CFOP 5102, canal `b2b_partner`) com fonte oficial e evidências de publicação;
- regras fiscais publicadas: ICMS CST 20 `MANUAL` 18%, PIS 1,65% `NONE`, COFINS 7,6% `NONE`;
- rascunho NF-e com `tax_input_snapshot = {"ICMS":{"baseReductionPct":60,"baseReductionReason":"homologacao sintetica"}}`.

## Resultado

14 de 14 checkpoints PASS (0 FAIL):

| Checkpoint | Resultado |
| --- | --- |
| preview base 4000 / pct 60 / valor 720 / origem MANUAL | PASS |
| preview == persistido (base, pct, valor) | PASS |
| persistido baseOriginal 10000 / base 4000 / valor 720 | PASS |
| total vProd 10000 / vICMS 720 | PASS |
| base ICMS do item 4000 (fonte do vBC no XML) | PASS |
| auditoria `BASE_REDUCTION_CHANGE` registrada | PASS |

Fixture obrigatória confirmada: base 10.000, redução 60%, base tributável 4.000, alíquota 18%, ICMS 720.
Não há divergência entre preview, cálculo salvo e os totais que alimentam o XML.

## Observações e divergências encontradas durante a montagem

- `fiscal_totals_snapshot` não expõe `vBC` agregado; a base por tributo vive em
  `fiscal_invoice_items.tax_snapshot->'taxes'->'ICMS'->>'base'`, que é a fonte do `vBC` no XML.
  O checkpoint foi ajustado para a fonte correta (não houve mudança de código de produção).
- Guards que bloquearam o cenário até serem satisfeitos (comportamento correto, documentado):
  marcador de ambiente, singleton de emitente ativo, prontidão de emitente e destinatário,
  certificado de homologação ativo, imutabilidade de itens após aprovação do pedido,
  evidências de publicação de política e de regra fiscal.

## Arquivos

- `restoration/fiscal-reducao-base/test_phase9_synthetic.sql` (script de homologação sintética, idempotente e revertido).
- Nenhuma migration nova; nenhuma RPC, RLS ou componente React alterado nesta fase.

## Rollback

Não aplicável: a fase é somente de verificação, executada em transação revertida.

## Pendências

- E2E Playwright do RascunhoWizard (Admin, Financeiro, perfil sem permissão; desktop e mobile).
- Cenário SEFAZ real (fora do escopo autorizado; emissão permanece desabilitada).
- 6 testes fiscais antigos falhando por divergência de tipos, sem relação com esta frente.
- Troca da senha do banco.
