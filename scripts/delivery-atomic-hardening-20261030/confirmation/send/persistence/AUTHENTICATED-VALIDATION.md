# Roteiro de validação autenticada — Enviar/Confirmar (NÃO EXECUTADO)

Status: **PENDENTE**. Preparado apenas. Nenhum login, segredo, SQL hosted, implantação ou publicação foi feito.

## 1. Pré-requisitos (bloqueadores)
- Ref exato `swzpzcwiasxmjutrmvkm` comprovado antes de qualquer leitura; divergência → parar.
- Ambiente isolado/homologação com saídas externas bloqueadas (`COMMUNICATION/EMAIL/WHATSAPP_DELIVERY_ENABLED=false`, in-app adapter e webhook OFF). Produção somente leitura.
- Commits: frontend contendo `deliverySendPersistence.ts` (base `8d276bea` + este recorte), confirmação `5ea09498…`/sucessores revisados.
- SQL aplicado pelo auditor (não por este pacote): `confirmation/release.sql.review` e `confirmation/send/release.sql.review` após preflight exato; PRE/POST conferidos.
- ACL esperada: `authenticated` EXECUTE apenas em `rpc_entrega_envio_capability_v1`, `rpc_entrega_enviar_manual_v1` e RPCs de confirmação revisados; sem DML cliente em `entregas`; sem EXECUTE em `fn_entrega_confirmar_engine_v1`; waiver/cancelamento de etiqueta fechados.
- Contas reais de teste criadas pelo responsável (não por este pacote): ARBio (gestor/administrativo ativo), FSF (outro tenant), B2B gestor e B2B técnico separados. Nunca usar `service_role` como ator.
- Fixtures proibidas: entrega `d7edc250-…`, lote `5fa6d35b…`, OS `c909c862…`.

## 2. Snapshots PRE/POST (por cenário, somente leitura)
`entregas` (status, updated_at, validation_hash), recibos privados de envio/confirmação, `estoque_produto`/ledger (contagem e soma por lote/OS), `entrega_comprovantes`, títulos/parcelas financeiras, documentos fiscais, outbox/comunicação, notificações. Esperado: só `status`/`updated_at` mudam no Enviar; confirmação sem segunda baixa; financeiro/fiscal/outbox **inalterados**.

## 3. Matriz positiva — ARBio
| # | Cenário | Esperado |
|---|---|---|
| P1 | Enviar separado→em_rota | ACK exato; registro local removido |
| P2 | ACK perdido (rede cortada após dispatch) → reload | "Reconciliar envio"; sem replay automático; clique reusa mesma chave/payload; replay=true |
| P3 | Dois itens: Enviar A→Confirmar A (parcial)→Enviar B | OS não finaliza; sem nova baixa |
| P4 | Duas abas: aba 1 em dispatch, aba 2 Enviar | aba 2 recusa ("outra aba"); sem chamada |
| P5 | Confirmar após Enviar | prova/recebedor exigidos; sem financeiro aberto |

## 4. Matriz negativa — FSF e outros
| # | Cenário | Esperado |
|---|---|---|
| N1 | FSF chama capability/enviar com entrega ARBio | negado (42501/indisponível), sem escrita |
| N2 | Registro local ARBio presente, login FSF | registro invisível e intacto; nenhuma reconciliação |
| N3 | Papel revogado entre preflight e dispatch | negado no servidor; registro retido |
| N4 | Entrega cancelada/entregue com registro retido | só consulta; sem mutação |
| N5 | Registro adulterado (DevTools) | envios bloqueados; servidor nunca consultado como autoridade |
| N6 | OS finalizada | capability indisponível |

## 5. B2B (separado, não liberado)
B2B gestor e técnico: Enviar/Confirmar devem permanecer **indisponíveis** até contrato próprio; registrar apenas a negação.

## 6. Evidência
Capturas sanitizadas e IDs com hash; nunca tokens/cookies/senhas. E2E até bloqueio fiscal reportado separado; fluxo financeiro completo permanece NÃO VALIDÁVEL.
