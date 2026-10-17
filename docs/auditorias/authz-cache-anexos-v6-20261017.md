# v6 — 17/10/2026, resultado revisável, NO-GO

Sem instalação, SQL hosted, deploy Edge, publicação ou gates; nenhuma ação
em assinatura/pagamentos/associações/SMTP/Auth. AR Bio ACTIVE preservada sem
readback ou conversão nesta rodada. Relatos do auditor são evidência externa.

## Downloads candidatos

- `useAuthenticatedAttachmentOpener.ts`: Map por path, dedupe inclusive após
  conclusão, eviction LRU máximo 24 URLs e 60MiB por owner, arquivo máximo
  20MiB; revoke antes de eviction e scope/unmount; retry manual após erro ou
  eviction, trava durante request e controller antigo não remove novo.
- Download é clique explícito síncrono em anchor `download`, sem target/new
  window nem popup async. Primeiro clique prepara; UI apresenta loading e
  "Baixar arquivo"/"Pronto para baixar" quando pronto. Não dispara download
  oculto depois do await; não exige segundo clique invisível.
- ClienteDocumentosTab/OrderMessagesPanel adaptados só no ramo gate fechado.
  Thumbnail e documentos preservam fences tenant/identity/epoch/pending e
  abort/limpeza; legado ainda ativo com gate false, não classificar drenado.
- Ownership limitado por owner, não agregado universal de todos os componentes.
  Downloader global já limita 3 ativos/48 espera/15s desde entrada; Blob pool
  de thumbnails tem seus próprios limites. Limite de memória universal, browser
  streaming e todos os emissores não certificados por este delta.

## Testes executados

`bun run test -- src/test/equipe-tecnica src/test/config/authzEpochMonitor.test.ts src/test/config/authzFoundation.integration.test.tsx src/test/clientes/ClienteDocumentosTab.formSubmit.test.tsx`

**183/183 PASS, 15 arquivos**:
- 7 ownership novos: 24 URLs/dedupe/eviction/retry, 60MiB/>20MiB, anchor
  explícito sem popup e limpeza, resposta após unmount/tenant/epoch/pending.
- 17 consumidores reais RTL: preparação/repetidos/negação/retry, obsoleto após
  unmount/escopo/ABA, duplo clique e thumbnail; transporte simulado.
- Blob 23 e galeria retry 4 preservados, demais regressões na suíte.
- Monitor 19 + integração 12 existentes sem enfraquecimento. Teste independente
  do auditor de resposta após unmount citado como PASS externo; fonte própria
  do auditor não localizada nesta árvore, não editada/substituída. Caso local
  após unmount permanece exercitado no hook e consumidores.

Lint hook/2 arquivos testes alterados **0 erros/0 warnings**. Build automático
OK e diff-check PASS. Typecheck dedicado e scanner completo desta rodada não
executados manualmente, aguardam validação independente; não alegar zero.
Nenhum desses testes é HTTP Storage real ou sessão autenticada real.
Browser real de Blob/download ainda UNVERIFIED porque gates não podem abrir;
anchor evita popup mas comportamento download/dispositivo requer auditoria.

## SQL/cache e contratos

- `v6-contracts-supplied.json`: 16 hashes fornecidos, fonte externa explicitada.
- `v6-missing-contracts-readonly.sql`: catálogo a capturar, não executado.
- `v6-status.review.md`: closure de leitura agora inclui invites/iat, entitlements
  completos e wrappers recebidos; contratos faltantes listados precisamente.
- Ordem de locks comerciais/tickets/guards e DDL fullschema não fechadas,
  `is_platform_superadmin(uuid)` ainda sem corpo fornecido neste pacote.
  Leitor snapshot/tempo não pode aprovar lease além de próxima fronteira.
  Portanto **não transformar desenho por entidade em SQL executável/harness
  falsamente fiel**. Nenhum novo harness SQL aprovado com stubs.

## Contenção server-side candidata

- `storage-operation-containment.sql.review` + rollback: RESTRICTIVE por
  operação, allowlist de download autenticado/list/info e negação signing.
  Sem alargar tenant/RBAC existente nem confiar no cliente. Hashes live
  faltantes fazem preflight/rollback falhar fechado; não instalar.
- Plano/inventário no adendo `anexos-contencao-drenagem-5584cc29.review.md`.
  Helper/ACL/policy/buckets e HTTP live não comprovados. Emissores service-role
  permanecem fora da contenção RLS e exigem retirada nos ramos Edge; não tocar
  runtime Edge para evitar implantação automática não autorizada.
- T0 indefinido; bytes já baixados não revogáveis. UI nova e policy candidata
  não provam que cliente antigo perdeu emissão. Gate cache/Blob false;
  principal/edição de vínculos continuam fechados.