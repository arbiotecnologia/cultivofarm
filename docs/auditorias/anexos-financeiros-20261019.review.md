# Anexos financeiros — correção revisável no fluxo existente

## Baseline e evidência independente

HEAD solicitada: `ba13f5ad9f88e8d681daf46313b29c2ed545b97e`. Evidência REAL publicada fornecida pelo auditor: financeiro A teste3, `/financeiro/receber` → recebível fictício `TESTE AUDITORIA FINANCEIRO AR 20261009` → Documentos → Outro → TXT fictício retorna `new row violates row-level security policy`. Verificação SQL posterior: **test_objects=0/test_metadata=0**, sem arquivo/metadado persistido. Não foi reproduzida uma escrita hosted pelo agente.

Evidência independente pós-publicação dos monitores: produtor e financeiro preservaram drafts **>35s**; revogados às **2026-10-18T23:53:14Z**, ambos pausados na observação **23:53:31Z**, sem reload/clique; retry negou. Após restore, produtor voltou com draft vazio; financeiro precisou **2 retries, causa desconhecida**, sem draft anterior. Sem salvar cobrança/solicitação. A observação de 17s não é latência exata nem SLA, e o segundo retry continua como risco não explicado. Não é auditoria global nem homologação real de anexos.

## Contrato atual confirmado somente leitura

Consultas SELECT-only com marcador obrigatório `fiscal_environment_marker.project_ref = 'swzpzcwiasxmjutrmvkm'` retornaram esse ref explícito em 2026-10-19 00:00–00:01 UTC. Nenhum DDL/DML/deploy/publicação.

- `financial_storage_object_permitted(text,text)` MD5 `d03da0efc828ed0f99259c75390c6d13`: INVOKER/STABLE/search_path vazio, exige strict path, h15 e is_financial_staff; `financial-docs` interpreta primeiro segmento como OWNER_TYPE, segundo como UUID. Owner deve existir com organization_id=h15. RECEIVABLE/PAYABLE/PAYMENT_RECEIVABLE/PAYMENT_PAYABLE/FISCAL_INVOICE; **DELIVERY cai em false**.
- `storage1_path_strict(text)` MD5 `94164fa3b90088b0a1f16ac465a635d4`: tamanho 1–1024, sem barras inicial/final/duplicada, backslash, `%`, controles ou segmentos `.`/`..`.
- `guard_tenant_organization_id()` MD5 `d01a740c1e3e02407131d2b9228bf658`: trigger **BEFORE INSERT OR UPDATE** em financial_documents. No INSERT sem organization_id, preenche **h15 atual**, não tenant inventado pelo navegador; nega tenant diferente/ausente e UPDATE que altere tenant. organization_id nullable sem default na coluna; trigger permanece ativo.
- `financial_documents`: INSERT policy `fd_staff_insert` exige is_financial_staff; restrictive `tenant_isolation_d51_5` exige organization_id não nulo e h15. SELECT/UPDATE/DELETE e dois triggers de auditoria preservados. A leitura não revelou validação adicional owner↔organization no INSERT metadata: a correção reutiliza a autorização Storage do owner antes de inserir, sem alegar que uma escrita direta arbitrária de metadata foi endurecida por esta entrega.
- `rpc_financial_document_soft_delete(uuid,text)` MD5 `bfce59fb3e68309d6d306a9c712fd1f3`, corpo e invocação preservados. Não chama Storage remove/delete.
- Pagamento legado `c18e061b-16ee-4e32-b031-cb043d0528d7` com organization_id NULL continua **negado**, não positivo A. Nenhum tenant foi atribuído e nenhuma fixture foi gravada.

## Delta mínimo

`src/lib/financeiro/documentStoragePath.ts`: valida cinco tipos, UUID completo e basename; rejeita traversal/separadores/%/controles/vazio/nome excessivo. Normaliza acentos e caracteres em basename ASCII segura; usa `crypto.randomUUID()` e `upsert:false` para unicidade. Saída **OWNER_TYPE/OWNER_UUID/UUID-basename**, sem organization prefix. Validação de path não substitui autorização server-side.

`src/components/financeiro/DocumentosPanel.tsx`: usa **useStorageAccessScope existente**, sem modificar o hook/monitor. Captura fence no clique/file-change, valida antes upload/remove, após upload **antes INSERT**, após INSERT/RPC e em onSuccess antes toast/invalidation/onChanged. Query invalidation inclui scope original. Tipo de documento capturado junto ao arquivo. DELIVERY/owner inválido e contexto inválido desabilitam ações de escrita; download/readiness existentes preservados. Erros atuais mostram erro, não sucesso; conclusões antigas não apresentam toast/resultado sob novo contexto. Softdelete canônico permanece.

