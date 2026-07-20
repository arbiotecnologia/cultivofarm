# Etiquetas de Produto Pós-Envase (Fase Envase 1)

## Objetivo
Gerar, imprimir, reimprimir, cancelar e validar publicamente etiquetas dos produtos/bioinsumos AR Bio após o envase, com QR Code para rastreabilidade segura.

## Fluxo
Produção → Lote → CQ → **Envase → Etiqueta** → Estoque/Entrega → Comprovante → Rastreio público.

## Tabelas
- `public.produto_etiquetas` — registro principal da etiqueta (vínculos, dados impressos, trace, controle).
- `public.produto_etiqueta_eventos` — histórico (`etiqueta_gerada`, `etiqueta_impressa`, `etiqueta_reimpressa`, `etiqueta_cancelada`, `etiqueta_substituida`, `qr_validado`, `rastreio_visualizado`).
- `public.entrega_etiquetas` — vínculo N:N entre entregas e etiquetas.
- `public.envase` — recebeu colunas `etiqueta_gerada`, `etiqueta_id`, `etiqueta_gerada_em`, `etiqueta_gerada_por`.

## Código
Sequência `produto_etiqueta_seq` produz códigos no formato `AR-LB-000001`.

## Campos impressos
**Principal (100×60 mm)**: logo AR Bio, "Agricultura Sustentável", produto, protocolo (se houver), lote, volume + unidade, cepas/microrganismos, fabricação, validade, conservação, uso, QR Code, código.

**Reduzida (50×30 mm)**: AR Bio, produto, lote, volume, fabricação, validade, QR Code, código.

**Tipos oficiais de etiqueta** (constraint `produto_etiquetas_tipo_chk`):
- `principal` — etiqueta padrão completa.
- `reduzida` — etiqueta compacta.
- `caixa` — etiqueta de caixa/master.
- `transporte` — etiqueta de transporte/logística.
- `amostra` — etiqueta de amostra/cq.
- `interna` — etiqueta de uso interno.

Client e fazenda **não são impressos por padrão** nesta fase.

Textos padrão:
- Conservação: *"Conservar em local fresco, protegido do sol. Evitar exposição direta ao calor."*
- Uso: *"Utilizar conforme recomendação técnica AR Bio."*
- Rodapé: *"Produto rastreável pelo QR Code. Este rótulo não substitui documento fiscal ou recomendação técnica."*

## QR Code
- Conteúdo: `{origin}/rastrear-produto/{trace_token}` (token UUID v4, não sequencial).
- `qr_code_payload` no banco contém o path; URL completa é montada no frontend via `window.location.origin`.
- `trace_hash` = SHA-256 de `trace_token|codigo_etiqueta` (não é segredo, apenas integridade).

## RPCs

| RPC | Auth | Função |
|---|---|---|
| `rpc_gerar_etiqueta_produto(p_payload jsonb)` | authenticated (admin/gestor/producao/operador_onfarm) | Cria etiqueta, vincula no envase/entrega, registra evento + auditoria. |
| `rpc_marcar_etiqueta_impressa(p_etiqueta_id)` | authenticated (+ administrativo) | Alterna `gerada→impressa→reimpressa`, incrementa contador. |
| `rpc_cancelar_etiqueta_produto(p_etiqueta_id, p_motivo)` | admin/gestor/producao | Motivo obrigatório, **sem DELETE**. |
| `rpc_desvincular_etiqueta_entrega(p_entrega_id, p_etiqueta_id, p_motivo)` | admin/gestor/producao/operador_onfarm | Desvinculação **lógica** (`ativo=false`, sem DELETE). Motivo obrigatório (≥3 chars). Registra evento `etiqueta_substituida` em `produto_etiqueta_eventos` usando coluna `metadata` (não `payload`). Audita em `financial_audit_log` como `LABEL_DELIVERY_UNLINKED` via colunas `performed_by`, `new_data` e `reason` (não usa `user_id`/`payload`). Bucket `produto-etiquetas` permanece privado. EXECUTE concedido apenas a `authenticated`. |
| `rpc_validar_rastreio_produto(p_trace_token)` | **anon** | Retorna apenas dados mínimos seguros. |
| `rpc_rastreio_produto_interno(p_etiqueta_id)` | validado por `can_user_access_produto_etiqueta` | `cliente_produtor` bloqueado. `administrador/gestor/producao/operador_onfarm/administrativo` → `nivel=completo` (com CQ e estoque). `financeiro/consultor_tecnico/tecnico_agronomo` → `nivel=limitado` (sem CQ detalhado e sem estoque). |

## Função de acesso `can_user_access_produto_etiqueta(p_etiqueta_id)`
`SECURITY DEFINER`, `STABLE`, retorna `boolean`. Centraliza visibilidade da etiqueta:

- `administrador`, `gestor`, `producao`, `operador_onfarm`, `administrativo`, `financeiro`: `true`.
- `cliente_produtor`: `true` somente se a etiqueta tiver `cliente_id` vinculado ao usuário em `user_clientes`.
- `consultor_tecnico` / `tecnico_agronomo`: `true` somente se `gerada_por = auth.uid()` **ou** se o `cliente_id` da etiqueta estiver vinculado ao usuário em `user_clientes`. Sem leitura global.
- Demais perfis: `false`.

