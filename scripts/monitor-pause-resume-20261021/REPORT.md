# Retomada segura após pausa do monitor — /clientes (candidata local, NÃO publicada)

Base de produção: frontend `51048f5f`. Revisão `d5e0a318` (floor 12 s) foi REJEITADA e revertida.

## 1. Monitor revertido (sem aumento de carga)
- `src/lib/authz/authzEpochMonitor.ts` voltou byte-exato ao baseline publicado (SHA256 `febf394c…8069`), floor 10 s.
- O teste do floor 12 s foi arquivado em `../monitor-spike-floor-20261021/rejected/`.
- Cadência e número de pedidos são idênticos aos de 51048f, porque o código do monitor é o mesmo. Nenhum retry novo e nenhuma cadência maior.

## 2. Entendimento corrigido (incidente admin B 15:20 UTC)
- `rttMs=10430` no `expire` é o tempo decorrido de uma requisição AINDA PENDENTE no prazo (lease de 15 s desde o pedido), não a duração de uma resposta.
- O gateway v2 registrou origin 14.651 ms (upstream 50) e 12.136 ms (upstream 64) na janela, enquanto a V1 respondeu em ~235–438 ms. Como há várias abas com a mesma identidade, não dá para atribuir a request exata à aba.
- Picos de 12–17 s ultrapassam o que qualquer margem dentro do lease de 15 s consegue cobrir. Nesses casos, a pausa fail-closed é necessária. A correção trata a RECUPERAÇÃO, não elimina essas pausas.
- A investigação dos picos v2 está com o proprietário (gateway/upstream), sem opt-out documentado.

## 3. Correção da recuperação
Problema: `AuthzEpochBoundary` desmonta todo o conteúdo quando `authzReady=false`. Depois da reautorização, o modal "Editar Produtor"/aba Documentos sumia e o usuário precisava recomeçar.

Candidata:
- O módulo em memória `src/lib/navigation/protectedResumeContext.ts` guarda somente principal (usuário+empresa+papéis ordenados), rota, ID do cliente e aba de uma allowlist. Não guarda formulário, Blob, URL nem resposta. Não usa storage persistente. Consumo único, TTL de 120 s.
- `ProdutoresTab`: registra o contexto enquanto o modal de edição está aberto e autorizado. Depois de remontar, aguarda a releitura canônica autorizada (`fetchClientes`, as mesmas 2 leituras de qualquer montagem). Reabre só se o cliente ainda vier nessa leitura, com valores do servidor (rascunho descartado). Fechar, cancelar, salvar ou navegar para outra rota limpa o contexto.
- `ClienteFormTabs`: `initialTab` só é aplicada se a aba estiver autorizada (Documentos exige `useCanManageClienteDocs`). A aba Documentos refaz o próprio carregamento autenticado.
- `AuthzEpochBoundary`: com principal diferente ou ausente (troca de identidade, empresa ou papéis, revogação, logout, A→B→A), o contexto é descartado. Durante `authzReady=false` nada é renderizado (inalterado).
- Não há rota, provider ou monitor paralelos.

## 4. Cancelamento do request expirado
Os probes do monitor (`internalContextProbe`, `producerContextProbe`, B2B e `get_my_authz_fingerprint`) não recebem `AbortSignal`. Propagar o sinal exigiria mudar o AuthProvider e todos os probes, o que não é uma alteração mínima, e não reduziria a carga do servidor, que já recebeu a request. Por isso não foi alterado. A resposta tardia já é descartada por geração/fence, sem retry nem renovação. Fica documentado como I/O órfão limitado a no máximo 1 por aba por expiração.

## 5. Testes (transporte simulado; não é homologação real)
`src/test/clientes/ProdutoresTab.authzResume.test.tsx` (9 testes):
- pausa→recuperação reabre a aba Documentos com dados do servidor e sem rascunho;
- leituras na remontagem = 2, sem carga extra;
- consumo único;
- revogação de papel → não reabre;
- cliente removido → não reabre;
- A→B→A descarta;
- fechar descarta;
- TTL, rota, allowlist e logout.

Resultados: `src/test/config` + `src/test/clientes`: 74 arquivos, 1103/1103. Typecheck da app OK; o build roda automaticamente.

## 6. Rollback
`python3 scripts/monitor-pause-resume-20261021/rollback.py` restaura os 3 arquivos (baseline `d7bc1e28`) e remove o módulo e o teste. O monitor permanece no floor 10 s publicado. Não envolve SQL, Auth, Edge, papéis nem dados.

## Pendente
- Estabilidade do gateway v2 (proprietário).
- Homologação real dos demais perfis.
- Revisão independente antes de publicar.
- SU-518022: somente ack.
