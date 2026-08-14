# FASE 28B — Auditoria detalhada e somente-leitura do motor de estoque AR Bio

Escopo desta fase: auditoria estática por leitura de código, documentação e teste
de contrato. **Nenhuma** alteração de banco, migration, RLS, RPC, Edge Function,
carrinho, pedido B2B, portais, precificação, catálogo, aprovação técnica ou
frontend funcional. Nenhuma biblioteca nova. Nenhuma query de escrita.

## 1. Auditoria da Fase 28A — **28A CERTIFICADA**

| Item auditado | Resultado |
| --- | --- |
| `docs/auditorias/ar-bio-pos-catalogo-fase28a-mapa-proxima-frente.md` existe | OK |
| Relatório 28A registra "27E CERTIFICADA" | OK (seção 1) |
| `docs/auditorias/catalogo-fase27e-certificacao-final.md` conclui "FINALIZADA E APTA" | OK |
| Próxima frente recomendada = Estoque/Volumes — blindagem do motor de estoque | OK (status final da 28A) |
| Prompts 28B, 28C e 28D presentes no relatório 28A | OK |
| Migration nova na 28A | Nenhuma (última segue `20260905000000_hardening_digest_schema_v1.sql`) |
| `src/test/catalogo/catalogo-fase28a-pos-certificacao.test.ts` passa | OK (11 PASS) |
| Binding staging | Drift detectado no início desta fase (`.env` e `types.ts` regenerados para sandbox); restaurados ao baseline `c75bb87f` (staging `ikaauvsflpmamgxmkhoq`, `types.ts` com 21.850 linhas) antes de qualquer validação |

Conclusão: **28A ÍNTEGRA**, sem falha crítica ou alta. Auditoria de estoque liberada.

## 2. Mapa de arquivos auditados

Motor e biblioteca
- `src/lib/estoque/motorEstoque.ts` (122 linhas) — motor canônico de movimentação.

Componentes de estoque (`src/components/estoque/`)
- `ReservaDialog.tsx` (695), `ReservarEmbalagemEntregaDialog.tsx` (97),
  `MotivoEmbalagemDialog.tsx` (43), `EmbalagemMovimentacoesTimeline.tsx` (51),
  `EstoqueBI.tsx` (147), `CriarEmbalagensPosEnvaseDialog.tsx`,
  `EmbalagensEntregaPanel.tsx`, `EmbalagemEstoqueCard.tsx`,
  `EmbalagemStatusBadge.tsx`, `ConferenciaEmbalagemQR.tsx`, `HistoricoSheet.tsx`,
  `GerarEtiquetaEmbalagemDialog.tsx`, `GerarEtiquetasLoteDialog.tsx`,
  `VincularEtiquetaEmbalagemDialog.tsx`.

Cockpit/produção (`src/components/cockpit/`)
- `reservaCalc.ts` + `reservaCalc.test.ts`, `ReservarEstoqueDialog.tsx` (363),
  `RegistrarEnvaseDialog.tsx`, `GerarLoteDialog.tsx`, `RegistrarCQDialog.tsx`,
  `ProducaoResumoTab.tsx`, `ComposicaoProducaoCard.tsx` + `composicaoCalc.ts`,
  `FinalizarOSButton.tsx`, `EsteiraStepper.tsx`.

Entregas (`src/components/entregas/`, `src/pages/Entregas.tsx`)
- `SeletorLoteEnvasado.tsx` (186), `ConfirmarEntregaDialog.tsx`,
  `RegistrarEntregaDialog.tsx`, `ConfirmacaoEntregaPanel.tsx`,
  `TermoEntregaPanel.tsx`, `EntregaComprovantePanel.tsx`,
  `EntregaChecklistPanel.tsx`, `EntregaOcorrenciasPanel.tsx`,
  `PreviewDocumentoEntrega.tsx`.

Hooks
- `src/hooks/useEsteiraLaboratorio.ts` (orquestrador da esteira),
  `src/hooks/useEmbalagensPorItem.ts`, `src/hooks/useCatalogoVolumes.ts`,
  `src/hooks/usePendenciasEsteira.ts`.

