# Complemento B4 — quantidade fiscal, unidade e embalagem inteira

**Candidato INATIVO/BLOQUEADO/NÃO APROVADO.** Todos os testes ocorreram somente em PostgreSQL descartável, com Auth/GUC, documentos `AUTHORIZED`, contabilidade e adaptadores sintéticos. Não houve NF, transmissão, cobrança, escrita hospedada, envio, publicação ou subagente.

## Reprodução da lacuna

Candidato anterior SHA256 `d9a2089559c8e388316b9bb17cb4939b8215b500e58f94bbdbd8cd10ae67ccb7`: **87/108 checks, exit 1**. A composição B3 protegia a quantidade inteira no pedido e seu snapshot, mas o alocador B4 lia apenas `items[].quantity` e a comparava diretamente com `partner_order_items.quantidade`.

Consequências reproduzidas, sempre sem documento real:

- `0,5 UN` de uma embalagem inteira de 25 kg criou título e alocação fictícios;
- `1 UN + 50 kg`, `1 UN + 25 L` e item sem códigos de unidade também criaram título/alocação;
- `25 kg`, `50 kg`, `25.000/50.000 g`, `1.000 ml` e `500 ml` foram comparados como números de unidades do pedido e falharam por excesso;
- o recibo `item_money` não continha quantidade de pedido normalizada nem conteúdo fiscal normalizado.

Isso comprova uma lacuna na **composição** B3→documento autorizado sintético→alocador B4, não uma vulnerabilidade LIVE nem uma NF real aceita.

## Correção mínima gerada

Candidato atual SHA256 `14538a204b7351a6a47c9a2499ef7fc63079529a975b270233ae2809bf3eebcd`. O diff `candidate-before-after.diff` altera somente `platform_private.b2b_allocate_document(uuid)`:

- exige `item_id`, `quantity`, `commercial_unit`, `taxable_quantity` e `taxable_unit`, com tipos e chaves estritos;
- usa `packaging_*_snapshot` para embalagem inteira e `volume_ml/volume_ml_snapshot` coerentes para líquido;
- reconcilia comercial e tributário somente dentro de peso (`kg/g`) ou volume (`L/ml`), nunca entre peso e volume;
- deriva a quantidade do pedido pelo conteúdo do snapshot; `50 kg ÷ 25 kg = 2 UN`, não 50 UN;
- rejeita fração de wholepack com `FISCAL_WHOLE_PACKAGE_FRACTION` e divergências com `FISCAL_QUANTITY_UNIT_DIVERGENCE`/`FISCAL_UNIT_MISMATCH`;
- calcula saldo anterior e centavos sobre `item_money.quantity` normalizado, preservando `d.items` original e gravando o recibo fiscal normalizado em `item_money`;
- não altera preço, juros Price, calendário, grants, ACLs, writers, emissão fiscal ou gates contábeis.

Documentos antigos ainda não alocados e sem os novos campos falham fechados com `FISCAL_UNIT_CONTRACT_REQUIRED`. Não houve backfill nem reclassificação de origem; o auditor deve exigir nova atestação compatível, sem reescrever histórico.

## Resultados independentes — não somar

1. **123/123, exit 0 — mesma matriz antes/depois:** `evidence-after-core.json` e `test-after-core.*`; o antes correspondente está em `evidence-before.json`/`test-before.*`.
2. **132/132, exit 0 — matriz ampliada:** `evidence-after.json` e `test-after.*`. Acrescenta duas NFs parciais de 25 kg no mesmo pedido de duas embalagens, replay no mesmo título, terceira embalagem negada e ausência de duplicidade.
3. **73/73, exit 0 — regressões B4:** `component-after.*` e `../../evidence-b4-b3.json`; inclui Price, baixa, substituição de centavos, concorrência, calendário, tenant e contenções.
4. **42/42, exit 0 — manifesto/pins:** `manifest-after.*` e `../../evidence-manifest.json`; permanecem 54 objetos, sem GRANT ou stub no instalador.

As falhas intermediárias de harness e a divergência de caixa `KG/kg` foram preservadas em `evidence-harness-*`, `evidence-candidate-case-mismatch.json` e arquivos correspondentes; não contam como PASS.

## Composição dos guards

1. O writer B3 de embalagens aceita somente quantidade inteira e congela embalagem, conteúdo e unidade no item do pedido.
2. A aprovação econômica B3 mantém o snapshot e o preço do pedido; a NF fictícia não fornece preço.
3. O novo recorte valida os códigos fiscais contra esse snapshot, normaliza somente unidades da mesma grandeza e exige inteiro para wholepack.
4. O alocador continua usando quantidade comercial do pedido para residual e rateio monetário acumulado; o payload fiscal original permanece append-only.
5. A dependência fiscal/contábil real continua deny; o stub aparece só no harness depois da negação real já coberta pela regressão B4.

## Pendências inalteradas

- A baseline LIVE de `rpc_receivable_money_projection_v1(uuid,integer,integer)` continua ausente; PRE/install/rollback seguem fail-closed.
- O impacto `MONEY_ORIGIN_UNPROVEN` em títulos manuais de parceiros continua sem decisão.
- Corpos/owners/ACLs LIVE, elegibilidade ARBio, JWT/RLS/Storage/PostgREST/browser, emissão e cobrança reais continuam NOT_RUN.
- Nenhum PASS local autoriza instalação, ativação ou publicação.
