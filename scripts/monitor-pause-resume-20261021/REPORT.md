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

## 3. Correção da recuperação (v2 após revisão da691664)
A revisão da691664 mostrou que a v1 retomava com latch/negativa sob o mesmo principal em cache e em qualquer remontagem. Ela foi substituída por:
- **Módulo** `src/lib/navigation/protectedResumeContext.ts`, em memória e sem storage. Guarda principal (usuário, empresa e papéis ordenados), rota, ID do cliente e `pausedAt`. Somente a aba **Documentos** é guardada; outra aba descarta o contexto. Não guarda formulário, Blob nem URL.
- **Arme apenas no ponto canônico** `useAuth` → `onExpire("timeout")` (`armResumeOnTimeout`). O TTL de 120 s conta da pausa, não da abertura do modal.
- **Descarte no `useAuth`:**
  - `onExpire` com ineligible, error ou offline;
  - `onEpochChange`;
  - `latchBlocked`;
  - `signOut`;
  - mudança de principal.
  O `takeResume` exige pausa armada, mesmo principal, mesma rota, TTL e consumo único.
- **`ProdutoresTab`:** depois da releitura canônica autorizada, reabre só se o cliente vier nela, com valores do servidor. O conteúdo fica totalmente ausente enquanto `authzReady=false`.
- **`AuthzEpochBoundary`:** voltou byte-exato ao baseline.
- **AuthProvider:** alteração mínima autorizada, sem novos probes, lease ou cadência.

## 4. Cancelamento do request expirado — PENDENTE (não resolvido)
Os probes do monitor não recebem `AbortSignal`. A resposta tardia é descartada por geração/fence, mas o I/O em voo continua até o transporte terminar. Isso foi aceito como pendência fora de escopo; não está resolvido.

## 5. Testes (transporte simulado; não é homologação real)
- `ProdutoresTab.authzResume.integration.test.tsx` (7): AuthProvider, monitor, probe, boundary e ProdutoresTab REAIS, com transporte e relógio falsos, sem chamada manual a observe/arm. Casos:
  - timeout → mesmo principal recupera Documentos (modal aberto por mais de 150 s antes da pausa), sem rascunho e com releitura;
  - aba Financeiro não retoma;
  - ineligible com papéis restaurados não retoma;
  - cliente negado na releitura;
  - revogação/latch na pausa;
  - logout;
  - A→B→A.
- `ProdutoresTab.authzResume.test.tsx` (5): contrato do módulo (sem arme, allowlist, TTL desde a pausa, divergência, consumo único).
- `src/test/config` + `src/test/clientes`: 75 arquivos, 1106/1106. Typecheck OK. Monitor byte-exato `febf394c…8069`.

## 6. Rollback
`python3 scripts/monitor-pause-resume-20261021/rollback.py` restaura 4 arquivos (baseline `d7bc1e28`, incluindo `useAuth.tsx`) e remove o módulo e os testes. Foi verificado em cópia isolada: os 4 arquivos ficaram byte-exatos e o módulo foi removido. O monitor segue com floor 10 s. Não envolve SQL, Auth server, Edge nem dados.

## Pendente
- Gateway v2: 15:45–52 com máximo de 5.565 ms, contra upstream máximo de 158 e v1 máximo de 411; não resolvido (proprietário).
- Cancelamento de transporte.
- Homologação real dos demais perfis.
- Revisão independente.
- SU-518022: somente ack.
