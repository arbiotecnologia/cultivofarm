# Comprovantes de entrega — abridor autenticado (baseline 0b964c47)

Escopo: só consumo/download em `EntregaComprovantePanel` (URL assinada 300 s + `window.open`) e
`ConfirmacaoEntregaPanel` (URL assinada 60 s + `window.open` + `error.message` no toast).
Sem SQL/ACL/RLS, publicação, monitor/lease, assinatura digital, confirmação, uploads/vínculos ou estado operacional.

## Mudança
- Ambos usam o `useAuthenticatedAttachmentOpener` existente (bucket `entrega-documentos`): "Preparar" baixa bytes
  com a sessão do ator; "Baixar" só em novo clique. Recurso = snapshot entrega/registro/caminho; mudança de
  tenant/papéis/época/logout/unmount aborta e revoga Blob; lease inválida oculta e bloqueia o clique antigo.
- `deliveryReceiptLocator`: aceita só `entregas/<entrega_id>/comprovantes/<uuid>.<ext>` da própria entrega
  (formato dos uploads atuais). Outros caminhos falham fechado sem requisição. Erros neutros, sem mensagem do transporte.
- Autorização de papel/tenant permanece na Storage RLS (`storage1_delivery_allowed`, restritiva) — não alterada.

## Limites honestos
- Comprovantes legados com caminho fora desse formato ficam indisponíveis nestes painéis (fail-closed).
- Caminhos `assinaturas/` (PNG da assinatura) não são expostos aqui — não eram por estes botões.
- Testes usam Auth/transporte simulados; não são homologação JWT/RLS real.

## Verificação local
- 25 testes novos (`comprovanteDownloadAutenticado`): locator, happy path, erro, caminho inválido, sem arquivo,
  tenant/roles/época/lease durante e após preparo, nenhuma `createSignedUrl`/`window.open`.
- Suítes entregas + StorageDownloads + AttachmentOpener: 190/190. tsgo app/node EXIT 0.
- `StorageDownloads.session` deixou de cobrir a entrega (fluxo de URL assinada removido); cobertura migrou para o teste novo.

## Pendente
Revisão independente; homologação real A/B (download, negação cross-tenant, troca de papel). Não publicado.

## Rollback
`python3 rollback.py` (preflight) / `--apply [raiz]` restaura bytes de 0b964 e remove os arquivos novos —
reintroduz as URLs assinadas. Testado byte-exato em cópia isolada.

## Extensão (base 489d70016d, mesmo pacote contra 0b964): ClienteDocumentosTab
- Falha real: o gate global `AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED=false` mantinha o branch legado, e um clique em A
  gerou `POST /storage/v1/object/sign/clientes-docs/...` (HTTP 200). O gate global **não** foi alterado.
- Agora o componente usa sempre `useAuthenticatedAttachmentOpener` (bucket `clientes-docs`); foram removidos
  `createSignedUrl`/`window.open`. A UI tem "Preparar"/"Baixar", ambos `type="button"`, e o erro é neutro. O recurso é um snapshot da lista exibida.
- Locator: o caminho precisa começar por `<org do ator>/clientes/<clienteId>/` (formato do upload atual) e não pode ter segmentos vazios, `.` ou `..`.
  Fora disso, falha fechado sem requisição. Tenant/papel continuam na Storage RLS.
- Upload, exclusão, formulário, cadastro, monitor e SQL ficaram intocados.
- `StorageDownloads.session.test.tsx` foi removido: só cobria os fluxos de URL assinada eliminados. A cobertura equivalente (lease
  tardia, tenant, papéis, revogação) está em `ClienteDocumentosTab.authenticatedDownload`, `PortalAttachmentConsumers.blob`
  e `comprovanteDownloadAutenticado`.
- Verificação: clientes + equipe-tecnica + entregas 363/363; tsgo app/node EXIT 0; rollback isolado byte-exato.
- Homologação real pendente: documento cadastral A (1751 bytes), após a revisão. Para entregas, não há registros em A/B,
  então a homologação continua pendente e nenhuma fixture foi criada.
