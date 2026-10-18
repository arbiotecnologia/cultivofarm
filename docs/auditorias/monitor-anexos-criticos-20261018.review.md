# Monitor/anexos — correção focal, revisão local após 24b5f807

## Escopo e resultado

Baseline exato: `24b5f80716e8c22abeebf97dff69114319cb162a`.
Nenhum SQL hosted, publicação, deploy Edge, mudança de RLS/grants/contratos,
dependências, rotas ou gates. B2B publicado permanece true/b2b-context;
Blob false e v6/global não ativados. Aceite real do gestor anterior preservado;
nenhuma homologação real nova reivindicada.

Falha demonstrada: relógio do monitor alcança **15.000ms**, mas callbacks de
timer/React ainda não executaram; `monitor.state()` ainda `valid`,
`checkAccess()` false. O fence antigo só capturava ready/época do render.
**4/4 adversários falharam antes**: capture autorizava, URL assinada tardia era
exposta, opener iniciava download, thumbnail criava objectURL. Transporte fake,
monitor real com relógio injetado; não prova exploração JWT/Storage live.

Correção nos mesmos hooks: `useStorageAccessScope` reconsulta
`checkAuthzAccess` existente no ready e no capture (antes/depois do await),
sem novo autorizador. `useSignedUrls` reutiliza esse fence; Blob/opener também
rechecam início/conclusão. Lifecycle em layout effect impede que StrictMode
capture uma geração já desmontada; teste StrictMode existente preservado.
Produtor/internos continuam sem monitor neste rollout: o check existente é
no-op para eles, não inventamos lease ou promessa de revogação global.

## Inventário preciso das fontes atualmente conectadas

Inventário do código desta árvore, não certificado de acessibilidade por JWT.
“Interno” exige role/feature/tenant da página; “produtor/B2B” exige guards e
leitores canônicos. Bucket inexistente/policy negando pode tornar caminho
implementado inacessível; não assumir sucesso só por existir UI.