Migrations relevantes (somente leitura)
- `20260827000000_envase_acao_canonica.sql` (ação canônica de envase e escrita
  em `estoque_movimentacoes` dentro de `rpc_cockpit_registrar_envase_v1`);
- `20260831020000_envase_cq_trigger_determinismo.sql`;
- `20260630185955_*.sql`, `20260804024341_*.sql`, `20260804024430_*.sql`
  (definições/evoluções de `reservar_estoque_item`).

## 3. Funções puras versus efeitos colaterais

Puras (determinísticas, sem I/O — candidatas naturais a congelamento na 28C)
| Função | Arquivo | Contrato observado |
| --- | --- | --- |
| `chaveIdempotencia(...partes)` | `motorEstoque.ts:82` | junta partes não vazias com `:` |
| `mensagemErroEstoque(err)` | `motorEstoque.ts:104` | extrai `ESTQ_[A-Z_]+` e mapeia para mensagem PT-BR; fallback = mensagem crua |
| `EstoqueMotorError.codigo/isConflito/isPermissao` | `motorEstoque.ts:66` | classificação de erro por código |
| `fmtEmb(item)` | `reservaCalc.ts` | `q× v/q L`, `q un` ou `—` |
| `computeTotals(selected, qtys)` | `reservaCalc.ts` | soma un e litros pró-rata `q*vol/qtdTotal` |
| `findInvalidIds(selected, qtys)` | `reservaCalc.ts` | inválido se vazio, NaN, `<=0` ou `> quantidade` |
| `clampQty(value, max)` | `reservaCalc.ts` | limita a `[1, max]`, preserva `""` |
| `formatVolumeLabel`, `precoPorLitro`, `valorDose100ml`, `dosesPorVolume`, `formatPrecoLitro`, `formatDose100ml` | `useCatalogoVolumes.ts` | conversões mL→L, dose = `volume_ml/100` quando `doses_por_volume` ausente |

Efeitos colaterais (I/O Supabase)
| Ponto | Arquivo | Natureza |
| --- | --- | --- |
| `operarEstoque` → `rpc_estoque_operar_v1` | `motorEstoque.ts:86` | única via canônica de saldo/reserva |
| `reservarEstoque` → `reservar_estoque_item` | `useEsteiraLaboratorio.ts:450` | reserva do cockpit (via legada, ver risco A1) |
| `rpc_cockpit_gerar_lote_v1`, `rpc_cockpit_registrar_envase_v1`, `rpc_cockpit_cancelar_reserva_v1`, `rpc_cockpit_criar_entrega_v1`, `rpc_cockpit_confirmar_entrega_v1`, `rpc_avancar_esteira_laboratorio`, `rpc_programar_os_v1`, `rpc_validar_integridade_esteira` | `useEsteiraLaboratorio.ts` | motores transacionais da esteira |
| `rpc_reservar_embalagem_entrega` | `ReservarEmbalagemEntregaDialog.tsx:47` | reserva de embalagem para entrega |
| `rpc_criar_embalagens_pos_envase`, `rpc_gerar_etiqueta_produto`, `rpc_vincular_etiqueta_embalagem`, `rpc_gerar_etiquetas_embalagens_lote`, `rpc_ler_embalagem_por_qr` | componentes de estoque | ciclo de embalagem/etiqueta |
| `rpc_entrega_confirmar_v1` e família `rpc_entrega_*` / `rpc_*_entrega` | componentes de entregas | ciclo de entrega/termo/comprovante |
| `SELECT` diretos em `estoque_produto`, `estoque_embalagem_movimentacoes`, `envase`, `lotes`, `entregas`, `partner_orders` | `ReservaDialog`, `ReservarEstoqueDialog`, `EstoqueBI`, `EmbalagemMovimentacoesTimeline`, `SeletorLoteEnvasado` | leitura para UI (não altera saldo) |

