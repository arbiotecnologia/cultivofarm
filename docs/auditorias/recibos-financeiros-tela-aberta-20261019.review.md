# Recibos financeiros — candidata restrita de anexos

## Atualização independente 19/10 12:13
Base f91728b publicada: auditor informou homologação REAL limitada recibos/financeiro/admin. PDF autenticado A salvo/renderizado; B busca REC-2026-000001 vazia; A inativado12:07:39Z retirou Baixar PDF/retry negado/restore12:08:05Z somente Preparar PDF; B inativado12:08:25Z/retry negado/restore12:08:56Z filtro limpo. A/B ativos, roles originais, estáveis96s após restore. Sem novo pagamento, login/reload ou prova JWT direto/global. Substitui a pendência de homologação deste recorte abaixo, preservando relato histórico; não homologa PDF de aplicação nem signer adversarial HTTP. A fase atual está em pdf-aplicacao-anexos-20261019.review.md.

## Base e autorização
Base publicada/homologada multipapel informada: `71decc2d2b6b2028b9ca2170e8f1344bee9d0b48`.
Somente frontend, testes e artefatos; nenhuma operação hosted, DDL, Edge deploy, publicação, reload, criação de recibo/pagamento ou alteração de perfil foi executada. Destino obrigatório de qualquer verificação posterior: `swzpzcwiasxmjutrmvkm`. Contratos permanecem fora do recorte.

## Falha e correção
`RecibosList` não cercava listagem/cancelamento/download por identidade, tenant, roles, epoch ou filtros; assinava Storage por 3600s e abria URL remota, inclusive `data.url` da Edge.

- Listagem usa `useStorageAccessScope`, filtro explícito tenant, abort/timeout e fence antes/depois do await e antes de publicar resultado. Resposta com tenant divergente é rejeitada. Mudança de filtro/identidade/epoch e unmount invalidam solicitações anteriores; resultados fora de ordem não substituem a consulta atual.
- Cancelamento preserva exatamente `cancel_financial_receipt(_receipt_id,_reason)`, sem operação alternativa. Contexto, recibo selecionado e geração do diálogo são capturados; lock local bloqueia clique duplicado. Sucesso, recarga e fechamento só ocorrem no contexto atual. Abort/timeout não desfaz operação já concluída no servidor: mensagem orienta consultar o recibo antes de repetir, sem retry automático.
- PDF usa o opener autenticado existente, sem mudar seus hooks. Primeira ação prepara bytes; segunda ação explícita baixa o Blob já preparado. O opener aplica limite/timeout e fence próprios, revoga URLs locais ao desmontar e nunca usa fallback público/assinado. URL Edge arbitrária é ignorada.
- Locator validado: `tenant/receipt_year/receipt_number.pdf`, tenant UUID próprio, número `REC-AAAA-NNNNNN` (sequência pode crescer), ano consistente, bucket `financial-receipts`. Path existente deve ser exatamente esse locator; path retornado pela Edge deve coincidir, assim como o número. Nenhum prefixo financial-docs/owner-first foi transposto para este bucket.
- Recurso PDF contém snapshot completo do recibo e escopo da listagem. Alteração real desse snapshot desmonta ownership/aborta download; confirmação idêntica não inventa mudança.

## Autoridade e contratos inspecionados
O cliente Supabase canônico permanece único; download chama o SDK autenticado `storage.from(...).download(...).asStream()` com signal/cache no-store. Fences e validação de locator **não autorizam** acesso: RLS, Storage e RPC são obrigatórios.

Fonte local de `generate-financial-receipt`: bearer/Auth getUser, h15, recibo por id+tenant, upload do path canônico e retorno `{url,path,receipt_number}`. A Edge continua emitindo signed URL 3600s; esta candidata não a consome, mas não elimina essa emissão nem comprova o deployed source. Geração pode já ter gravado PDF/metadado antes de revogação/timeout; não há cleanup destrutivo nem promessa de cancelamento server-side. Nova emissão/download exige autorização atual do servidor, a ser verificada independentemente por HTTP autenticado.