| Família/bucket | UI/fluxo implementado e perfil | Emissão/path/TTL e fence |
|---|---|---|
| consultor-arquivos | Internos/técnico: `src/pages/ConsultorTecnico.tsx`, `components/visita/EvidenciasTabs.tsx`, `visita/roteiro/RoteiroVisita.tsx`, `solicitacoes/{TimelineAtendimento,SolicitacaoDetalheTabs}.tsx`, `talhoes/HistoricoTalhao.tsx`; mobile técnico: `pages/app/{MobileTalhaoHistorico,wizard/WizardAnexosStep}.tsx` | Todos importam `useSignedUrls`; paths de metadados, signer SDK caller, **3600s**. Upload `src/lib/mediaUpload.ts`, `pages/app/MobileSolicitar.tsx`; legado sem path usa `arquivo_url` em `lib/equipe-tecnica/evidencias.ts:resolverUrlEvidencia`, não fallback em erro de assinatura. |
| aplicacao-evidencias | `components/aplicacao/{EvidenciasGallery,AplicacaoCard}.tsx`; produtor via `pages/portal/PortalAplicacoes.tsx` monta AplicacaoCard | Gallery→useSignedUrls **3600s**, path gerado por `lib/aplicacoes/evidencias.ts:caminhoEvidencia`; PDF local `lib/pdfAplicacao.ts` ainda assina imagem **600s** fora do hook; upload EvidenciasUploader. |
| clientes-docs | Internos: `components/clientes/ClienteDocumentosTab.tsx`; não localizado mount direto nas páginas produtor/B2B nesta varredura | `clientes/<cliente>/...`, SDK **60s**; capture antes/depois await; ramo Blob fechado. |
| order-attachments | Interno `pages/comercial/PedidosB2B.tsx`→`components/comercial/OrderMessagesPanel.tsx`; B2B `components/portal-parceiro/MensagensPedidoDialog.tsx`→mesmo panel | `<order>/<message>/<timestamp>-<file>`, `hooks/useCommercial.ts:getAttachmentSignedUrl`, SDK **3600s**; thumbs/open caller fences atuais. Helper sozinho não consulta monitor; caller é obrigatório. Metadados em partner_order_message_attachments/msg/order; contexto técnico não presume acesso comercial. |
| entrega-documentos | Internos `components/entregas/{ConfirmacaoEntregaPanel,EntregaComprovantePanel}.tsx` | SDK **60s/300s**, path metadado arquivo_path; capture caller. |
| entrega-termos | Internos `components/entregas/TermoEntregaPanel.tsx` | Edge `supabase/functions/entrega-termo-pdf/index.ts` action signed_url **120s**, path `<entrega>/<termo>/v<versao>/...`; caller fence. Edge prova termo via caller RLS e depois usa admin para signer; **sem rechecagem equivalente após I/O**. |
| financial-docs | Internos financeiros `components/financeiro/DocumentosPanel.tsx` | SDK **300s**, upload `<org>/<ownerType>/<ownerId>/...`; download capture. |
| financial-reports | Internos `components/financeiro/relatorios/{HistoricoExportacoes,ReportShell}.tsx` | histórico SDK **3600s** com capture; Edge `generate-financial-report/index.ts` gera/upload/assina **3600s**, `<org>/<actor>/<filename>`; ReportShell fence. |
| financial-receipts | Internos `components/financeiro/EmitirReciboButton.tsx`, `pages/financeiro/RecibosList.tsx` | Edge `generate-financial-receipt/index.ts` **3600s**, `<org>/<year>/<number>.pdf`; EmitirReciboButton fence; **RecibosList download/load sem scope fence** (residual concreto de fonte, não corrigido neste delta focal). Histórico SDK **3600s**. |
| fiscal-xml | Internos fiscal→`supabase/functions/fiscal-xml-engine/index.ts` action download | Caller fiscal_xml_runs RLS + `h15_service_actor_run_access` antes de admin signer **120s**, bucket/path do run; falta prova/rechecagem final no ramo existente. Não liberar fiscal para externo. |
| fiscal-certificates | Internos autorizados upload A1→`components/fiscal/certificados/UploadCertificadoA1.tsx`/Edge; engine interno baixa material | Não é signer genérico de usuário, chave/material privado; não assumir segurança pelo nome/private. Não tocar/testar material real. |
| visitas-pdf | fluxos PDF/`components/visita/EnviarPdfVisitaDialog.tsx`, aplicação `AplicacaoCard.tsx` | Edges `enviar-pdf-visita` e `enviar-pdf-aplicacao` continuam stubs contidos; não presumir entrega externa/emissão. Auditar bucket residual separadamente. |
| logos | `components/{portal/PortalBrandingSettings,configuracoes/AparenciaTab}.tsx`, branding de todos portais | URL pública de branding, fora da revogação de anexos privados. Writes plataforma permanecem guardados. |

Arquivos produzidos localmente sem nova assinatura remota (não são concessão
Storage): B2B `pages/portal-parceiro/{HistoricoSimulacoes,SimulacoesEquipe,
FichasTecnicas}.tsx` exportam dados/Blob do navegador; bytes já vistos não podem
ser revogados retroativamente. `pdfAplicacao.ts` possui signer direto e requer
revisão separada do workflow de exportação e de sua autorização atual.

## Storage/RLS: observado na fonte vs live

Referências locais (não reexecução live):
- `supabase/migrations/20261005200923_a9898565-995b-4066-a99b-e138442af842.sql`:
  d51_5_clientes_docs_*→cliente_storage_object_permitted→h15+cliente;
  d51_5_financial_storage_*→financial_storage_object_permitted→h15+financial staff/owner.
- `supabase/migrations/20261008141326_7df733a3-5535-4203-9b23-928271394c19.sql`:
  storage1_* RESTRICTIVE para entrega-documentos/aplicacao-evidencias/consultor-arquivos.
- `supabase/migrations/20261005221945_5a892019-9ef5-4ffb-abf7-2984e58c3ede.sql`:
  policies consultor-arquivos. Não confundir ledger local com estado instalado.
