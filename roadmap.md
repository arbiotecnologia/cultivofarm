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
- [x] Reconfirmar baseline read-only: PUC/PTC 0/0, 29 policies por helpers, 59 entradas no manifesto; writers/cascades e limites de origem documentados.
- [x] Preparar metadata neutra sem FK/uso autorizador, preflight/rollback gated e relatório de decisão B3.2.
- [x] Executar 22 checks PostgreSQL descartável, arquivos completos sob baseline sintético e 4 suites Vitest; lint focado exit 0, sem prova hosted.
- [ ] B3.2 instalação neutra externa: aguarda autorização/revisão, backup, destino e preflight sem drift/consumers; agente não executa.
- [ ] Origem/cleanup/cutover: NO-GO por contrato ator/source estável/colisões/revogação e provas JWT/RLS A/B/legado/Storage pendentes.

## F2-B3.2 — revisão independente / B3.3 somente desenho
- [x] Revisar manifesto/rollback, locks, concessões indiretas e consumidores dinâmicos; preparar preflight/postflight ampliados (risco automático RESTRICT confirmado).
- [x] Documentar checklist de backup recuperável e decisão de adiar metadata; recuperação real NÃO realizada.
- [x] Desenhar B3.3 server-owned com RPCs fechados, ator/alvo, colisões e fronteiras transacionais; prompts e 12 checks locais (não contrato funcional implementado).
- [ ] Implantação: NO-GO; auditor não possui backup/snapshot recuperável comprovado, nem provas reais JWT/RLS A/B.

## F2-B3.3-A — contratos coordenados, somente preparação
- [x] Reconfirmar RPCs/ACL, guards/locks e writer direto read-only no destino canônico (0/0, 29 policies).
- [x] Definir evolução compatível/source/CAS/revogação e leitores; SQL com recusa, mandato/representação física pendentes explícitos.
- [x] Executar 44 checks PG com 6 disputas entre sessões; 4 testes Vitest PASS, lint focado exit 0, limites documentados.
- [ ] Instalação: bloqueada por backup/restauração, contratos hospedados e provas JWT/RLS A/B; nenhuma execução autorizada.
## F2-B3.3-B — mandato/receipts, somente preparação
- [x] ACL efetiva assign/unassign fechada; writers/revokers e leitores inventariados read-only.
- [x] Decisão: receipt privado novo mínimo (não estender partner_audit_logs); candidata B1 bloqueada.
- [x] Simulação PG descartável 17/17.
- [ ] Instalação B1+: bloqueada por backup/restauração, revisão externa e provas JWT/RLS A/B.

## Entrega Operacional 1 — can_user_access_cliente(uuid,uuid)
- [x] Auditoria read-only: brechas revogação/parceiro inativo/PTC órfão confirmadas; baseline md5 c610786f.
- [x] Candidata + rollback + preflight em docs/auditorias/vinculos-b2b-entrega1-*; testes PG descartável 4 fases PASS.
- [ ] Instalação: NO-GO até backup/restauração comprovados e provas JWT/RLS A/B; containment PUC e 12 policies intactos.

## Entrega 1 — can_user_access_cliente(uuid,uuid) hardening
- [x] Candidata revisão 1.2 (fail-closed owner NULL, revogação pu/pu2/pu3, coerência tenant=owner) preparada e testada em PostgreSQL descartável com paridade live.
- [x] Aplicada em PRODUÇÃO pelo auditor externo (cultivofarm_b2b_entrega1_client_access_hardening_prod_20261018); pós-auditoria: md5 4e0c374caa04bb9bf9fac9cc4e6723f1, 12 policies preservadas, ACL/owner/search_path inalterados, zero acessos legítimos cortados.
- [x] Relatório pós-implantação registrado (docs/auditorias/vinculos-b2b-entrega1-pos-prod-20261018.review.md); rollback manual disponível sob avaliação.
- [ ] JWT/RLS real tenants A/B: NÃO testado — homologação de acesso real pendente (blocker: sessões externas).
- [ ] Backup/restauração de produção: não comprovado — comprovar antes de próxima migração.

## Entrega 2 — próximo recorte read-only (revogação B2B remanescente)
- [x] Auditar helpers escalares get_user_partner_id/get_partner_papel (LIMIT 1 sem revoked_at/owner; fail-closed 0/2+) — brechas confirmadas, 30 policies dependentes mapeadas.
- [x] Auditar platform_private.b2b_commercial_context (sem revoked_at na contagem/seleção) e overload can_user_access_cliente(uuid) (herda endurecimento da Fase A, sem alteração própria).
- [x] Preparar SQL candidato por fase (A/B/C) + rollback exato + testes locais (Vitest 1/1 passou); SEM DDL/DML hosted, sem publicar, sem reabrir RPCs/PUC containment.
- [x] Revisão externa 2026-10-18: lacuna Fase C (sem tenant_id=owner no contexto do portal) corrigida na rev 2.1 — vínculo exige tenant coerente com owner comercial, legacy_partner_tenant preservado; candidata real executada em PostgreSQL descartável, fase 5 do lab (8 cenários) e Vitest 1/1 passaram; rollback anti-drift atualizado.
- [ ] Instalação Entrega 2: NO-GO — backup/restore e provas JWT/RLS A/B pendentes; exige autorização específica.
- [ ] Auditar leitores diretos partner_users/PTC remanescentes (31 funções lexicais, 6 policies diretas) — próximo recorte.
