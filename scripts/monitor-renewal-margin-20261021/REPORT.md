# Margem de renovação antecipada 7,5 s → 10 s (21/10/2026) — ativo localmente, NÃO publicado

## Mudança
Somente `EARLY_RENEWAL_FLOOR_MARGIN_MS` 7_500 → 10_000 e o comentário técnico em
`src/lib/authz/authzEpochMonitor.ts`. Mínimo 1 s, jitter 0,5 s, lease 15 s desde o início do
request, rejeição de resposta tardia, single-flight, onExpire e fences intactos.
Não tocados: useAuth, consumidores/anexos, CQ, RLS/SQL/Auth, candidato lease-lapse (segue rejeitado).

| Arquivo | SHA-256 |
|---|---|
| authzEpochMonitor.ts baseline (7500) | 72b26f0aa94caae2a94cc0c34a1d8297227b3e7388b30a7c3c574db38f96d1a9 |
| authzEpochMonitor.ts candidato (10000) | febf394c270758376370df87ebdc1f05749a54badb46065e573dad09bd828069 |
| useAuth.tsx (inalterado) | b3a65696cad65ebe08e861d525c68e55982bf79a49b3e21b448ec09f18d0e63b |
| localDiagnostics.ts (inalterado) | b3691b9a3263a1ac47f1c9338d4219306df0fe50d3c6648afa37b1002c65dccc |
| roleChangeReresolve.ts (inalterado) | b6d7f4e42ec858b0be5105986ef2c110994849419d88a8a630805e7ec788ef8d |

## Limites
- Pico ISOLADO de até ~9,5 s após RTT baixo: passa (8 s observado em B coberto).
- RTT 8 s sustentado: margem = 2×RTT = 16 s > lease → expira fail-closed.
- RTT ≥ 15 s (ex.: 17,1 s do gateway 2): expira fail-closed; só ampliar lease resolveria (não feito).
- Abas ocultas com throttling: timer atrasado nunca estende acesso (checagem por relógio monotônico).

## Frequência e carga (somente escopos revisados com renewBeforeDeadline)
Intervalo = RTT + max(1 s, 15 s − RTT − margem − jitter):
- RTT 3 s: 7,5 s → 5 s (+50% requisições do probe por aba).
- RTT 0,2 s: ~7,3 s → ~4,5 s (+60%).
- RTT ≥ 4 s: já limitado por 2×RTT; diferença decrescente.
Cada probe é uma RPC leve (internal_actor_context_v1). Com N abas abertas a carga escala por N.
Risco: sob degradação do gateway, mais probes concorrentes; mitigado por single-flight por aba e
piso de 1 s. Nenhum log sensível novo (diagnósticos inalterados).

## Testes
Novo `src/test/config/authzRenewalMargin.test.ts` (7, tempos absolutos):
- Com 10000: 7/7.
- Com baseline 7500: 5/7 — falham "pico isolado 8 s" (expira: regressão esperada reproduzida) e
  "revogação durante pico 8 s" (baseline expira por timeout antes de ver ineligible; ainda bloqueado).
Scaffolding ajustado só em aritmética de cadência acoplada a 7,5 s, sem relaxar fail-closed:
- authzEarlyRenewal: sequências de início, tetos de contagem, constante esperada; teste "pico acima do
  piso" passou de 8 s para 10,5 s (continua provando expiração e não reabertura); "resposta no
  deadline" usa RTT 10 s.
- managerConsultantOpenSession: contagem de polls ocultos em 20 s agora faixa 2–5 (cadência ~5 s).
- retryLoadingRace (admin, 8 s): espera limitada (≤30 s) até "Sessão pausada" — instabilidade já
  conhecida da baseline (1/3 falhas na baseline sem ajuste), o assert de pausa se mantém. 5/5 após ajuste.
Resultados: src/test/config 1084/1084 (71 arquivos); config+lib+equipe-tecnica+financeiro 1352 testes,
únicas 8 falhas em financialReport*.edge (idênticas na baseline, sem relação). tsgo app OK; build OK.
Testes sintéticos (relógio/transporte simulados): não são homologação JWT/RLS/browser real.

## Rollback
`python3 scripts/monitor-renewal-margin-20261021/rollback.py` (confere hashes, restaura 7500).
Testes ajustados podem ser revertidos junto, se desejado (frontend.patch documenta só o monitor).
