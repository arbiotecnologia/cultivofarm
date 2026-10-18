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
- [x] Auditar sync/validação, writers, políticas e leitores no ref canônico, sem escritas.
- [x] Preparar experimento mínimo revisável, baseline, rollback e preflight bloqueado sem reabrir PUC.
- [x] Testar projeção, resíduos, repetição, isolamento e concorrência em PostgreSQL descartável (23 checks; três suites focadas passaram).
- [x] Registrar efeitos/limites e PASS/NO-GO por contrato, sem execução hosted/publicação.
- [ ] Autorizar pacote instalável F2-B2: bloqueado por proveniência PTC compartilhada, contrato de ator/cleanup e revogação fora do sync; exige decisão e revisão independentes.

## F2-B3 — decisão de proveniência e preparação
- [x] Reconfirmar baseline read-only e consumidores de concessão independente PTC/PUC (0/0, writers/RPCs/corpos/ACL).
- [x] Comparar modelos e documentar preferência PUC canônica/PTC transitória, 17 critérios, backlog/gates e SQL aditivo bloqueado.
- [x] Revisar preflight/rollback; 14 checks estruturais locais, 4 testes focados em duas rodadas e lint novo exit 0; sem escrita hosted/prova RLS.
- [ ] Instalação futura: depende de aceite da semântica, contrato ator/alvo e provas hospedadas A/B; não autorizada neste turno.

## F2-B3.1 — contrato em etapas sem alterar grants
- [ ] Reconfirmar baseline read-only, writers/readers, cascades e limites de origem server-owned.
- [ ] Preparar metadata neutra sem FK/uso autorizador, preflight, rollback e decisão B3.2.
- [ ] Executar testes PostgreSQL descartável de esquema, parent delete, colisões e preservação; registrar limites e blockers.