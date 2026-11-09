# Auditoria integrada pós-PB-001039 — 09/11/2026 19:16 UTC

## Escopo e baseline

- Baseline recebida como relato do auditor: frontend `12cc969f`, bundle `index-vqoJpoyC`; PB-001039 `305145ab-8bf7-4f85-a20f-86c23e4be64e`, total 18, boleto 1x/0%/30 dias após NF, fiscal DRAFT e sem recebível; FSF GET direto por ID 200 `[]`.
- Guard81, Seller91 e etapas 11..71 foram tratados como instalados pelo auditor. Nada foi reaplicado em produção.
- Todos os ensaios deste resultado usaram PostgreSQL 17.11 descartável, dados sintéticos e nenhum listener/provedor externo. Não são prova JWT/RLS/Storage/hosted nem autorização de gates, emissão, cobrança, envio ou publicação.

## Execuções novas

| Prova | Resultado | Evidência |
|---|---:|---|
| Cadeia integrada pedido→estoque/revenda→entrega→fiscal/B4, incluindo promoção pendente | **47/47, exit 0** | `../attempt-115/` |
| Matriz econômica com corpos capturados e Seller91 no espelho | **353/353; recorte CCR2 144/144, exit 0** | `../../production-rollout-posplans-20261108-condition-contract-required/rev2-coherence-20261109/evidence/attempt-37/` |
| Compra de acabado químico/fertilizante, reserva/baixa/estorno, entrega/replay/concorrência | **59/59, exit 0** | `components-final/physical/after.json` |
| Regressão biológica | **7/7, exit 0** | `components-final/physical/legacy-candidate.json` |
| Lote do fornecedor, apresentações, tenant e idempotência | **15/15, exit 0** | `components-final/physical/supplier-lot.json` |
| Nulidade e contratos fail-closed | **52/52, exit 0** | `components-final/physical/null-contract.json` |
| B4 parcial, replay, concorrência, recuperação e rollback | **198/198, exit 0** | `components-final/b4/evidence-b4-shared-impact.json` |
| Unidades fiscais e embalagens | **178/178, exit 0** | `components-reconciled/test-b4-fiscal-units-fiscal-evidence/evidence-after.json` |
| Manifesto B4 | **61/61, exit 0** | `components/test-b4-manifest.log` |

As contagens são de suítes com sobreposição e não devem ser somadas como cobertura única.

## Inventário objetivo dos cenários

- **Biológico:** programação, envio, confirmação e cancelamento/estorno legados passaram com o gate de acabado desligado; item sem envase continuou negado. Não é novo pedido B2B biológico nem abertura de produção.
- **Químico e fertilizante:** compra de produto acabado em kg/g/L/ml, embalagens inteiras, sem bioreator/CQ/envase; reserva, split parcial, baixa única, cancelamento com merge/estorno, expedição, entrega e replays passaram. kg/g não viraram litros.
- **Entrada para revenda:** lote interno UUID do servidor e lote externo do fornecedor preservado; mesmo lote externo entre tenants/recebimentos/apresentações não colidiu. Cross-tenant, payload divergente e replay concorrente ficaram contidos.
- **Entrega parcial e concorrência:** parcial válida persistiu sem concluir o pedido; cobertura integral concluiu; excesso, item estranho, parcial cancelada e revogação durante locks foram negados. Duas últimas entregas concorrentes e replays não duplicaram efeitos.
- **Faturamento parcial:** pendente/rejeitado não gerou documento/título. No componente B4 com costura fiscal declarada, NF parcial válida gerou título; replay e duas sessões mantiveram um título e uma alocação **por documento**. Três NFs independentes geraram três títulos e fecharam o residual. Não houve boleto/Pix/pagamento automático.

## Bloqueio esperado versus defeito

- **Promoção com contabilidade pendente:** `C2_ACCOUNTING_PENDING`, pedido byte-equivalente antes/depois (`attempt-115/accounting-pending-promotion-denial.json`).
- **Aprovação com contabilidade pendente:** mesma negação atômica, sem alteração do pedido.
- **Positivo isolado:** configuração contábil fictícia VALIDATED permitiu promoção CAS e aceite; `ready_for_production=false`. Isso não é confirmação fiscal de NF.
- **Recebível:** na cadeia integrada, callback H13 autorizado e replay ficaram `FISCAL_AUTHORIZATION_CLOSE_PENDING`, com zero documento B4/alocação/snapshot/recebível; a dependência real always-deny não foi substituída. O positivo B4 é componente separado com `b2b_integration_dependencies` costurada somente depois da negativa real.
- **Estoque/entrega:** gates e grants fechados negaram compra, OS, envio e confirmação; B2B direto permaneceu `DELIVERY_SCOPE_DENIED`. São contenções operacionais independentes, não uma única guarda fiscal. A entrega positiva local após contabilidade fictícia válida não gerou recebível e não prova liberação real.
- **Rollback:** deny-only, histórico preservado, gates e writers novamente fechados; dez triggers/ACL de recebíveis e proibição downstream preservados.

**Nenhum defeito de backend foi reproduzido nesta rodada; nenhum SQL operacional/candidato foi alterado.** O acréscimo em `compose.py` é somente a negativa de promoção no harness.

## Cardinalidade: lacuna funcional explícita

