# Monitor — mitigação de pausas evitáveis (21/10/2026) — BLOQUEADA, não ativada

Base: b76298d9. Runtime inalterado (hashes conferidos após restauração):
- src/lib/authz/authzEpochMonitor.ts `72b26f0aa94caae2a94cc0c34a1d8297227b3e7388b30a7c3c574db38f96d1a9`
- src/lib/authz/localDiagnostics.ts `b3691b9a3263a1ac47f1c9338d4219306df0fe50d3c6648afa37b1002c65dccc`
- src/hooks/useAuth.tsx `b3a65696cad65ebe08e861d525c68e55982bf79a49b3e21b448ec09f18d0e63b`
- Suíte src/test/config com runtime restaurado: 1077/1077 (70 arquivos).

## Diagnóstico do evento B (RTT 7999 ms, leaseRemaining −997 ms, aba oculta)
Com amostras ~3 s, a renovação sai em deadline − (7,5 s + jitter ≤ 0,5 s), ou seja 7,0–7,5 s antes.
RTT 8 s ⇒ a resposta chega ~0,5–1 s após o deadline confirmado. O monitor expira (correto pelo
contrato), invalida a geração e o auto_retry abre um SEGUNDO request após 1,5 s. O −997 ms é
compatível com timer da aba oculta disparando atrasado (throttling ~1 s); a checagem de acesso usa
relógio monotônico e não depende do timer, portanto o atraso não estendeu autoridade.
Agregados do gateway (max 2,99 s / 17,1 s) não foram pareados com este evento.

## Candidato testado (candidate/, frontend.patch)
"Lapse": ao vencer a lease com o MESMO request ainda dentro de seus 15 s, esconder (pending) sem
invalidar o request, aceitando sua resposta. Novos testes 9/9 (3/8/17 s, oculto/retomada, revogação,
troca de fingerprint, stop, escopo não revisado).

## Por que NÃO foi ativado
Suíte config com o candidato: 13 falhas reais de contrato, não de scaffolding:
- authzEarlyRenewal: contratos revisados exigem que resposta no/após o deadline confirmado seja
  rejeitada e que 8 s expire com onExpire('timeout').
- financialAdminEnvironment / financialOpenSession / companyAdminOpenSession: "PDF preparado tardio
  após expirar não cria Blob" e "timeout descarta confirmação tardia" — os fences de consumidores
  dependem de onExpire (generationRef++ no AuthProvider). Em pending sem onExpire esse fence não
  dispara: risco real de vazamento de bytes tardios. Corrigir exigiria mexer nos fences de anexos.
- internalProbeLatency: controle publicado deixa de expirar.
Ajustar esses asserts relaxaria contratos fail-closed; por isso a mudança foi revertida.

## Limite documentado
- RTT > 15 s (ex.: 17,1 s do gateway 2): impossível manter acesso sem ampliar lease — pausa é a proteção.
- RTT 7,5–15 s após amostras rápidas: pausa curta ainda ocorre; mitigar exige decisão do
  proprietário entre (a) aumentar a margem mínima (mais requisições, altera constante revisada) ou
  (b) aceitar resposta pós-deadline junto com novo fence de anexos em pending (escopo maior).
- Throttling intenso de abas ocultas (>5 min, 1 timer/min) não é contornável em JS; resolve na retomada.

## Rollback
Nada a reverter no runtime. baseline/ contém cópias byte-exatas das versões vigentes.
