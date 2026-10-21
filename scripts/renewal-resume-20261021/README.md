# Retomada de Documentos após renovação natural (TOKEN_REFRESHED) — candidata, NÃO publicada

Base: publicado a82c82d5. Observação real: admin A/B, token_refreshed 16:24:41Z/16:28:41Z, Documentos aberto → lista, sem timeout.

## Causa comprovada (teste integrado AuthProvider real + monitor + AuthzEpochBoundary + ProdutoresTab)
Em TOKEN_REFRESHED do mesmo usuário o AuthProvider limpa identidade e re-resolve perfil/papéis (fail-closed, correto).
Durante essa re-resolução `latchBlocked` fica true e o efeito `if (latchBlocked) clearResume()` descartava
o contexto de navegação síncronamente; a retomada só era armada por `onExpire("timeout")`. Resultado: a tela
reabria na lista. Reprodução: `before.txt` (1 FAIL) → `after.txt` (16/16).

## Correção mínima (2 arquivos)
- `armResumeOnRenewal`: TOKEN_REFRESHED do MESMO usuário arma a retomada (TTL 120 s conta daqui); troca de identidade/saída limpa.
- Principal ausente e latch são tolerados SOMENTE para retomada armada por renovação e SOMENTE enquanto `loading`;
  latch/ausência que persistem após a releitura descartam. Timeout continua com regras anteriores.
- `takeResume` inalterado: exige principal relido idêntico (usuário/empresa/papéis), rota, TTL; ProdutoresTab relê clientes e só reabre se o cliente vier na leitura. Apenas aba Documentos; nenhum rascunho/Blob/URL/dado de formulário.
- Sem novos probes, polling, retries, reload de sessão nem alteração de lease/monitor (carga: probes por renovação ≤ baseline 3).

## Testes
Novos (integrados): mesmo principal reabre com dados relidos e sem rascunho; papel removido; empresa diferente; perfil inativo;
cliente removido; aba ≠ Documentos; TTL; renovação + troca de identidade; carga. Clientes+config+navegação: 1209/1209. Typecheck OK.
Simulado, não homologação real.

## Isolamento XML
Frontend XML candidato (`useFiscalXmlEngine.ts`, `GeracaoXmlNfeSecao.tsx`) restaurado byte-exato ao a82 e arquivado em
`scripts/fiscal-xml-download-blob-20261021/frontend-candidate/` (com patch e teste `.review`). Edge XML não implantada.

## Rollback
`python3 scripts/renewal-resume-20261021/rollback.py` — restaura os 2 arquivos ao a82 (verifica hashes).
