# Cache e anexos — candidata revisável 0c324c2d

## Estado e evidências

**NO-GO para instalação, publicação e abertura.** Cache e Blob gates `false`.
Base `5aff4b06369d3530272ee2107205f534669b0a16` ancestral preservada;
nenhuma nova ativação, associação, assinatura, pagamento ou escrita hosted.

Evidência externa do titular: revisão 45/45 (14 independentes + 19 monitor +
12 integração), lint 0/4 warnings e scanner4230/0. Esses 14 testes independentes
não são atribuídos à execução deste agente. B2B publicado abriu parceiro correto,
pedidos vazio, outros recursos explicitamente indisponíveis; `/plataforma` negada.
**Isso não certifica fluxo B2B integral.**

## 1. Contrato individual corrigido

`scripts/authz-cache/resolver-contracts.json` arquiva os hashes **informados pelo
auditor**, não uma nova captura hosted:

| Resolver | Volatilidade | MD5 da definição |
|---|---|---|
| get_cliente_ids_for_user(uuid) | v | c80d5900692d960f649d0a9f7850fe2c |
| producer_commercial_client_scope(uuid) | s | 49b8329ce232670c1560f0683b913a26 |
| b2b_commercial_context() | s | 02158d4204dea67308558f649113ba6d |

`candidate.sql.review` v4 compara cada contrato separadamente. Core e wrapper
são **VOLATILE**: não prometem snapshot STABLE sobre dependência VOLATILE;
resolvers existentes não são alterados. Wrapper permanece INVOKER, core privado
self-only, search_path vazio e grants específicos mínimos.

Harness agora executa preflight com **hashes dos corpos locais substituídos apenas
em memória**, mantendo volatilidades v/s/s; não pula o bloco e não afirma hashes
hosted testados. Primeira execução revelou conflito de variável record `p` com
alias `pg_proc p`; corrigido para `proc`. Nenhum PASS atribuído à tentativa falha.

## 2. Inventário de writers e revisão monotônica

Fontes locais e migrations históricas não provam instalação simultânea. Preflight
read-only em `scripts/authz-cache/writer-preflight-readonly.sql` inventaria triggers,
enablement, hashes, FK actions e ACL, **não executado hosted**.

| Dependência | Writers/arquivos auditados |
|---|---|
| Identidade, roles, vínculos | `scripts/tests/b2b-provisioning-real-triggers.sql`: acquire_gate/touch_related_profiles; `create-user/index.ts`, admin_provision_user_profile_v1/admin_edit_user_profile_v1 (20260922160218 e sucessores), tenant_admin_set_user_active (20261005192534) |
| Dados comuns externos | `scripts/user-links-phase2/installed/20261016221926*` e `20261016223134_user_edit_f2_common.live.sql.review`; não abrir associação |
| Principal | `scripts/user-links-principal/installed/20261016235551*`: sync_user_cliente_principal/trg_user_clientes_sync_ins/upd/del, OLD+NEW, nested profile writes; índice UNIQUE(user_id) WHERE principal preservado |
| Partner membership/papel | link_partner_user/set_partner_user_papel (20260702022038/20260702022922), `usePartnerUsers.ts`; partner ativo/deleted/owner em `useParceiroB2BMutations.ts` |
| Provisionamento/convites/Auth | `20261015205954*`: claim/finish/compensation/invitation gates; handle_new_user (20260729112758); Edges create-user, admin-update-user-password, platform-invite-org-admin, platform-org-admin-email-change |
| Organização | _org_set_status/onboarding/create (20261001120810, 20261005193030, 20261005232036); profile core (20261007032147), admin/finalizer (20261001122557, 20261002052628) |
| Entitlements | `20261006042518*`: entitlements_for_user, feature override/end; subs ACTIVE/TRIAL/cancel_at; versões publicadas/features/modules ativos |
| Assinatura/planos | transition_subscription_core instalado `20261017005910*`, extend_trial (20261005231945), expire_due_trials (20261005231703); publish/save/archive plan (20261006035846/20261006032326) |
| Serviços/fixtures | fase-e-runtime-harness e provisioner direto; sem exceção de invalidação para service/fixtures |

`monotonic.sql.review` complementa v4, reutilizando singleton **existente**
`cf_user_guards_v1.state.revision`, sem reset/backfill. Preflight exige os cinco
gates BEFORE STATEMENT I/U/D existentes (inclusive auth.users), sem criar trigger
em schema reservado. Trigger privado novo cobre organizações/partners/clientes,
assinaturas/overrides/versions/version_features/features/modules; nega TRUNCATE
nessas nove dependências e incrementa antes de DML, inclusive nested/zero-row.
Não usa GUC, depth bypass ou fan-out de identidades. Não autoriza escrita: guards,
RLS e tickets existentes continuam obrigatórios. Rollback remove só objetos novos,
preserva contador e exige prova externa de gate fechado.