Observação: os `SELECT` diretos são leitura e não violam a guarda de escrita
`fn_estoque_produto_guard`; a mutação de saldo permanece server-side.

## 4. RPCs e ações canônicas

`rpc_estoque_operar_v1` (contrato tipado em `motorEstoque.ts`):
- Ações: `reserva`, `cancelamento_reserva`, `expedicao`, `entrega`,
  `estorno_expedicao`, `ajuste`, `perda`, `descarte`, `devolucao`.
- Referências: `entrega`, `ordem_servico`, `ordem_servico_onfarm`,
  `partner_order`, `envase`, `lote`, `manual`, `sistema`.
- Retorno inclui `replay`, `saldo_anterior/posterior`, `reservado_anterior/posterior`,
  `status_anterior/novo` — ou seja, **idempotência é first-class** via
  `p_idempotency_key`.
- Códigos de erro cobertos: `ESTQ_SEM_PERMISSAO`, `ESTQ_ESCOPO_INVALIDO`,
  `ESTQ_SALDO_INSUFICIENTE`, `ESTQ_IDEMPOTENCY_CONFLITO`, `ESTQ_ESTORNO_DUPLICADO`,
  `ESTQ_ESTORNO_DE_ESTORNO`, `ESTQ_MOTIVO_OBRIGATORIO`, `ESTQ_APROVACAO_REQUERIDA`,
  `ESTQ_UPDATE_DIRETO_BLOQUEADO`, `ESTQ_DEVOLUCAO_CQ`, `ESTQ_DEVOLUCAO_VALIDADE`.

Consumidores atuais do motor canônico: **apenas** `src/pages/Entregas.tsx`
(`entrega-expedicao` na criação e `entrega-estorno` no estorno), ambos com chave
de idempotência determinística.

Vias paralelas ainda em uso (não canônicas pelo motor, mas server-side):
`reservar_estoque_item`, `rpc_cockpit_cancelar_reserva_v1`,
`rpc_reservar_embalagem_entrega`, `rpc_cockpit_registrar_envase_v1`
(este último grava diretamente em `estoque_movimentacoes` com `acao`/`status_novo`).

Nomenclatura de movimentação de embalagem usa vocabulário próprio
(`reserva_entrega`, `separacao_entrega` em `EmbalagemMovimentacoesTimeline.tsx`),
distinto das ações do motor — duplicidade de nomenclatura documentada abaixo.

## 5. Unidades e conversões encontradas

- `estoque_produto`: `quantidade` (unidades/embalagens) + `volume_total` (litros).
- Volume unitário derivado: `volume_total / quantidade` (`fmtEmb`).
- Total em litros pró-rata: `q * volume_total / quantidade` (`computeTotals`).
- Catálogo: `volume_ml`; litros = `volume_ml/1000`; dose 100 mL =
  `doses_por_volume ?? volume_ml/100`.
- Catálogo comercial: produto em `hectare`, microrganismo em `dose_100ml`
  (contrato preservado do Catálogo, fora do escopo desta frente).
- Vasilhame/embalagem: contagem inteira de unidades (`un`), sem conversão.

## 6. Integração com cockpit/produção

Cadeia: `programacao_producao` → `lotes` (`rpc_cockpit_gerar_lote_v1`) → `envase`
(`rpc_cockpit_registrar_envase_v1`, que cria `estoque_produto` e registra
`estoque_movimentacoes`) → reserva (`reservar_estoque_item` via
`ReservarEstoqueDialog`/`ReservaDialog`) → entrega.

Cálculo de reserva (frontend): `ReservarEstoqueDialog` lê itens do lote com
`status = disponivel` ou já reservados para a mesma OS, inicializa quantidades
com o saldo do item, valida com `findInvalidIds`/`clampQty` e envia item a item.
Guarda de rastreabilidade: `reservarEstoque` confere se o lote pertence à OS,
salvo `overrideOrigem` explícito; falha da checagem apenas emite `console.warn`
(não bloqueia).

