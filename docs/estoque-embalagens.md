# Estoque por Embalagem Etiquetada (Fase Envase 2)

## Objetivo
Rastrear cada embalagem física pós-envase desde a entrada em estoque até a entrega ao cliente, vinculando lote, etiqueta, reserva, separação e entrega.

## Fluxo
Produção → CQ → Envase → **Embalagem → Etiqueta → Estoque → Reserva → Separação → Entrega física** → Comprovante (assinatura) → Rastreio.

> **Importante**: confirmação física da embalagem (status `entregue`) ≠ confirmação formal de recebimento. O recebimento formal continua no fluxo de `entrega_comprovantes` com assinatura digital/física e QR Code da entrega.

## Tabelas

### `public.estoque_embalagens`
Cada linha representa **uma** embalagem física. Status possíveis:
`em_estoque`, `reservado`, `separado`, `entregue`, `cancelado`, `descartado`, `vencido`, `bloqueado_cq`, `bloqueado_operacional`.

Código: `AR-EMB-000001` (sequence `estoque_embalagem_seq`).

### `public.estoque_embalagem_movimentacoes`
Histórico imutável. Tipos:
`entrada_estoque`, `etiqueta_vinculada`, `reserva_entrega`, `separacao_entrega`, `entrega_confirmada`, `cancelamento`, `descarte`, `bloqueio`, `desbloqueio`, `ajuste_manual`, `leitura_qr`, `divergencia_qr`.

### Alterações
- `produto_etiquetas.embalagem_id` (FK).
- `entregas.separacao_status` (`pendente`, `parcialmente_separada`, `separada`, `divergente`, `cancelada`), `separacao_confirmada_em`, `separacao_confirmada_por`.

## Funções de acesso
- `can_user_access_estoque_embalagem(id)`:
  - admin/gestor/produção/operador_onfarm/administrativo → leitura total.
  - financeiro → somente embalagens vinculadas a entrega.
  - consultor/técnico → somente embalagens de clientes em `user_clientes`.
  - cliente_produtor → somente `status='entregue'` do próprio cliente.
- `can_user_manage_estoque_embalagem(id)`: admin/gestor/produção/operador_onfarm.

## RLS
- `estoque_embalagens`: SELECT via função de acesso; INSERT/UPDATE só para perfis internos de gestão.
- `estoque_embalagem_movimentacoes`: SELECT via função; INSERT só interno.
- **Sem DELETE em nenhuma das tabelas.**

## RPCs

| RPC | Perfis | Função |
|---|---|---|
| `rpc_criar_embalagens_pos_envase(payload)` | admin/gestor/prod/op_onfarm | Cria N (1–500) embalagens; pode gerar etiqueta automática |
| `rpc_vincular_etiqueta_embalagem(emb, etq)` | idem | Bloqueia duplicidade/cancelada/embalagem encerrada |
| `rpc_reservar_embalagem_entrega(emb, entrega, item?)` | idem | Bloqueia vencidas/encerradas; recalcula separação |
| `rpc_confirmar_separacao_embalagem(emb)` | idem + administrativo | Exige status `reservado` |
| `rpc_confirmar_entrega_embalagens(entrega)` | idem | Marca embalagens reservadas/separadas como `entregue`; não toca financeiro/comprovante |
| `rpc_cancelar_embalagem(emb, motivo)` | idem | Motivo ≥3, bloqueia se já entregue, sem DELETE |
| `rpc_descartar_embalagem(emb, motivo)` | idem | Idem |
| `rpc_ler_embalagem_por_qr(codigo)` | qualquer autenticado com acesso | Aceita código embalagem, código etiqueta ou trace_token |
| `rpc_recalcular_separacao_entrega(entrega)` | autenticado | Recalcula `separacao_status` |

Todas as RPCs registram em `financial_audit_log` (`entity_type='estoque_embalagem'`).

## Conferência por QR
Componente `ConferenciaEmbalagemQR` aceita leitura via scanner/teclado (sem câmera obrigatória nesta fase). Informa se a embalagem pertence à entrega atual.

## Integrações
- **Envase**: botão "Criar embalagens" abre dialog; opção gerar etiquetas automáticas.
- **Entregas**: painel `EmbalagensEntregaPanel` permite reservar, separar e confirmar entrega física.
- **Comprovante**: lista códigos de embalagem/etiqueta entregues (sem alterar assinatura formal).
- **Financeiro**: somente leitura; nenhuma alteração de título financeiro.

## Alertas futuros (não implementados)
`embalagem_sem_etiqueta`, `embalagem_vencida_em_estoque`, `entrega_com_embalagem_nao_separada`, `divergencia_conferencia_qr`, `embalagem_reservada_sem_entrega`.

