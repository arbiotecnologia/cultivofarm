# Fase 2 — Comprovante de entrega: implementação e evidências

Ambiente: staging `ikaauvsflpmamgxmkhoq`. Produção não tocada. Nada publicado. Sem SEFAZ. Sem exposição de segredos (SQL via runner fail-closed com `$STAGING_DSN`).

## 1. Migrações incrementais aplicadas

| Arquivo | Conteúdo |
| --- | --- |
| `restoration/os-e2e/17-migration-20260903000000_comprovante_entrega_documento_v1.sql` | Sequência `comprovante_entrega_seq` (`CE-YYYY-000000`), `fn_comprovante_entrega_montar_v1(uuid)`, `rpc_get_comprovante_entrega_data(uuid, bool)`, revogação de `anon` nas tabelas documentais |
| `restoration/os-e2e/18-migration-20260903010000_comprovante_cepas_fix.sql` | `produto_etiquetas.cepas` tratado como `text[]` via `array_to_string` |
| `restoration/os-e2e/19-migration-20260903020000_comprovante_tipo_canonico.sql` | `entrega_comprovantes_tipo_chk` passa a aceitar `comprovante_entrega` |
| `restoration/os-e2e/97-rollback-20260903000000.sql` | Rollback completo do conjunto |

## 2. Regras de negócio

- Entrega **não confirmada** → documento `romaneio` (conferência, sem valor de recebimento, sem snapshot congelado).
- Entrega **confirmada com recebedor identificado** → documento `comprovante`, com snapshot imutável gravado em `entrega_comprovantes.metadata` e numeração canônica `CE-YYYY-NNNNNN`.
- Banco bloqueia `entregue` sem identificação do recebedor; `recebedor` é distinto de `confirmado_por`.
- Reemissão é auditada (contador de reemissões) sem alterar número nem conteúdo do snapshot.

## 3. Segurança

- `anon` e `PUBLIC` sem `EXECUTE` no motor documental; `authenticated` autorizado.
- `search_path = public, pg_temp` nas duas funções.
- `anon` sem grants nas tabelas de documentos de entrega.
- Erros canônicos: `COMPROVANTE_UNAUTHENTICATED`, `COMPROVANTE_FORBIDDEN`, `COMPROVANTE_PRODUTO_OBRIGATORIO`, `COMPROVANTE_SEM_ITENS`.

## 4. Frontend

- Novo motor `src/lib/comprovanteEntregaPdf.ts` consome exclusivamente o payload da RPC (sem remontagem no cliente), com identidade visual, blocos Emitente/Destinatário/Itens/Transporte/Recebimento e rodapé com hash de autenticidade.
- `src/pages/Entregas.tsx` usa `gerarDocumentoEntregaPDF` e traduz erros do servidor.
- `src/lib/reciboEntregaPdf.ts` removido.

## 5. Evidências

Harness transacional `restoration/os-e2e/33-comprovante-20260903.sql` (BEGIN … ROLLBACK): **18/18 PASS**
(D01–D05 ACL/search_path, D06–D08 romaneio, D09–D12 comprovante e numeração `CE-2026-000004`, D13–D15 idempotência/imutabilidade/reemissão, D16–D18 validações e negação de acesso).

Validações locais: `tsgo --noEmit` limpo, Vitest **2776 passed**, build OK.

## Veredito

**FASE_2_CONCLUIDA_EM_STAGING — APTO PARA HOMOLOGAÇÃO**