- `scripts/authz-cache/v6/attachments.sql.review`,
  `scripts/authz-cache/storage-operation-containment.sql.review`: candidatas,
  **não instaladas por nós**. Contenção operação tem expected_policy_md5=NULL
  e rejeita; buckets order-attachments/entrega-termos historicamente ausentes
  no manifest 17/10. Não afirmar ausência atual sem consulta nova.

Novo inventário SELECT-only:
`scripts/authz-cache/attachment-lease-review/preflight-readonly.sql`.
Não executado hosted; ferramenta SQL sem identidade explícita do destino não
substitui verificação do ref. Exportar buckets/policies/ACL/helpers/trigger bodies
atuais no conector comprovadamente swzpzcwiasxmjutrmvkm. Não usar refs proibidos.
Checks necessários: privado, RLS efetiva, caller tenant/RBAC/revoked link em cada
operação sign/sign_many/list/download/info; grants reais, permissive OR e
restrictive AND, herança/bypass service-role e fonte Edge deployed correspondente.

## Nova emissão, resposta tardia e URLs antigas

- Fence bloqueia **novo início** em callers que consultam ready e rejeita
  **retorno/abertura tardia** após lease consumida/época/identidade/unmount.
- Não faz uma operação já enviada ao Storage deixar de assinar no servidor.
  RLS/Edge ainda precisam revalidar a autoridade canônica atual; fence cliente
  é defesa de apresentação, não segurança server-side ou cancelamento remoto.
- URL assinada anteriormente emitida pode continuar servindo até TTL;
  suprimir UI não revoga token/URL. Bytes baixados/in-memory/PDF/export não
  são apagáveis remotamente. T0/drenagem depende de retirar TODOS signers,
  também clientes antigos e service-role. Não iniciar relógio de drenagem aqui.
- Edges candidatas existentes `scripts/authz-cache/v6/edges/{entrega-termo-pdf,
  fiscal-xml-engine,generate-financial-report,generate-financial-receipt}.index.ts.review`
  e `serve-verified-attachment.ts.review` não foram movidas para runtime:
  isso implantaria automaticamente sem autorização. Manifest antigo precisa
  confronto com HEAD/deployed; não reatribuir hashes como se revisão atual.

## PostgreSQL real local — evidência e limites

`python3 scripts/authz-cache/v6/test-isolated.py` executa arquivos integrais:
`live-guards.sql.review`, `row-revision.sql.review`, `live-storage.sql.review`,
rollback inteiro (rejeição esperada) e baseline histórico
`scripts/user-links-phase2/baseline-admin-edit.sql.review`. Goldens SHA256 fixos
das 3 fontes verificadas, não regenerados no teste. Sem truncar guards/BEGIN/COMMIT.
PostgreSQL descartável em socket /tmp, initdb trust só local/sem TCP; nenhuma
conexão Supabase. Tabelas reduzidas e auth.uid via fixture local declarados.

Provas: revoke→restore avança stamp nas duas operações; OLD/NEW touch ordenado;
rollback conserva stamps; org guard precede zzzz stamp e negação preserva
business row/revisão; ABA/incarnation DELETE/INSERT/forged INSERT; writers mesma
entidade serializam incrementos; org A não bloqueia entidade/profile B; singleton
identidade preservado. Snapshot REPEATABLE READ real mantém revisão antiga
durante ABA committed; transação now() pode autorizar boundary já passada no
clock_timestamp. Não é reader v6 homologado; revela pré-requisito temporal.

**40P01 reproduzido deterministicamente**: writer histórico admin completo
segura profile→user_roles DML→singleton; identidade segura singleton→touch
profile. Duas sessões sincronizadas por pg_locks/pg_blocking_pids; SQLSTATE
40P01 + acquire_gate exigidos. Stubs de is_tenant_admin_for_user=true e
is_platform_superadmin=false **somente para atingir locks**: não provas de
autorização. Baseline histórico não certifica que produção atual usa esse corpo.
Common atual capturado tem NOWAIT antes de profiles; não substituir pelo
histórico nem afirmar que teste do histórico certifica common/current writers.
Nenhum trigger foi desligado para produzir PASS.