## Matriz e resultados locais

- **11 arquivos / 186 testes PASS**, incluindo **49 casos** `src/test/financeiro/DocumentosPanel.storage.test.tsx`.
- Path dos cinco tipos, basename acentuada, unicidade, UUID malformado, traversal, barras, `%`, controle, vazio, comprimento excessivo, unsupported DELIVERY/FINANCIAL_RECEIPT/REPORT_EXPORT/case incorreto.
- Fluxo real DocumentosPanel + useStorageAccessScope com transporte Supabase fake: upload→metadata→callback, sem organization_id manual; softdelete original; erro Storage/metadata/RPC sem sucesso/cleanup.
- Revogação início (monitor real com deadline 15s sem rerender), meio/fim de upload/metadata/remove, troca tenant/UID/epoch, unmount, A→B→A observado e deadline entre mutation completion/onSuccess: sem metadata tardia ou publicação stale. Não é teste de JWT/Storage hosted nem ABA universal não observado.
- Regressões produtor/financeiro/B2B com drafts >=2 polls e descarte/restore, anexos a905, gates, softdelete: PASS. Warning Recharts de dimensões zero no JSDOM continua pré-existente.
- Staging novo **4/4 PASS**, staging a905 **2/2 PASS**; hashes SHA256 byte-exatos e `git diff --check` PASS. Build/typecheck são os checks automáticos do ambiente, não comandos executados manualmente pelo agente.

## Riscos e pré-requisitos de revisão

Upload já concluído + lease expirada/tenant trocado/erro INSERT pode deixar objeto **órfão** sem metadata. Sem cleanup destrutivo automático, sem remover sob sessão revogada nem retry automático de escrita. Não existe novo ledger/fluxo para órfãos. Se INSERT/softdelete já foi aceito e a sessão expira antes da resposta, efeito pode existir no servidor, mas UI não publica sucesso; auditor deve reconciliar com sessão autorizada, sem repetir às cegas. Signed URL emitida e bytes baixados não são revogáveis por esta UI; nova emissão segue RLS/fence existentes. Janela entre fence e autorização server-side permanece sujeita ao estado que cada operação observa, sem snapshot transacional entre Storage/metadata.

Antes da publicação pelo auditor: revisar candidata/manifest; testar upload real do recebível fictício permitido A, metadata tenant h15 correto, abertura do arquivo; negativos B/owner NULL/DELIVERY; revogação e troca de contexto durante operação sem sucesso stale. Essa homologação **não foi concluída** pelo agente.

## Artefatos e rollback preciso

`scripts/authz-cache/financial-attachment-release/manifest.json`, `DocumentosPanel.candidate.review`, `DocumentosPanel.rollback.review`, `documentStoragePath.candidate.review`, `stage.py`, `test_stage.py`. PRE/POST SHA256 fixados explicitamente nos bytes, não regenerados pelo teste.

Staging candidate/rollback só gera cópias **fora do projeto**, valida todos os POST/artifacts e monitores protegidos antes de qualquer saída. Recusa drift; não instala. Rollback restaura **somente DocumentosPanel PRE**; builder novo fica inerte sem importer, sem exclusão automática. Não reverte useAuth, leases, hooks a905, gates produtor/financeiro/B2B ou Blob. Operador deve validar POST exato e arquivos protegidos antes de restaurar; rollback reintroduz a falha de path conhecida e não é solução para liberação de anexos. Gate foundation/produtor/financeiro true, b2b-context, Blob false/global v6 fechado preservados.
## Adendo independente — publicação frontend e falha SERVER

Auditor informou publicação/revisão de cc62c3dceb61d799722813f620fbe42f994c180e, deployment 5d25d61e-113f-482a-8bbe-06644e11e88e, bundle index-QMZ-AAz8.js: 10 hashes, staging 4/4 e path/9 mutações PASS. Financeiro A autenticado real: upload Outro TXT/abertura PASS, metadata tenant A/owner esperado. Revogação 00:08:57Z removeu painel e retry negou; restore 00:09:50Z retry1 retomou. Perfil/fixture preservados, dois recebíveis. Evidência fornecida pelo auditor, não execução do agente.

Nova falha: SQL authenticated/admin B com iat atual/h15 B aceitou metadata de parent RECEIVABLE A; ROLLBACK sem persistência, não login B. Candidata SERVER e limites: docs/auditorias/financial-documents-integrity-20261019.review.md. Frontend/monitores preservados; implantação e login B real dependem do proprietário/auditor.
