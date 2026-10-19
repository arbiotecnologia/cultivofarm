# Integridade SERVER de financial_documents — candidata NÃO instalada

## Evidência e escopo

Frontend `cc62c3dceb61d799722813f620fbe42f994c180e` revisado/publicado pelo auditor, deployment `5d25d61e-113f-482a-8bbe-06644e11e88e`, bundle `index-QMZ-AAz8.js`. Upload/abertura A e revogação/restore reais fornecidos pelo auditor estão no adendo de `anexos-financeiros-20261019.review.md`. Nova falha reportada: SQL authenticated/admin B com **iat atual/h15 B** aceita metadata de parent RECEIVABLE A, atribuindo org B; ROLLBACK sem persistência, não login B. Laboratório reproduziu o bypass no baseline antes da candidata.

Somente artefatos SQL revisáveis, testes locais e documentação. Nenhum hosted DDL/DML, Edge deploy, publicação, frontend, RLS/Storage ou gates alterados. Nenhum subagente. Consultas anteriores SELECT-only confirmaram marcador canônico `swzpzcwiasxmjutrmvkm`; laboratório nunca usa env/conexão hosted. Correção não está em migrations autoexecutáveis.

## Contrato proposto e inventário

`scripts/financial-documents-integrity/callers.md` inventaria os oito tipos e callers: RECEIVABLE/accounts_receivable; PAYABLE/accounts_payable; DELIVERY/entregas; FISCAL_INVOICE/fiscal_invoices; PAYMENT_RECEIVABLE/receivable_payments; PAYMENT_PAYABLE/payable_payments; FINANCIAL_RECEIPT/financial_receipts; REPORT_EXPORT/financial_report_exports. Busca runtime/pg_proc não certifica SQL dinâmico/writers externos não capturados.

Uma trigger adicional `zz_financial_document_integrity` BEFORE INSERT/UPDATE, depois de `tenant_organization_guard` pela ordem alfabética. Preserva guard tenant, policies, audits, Storage e RPC softdelete. Função trigger SECURITY DEFINER/search_path vazio/owner postgres, EXECUTE somente postgres/service_role; sem endpoint authenticated/anon/PUBLIC.

- Parent existente, org não NULL e igual à metadata; FOR SHARE retém lock até fim da transação. Parent estrangeiro/inexistente e legado NULL negados, sem tenant inventado/backfill.
- UID presente: h15/readiness/staff e empresa atual; uploaded_by self no INSERT. UID ausente: papel **DB** service_role ou sessão administrativa postgres, empresa explícita e mesmo owner/path válidos. Claim `role=service_role` não concede privilégio. Edges atuais escrevem locators nos parents, não financial_documents; não foram modificadas.
- Organization, owner_type, owner_id, uploaded_by imutáveis em UPDATE, inclusive service. Referências fiscal_invoice_id/fiscal_event_id exigem mesma empresa.
- Path strict OWNER/UUID/basename para seis tipos metadata. **DELIVERY metadata não concede Storage DELIVERY**; cinco tipos Storage atuais preservados.
- FINANCIAL_RECEIPT/REPORT_EXPORT: locator exato já registrado no parent, prefixo org/bucket financial-receipts ou financial-reports esperado. Snapshot zero metadata e nenhum INSERT localizado desses tipos: positivo sintético não certifica writer externo.
- Softdelete RPC/corpo/ACL preservados. Tombstone do locator legado inalterado passa somente com parent/tenant válidos, deleted_by do actor/motivo válido; spoof/reparent/bundled alteração negados. NULL legado invisível e negado. Hard DELETE authenticated continua RLS false; service elevado conserva privilégios existentes.

## Arquivos e hashes exatos

Em `scripts/financial-documents-integrity/`: `candidate.sql.review`, `rollback.sql.review`, `preflight.sql.review`, `postflight.sql.review`, `contracts-guard.sql.review`, `guard.function.sql.review`, `manifest.json`, `callers.md`, `local-setup.sql`, `baseline-functions.sql`, `local-baseline.sql`, `test-local.py`.