Leitor self-only compara contador antes/depois do resolver VOLATILE, recusando
drift comprometido; incorpora decimal bigint como texto no hash, sem Number JS
ou IDs extras retornados. A→B→A **committed nas dependências cobertas** muda hash
mesmo sem updated_at. Savepoint/rollback desfaz dados+incremento.

### Bloqueios para instalação
- Cobertura hosted de gates/ACL/FKs e dos demais writers transitivos NÃO comprovada.
- Autorização por tempo muda sem DML; resolver atual e lease continuam necessários.
  Revisão monotônica não captura todas as janelas temporais intermediárias por si.
- TRUNCATE/replication/DDL privilegiado nos cinco objetos de identidade deve ser
  auditado externamente; candidata não modifica auth/storage gerenciados.
- RPCs que adquirem row lock antes do singleton podem inverter ordem. A corrida
  isolada prova serialização básica, não ausência universal de deadlock. Retry não
  autoriza duplicar mutações nem ampliar associação.
- Invalidação global pode causar remount em tenants não afetados e aumentar carga;
  medir antes de abrir. JWT/session revocation permanece responsabilidade Auth.

## 3. Anexos autenticados — implementação candidata

Arquivos:
- `src/lib/authz/attachmentBlobGate.ts`: false separado, sem abertura implícita.
- `authenticatedAttachment.ts`: cliente canônico, SDK `.download(...).asStream()`,
  `cache:no-store`, AbortSignal; nunca signed/public fallback; erro neutro.
- `useAuthenticatedBlobUrls.ts`: interfaces urls/loading/error/refresh + request,
  ownership e fences identidade+tenant+roles+resource+epoch, cleanup em layout effect.
- `useSignedUrls.ts`: adaptador compatível com ambas branches montadas; gate false
  conserva legado e candidato não baixa; opção lazy aditiva.
- `EvidenciasGallery.tsx`: candidata lazy por IntersectionObserver fotos visíveis,
  outros arquivos por clique; pending remove imagem/lightbox antes do paint.

Limites operacionais propostos (não regras comerciais): 3 downloads simultâneos
globais, fila até48, 24 caminhos/escopo, 20MiB/arquivo, 60MiB retidos por hook,
timeout15s incluindo fila. Streaming cancela ao ultrapassar bytes; um chunk já
recebido e buffers do browser ainda existem. **60MiB não é orçamento global de
todos os hooks**. MIME conservador por extensão allowlisted; desconhecido vira
octet-stream. Não renderizar HTML/SVG arbitrário. Sem persistência de Blob/cache
de conteúdo. URL criada pertence ao hook e é revogada em refresh/remoção/logout/
pending/epoch/unmount; resposta antiga não publica URL. Interfaces legadas não
prometem download click em uma etapa: arquivos lazy podem exigir novo clique
após obter bytes, ponto UX a revisar.

### Inventário completo de emissores localizado no código

| Emissor | Bucket / TTL legado |
|---|---|
| useSignedUrls (9 consumidores) | consultor-arquivos/aplicacao-evidencias /3600s |
| useCommercial.getAttachmentSignedUrl → OrderMessagesPanel (portal e comercial) | order-attachments /3600s |
| ClienteDocumentosTab | clientes-docs /60s |
| DocumentosPanel | financial-docs /300s |
| HistoricoExportacoes | financial-reports ou bucket da linha /3600s |
| ConfirmacaoEntregaPanel | entrega-documentos /60s |
| EntregaComprovantePanel | entrega-documentos /300s |
| RecibosList | financial-receipts /3600s + URL retornada da Edge |
| pdfAplicacao | aplicacao-evidencias /600s |
| Edge generate-financial-report/receipt | financial-reports/receipts /3600s |
| Edge entrega-termo-pdf | entrega-documentos /120s |
| Edge fiscal-xml-engine | bucket do run /120s |

9 consumidores compartilhados: ConsultorTecnico, RoteiroVisita, EvidenciasTabs,
EvidenciasGallery, HistoricoTalhao, TimelineAtendimento, SolicitacaoDetalheTabs,
MobileTalhaoHistorico, WizardAnexosStep. Branding `logos.getPublicUrl` em
AparenciaTab/PortalBrandingSettings **preservado público**.

### Delta posterior necessário antes de liberação integral
- Emissores diretos/Edges da tabela ainda não migrados; promover apenas adaptador
  não elimina URLs legadas. Preparar abertura/download owned por componente com
  fence imediatamente antes de abrir popup/save/email e cleanup de janela vazia.
- Migrar lazy/visibility nos outros oito consumidores; default compatível é eager,
  não declarar native loading=lazy como adiamento do download.