## Princípios de segurança
- Sem `USING (true)`.
- Sem DELETE destrutivo (cancelamento/descarte lógicos).
- Cliente produtor não vê estoque interno.
- QR interno respeita permissão; rastreio público continua via `rpc_validar_rastreio_produto` da etiqueta.

## Fase Envase 2.1 — Consolidação operacional

- Criação de embalagens preenche automaticamente `produto_id` a partir do lote quando não informado; se ainda assim ausente, registra `metadata.produto_id_nao_identificado=true` e devolve warning.
- Geração automática de etiqueta deixou de ser silenciosa: se `gerar_etiqueta_automaticamente=true` e a etiqueta falhar, toda a operação é revertida com mensagem clara ("Falha ao gerar etiqueta automática para a embalagem...").
- Reserva para entrega passa a usar seleção de entrega (sem digitar UUID), exibindo número/cliente/fazenda/data/status.
- Página `Estoque de Embalagens` operacionaliza ações: imprimir/abrir etiqueta, vincular/gerar etiqueta, copiar QR, reservar, cancelar e descartar (motivo obrigatório).
- Entrega física via `rpc_confirmar_entrega_embalagens` agora registra `status_anterior` corretamente por embalagem; não substitui o recebimento formal (assinatura/comprovante).
- `rpc_recalcular_separacao_entrega`: pendente → parcialmente_separada → separada conforme reservadas/separadas/entregues.
- Conferência por QR dentro da entrega indica se a embalagem pertence, é divergente, está sem entrega vinculada, já entregue ou vencida.

## Fase Envase 2.2 — Integridade relacional + geração de etiqueta por embalagem

### Foreign keys adicionadas em `public.estoque_embalagens`
- `fk_estoque_embalagens_lote` → `public.lotes(id)` (ON DELETE RESTRICT)
- `fk_estoque_embalagens_produto` → `public.produtos(id)` (ON DELETE SET NULL)
- `fk_estoque_embalagens_envase` → `public.envase(id)` (ON DELETE SET NULL)
- `fk_estoque_embalagens_cliente` → `public.clientes(id)` (ON DELETE SET NULL)
- `fk_estoque_embalagens_fazenda` → `public.fazendas(id)` (ON DELETE SET NULL)
- `fk_estoque_embalagens_entrega` → `public.entregas(id)` (ON DELETE SET NULL)

Em `public.produto_etiquetas`:
- `fk_produto_etiquetas_embalagem` → `public.estoque_embalagens(id)` (ON DELETE SET NULL)

Constraints adicionadas com `NOT VALID` e validadas em seguida (auditoria não encontrou registros inconsistentes). Caso surjam dados legados inconsistentes em outros ambientes, mantenha `NOT VALID` e gere relatório de correção — novos `INSERT/UPDATE` já são validados pelo Postgres.

`public.entrega_itens` não existe nesta fase, portanto nenhuma FK foi criada para `entrega_item_id`.

### Validação reforçada em `rpc_criar_embalagens_pos_envase`
A função agora bloqueia criação se `lote_id`, `produto_id`, `envase_id`, `cliente_id` ou `fazenda_id` informados não existirem. Mensagens de erro indicam o ID rejeitado.

### Geração de etiqueta por embalagem
- Novo componente `GerarEtiquetaEmbalagemDialog`: lê dados da embalagem (lote, produto, envase, cliente, fazenda, volume, unidade), chama `rpc_gerar_etiqueta_produto` com payload pronto e em seguida `rpc_vincular_etiqueta_embalagem`. Usuário não precisa digitar UUID.
- Os tipos de etiqueta disponíveis seguem a constraint oficial do módulo de etiquetas: `principal`, `reduzida`, `caixa`, `transporte`, `amostra`, `interna`.
- `VincularEtiquetaEmbalagemDialog` agora é "Vincular etiqueta existente": exibe Select de etiquetas do mesmo lote, sem embalagem vinculada e não canceladas.
- No card de embalagem, quando sem etiqueta aparecem dois botões: **Gerar etiqueta** (principal) e **Vincular existente** (secundário). Quando já existe etiqueta, aparecem **Ver etiqueta** e **Rastrear** (abre `/rastrear-produto/{trace_token}`).

## Rastreabilidade OS↔lote (jul/2026)

Toda reserva (aba Entregas, diálogo Estoque e cockpit) valida se o lote pertence à OS/OP informada — cadeia `lotes.programacao_id → programacao_producao.ordem_servico_id/ordem_servico_onfarm_id`. Se divergir, o operador precisa confirmar override explícito num AlertDialog; a ação é registrada em `laboratorio_esteira_eventos` com a observação "Reserva com OVERRIDE de origem". Sem override, o hook `useEsteiraLaboratorio.reservarEstoque` bloqueia a chamada mesmo se a UI perder o filtro.
