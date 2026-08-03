# Produção → Etiquetas pós-envase → Termo de Entrega — Certificação (ciclo 1)

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (marker `STAGING` validado antes de qualquer escrita).
Produção `navfzbwgwzruipouyfnk` **não acessada**. Nada publicado. Forward-only.

## 1. Inventário anterior (Fase 0 — auditoria real)

### Backend já existente (reutilizado, nada duplicado)
| Domínio | Objetos encontrados |
|---|---|
| OS/Programação | `ordens_servico`, `ordens_servico_onfarm`, `programacao_producao`, `production_planning`, `publish_planning_to_lab`, `lab_request_replanning` |
| Lote/CQ | `lotes` (enum `status_lote`: em_producao → aguardando_cq → aprovado/reprovado), `controle_qualidade`, `cq_parametros_referencia`, `fn_cq_aprovado_avanca_os` |
| Envase | `envase` (+ `etiqueta_gerada/etiqueta_id/…`), `fn_validate_envase_cq`, `fn_validate_envase_volume`, `fn_envase_avanca_os`, `rpc_cockpit_registrar_envase_v1` (transacional, idempotente) |
| Etiquetas | `produto_etiquetas`, `produto_etiqueta_eventos`, `rpc_gerar_etiqueta_produto`, `rpc_marcar_etiqueta_impressa`, `rpc_cancelar_etiqueta_produto`, `rpc_validar_rastreio_produto`, `rpc_rastreio_produto_interno` |
| Estoque/Embalagem | `estoque_produto`, `estoque_embalagens`, `estoque_embalagem_movimentacoes`, `rpc_criar_embalagens_pos_envase`, `rpc_reservar_embalagem_entrega`, `rpc_confirmar_separacao_embalagem` |
| Entrega/Termo | `entregas`, `entrega_comprovantes`, `entrega_checklist`, `entrega_ocorrencias`, `entrega_etiquetas`, `entrega_documentos`, `rpc_gerar_formulario_entrega`, `rpc_coletar_assinatura_digital_entrega`, `rpc_anexar_comprovante_entrega`, `rpc_confirmar_recebimento_entrega`, `rpc_dispensar_assinatura_entrega`, `rpc_validar_comprovante_entrega` |
| Financeiro/Fiscal | `fn_generate_receivable_from_entrega`, `fn_sync_entrega_financial_status`, `fn_fiscal_requirement_resolve` |

### Frontend
`CockpitLaboratorio.tsx`, `Lotes.tsx`, `EnvasePage.tsx` (já com `EtiquetaProdutoActions`), `EstoqueEmbalagens.tsx`, `Entregas.tsx`, `entregas/FormularioEntregaPrint.tsx`, `etiquetas/EtiquetaProdutoPrintPage.tsx`, `components/entregas/*` (canvas de assinatura, comprovante, QR).

**Conclusão da Fase 0:** o fluxo pedido → OS → programação → lote → CQ → envase → etiqueta → reserva → entrega → assinatura → rastreio **já existe e é canônico**. Não havia justificativa para criar entidades novas; este ciclo corrigiu defeitos, não criou fluxo paralelo.

### Defeitos críticos/altos identificados
| # | Severidade | Defeito |
|---|---|---|
| D1 | **Crítico** | `rpc_gerar_etiqueta_produto` **não checava o status de CQ do lote** — era possível emitir etiqueta comercial de lote `em_producao`, `aguardando_cq` ou `reprovado`. |
| D2 | Alto | Reimpressão sem motivo obrigatório (`rpc_marcar_etiqueta_impressa` incrementava contador sem justificativa auditável). |
| D3 | Alto | Sem snapshot imutável nem versão de template: alterar cadastro/colunas mudava retroativamente a etiqueta histórica. |
| D4 | Médio | Cancelamento existia, mas **substituição vinculada** não — histórico de sucessão de seriais ausente. |
| D5 | Médio | Ausência de índices por lote/envase/status em `produto_etiquetas`. |

## 2. Alterado neste ciclo