- Remover fallbacks privados legados em EvidenciasTabs, RoteiroVisita,
  HistoricoTalhao, TimelineAtendimento, SolicitacaoDetalheTabs e MobileTalhaoHistorico
  após comprovar paths/metadata; sem fallback para URL remota quando path privado
  falhar. Revisar audio src/lightboxes e PDF/email final, não apenas fetch inicial.
- Essa lista é **plano de promoção**, não alegação de conversão completa. Nenhuma
  Edge tocada/deployada e nenhuma Storage policy ampliada neste recorte.

## 4. Janela de drenagem e clientes antigos

T0 só começa após cessar **todos** os emissores privados relevantes no frontend e
Edges e impedir emissão por versões antigas. Publicação isolada não basta: abas
antigas podem continuar assinando. Usar fluxo canônico de atualização/version
existente e, se necessário, contenção server-side revisada; não inventar revogação
de signed URLs via logout. Registrar última emissão efetiva e aguardar ao menos
TTL máximo observado **3600s**, margem para clock e TTLs externos ainda desconhecidos.
Enquanto emissores antigos existirem, T0 indefinido e abertura integral NO-GO.
Testar URLs pré/pós-limite e sessões antigas sob autorização específica, sem
prometer revogar arquivo já baixado, cópia/cache externo ou documento já aberto.

## 5. Resultados exatos do agente

- **117/117 Vitest**,8 arquivos: monitor19, integração Auth12, scoped11,
  legacy signed21, Blob17, gallery session8, gate+gallery real2, F2 diálogo27.
  Sessão/transporte simulados; gate true e false explicitamente mockados.
- **38 assertions SQL v4 +22 monotônicas**,2 checks synthetic multirow/nested/
  cascade,1 teste duas conexões, rollback monotônico e v4 PASS. PostgreSQL isolado;
  Auth/schema/entitlements reduzidos. Não executar esses fixtures no hosted.
- Regressão separada principal: **40 checks PASS**, guards reais capturados,
  cascades/writer aninhado/duas conexões. Não é fullschema conjunto de nova trigger.
- Lint focal **0 erros/0 warnings**. Build automático **OK 01:47:06 UTC**; erro
  intermediário BlobPart Uint8Array corrigido com buffer próprio. Typecheck dedicado
  não executado manualmente: **UNVERIFIED**, build não o substitui.
- Scanner focal **16 arquivos/0 achados**, diff-check PASS e build automático
  **OK 01:48:44 UTC** no fechamento; sem prova autenticada
  browser/Storage API/hosted SQL nesta rodada. Sessão externa gerenciada indisponível
  ao agente; evidência do auditor acima não substitui testes integrados de anexos.

Riscos pendentes são gates técnicos, não pedido genérico de aprovação humana;
gestão de vínculo permanece bloqueada. Relatório anterior é histórico e suas
alegações universais de updated_at/ABA não valem para esta candidata.
---

# Adendo — revisão a36514db (17/10/2026): impeditivos e correções

## A. Revisão monotônica global REJEITADA — substituída por escopo

`monotonic.sql.review` incorporava singleton GLOBAL no fingerprint de todas as
identidades e BEFORE STATEMENT em clientes/empresas/assinaturas: edição zero-row
em tenant A remontava rascunhos de B e serializava writers comerciais no lock
global, com risco de inversão contra row locks de RPCs. **NÃO INSTALAR**; arquivo
preservado como histórico com cabeçalho de rejeição.

Substituta `scoped.sql.review` (v5, candidata, não instalada):
- fingerprint do titular usa `profiles.updated_at` do PRÓPRIO usuário (carimbo
  já movido pelos triggers live `z90_cf_touch_profile` em user_clientes/
  partner_users/user_roles → `touch_related_profiles`, e `z99_cf_profile_stamp`
  em profiles → `greatest(clock_timestamp(), OLD.updated_at + 1 microsecond)`);
  nenhum contador global novo.
- AFTER ROW `a01_authz_scope_touch` apenas em `partner_accounts` (toque nos
  perfis dos partner_users do parceiro) e `organizations` (toque nos perfis da
  organização), reutilizando `touch_related_profiles`/`advance_stamp`;
  fan-out limitado ao escopo afetado, locks por PK ordenada.
- Sem BEFORE STATEMENT global, sem GUC, sem pg_trigger_depth; writers comerciais
  de outros tenants não tocam o carimbo do titular.