## Rollback/revisão

`scripts/authz-cache/attachment-lease-review/manifest.json`: PRE exato baseline
24b5f807/POST dos 4 hooks; `*.candidate.review` e `*.rollback.review` byte-exatos.
`stage.py candidate|rollback <diretório fora do projeto>` valida TODOS POST e
artefatos antes de gerar saída, não aplica nada. Drift rejeita sem output;
reviewer aplica apenas com autorização e guards, preservando flags/monitor/Edges.
Rollback volta à falha anterior: **não é recomendado como solução de segurança**;
há risco de resposta tardia retornando. Não tratar rollback como revogação de URLs.

## Pré-requisitos restantes / NÃO GO global

1. Captura live/deployed atual dos paths acima + operação HTTP/JWT por perfil,
   inclusive pai/tenant/role revogado; sessões reais independentes pelo auditor.
2. Contenção server-side das novas emissões e rechecagem final dos signers Edge;
   anexos/buckets permissivos não devem ser criados/remapeados para fabricar PASS.
3. Writers **atuais integrais**, filhas/audit/tickets/defaults/FK/index/ACL,
   CAS/NOWAIT e ordem multi-statement/cascades, sem stubs como homologação;
   não reaplicar/reverter helpers E1/E2/3 já instalados.
4. Reader v6 consistente/temporal, fronteiras server_remaining_ms e ABA
   sob snapshots verdadeiros; não mudar volatilidade/resolvers para passar teste.
5. Residual RecibosList/pdfAplicacao/signed arquivo_url e emissores fora do fence;
   não declarar todas sessões internas/produtor revogáveis com rollout B2B.

Resultados finais ficam no bloco abaixo; homologação global NÃO concluída.

## Validação final desta rodada

- Vitest direcionado: **234/234 PASS, 17 arquivos** (`src/test/equipe-tecnica`,
  authzEpochMonitor, authzFoundation.integration, b2bOpenSession.integration,
  b2bPreviewReleaseGate e ClienteDocumentosTab.formSubmit). Inclui 5 adversários
  novos com monitor real, 4 componentes reais com lease expirada sem rerender,
  resposta tardia/novo início/Blob preparado/StrictMode e regressão B2B.
- PostgreSQL local: **38 checks PASS**, incluindo rejeições esperadas e
  reproduções de riscos, **não 38 aprovações de autorização**. 21 checks do
  harness original passaram antes da extensão; completo estendido não usa
  réplica de writer/revision/guard no lugar dos corpos capturados.
- Rollback/staging: **2/2 unittest PASS** (hash/bytes e drift antes de output).
  Manifest contém SHA256 PRE/POST fixos dos 4 hooks; testes não os recalculam
  para substituir os goldens. Nenhum arquivo Edge é incluído/aplicado.
- Build/typecheck **automáticos**: `build OK` em 2026-10-18T23:23:21Z;
  nenhum build/typecheck manual. Erro inicial de inferência literal no teste
  novo corrigido, e regressão StrictMode identificada/corrigida sem enfraquecer teste.
- `git diff --check` PASS, flags/monitor/signer Edge/runtime fora dos 4 hooks
  preservados em relação à baseline. Nenhum teste HTTP/JWT ou login real desta
  rodada. Relatório não converte inspeção local/relato antigo em prova live.

Paths de revisão: `scripts/authz-cache/attachment-lease-review/` (manifest,
candidate/rollback por hook, stage.py, test_stage.py, preflight-readonly.sql);
`src/test/equipe-tecnica/attachmentLeaseDeadline.test.tsx`;
`src/test/equipe-tecnica/StorageDownloads.session.test.tsx`;
`scripts/authz-cache/v6/test-isolated.py` e fontes fixas nele enumeradas.
O relatório existente de aceite B2B possui apenas link para este adendo;
roadmap conserva dependências externas abertas nominalmente.