Divergência frontend × SQL: a validação `q > quantidade` é feita no cliente sobre
um snapshot em cache; a decisão final de saldo é do servidor. Não há evidência de
saldo negativo possível pelo cliente, mas o cliente pode exibir disponibilidade
desatualizada.

## 7. Integração com entregas/comprovante

- `SeletorLoteEnvasado` exibe `status`, `_saldo` e `_saldo_reserva`, destacando
  reserva fora do escopo da OS (`reservado_para_os_id !== highlightForaEscopoOsId`).
- `Entregas.tsx` é o único ponto que chama o motor canônico: expedição na criação
  (`chaveIdempotencia("entrega-expedicao", entregaId)`) e estorno
  (`chaveIdempotencia("entrega-estorno", id)`).
- Confirmação de entrega: `rpc_entrega_confirmar_v1` (`ConfirmarEntregaDialog`).
- Comprovante/romaneio: `rpc_entrega_gerar_termo_v1`, `rpc_anexar_comprovante_entrega`,
  snapshot imutável já certificado nas Fases 2/3 do comprovante — inalterado aqui.

## 8. Riscos por prioridade

Crítico
- Nenhum risco crítico comprovado nesta auditoria estática. A guarda de banco
  `fn_estoque_produto_guard` impede UPDATE direto de saldo, e as mutações
  observadas são todas server-side.

Alto
- **A1 — Duas vias de reserva.** Cockpit usa `reservar_estoque_item` sem chave de
  idempotência, enquanto o motor canônico (`rpc_estoque_operar_v1`, ação
  `reserva`) suporta `p_idempotency_key`. Repetição de clique/retry de rede pode,
  em tese, gerar reserva duplicada. Mitigação atual: flag `submitting` na UI.
- **A2 — Reserva item a item em laço.** `ReservarEstoqueDialog` chama
  `reservarEstoque` por item sequencialmente; falha no meio deixa reserva parcial
  sem compensação transacional.

Médio
- **M1 — Guarda de origem silenciosa.** Exceção na verificação lote↔OS apenas
  registra `console.warn` e segue, degradando a rastreabilidade.
- **M2 — Nomenclatura dupla.** Movimentação de embalagem (`reserva_entrega`,
  `separacao_entrega`) não usa o vocabulário do motor (`reserva`, `expedicao`).
- **M3 — Validação de saldo baseada em cache.** `ReservarEstoqueDialog` valida
  contra snapshot React Query; `ReservaDialog` mitiga relendo `estoque_produto`.

Baixo
- **B1 — Ausência de testes dedicados** para `motorEstoque.ts` e para as
  conversões de `useCatalogoVolumes.ts` (apenas `reservaCalc.test.ts` existe).
- **B2 — `motivo` obrigatório** existe no banco (`ESTQ_MOTIVO_OBRIGATORIO`) mas
  o `MotivoEmbalagemDialog` valida somente `length >= 3` no cliente.
- **B3 — Uso de `as any`** nas chamadas RPC de estoque, perdendo tipagem gerada.

## 9. Invariantes a congelar por teste na Fase 28C

1. Saldo nunca negativo: nenhuma via de UI pode enviar quantidade `<= 0` nem
   maior que a disponível conhecida (`findInvalidIds`, `clampQty`).
2. Reserva não excede o disponível: `clampQty(v, max)` sempre retorna `<= max`
   e `>= 1`, preservando `""`.
3. Liberação não excede o reservado: `cancelamento_reserva` é ação canônica e o
   cockpit usa `rpc_cockpit_cancelar_reserva_v1` (validação server-side).
4. Conversões determinísticas: `volume_ml/1000` para litros,
   `doses_por_volume ?? volume_ml/100` para doses, `q*vol/qtdTotal` para litros
   pró-rata, `fmtEmb` estável para casos inteiros e fracionários.
5. Ações canônicas: o conjunto `EstoqueAcao` permanece exatamente com as 9 ações
   listadas; nenhuma ação nova/renomeada sem migration correspondente.
