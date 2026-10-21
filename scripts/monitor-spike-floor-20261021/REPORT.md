> **REJEITADA — revisão d5e0a318 (15:43 UTC): NÃO publicar.** O floor de 12 s evita apenas o pico de 10.500 ms; 12.136/14.651/17.000 ms continuam pausando, e a carga aumentaria 67–71%. Correção: `rttMs=10430` foi o tempo decorrido de uma requisição ainda pendente, não uma resposta 3 ms atrasada. Monitor revertido byte-exato para 10 s; veja `../monitor-pause-resume-20261021/`.

# Monitor — piso de renovação 10 s → 12 s (candidata, NÃO publicada)

Base: frontend publicado 51048f5f / repo 8bddd182. Só `src/lib/authz/authzEpochMonitor.ts` (constante + comentário).
Baseline SHA256 `febf394c…8069` → candidata `109d5b81…4238`. Sem SQL/Auth/papéis/Edge/dados/publicação.

## Causa comprovada (adminB 15:20:25.534Z)
`rttMs 10430`, `leaseRemainingMs -3`, `requestRemainingMs 4570` (= 15000 − 10430):
o request começou com 10 427 ms de lease restante (piso 10 000 + jitter 427).
A resposta precisava de 10 430 ms → lease expirou 3 ms antes. Não foi revogação
(sem `ineligible`), nem timer suspenso (o deadline foi atingido em estado `valid`).
O `auto_retry` 1,5 s depois recuperou a tela, mas o conteúdo protegido foi desmontado
pelo `AuthzEpochBoundary` (por desenho) → modal Documentos e Blob preparados descartados.

## Correção
`EARLY_RENEWAL_FLOOR_MARGIN_MS = 12_000`. Lease 15 s desde o request, rejeição de
resposta tardia, single-flight, boundary do servidor e fail-closed inalterados.

## Limite matemático (impossível evitar pausa acima disto sem ampliar lease)
Folga máxima no início do request = 15 s − RTT anterior − 1 s (MIN_DELAY).
- RTT anterior ≤ 2 s: pico isolado < 12 s passa.
- RTT anterior 3 s: pico < 11 s passa; 11,5 s pausa.
- Pico ≥ 12 s, RTT sustentado > ~7 s, ou ≥ 15 s: pausa sempre (fail-closed).
Antecipação adaptativa por pico observado foi avaliada e descartada: não protege o
PRIMEIRO pico após amostras rápidas (caso real) e só aumentaria carga depois.

## Impacto de carga (por aba, inclusive abas ocultas no escopo revisado)
| RTT | piso 10 s | piso 12 s |
|---|---|---|
| ~0,2 s | ~4,5 s entre requests (21/90 s) | ~2,5 s (36/90 s, +71%) |
| 1,5 s | 5 s | 3 s (+67%) |
| 3 s | 5 s | 4 s (+25%) |
Com N abas a carga é N×. Se o gateway mostrar saturação, rollback é imediato.

## Recuperação/estado
Durante pendência/expiração nada sensível fica montado; Blob/modal NÃO são
reaproveitados (exigiria nova autorização). Re-preparo manual após retomada é o
comportamento seguro esperado; preservar estado não sensível (qual modal) exigiria
mudança de UI fora deste escopo mínimo.

## Testes (simulados, relógio/timers falsos — não é homologação real)
- Novo `src/test/config/authzSpikeFloor.test.ts` (14): 10,43/10,5/11,5/11,9 s após 1,5 s;
  10,5 s após 3 s; limites 11,5 s/12,5 s pausam e não reabrem; sustentado 10,5 s;
  ≤15 s por grant e sem sobreposição; carga; timer suspenso 20 s; revogação; boundary servidor.
  Contra a baseline: 8 falham (reprodução).
- Ajustados só valores de cadência/contagem fixados no piso antigo (authzEarlyRenewal,
  autoTimeoutRecovery, managerConsultantOpenSession); nenhum assert de segurança relaxado.
- `src/test/config` + `src/test/equipe-tecnica` + recuperação: 1298/1298. Typecheck OK.

## Rollback
`python3 scripts/monitor-spike-floor-20261021/rollback.py` (verifica hashes, restaura piso 10 s).