Usada nas policies `SELECT` de `produto_etiquetas` e `produto_etiqueta_eventos` e dentro de `rpc_rastreio_produto_interno`.

## Dados expostos publicamente (`rpc_validar_rastreio_produto`)
- status (ativo/cancelada/vencido), código, produto, lote, fabricação, validade, volume, unidade, mensagem contextual.

**Não expõe**: cliente, fazenda, contatos, documentos, dados financeiros/custos, CQ detalhado, logs internos, IP do visitante.

## Mensagens públicas
- ativo: "Produto registrado no sistema AR Bio."
- cancelada: "Etiqueta cancelada ou substituída. Confirme com a AR Bio."
- vencido: "Produto com validade expirada. Confirme condições com a AR Bio."
- token inválido: "Etiqueta não encontrada ou indisponível."
- `public_trace_enabled=false`: "Rastreio público desabilitado para esta etiqueta."
- `trace_expires_at` vencido: "Rastreio expirado."

## RLS
- `produto_etiquetas`: gestão (`ALL`) por admin/gestor/producao/operador_onfarm. SELECT mediado por `can_user_access_produto_etiqueta(id)`.
- `produto_etiqueta_eventos`: gestão restrita aos perfis internos; SELECT mediado por `can_user_access_produto_etiqueta(etiqueta_id)`.
- `entrega_etiquetas`: **sem DELETE** (revogado de `authenticated`/`anon`). Policies separadas para SELECT (via função de acesso), INSERT e UPDATE restritos a admin/gestor/producao/operador_onfarm. Desvinculação somente via `rpc_desvincular_etiqueta_entrega` (lógica). Colunas: `ativo`, `desvinculado_em`, `desvinculado_por`, `motivo_desvinculacao`. Queries devem filtrar `ativo = true`.
- Consultor/técnico **não veem** etiquetas de todos os clientes; cliente_produtor segue isolado por `user_clientes`.
- Sem políticas `USING (true)`.

## Storage
Bucket privado **`produto-etiquetas`** (confirmado privado). Preparado para armazenar PDFs/QR de etiquetas em fase futura; acesso somente via signed URL gerada para perfis internos.

## Páginas/rotas
- `/etiquetas/:id/imprimir` — print-friendly (protegida).
- `/rastrear-produto/:token` — pública, chama somente `rpc_validar_rastreio_produto`.

## Integração com Entregas
- `entrega_etiquetas` permite múltiplas etiquetas por entrega.
- Desvínculo é lógico via RPC, mantendo histórico auditável.

## Integração com Financeiro
- Financeiro **visualiza** etiquetas (via função de acesso) mas **não gerencia**.
- Geração de etiqueta **não** cria título financeiro.

## Auditoria
- Eventos em `produto_etiqueta_eventos` (inclui `etiqueta_substituida` para desvínculos).
- Espelho em `financial_audit_log` com `entity_type='produto_etiqueta'` e ações `LABEL_GENERATED`, `LABEL_PRINTED`, `LABEL_REPRINTED`, `LABEL_CANCELLED`, `LABEL_DELIVERY_UNLINKED`.
- Validação pública registra `qr_validado` sem capturar IP.


## Limitações regulatórias
Esta etiqueta é **operacional** e deve ser validada internamente pela AR Bio (e por responsável técnico/regulatório se aplicável) antes de uso comercial definitivo. O QR Code é informativo e não substitui rótulo regulatório, documento fiscal ou recomendação agronômica.

## Alertas futuros (não implementados nesta fase)
`envase_sem_etiqueta`, `etiqueta_nao_impressa`, `etiqueta_cancelada_em_entrega`, `produto_com_validade_vencida_em_estoque`.

## Etiqueta + Embalagem (Fase Envase 2.1)

- Cada etiqueta pode estar vinculada a uma embalagem (`produto_etiquetas.embalagem_id`) e vice-versa (`estoque_embalagens.etiqueta_id`).
- Quando o usuário marca "Gerar etiqueta automaticamente" ao criar embalagens, a etiqueta é **obrigatória**: falha aborta a criação inteira (sem embalagens órfãs).

## Fase Envase 2.2 — origem da etiqueta

A etiqueta de produto pode nascer em três fluxos, todos passando por `rpc_gerar_etiqueta_produto` e mantendo rastreabilidade unificada:

1. **No envase** — geração automática ao criar embalagens com `gerar_etiqueta_automaticamente=true` (`rpc_criar_embalagens_pos_envase`).
2. **Depois, a partir da embalagem** — `GerarEtiquetaEmbalagemDialog` na tela de estoque por embalagem (não pede UUID; preenche payload a partir da embalagem).
3. **Vinculação de etiqueta existente** — `VincularEtiquetaEmbalagemDialog` (renomeado para "Vincular etiqueta existente"). Lista apenas etiquetas do mesmo lote, sem embalagem vinculada e não canceladas. A RPC `rpc_vincular_etiqueta_embalagem` rejeita etiqueta cancelada ou já vinculada a outra embalagem ativa.