Signed URL já emitida pode continuar válida até seu TTL; bytes já baixados não são revogáveis. Blob local é revogado ao perder ownership, mas isso não apaga cópias obtidas. Testes demonstram bloqueio de nova ação e descarte de respostas tardias, não revogação retroativa de URL/bytes.

## Evidência local
- **231/231**, oito arquivos dirigidos: recibos 51; SDK 1; documentos financeiros 49; regressões lease/signedURL/Blob/monitor/multipapel restantes. Transporte, RPC, download e relógio controlados: **não é login real/JWT/RLS hosted**.
- Testes positivos/negados, locator/traversal/tenant/bucket, filtros fora de ordem, uid/tenant/roles/epoch/unmount/lease, cancelamento duplicado, geração existente/nova, timeout Edge, bytes preparados após expiração, snapshot de recibo e revogação Blob.
- Staging **5/5**: bytes candidata/rollback, remoção explícita da dependência nova, recusa de destino projeto e drift atômico de fonte/artefato; dados UTF-8/CRLF usados na prova de drift.
- Build automático: `build OK` em 19/10 02:49:51Z e posteriores conforme recibo local. Tentativa inicial de typecheck separado apontou erros nos testes, corrigidos; **typecheck independente final PASS**, `tsgo -p tsconfig.app.json --noEmit`, exit 0; recibo separado registrado.
- Suíte ampla não repetida. As **seis falhas históricas** documentadas nas fases anteriores permanecem pendências; não foram ocultadas nem recertificadas aqui.

## Pacote e rollback
`scripts/authz-cache/receipt-list-release/`: manifest fixo de duas fontes runtime, treze fontes protegidas byte-exatas da base; snapshots candidata/rollback; stage/test_stage; preflight SELECT-only; SHA256SUMS e validation-receipt.

Stage só escreve fora do checkout após verificar todos os hashes, sem SQL/Edge/instalação. Rollback restaura somente `RecibosList` da base e lista remoção de `receiptStorageLocator.ts` em `REMOVE-ONLY.json`; nunca autoinstala nem altera gates/monitor/servidor/anexos publicados. Testes/documentação podem permanecer para revisão; testes da candidata deixam de valer após rollback runtime.

Preflight inventaria bodies/MD5/ACL/owner/search_path, RLS/policies, triggers e bucket sem ler linhas comerciais. **Não executado hosted; não há hashes live certificados nesta entrega.** Operador deve provar o ref canônico antes de executá-lo e revisar resultado integral; presença do arquivo não é PASS.

## Homologação pendente
Sessões financeiro A/admin B existentes não foram alteradas. Ambiente informa Supabase externo não gerenciado: não há sessão autenticada disponível para restauração nesta execução. Não solicitar senhas nem mintar contra Cloud.

Proprietário: disponibilizar sessão financeiro A na prévia para listar/preparar/baixar um recibo existente autorizado, sem criar pagamento/recibo/cancelamento real; validar admin B sem dados A e requisição HTTP direta de download negada. Revogação/restore, URL emitida e locator da Edge exigem revisão/homologação independente. Geração real não foi chamada porque pode escrever PDF/metadado. Nenhum resultado browser autenticado foi certificado.

## Inventário apenas — fora do recorte
1. Global v6 segue fechado: prova server-side de orçamento/fingerprint/revisões monotônicas, writers/ordem de locks/ABA e homologação concorrente continuam gates independentes; laboratório local não os certifica.
2. `src/lib/pdfAplicacao.ts`: signer 600s sem fence, pendência própria; não modificado.
3. `supabase/functions/entrega-termo-pdf/index.ts`: guard final antes da emissão signed URL pendente de revisão; não modificado.

Foundation/recortes ativos, refresh B2B e Blob false permanecem byte-exatos; sem auditoria global, contratos concluídos ou autorização para publicar antes da revisão externa.