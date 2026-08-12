# Fase 1 — Auditoria do comprovante de entrega (AR Bio)

Ambiente: staging `ikaauvsflpmamgxmkhoq` (produção não tocada). Somente leitura nesta fase.

## 0. Contaminação visual e binding

- `src/routes/index.tsx`: placeholder inerte, sem texto de prompt. OK.
- `src/integrations/supabase/types.ts`: encontrado truncado (155 linhas); restaurado de `7c56c377` com 21.850 linhas.
- `.env`: reapontado para o projeto de staging `ikaauvsflpmamgxmkhoq` (mesma origem de commit).

## 1. Gerador atual do PDF (estado pré-Fase 2)

- Arquivo: `src/lib/reciboEntregaPdf.ts` (removido na Fase 2).
- Montagem 100% no frontend a partir da linha carregada em `src/pages/Entregas.tsx`; nenhum snapshot persistido.
- Numeração do documento derivada de `id.slice(0, 8)` (ex.: `B7CCE937`) — não sequencial, não auditável, não legível para o produtor.
- Sem distinção entre entrega pendente e entrega confirmada: o mesmo papel era emitido como se fosse comprovante.
- Emitente/destinatário lidos parcialmente do cliente atual; qualquer alteração de cadastro reescrevia retroativamente o documento já entregue.
- Reemissão não registrada.

## 2. Infraestrutura já existente aproveitável

- `public.entrega_formulario_seq` + `rpc_gerar_formulario_entrega` (padrão de numeração canônica).
- `public.entrega_termos` e `fn_entrega_build_snapshot_v1` (padrão de snapshot).
- `public.company_fiscal_settings` como fonte do emitente.
- `public.produto_etiquetas` como fonte real de produto/lote/cepas.

## 3. Achados de segurança

- `public.entrega_comprovantes`: role `anon` com grants de DML excedentes.
- Ausência de motor server-side: regra "romaneio x comprovante" era decidida no cliente, portanto burlável.

## 4. Veredito

**FASE_1_APTA** — auditoria concluída, lacunas mapeadas e endereçáveis por migração incremental com rollback. Autorizado avançar para a Fase 2.