Migração forward-only (staging):
- `produto_etiquetas`: novas colunas `snapshot`, `template_versao`, `cq_liberado`, `lote_status_na_emissao`, `motivo_ultima_reimpressao`, `substitui_etiqueta_id`, `substituida_por_id` (+ FKs autorreferentes, `ON DELETE SET NULL`).
- Trigger `trg_produto_etiquetas_snapshot_immutable`: bloqueia alteração de `snapshot`, `codigo_etiqueta`, `trace_token`, `lote_id`, `lote_codigo`, `template_versao`, `gerada_em`.
- `rpc_gerar_etiqueta_produto` (substituída, mesma assinatura): **gate de CQ** — tipos `principal/reduzida/caixa/transporte` exigem `lotes.status = 'aprovado'`; `interna/amostra` permitidas e gravadas com `cq_liberado=false`. Grava snapshot completo + versão de template + origem da validade.
- `rpc_marcar_etiqueta_impressa(uuid, text)`: reimpressão exige motivo ≥ 3 caracteres; registra em `produto_etiqueta_eventos` e `financial_audit_log`. Overload de 1 argumento removido.
- `rpc_substituir_etiqueta_produto(uuid, text)`: emite substituta vinculada e cancela a anterior (nunca apaga), motivo ≥ 5 caracteres.
- `EXECUTE` revogado de `PUBLIC`/`anon`, concedido a `authenticated`.
- Índices `idx_produto_etiquetas_lote|envase|status`.

Frontend: `src/pages/etiquetas/EtiquetaProdutoPrintPage.tsx` — diálogo de motivo na reimpressão, badges "Cancelada" / "CQ não liberado", bloqueio de impressão de etiqueta cancelada, prevenção de clique duplo.

Artefato de verificação: `restoration/producao-etiquetas/verify.sql`.

## 3. Evidências

`verify.sql` executado em staging — **8/8 gates OK**: marker STAGING, colunas de snapshot, trigger de imutabilidade, gate de CQ, motivo obrigatório na reimpressão, RPC de substituição, ausência de EXECUTE para `anon`, índices.
Typecheck: **PASS**.

Não houve prova E2E de runtime: staging está com `lotes=0`, `envase=0`, `estoque_embalagens=0`, `entregas=0`, `produto_etiquetas=0`. Nenhum dado foi criado (limite de crédito deste ciclo).

## 4. QR Code e rastreio (estado atual, auditado)

`trace_token` é UUID aleatório; QR carrega apenas `/rastrear-produto/{token}`. `rpc_validar_rastreio_produto` respeita `public_trace_enabled` e `trace_expires_at`, retorna etiqueta cancelada como inválida/substituída, e expõe somente produto, lote, volume, fabricação, validade, tipo e situação — **sem** cliente, preço, pedido, UUID interno ou dado financeiro. Sem rate limit dedicado (pendência, ver §6).

## 5. Cleanup

Nenhum harness, usuário efêmero, fixture, token ou arquivo temporário foi criado neste ciclo. Nada a limpar.

## 6. Pendências (fora deste ciclo / exigem validação humana)

1. **Perfil de conformidade/rotulagem versionado** (MAPA, RT/registro profissional, NCM, advertências obrigatórias) — não implementado; a etiqueta ainda usa textos genéricos de conservação/uso e **validade estimada de +6 meses quando não há validade em estoque** (`snapshot.validade_origem='estimada_6_meses'`). **Exige validação de responsável técnico/regulatório antes de uso real.**
2. Serialização unitária por embalagem para etiqueta 1:1 (hoje `estoque_embalagens` já serializa; falta emissão em lote/intervalo e templates térmicos/A4 configuráveis).
3. Rate limit e log de consulta enxuto na rota pública de rastreio.
4. Termo de entrega (Fase 3): já existe assinatura digital + hash + QR; faltam versionamento do template no snapshot, entrega parcial discriminada por item aceito/recusado/pendente e PDF assinado em bucket privado.
5. Harness E2E de runtime (Fase 6) com dados sintéticos e perfis reais.

## 7. Custo e veredito

Ciclo executado dentro do teto de 35 créditos, encerrado em **checkpoint seguro** por limite de orçamento.

**Veredito: APTO COM RESSALVAS** — o furo crítico de emissão de etiqueta sem liberação de CQ está fechado e a trilha de auditoria (snapshot imutável, reimpressão motivada, substituição vinculada) está ativa em staging; permanecem as pendências §6, com destaque para a validação regulatória, e a ausência de prova E2E de runtime.
