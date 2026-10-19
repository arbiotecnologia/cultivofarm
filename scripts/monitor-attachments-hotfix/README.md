# Hotfix frontend isolado — monitor (variação >5 s) + downloads financeiros autenticados

Baseline publicada: `3eeb3212bcb42d606e924ba8b2cc21399d93d5f6`. Delta apenas frontend: `hotfix.patch`
(aplicável com `patch -p1` sobre a árvore 3eeb). Não inclui o candidato de Gerar Lote (permanece só em docs/árvore, não aplicado).
Sem SQL, sem publicação, sem mutação de papéis/dados. Contratos e v6 global seguem bloqueados.

## 1. Monitor — margem de renovação
- Evidência real (aba B, `index-8tXv60Mf`): expire `timeout`, `rttMs 5094`, `leaseRemainingMs -7`, após amostras ~3 s.
  A requisição começou 5.087 ms antes do deadline (piso 5 s + jitter) e chegou 7 ms tarde.
- Correção: `EARLY_RENEWAL_FLOOR_MARGIN_MS` 5000 → 7500. Só antecipa a requisição; lease 15 s desde o início
  do request, rejeição de resposta tardia, single-flight, MIN_DELAY 1 s, deadline e revogação inalterados.
- RTT acima de ~7,5 s continua falhando fechado (teste 8 s). Cadência típica passa de ~10 s para ~7,5 s.
- Testes: picos 5,1/5,5/6/7 s após 200 ms mantêm acesso; 5,5/6/7 s e outros 5 casos FALHAM com o piso antigo (verificado).

## 2. DocumentosPanel (`financial-docs`) e HistoricoExportacoes (`financial-reports`)
- Removido `createSignedUrl` (300 s / 3600 s) e `window.open`. Usa `useAuthenticatedAttachmentOpener` existente.
- Recurso = snapshot `id/storage_path/deleted_at` (exportação: `id/bucket/path/status`) + escopo da lista.
- "Preparar" baixa bytes com a sessão do ator (Storage RLS `financial_storage_object_permitted`, lida read-only:
  SELECT permitido a staff financeiro; `financial-reports` exige 1º segmento = org do ator). "Baixar" só em novo clique.
- Fail-closed: excluído, caminho fora de `owner_type/owner_id/arquivo`, DELIVERY (RLS nega), bucket ≠ `financial-reports`.
- Blob revogado/request abortado em tenant/papel/época/logout/unmount; bytes tardios após deadline sem rerender descartados.

## Verificação (local, Auth/transporte simulados — não é homologação JWT/RLS real)
- Árvore 3eeb + patch em /tmp: tsgo app/node EXIT 0; 7 arquivos focados 137/137; suítes config+financeiro+fiscal 2.1:
  1583/1585 — 2 falhas preexistentes (`canonicalTypesGuard`, `cultivofarm-runtime.static`) por imports legados em
  arquivos fora deste delta (ClienteDocumentosTab, EstornoDialog, AprovacaoCard, WizardAnexosStep, Categorias).
- Pendente real: renovação natural com rascunho >60 s em browser, download real A/B e negação por tenant.

## Rollback
`scripts/monitor-attachments-hotfix/rollback.sh` restaura bytes exatos 3eeb (`baseline.SHA256SUMS`) e remove o teste novo.
