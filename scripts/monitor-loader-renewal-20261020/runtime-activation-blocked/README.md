# Ativação runtime do monitor 88a872 — BLOQUEADA (2026-10-20 14:0x UTC)
Baseline runtime conferida antes da cópia: 165c628ebfa5af4e89f597971c0b88861fb831e12e012c1e7292ce154f2f1f9f (PASS).
Candidato copiado (7277e3b7…), tsgo app EXIT 0 e 18 regressões do pacote PASS, mas a suíte runtime existente src/test/config falhou:
- baseline: 2 falhas (preexistentes: canonicalTypesGuard, cultivofarm-runtime.static), 1075 PASS;
- candidato: 78 falhas em 15 arquivos (76 novas), incluindo retryLoadingRace (loader travado não termina em erro recuperável), operatorOpenSession offline/restore, autoTimeoutRecovery, monitorRetryReresolve, authzFoundation, authProviderCallback.
Parte pode ser simulador sem `.abortSignal()`, mas suítes que já o simulam também falham por comportamento.
Runtime restaurado byte-exato à baseline; nada commitado como ativação. CQ intocado. Sem publicação/sessão/dados.
Logs: candidate-runtime-suite.log, baseline-runtime-suite.log.
