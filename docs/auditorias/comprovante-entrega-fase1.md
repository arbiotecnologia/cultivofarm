# Fase 1 — Auditoria do gerador do comprovante de entrega (AR Bio)

Ambiente: staging `ikaauvsflpmamgxmkhoq` (produção `navfzbwgwzruipouyfnk` intocada). Nada publicado. Sem SEFAZ.
HEAD inicial da apuração: `87a9281f` · HEAD de trabalho desta rodada: `33b22156`.

## 1. Higiene do ambiente

- `src/routes/index.tsx`: placeholder inerte, sem texto de prompt (contaminação da edição visual revertida).
- `src/integrations/supabase/types.ts`: encontrado truncado (155 linhas) em duas ocasiões; restaurado de `7c56c377` com 21.850 linhas.
- `.env`: reapontado ao projeto de staging `ikaauvsflpmamgxmkhoq` (contract test de binding passa).

## 2. Fluxo anterior (pré-Fase 2)

Arquivo `src/lib/reciboEntregaPdf.ts` (removido na Fase 2):

- Montagem 100% no frontend a partir da linha de `entregas` carregada em `src/pages/Entregas.tsx`.
- Nenhum snapshot persistido: o documento era recalculado a cada emissão a partir do cadastro corrente.
- Numeração derivada de `id.slice(0,8)` (ex.: `B7CCE937`) — não sequencial, não auditável.
- Sem distinção entre entrega pendente e confirmada: emitia como comprovante um papel sem valor de recebimento.
- Regras de completude (produto, lote, quantidade) no cliente, portanto burláveis.
- Reemissão não registrada em lugar algum.

## 3. Infraestrutura reaproveitável identificada

| Objeto | Uso |
| --- | --- |
| `public.entregas` | Fonte da entrega, status, transporte e recebimento |
| `public.entrega_comprovantes` (`metadata jsonb`) | Persistência do snapshot e da numeração |
| `public.entrega_termos` | Documentos de termo já existentes |
| `public.entrega_formulario_seq` / `rpc_gerar_formulario_entrega` | Padrão de numeração canônica |
| `public.company_fiscal_settings` | Emitente |
| `public.entrega_etiquetas` + `public.produto_etiquetas` | Itens canônicos (produto, lote, volume, cepas `text[]`) |
| `public.ordens_servico` e `public.ordens_servico_onfarm` | Vínculo de OS (dois fluxos legítimos) |
| `public.is_delivery_staff(uuid)` | Autorização de perfil |

## 4. Problemas encontrados

1. `anon` com grants de DML em `entrega_comprovantes` / `entrega_termos`.
2. Ausência de motor server-side: a decisão romaneio × comprovante era do cliente.
3. Sem snapshot: alteração de cadastro reescrevia documento já entregue.
4. Numeração não auditável.
5. Nenhum registro de reemissão.

## 5. Veredito

**FASE_1_APTA** — lacunas mapeadas, todas endereçáveis por migração incremental com rollback, sem criar tabela paralela. Autorizada a Fase 2.