Arquivos `.review` **não autoinstalam**. Auditor deve revisar/aplicar o arquivo integral como migration versionada somente no ref canônico. Nenhum arquivo criado/editado em supabase/migrations.

Nova guarda PRE ausente; POST MD5 de pg_get_functiondef **62452456944c53935fde9f15da7bac8e**. Policies PRE/POST **2f1f0ad0472b8ec17b2841767f8416c7**; triggers existentes PRE/POST **364a1ac7fc3c82f25e595afeef9059ae**. Manifest fixa corpo MD5/ACL/owner/search_path de 13 dependências atuais (h15/readiness/staff/Storage/softdelete/audits), e SHA256 byte-exato de artefatos explicitamente. Testes só conferem, não regeneram goldens.

Candidata/rollback integrais: BEGIN, lock_timeout 3s, statement_timeout 30s, guards canônicos/contratos antes do LOCK, lock de tabela e POST antes COMMIT. Preflight/postflight READ ONLY. Preflight retorna somente contagens por tipo de tenant NULL, parent ausente/NULL, tenant mismatch, path-owner-bucket mismatch e autor ausente; sem IDs/nomes/conteúdo e sem reparo automático. Findings exigem revisão, não autorização para saneamento.

Rollback exige POST exato/contratos originais; remove **somente** nova função/trigger, verifica PRE ausente. Não toca dados, policies, Storage, frontend, a905 ou monitores. Reintroduz o bypass: decisão explícita do auditor, nunca rollback de segurança automático.

## Testes e limites

`python3 scripts/financial-documents-integrity/test-local.py`: PG17 descartável em /tmp, arquivos integrais com ON_ERROR_STOP e cluster encerrado ao fim. 13 corpos reais com MD5/ACL/config/owner, policies e triggers financial_documents exatos. Auth uid/jwt/foldername são stubs; schema/parents reduzidos com RLS tenant sintética e producer membership vazio. **Claims/current iat não são JWT assinado/login**; iat0 é negativo de readiness, nunca falso positivo admin.

Matriz local: oito tipos positivos A/B, foreign/missing/NULL parent, spoof autor, tenant/owner/path UPDATE, traversal/%/segmentos/UUID inválido, referências fiscais A/estrangeiras, buckets/locator ausente, hard-delete RLS zero linhas, softdelete/legado/NULL, perfil inativo/role removido, service sem UID/com UID, claim service falso, RPC service sem actor. Atomicidade: candidata recusada por drift/reaplicação, rollback recusado por drift/ausência, rollback fiel, falha POST só em cópia temporária. Goldens não alterados pelos testes.

Regressões frontend **9 arquivos / 159 testes PASS**: painel, Storage d51-5, softdelete, monitores B2B/produtor/financeiro, lease e Blob. Warning Recharts JSDOM preexistente. Build/typecheck são checks automáticos do ambiente, não comandos manuais do agente. Resultado SQL final registrado ao término abaixo.

## Riscos e gates de revisão

- Preflight novo antes da instalação; revisão dos oito contratos, writers externos/service e PG compatível. Sem afirmar equivalência global de RLS dos parents reduzidos.
- Locator legado inconsistente pode perder UPDATE não-delete; não é migrado/apagado. Tombstone só se owner/tenant válidos. `anexarComprovanteBaixa` usa prefixo org incompatível com Storage owner-first: falha preexistente inventariada, sem editar frontend/ampliar contrato nesta candidata.
- FOR SHARE pode competir/deadlock com writers parent→documento; nenhum certificado global de lock order/ABA. Referências fiscais secundárias são leitura no statement, não promessa universal de serialização.
- Perfil/roles/parent podem mudar entre operações; não há snapshot global. Storage/metadata não formam transação única; órfãos possíveis sem cleanup destrutivo. URLs já emitidas/bytes baixados não são revogados por esta guarda.
- Aplicação/homologação dependem do auditor/proprietário: login B real solicitado, testes upload/abertura/revoke/restore A/B com dados autorizados. SQL local não é hosted/JWT/browser. Sem auditoria global/contratos concluídos; Blob/global v6 fechados e monitores publicados preservados.