A expressão “recebível único” fica demonstrada como **um por documento/evento fiscal válido**, com idempotência e concorrência. Não fica demonstrada como “um único recebível por pedido com várias NFs parciais”: o contrato B4 atual produziu três títulos para três documentos. Se a intenção for um título único por pedido, há divergência de requisito que exige decisão e contrato próprios; nenhum código foi mudado para forçar essa interpretação.

## Capturas e limites reais

- A matriz CCR2 confirma o novo Seller91 MD5 `97bcdb9884b54adb3bd4aae4915e32d0` no espelho. O baseline pré-Seller91 e outras dependências permanecem listados como `*_unconfirmed` em `attempt-37/hook-results.json`; o PASS não os apaga.
- Para fechar uma composição única pós-Seller91 ainda são necessárias capturas exatas atuais de corpo/owner/ACL das dependências não confirmadas, em especial `platform_private.b2b_resale_delivery_order_valid_v1(...)` e `platform_private.b2b_resale_delivery_status_transition_valid_v1(...)`, além do manifesto atual das demais entradas `live_bodies_other_md5_unconfirmed` e `live23_extra_real_unconfirmed`.
- O positivo fiscal integrado permanece `NOT_RUN_BLOCKED`; ponte real, NFS-e, cancelamento automático e provedores não foram homologados.
- Tentativas de harness com checkpoint ausente, permissões do diretório temporário, argumento `--phase after`, diretório de evidência ausente e ACL de proprietário foram preservadas em `components/` e `components-reconciled/`. A repetição final usou artefatos da tentativa 114 e declarou no diff somente as duas deltas atuais e a normalização owner-only de `authz_tickets`; não houve stub silencioso.

## Registro temporal 19:16 — persistência na URL (SUPERADA às 19:34)

A lista `/comercial/pedidos-b2b` mantinha o filtro apenas no `Map` volátil; reload completo retornava ao padrão `aguardando_aprovacao_credito` e podia aparentar carteira vazia. O teste ANTES falhou 2/8. `usePedidosB2BStatusFilter` agora reflete `status` na URL, preserva outros parâmetros, aceita link explícito e não herda o parâmetro entre identidades/empresas. Não houve mudança de consulta, RLS, RPC ou autorização.

- DEPOIS: **4 arquivos, 44/44 testes**, typecheck exit 0 e build automático OK.
- Arquivos: `src/hooks/usePedidosB2BStatusFilter.ts`, `src/test/pedidos/pedidosB2BStatusFilter.test.tsx`.
- Não publicado pelo agente.

## Complemento auditado 19:34 — negação real e reconciliação do legado

Fonte: relato do auditor em `auditor-report-20261109-1934.json`; não houve consulta, escrita ou execução de produção pelo agente.

- Promoção autenticada de PB-001039 pela UI de produção: **HTTP 403 `C2_ACCOUNTING_PENDING`**. Hash do pedido `8127886e51e0327e880fe6102a106833`, `updated_at=2026-11-09T18:32:29.585832Z` e `audit_count=6` iguais antes/depois; `receivable=false`. É a negação atômica esperada, sem promoção, aprovação contábil fictícia ou título.
- Leitura LIVE relatada: `generate_b2b_receivable_secure(uuid)` MD5 `c49cc7ccedbcb28cba9b816b7e47c521`; implementação MD5 `1bdac7fae6d702fb42d3a30539e9c9c3`; `tg_auto_b2b_receivable` MD5 `0f679538fe394924b140e54938a3bb9e`, ainda com eventos `na_aprovacao`, `na_entrega` e `na_producao_finalizada`, trigger **O** (habilitada).
- `accounts_receivable` conserva dez triggers, incluindo `a00_delivery_no_downstream` **O**. Isso caracteriza legado sob contenção, **não** ponte fiscal instalada.
- Antes de qualquer aprovação de ponte fiscal é obrigatória reconciliação específica desses corpos, trigger, ACL e efeitos. **Nenhum título pode ser liberado sob o gatilho antigo.** Os PASS locais anteriores não removem este bloqueio nem certificam produção.

## Decisão UI atual 19:34 — padrão Todos e reset esperado

O auditor esclareceu que a retenção somente em memória volátil por identidade é deliberada e que reload completo deve resetar o filtro. A persistência na URL registrada às 19:16 foi retirada; não se persiste status no endereço nem entre identidades. A lista agora abre por padrão em **Todos**, evitando a aparência de carteira vazia, enquanto desmontagem/remontagem durante pausa de autorização do mesmo ator preserva a seleção. Consultas, escopo, gates, RLS e RPC não mudaram.

- DEPOIS: **3 arquivos, 27/27 testes** (`pedidosB2BStatusFilter` 9, `accountingPending` 5 e `partnerOrdersAdminScope` 13), typecheck exit 0 e build automático OK.
- Arquivos atuais: `src/hooks/usePedidosB2BStatusFilter.ts`, `src/pages/comercial/PedidosB2B.tsx`, `src/test/pedidos/pedidosB2BStatusFilter.test.tsx`.
- Duas tentativas de regressão citaram nomes ausentes (`pedidosAdminListIsolation.test.tsx` e `pedidosCreditPause.test.tsx`): **NOT_RUN / arquivo inexistente**, não PASS nem falha comportamental. Foram substituídas pelas regressões reais acima.
- Não publicado pelo agente.

## Contenção final

Nenhum SQL hospedado, pedido real novo, alteração de PB-001039/PB-001038, publicação, emissão, cobrança, pagamento, envio ou provedor. Envios e operações produtivas continuam OFF; dados de produção citados são somente o relato do auditor.
