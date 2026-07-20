# Entregas — Formulário, Assinatura Digital e QR Code (Fase 1)

## Fluxo oficial de finalização da entrega

1. **Gerar formulário** (`rpc_gerar_formulario_entrega`) — cria `entrega_comprovantes`, número `AR-ENT-000001`, `validation_token`, `validation_hash` e checklist padrão.
2. **Imprimir** em `/entregas/:id/formulario` (HTML print-friendly com QR Code) ou **coletar assinatura digital** no canvas (`rpc_coletar_assinatura_digital_entrega`) ou **anexar comprovante** físico (`rpc_anexar_comprovante_entrega`).
3. **Confirmar recebimento** (`rpc_confirmar_recebimento_entrega`) — exige recebedor + assinatura (digital ou anexada) quando `assinatura_obrigatoria`.
4. Admin/gestor/administrativo podem **dispensar assinatura** (`rpc_dispensar_assinatura_entrega`, motivo obrigatório ≥ 5 chars).

Estados de `entregas.comprovante_status`: `pendente → formulario_gerado → assinatura_digital_coletada | anexado → confirmado` (ou `dispensado`).

## Coleta de assinatura digital no celular

Componente `AssinaturaDigitalCanvas` captura traços (pointer events, mouse+touch), exige mínimo de pontos, gera PNG + SVG path + hash SHA-256. PNG vai para `entregas/{id}/assinaturas/...` no bucket privado `entrega-documentos`. Metadados registrados: `user_agent`, `assinatura_capturada_em`, `recebedor_nome/documento/cargo/telefone`, hash.

A assinatura digital tem função operacional equivalente ao comprovante físico anexado. **Não substitui** assinatura eletrônica avançada nem provedor jurídico — é comprovação operacional com rastreabilidade.

## Validação pública por QR Code

- URL: `${origin}/validar-entrega/{validation_token}` (rota pública, sem AuthGuard).
- Página chama **somente** `rpc_validar_comprovante_entrega(uuid)` (GRANT EXECUTE TO anon).
- Retorna apenas: `valido`, `status`, `numero_formulario`, `data_confirmacao`, `data_assinatura`, `validation_hash`, `mensagem`. Nunca expõe dados financeiros, CPF, anexos privados ou outros clientes.
- Respeita `validation_public_enabled` e `validation_expires_at`.

## Coleta de assinatura física e anexação

Botão "Anexar comprovante" abre upload (PDF/JPG/PNG/WEBP, ≤10MB) → storage `entregas/{id}/comprovantes/...` → RPC marca `assinatura_tipo='fisica_anexada'` e `status='anexado'`.

## Relação com financeiro/faturamento

- A fase 1 **não** gera contas a receber. O fluxo continua em `fn_generate_receivable_from_entrega`.
- `EntregasNaoFaturadas` pode ler `comprovante_status` como indicador.
- Financeiro tem SELECT em comprovantes/ocorrências/checklist; nunca altera.

## Texto padrão do termo de recebimento

> "Declaro, para os devidos fins, que recebi da AR Bio os produtos/bioinsumos descritos neste formulário, conferi as quantidades, identificação dos produtos, lotes, volumes e condições aparentes das embalagens no ato do recebimento. Declaro estar ciente de que o armazenamento, manuseio e aplicação devem seguir as orientações técnicas fornecidas pela AR Bio, respeitando as condições adequadas de conservação e utilização. Eventuais divergências identificadas no recebimento deverão ser registradas neste documento no campo de observações/ressalvas."

## Validação jurídica/contábil

O comprovante e a assinatura digital deste módulo registram **comprovação operacional** de recebimento, com rastreabilidade (data/hora, usuário, hash, IP/UA). **Não há promessa de validade jurídica absoluta.** Para validade legal estendida, integrar futuramente provedor de assinatura eletrônica avançada (ICP-Brasil, eIDAS).

## Auditoria

Ações registradas em `financial_audit_log` com `entity_type='entrega'`:
`DELIVERY_FORM_GENERATED`, `DELIVERY_DIGITAL_SIGNATURE_CAPTURED`, `DELIVERY_PROOF_ATTACHED`, `DELIVERY_RECEIPT_CONFIRMED`, `DELIVERY_SIGNATURE_WAIVED`, `DELIVERY_OCCURRENCE_REGISTERED`, `DELIVERY_CHECKLIST_UPDATED`.

## Storage e segurança

Bucket privado **`entrega-documentos`** com policies por papel (`is_delivery_staff`, `is_financial_staff`, vínculo `get_cliente_ids_for_user`). Downloads sempre via signed URL (300s).

## Fase 1.1 — Refinamento da validação pública e indicadores financeiros

### Mensagens contextuais da validação pública (`rpc_validar_comprovante_entrega`)

A RPC pública retorna `assinatura_tipo`, `possui_ressalvas` e uma `mensagem` contextual segura, **sem** expor recebedor, documento, telefone, anexos, metadata, IP/UA ou qualquer dado financeiro:

- `assinatura_tipo='digital_tela'` → *"Comprovante registrado com assinatura digital operacional no sistema AR Bio."*
- `assinatura_tipo='fisica_anexada'` → *"Comprovante registrado com formulário físico assinado no sistema AR Bio."*
- `assinatura_tipo='dispensada'` → *"Comprovante registrado com dispensa formal de assinatura no sistema AR Bio."*

A página `/validar-entrega/:token` exibe: status, tipo de assinatura (badge), número do formulário, data de confirmação, data de assinatura, indicador de ressalvas e hash. Nunca exibe dados sensíveis.

### Campo `validation_url`

A coluna `entrega_comprovantes.validation_url` permanece **null por padrão** porque o banco não conhece o domínio do frontend. A URL pública é montada no frontend via `buildValidationUrl(token)` em `QRCodeComprovante.tsx` como `${origin}/validar-entrega/${validation_token}`. Se futuramente houver configuração oficial de URL base no `configuracoes_sistema`, a RPC poderá passar a preencher `validation_url = app_url || '/validar-entrega/' || validation_token`.

### Indicador de comprovante em Entregas não faturadas

A tela `financeiro/EntregasNaoFaturadas` exibe badge de status do comprovante (pendente, formulário gerado, assinatura digital, anexado, confirmado, dispensado, rejeitado) e botão **"Ver validação"** quando há `validation_token`. Nesta fase o status é **apenas indicativo** — não bloqueia faturamento.

## Embalagens vinculadas (Fase Envase 2.1)

- O diálogo de comprovação de entrega exibe a seção "Embalagens vinculadas à entrega" com resumo (total, reservadas, separadas, entregues, sem etiqueta) e conferência por QR.
- O Formulário de Entrega impresso lista código da embalagem, código da etiqueta, lote, produto, volume e validade.
- Confirmação física das embalagens (`rpc_confirmar_entrega_embalagens`) **não** substitui assinatura/comprovante de recebimento formal — são fluxos independentes.

## Rastreabilidade OS↔lote (jul/2026)

O diálogo de entregas exibe por padrão apenas lotes cuja produção pertence à OS/OP em contexto (badge "✓ origem"). O toggle "Ver todos os lotes" e a seleção de lotes de outras OSs exigem confirmação explícita via AlertDialog e são propagadas para o hook `reservarEstoque` como `overrideOrigem=true`. Ver também `docs/estoque-embalagens.md`.
