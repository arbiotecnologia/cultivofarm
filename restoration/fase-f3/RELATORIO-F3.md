# FASE F3 — Prontidão fiscal do emitente/destinatário, operação e cálculo tributário (NF-e 55)

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** · Produção `navfzbwgwzruipouyfnk` **NÃO ACESSADA** · **NÃO PUBLICADO**.

## Migrations aplicadas

| Versão | Arquivo canônico | MD5 (arquivo = ledger) |
| --- | --- | --- |
| 20260816000000 | `supabase/migrations/20260816000000_fase_f3_prontidao_calculo_nfe.sql` | `6935cf0188f04894d278cba2ff4fa673` |
| 20260816010000 | `supabase/migrations/20260816010000_fase_f3_politica_unicidade_destino.sql` | `19cea11d48957541bf4f801f2a9480de` |

Ledger: **634 versões** (local = remoto, sem drift).

### Conteúdo de 20260816010000 (correções descobertas no harness)

1. `fop_active_uq` recriado incluindo `origin_uf`, `destination_uf`, `document_model`,
   `taxpayer_indicator` e `final_consumer` — o índice legado impedia políticas
   concorrentes GO→GO (CFOP 5101) e GO→SP (CFOP 6101) na mesma vigência.
2. Trigger `trg_fiscal_invoice_sync_normalized_status` — documentos F3 nasciam com
   `normalized_status` nulo e o guard de itens bloqueava a montagem do rascunho.
3. `rpc_fiscal_calculate_invoice_v1` — `kinds || 'IPI'` era lido como literal de array
   (`malformed array literal`); agora com cast textual explícito.
4. `rpc_fiscal_reserve_nfe_number_v1` — `gen_random_bytes` qualificado como
   `extensions.gen_random_bytes` e cNF convertido para `text` antes de `lpad`.

## Verificações executadas

| Gate | Resultado |
| --- | --- |
| `restoration/fase-f3/postcheck.sql` — gates estáticos | **52/52 PASS** |
| `restoration/fase-f3/postcheck.sql` — provas transacionais | **8/8 PASS** (revertidas) |
| `restoration/fase-f3/runtime-harness.sql` — casos autenticados | **30/30 PASS** (fixtures revertidas) |
| `bunx tsgo --noEmit` | limpo |
| `bunx vitest run` | 2744 passed, 4 skipped (168 arquivos) |
| `bun run build` | PASS |

Cobertura do harness: CNPJ/IE/CPF, CRT, série 1..999, cMun × UF, certificado,
validação contábil com SoD, destinatário PJ/PF, CFOP por operação e destino,
imutabilidade de política publicada, regra tributária com fonte oficial obrigatória,
override de SoD auditado e de uso único, bloqueio de emissão para pedido em análise,
ausência de regra nunca vira zero/isento silencioso, cálculo server-side com snapshot
imutável e idempotência, chave de acesso de 44 dígitos com DV correto, unicidade
NF-e por escopo, RLS/RBAC para perfil sem competência fiscal, painel consolidado,
24 microrganismos permanecem 0 prontos e auditoria fiscal sem segredos.

## Frontend

- `src/hooks/useFiscalNfeReadiness.ts` — consumo tipado de `rpc_fiscal_nfe_readiness_v1`
  com mapeamento de erros do servidor (sem vazar códigos internos).
- `src/components/fiscal/ProntidaoNfeSecao.tsx` — painel somente leitura com métricas
  de emitente, destinatários, operações, tributos e numeração + pendências acionáveis.
- `src/pages/fiscal/FiscalProntidao.tsx` — seção F3 integrada ao topo da central.
- `src/integrations/supabase/types.ts` — assinaturas das seis RPCs F3.
- `src/hooks/__tests__/useFiscalNfeReadiness.test.ts` — 3 casos de mapeamento de erro.

## Dados

Nenhum dado fiscal inventado: emitente placeholder permanece `NOT_READY` e os
24 microrganismos permanecem com 0 prontos. Todas as fixtures do harness rodam em
transação revertida.

**Status: APTO (staging).**
