# F2-B — auditoria e preparação revisável

- [x] Confirmar baseline e consumidores read-only no ref canônico.
- [x] Preparar candidata escalar, rollback exato e pré-prova sem executar em banco hospedado.
- [x] Validar localmente e registrar PASS/NO-GO por subfase.
- [x] Documentar bloqueadores externos: trigger de terceiros, contexto legado e RLS A/B reais; sem execução autorizada ao agente.

## F2-B1 — continuação somente leitura/preparação
- [x] Separar ator/alvo e reconciliar leitores diretos, contenções e legado no recorte auditado.
- [x] Preparar baseline, matriz e candidatas B1a/B1b com preflight e rollback; B1a somente gate NO-GO por contrato não provado.
- [x] Executar regressões no PostgreSQL descartável e registrar limites e próximo gate (35 asserts novos, 2 testes Vitest passaram).
- [ ] Liberar candidata instalável: bloqueada por contrato de gestão/cleanup e provas RLS A/B/legado hospedadas; exige próximo recorte e autorização independente.

## F2-B2 — projeção técnica contida
- [ ] Auditar sync/validação, writers, políticas e leitores no ref canônico, sem escritas.
- [ ] Preparar correção mínima revisável, baseline, rollback e preflight sem reabrir PUC.
- [ ] Testar projeção, resíduos, repetição, isolamento e concorrência em PostgreSQL descartável.
- [ ] Registrar efeitos/limites e PASS/NO-GO por contrato, sem execução hosted/publicação.