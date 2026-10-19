# Comprovante de baixa — candidata frontend limitada

## Resultado e escopo

Corrigidos somente o helper existente `src/lib/financial/anexarComprovanteBaixa.ts` e o diálogo existente `src/components/financeiro/BaixaDialog.tsx`, além de testes, documentação e artefatos revisáveis. Baseline de rollback: `0fce0ce1a03e859b80da36e9e40ae937e50bf056`. Sem DDL/DML hosted, pagamento/cobrança real, deploy Edge, publicação, novo fluxo ou subagente. B2B/produtor/financeiro publicados, anexos a905/painel e Blob/global v6 inalterados.

Servidor implantado pelo auditor: `financial_document_owner_integrity_20261019` no ref `swzpzcwiasxmjutrmvkm`; evidências externas/preflight/postflight/probes e login B estão no adendo de `financial-documents-integrity-20261019.review.md`. Não reaplicado. SQL com claims/iat atual não equivale a login real; login B sem contas/anexos A não testa HTTP signer.

## Contrato e fences

- Path determinístico `PAYMENT_RECEIVABLE|PAYMENT_PAYABLE/UUID/idempotency_key-basename`, sem prefixo org. Reutiliza `supportsFinancialDocumentOwner` do contrato compartilhado; não usa o gerador aleatório do painel porque retry deve manter a mesma chave/objeto. UUID e chave validados; slash, backslash, traversal, percent encoding e controles no nome rejeitados. Nome normalizado com limite; DELIVERY não é aceito.
- `financial_documents` insert deixa `organization_id` para a trigger canônica derivar/validar pelo parent, não atribui tenant a pagamentos orgNULL. Owner/autor/path continuam sujeitos ao guard server/RLS instalado; nenhum privilégio novo.
- `useStorageAccessScope.capture()` captura identidade/tenant/roles/epoch/recurso/montagem. Helper verifica antes/depois dos awaits; `supabase.auth.getUser()` do SDK canônico confirma UID antes de lookup/upload/metadata e antes de resultado/reuso. Isso não substitui h15/readiness/RLS nem torna múltiplas requests uma transação.
- Deadline 15s cobre o helper. Expiração corta sua conclusão e próximas etapas; **não cancela nem desfaz uma request já aceita pelo servidor**. Resolução tardia não publica sucesso/invalidation/fechamento no contexto antigo ou novo.
- Retry de baixa já confirmada continua no ramo `pendente`, sem RPC de pagamento. Reconsulta documento exato por owner/path/empresa/autor e deleted_at NULL; `23505` só é reuso se a row exata reaparece autorizada, nunca sucesso genérico.
- Baixa persistida e anexo falho continuam separados. Journal payable confirmado é limpo usando UID/parcela capturados no envio, inclusive se lease termina no anexo; não limpa journal do novo usuário. Alterações visuais/cache/toast/fechamento só ocorrem sob fence vigente. Erro incerto mantém journal original; servidor financeiro/RPC e softdelete preservados.

## Verificação local

`bun run test --` com helper/comprovante, contasPagarBloco2–6, contasReceberRevisao, DocumentosPanel.storage e integrações B2B/produtor/financeiro: **11 arquivos / 229 testes PASS**. Inclui paths dos dois owners, UUID/traversal, retry sem duplicate, partial upload/insert, unique race, UID diferente, owner estrangeiro, revogação início/lookup/upload/insert, Auth mudou após upload, timeout upload/metadata com resposta tardia; diálogo real sob transporte simulado prova retry sem nova RPC, revoke/tenant/UID/unmount sem sucesso e journal confirmado independente do anexo. Warning Radix Description/Recharts JSDOM preexistentes.

`python3 scripts/authz-cache/payment-proof-release/test_stage.py`: **2/2 PASS**, roundtrip byte-exato e drift no segundo arquivo recusado antes de escrever o primeiro. Build/typecheck do harness automático: último resultado `build OK`; não executados manualmente.

Não foi criado pagamento/cobrança real nem upload hosted neste turno. Fake transport aplica contrato reduzido do guard instalado; não é execução PostgreSQL nem homologação de JWT/RLS/Storage. Os 252 checks PostgreSQL são da candidata SERVER anterior e não são contados como novos testes deste frontend.

## Rollback e riscos

`scripts/authz-cache/payment-proof-release/` contém candidate/rollback dos dois arquivos, `manifest.json` com SHA256 byte-exato, `stage.py` e `test_stage.py`. Script exige `--target` e modo explícitos, verifica todos os baselines/artefatos antes das escritas. Testes só conferem hashes; não regeneram manifest. Rollback não autoinstala, não toca servidor, monitores, painel ou gates. Interrupção filesystem durante escrita não tem atomicidade transacional. Restaura o defeito do prefixo org; só usar por decisão do revisor.

Storage e metadata não são atômicos. Upload pode deixar objeto órfão após falha/revogação/timeout; insert pode ter persistido mesmo quando UI rejeita resposta. Nenhum objeto é removido automaticamente. Retry autorizado da mesma tentativa reconsulta metadata ou sobrescreve o próprio path determinístico. Não recupera drafts apagados pelo monitor nem retoma após restauração por conta própria. Ficheiro diferente com mesmo nome normalizado/chave pode substituir objeto da própria tentativa antes de metadata; identidade do conteúdo não foi ampliada nesta correção.

Upload real financeiro A pós-migration depende da sessão/revisão do proprietário usando dados autorizados existentes; não registrar nova baixa para testar. HTTP signer A/B direto e cenários independentes não executados aqui. Sem alegar conclusão global, contratos ou homologação real.

## Adendo externo 19/10 — publicação e limites

Auditor informou revisão/publicação HEAD `07d27698fff1026c09cffe2c4859ea59592aca5e`, deployment `68340d34-09b4-49e7-915a-4ac46fd1fa2a`, mesmo bundle `index-CgXJJ8e4.js` no domínio e preview. Seis hashes, stage 2/2 e seis helper cases independentes PASS. Diálogo abriu/cancelou sem Confirmar: pagamentos 3, recebíveis 2 inalterados. Anexo de baixa vigente **NÃO homologado** (recebimento A estornado; legados organization_id NULL). A referência local anterior a “unique race” é apenas branch fake: **não há UNIQUE owner/path no schema e fake 23505 não prova corrida ou idempotência global concorrente**.

Upload/abertura real financeiro A pós-migration foi informado PASS para anexo Outro de RECEIVABLE, arquivo `CultivoFarm-Auditoria-PosMigracao-20261019.txt`, doc `b2c80d34-eeae-4e9d-97fc-8eb5191ebf3e`, no preview `QMZ-AAz8`; dois arquivos teste e nenhum pagamento. Login B publicado zero contas confirmado. Não é comprovante de baixa nem prova HTTP signer. Nenhuma evidência foi reexecutada pelo agente.