Testes (`scoped-tests.sql.review` + `test-local.py`, PostgreSQL descartável):
38 assertions base PASS; 5 checks scoped PASS (ABA do titular muda fingerprint;
escrita em tenant A NÃO muda carimbo/fingerprint de B; toque via partner_accounts
e fan-out por organizations funcionam; carimbo monotônico); 1 teste com DUAS
conexões reais: writer de tenant A com transação aberta não bloqueia nem altera
o carimbo de tenant B (<0,5s). Rollback scoped PASS, carimbos preservados.
Limites: fixture reduzida, não prova hosted, fullschema, RLS, lock ordering
contra RPCs comerciais reais nem cobertura universal de writers transitivos.

## B. EvidenciasGallery — estados de falha/retry acessíveis

Antes: consumia só `urls/request`; falha de rede/limite 24 arquivos/20 MiB
deixava ícone mudo e o clique não repetia (controllers retinha o path).

Correções:
- `useAuthenticatedBlobUrls`: estado `failed` por caminho; controlador removido
  no `finally` (permite retry); `catch` marca o path como falho.
- `useSignedUrls` (legacy): `failed` derivado de caminhos válidos sem URL após
  erro; retry via `refresh` refaz o lote.
- Galeria: item falho exibe `role="alert"` "Falhou — tentar novamente" com
  aria-label; clique repete o download (candidato: `request`; legado:
  `refresh`); spin de carregamento só no candidato; nenhuma URL/arquivo obsoleto
  é aberto (lightbox só com URL do escopo vigente).
- Bug encontrado nos testes: `request`+`refresh` juntos abortavam a própria
  retentativa (cleanup do efeito aborta controllers); corrigido para um caminho
  por branch.

Teste real de componente `EvidenciasGallery.retry.test.tsx` (2 testes): falha
de rede → feedback acessível → clique repete → sucesso abre lightbox sem duplo
clique; falha persistente não abre arquivo nem limpa o erro.

## C. Consumidores de anexos sensíveis — candidatos com gate fechado

- `ClienteDocumentosTab` (bucket clientes-docs): branch candidata fechada com
  download autenticado + Blob URL (revoga após 60s), fence `access.capture()`;
  legado signed URL 60s preservado só com gate false; botões type="button"
  mantidos.
- `OrderMessagesPanel` (bucket order-attachments): `openOrderAttachment` e
  `AttachmentThumb` com branch candidata fechada (Blob URL, abort/revoke no
  unmount); SEM fallback remoto quando o download autenticado nega; legado
  `getAttachmentSignedUrl` só com gate false. Logos públicos de branding
  intocados.
- Emissores privados restantes inventariados (não convertidos neste recorte):
  `financeiro/DocumentosPanel.tsx`, `financeiro/relatorios/ReportShell.tsx`,
  `hooks/useCommercial.ts:getAttachmentSignedUrl` (usado pelo branch legado),
  `hooks/useSignedUrls.ts` legado e demais consumidores listados nos testes.
  Enquanto existirem, T0 de drenagem permanece indefinido e a abertura do gate
  global é NO-GO; atualização de UI não resolve clientes/antigas abas que
  continuam emitindo signed URLs — contenção/drenagem server-side revisável
  segue pendente (plano na seção 4 original).

## D. Resultados exatos desta rodada

- **117/117 Vitest** em 10 arquivos de `src/test/equipe-tecnica` (inclui os 2
  novos de retry e os 14 testes independentes preservados); monitor/hooks
  aprovados em 0c324c2d intocados.
- SQL local: 38 assertions base + 5 scoped + 1 duas conexões + rollback PASS
  (PostgreSQL descartável; NÃO hosted).
- Typecheck `tsgo -p tsconfig.app.json`: **0 erros**. Lint focal: 0 erros novos;
  7 erros `no-explicit-any` legados em ClienteDocumentosTab/OrderMessagesPanel
  preexistem ao diff (não introduzidos). Build OK; diff-check PASS; scanner
  focal: apenas REVOKEs esperados nos SQL candidatos.
- Gates: `AUTHZ_CACHE_FOUNDATION_ENABLED=false`,
  `AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED=false`. Sem SQL hosted, sem instalação,
  sem publicação, sem alteração de associações/assinatura/pagamentos/dados.

## E. Pendências e riscos

- Candidata scoped exige revisão crítica: campos/joins do schema (ex.
  `partner_accounts.commercial_owner_organization_id`), fan-out e lock ordering
  precisam de harness fiel ao fullschema antes de qualquer instalação.
- Limites do downloader (3 concorrentes, fila 48, 24 caminhos, 20 MiB/arquivo,
  60 MiB/instância, timeout 15s) implementados, mas 401/403/404/arquivo grande/
  timeout/fila ainda sem teste real dedicado nesta rodada.
- Prova autenticada browser/Storage API e hosted SQL seguem UNVERIFIED; nenhum
  teste mockado aqui é prova hosted.
- Gestão/troca de vínculos permanece bloqueada; não declarada liberada.