6. `EstoqueReferenciaTipo` permanece com os 8 tipos listados.
7. Códigos de erro `ESTQ_*` mapeados em `mensagemErroEstoque` cobrem os 11
   códigos conhecidos e o fallback devolve a mensagem original.
8. `chaveIdempotencia` é determinística, ignora `null`/`undefined`/`""` e usa `:`.
9. Operações críticas passam por RPC: nenhum componente de estoque executa
   `.update(`/`.insert(`/`.delete(` em `estoque_produto`.
10. Idempotência de entrega: `Entregas.tsx` mantém as chaves
    `entrega-expedicao` e `entrega-estorno`.
11. Proteção contra clique duplo: diálogos de reserva/entrega mantêm estado de
    `submitting`/`disabled` no botão de confirmação.
12. Motivo obrigatório: `MotivoEmbalagemDialog` mantém bloqueio para motivo curto.

## 10. Plano de correção seguro (proposta, não executada)

1. Congelar por teste (28C) todas as funções puras e o contrato de ações —
   risco zero, sem mudança de runtime.
2. Endereçar A1 apenas se a 28C comprovar o defeito: adicionar chave de
   idempotência determinística à chamada de reserva do cockpit, sem trocar a RPC
   e sem migration.
3. Endereçar A2 com relatório de resultado parcial na UI (feedback), sem alterar
   a semântica da reserva.
4. M1: promover a falha da guarda de origem a bloqueio explícito — requer
   decisão humana, pois muda comportamento.
5. M2/M3/B1-B3: documentação e testes; qualquer unificação de nomenclatura
   depende de migration e fica fora desta frente.

## 11. Prompt pronto para a Fase 28C (NÃO executar nesta execução)

```text
FASE 28C — Blindagem por testes do motor de estoque AR Bio

Auditar antes a Fase 28B aplicada no commit atual (relatório
docs/auditorias/estoque-fase28b-auditoria.md e teste
src/test/estoque/estoque-fase28b-auditoria.test.ts). Só prosseguir se 28B estiver
íntegra.

Escopo permitido: criar testes unitários e de contrato para o motor de estoque e,
se e somente se a 28B apontar defeito comprovado, corrigir esse defeito
pontualmente em lógica pura/frontend. Proibido: nova tabela, migration, RLS, RPC,
Edge Function, alteração de carrinho, pedido B2B, portais, precificação, catálogo,
nova biblioteca e fluxo paralelo.

Implementar:
- src/test/estoque/motor-estoque-fase28c.test.ts congelando as invariantes 1–12
  da seção 9 do relatório 28B (chaveIdempotencia, mensagemErroEstoque,
  EstoqueMotorError, EstoqueAcao, EstoqueReferenciaTipo, clampQty, computeTotals,
  findInvalidIds, fmtEmb, conversões de useCatalogoVolumes);
- teste de contrato estático garantindo ausência de update/insert/delete em
  estoque_produto nos componentes e a permanência das chaves
  "entrega-expedicao" e "entrega-estorno" em src/pages/Entregas.tsx;
- docs/auditorias/estoque-fase28c-blindagem.md com antes/depois e rollback.

Validar: connection-binding.static.test.ts, typecheck, testes de estoque, cockpit,
entregas, catálogo/navegação, suíte completa e build. Não executar a 28D.
```

## 12. Rollback

Esta fase adicionou apenas dois arquivos:
- `docs/auditorias/estoque-fase28b-auditoria.md`;
- `src/test/estoque/estoque-fase28b-auditoria.test.ts`.

Rollback = remover esses dois arquivos. `.env` e `src/integrations/supabase/types.ts`
foram restaurados ao baseline `c75bb87f`; nenhuma outra alteração de runtime,
banco, migration, RLS ou RPC foi introduzida.

## 13. Status final

**FASE 28B APLICADA COM SUCESSO — AUDITORIA DE ESTOQUE CONCLUÍDA E 28A CERTIFICADA.**

Nenhum risco crítico comprovado. Riscos altos A1 e A2 documentados para decisão
humana antes da 28C. A Fase 28C não foi executada.
