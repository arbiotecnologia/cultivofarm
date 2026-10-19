# F2-B — auditoria e preparação revisável

## 19/10 00:24 — comprovante de baixa no fluxo existente
- [x] Registrar aplicação externa financial_document_owner_integrity_20261019, probes SQL versus login B real.
- [x] Corrigir path owner-first idempotente e fences upload/metadados/callback, preservando a baixa registrada.
- [x] Testar retry/efeitos parciais/revogação/timeout: 229/229, stage2/2; rollback byte-exato só helper/diálogo e relatório comprovante-baixa-20261019.review.md; sem hosted DML.
- [ ] Upload real financeiro A após migration aguarda sessão/revisão do proprietário; sem pagamento/cobrança real.

## 19/10 00:11 — integridade server-side financial_documents
- [x] Inventariar oito owner_types/callers e capturar contratos live; contagens sem expor linhas.
- [x] Preparar candidata/preflight/postflight/rollback integrais em scripts/financial-documents-integrity, sem aplicar hosted.
- [x] Testar PG local RLS/claims iat atual: 252 checks, oito owners e atomicidade; regressões 159/159. Relatório SERVER com limites/aceite independente.
- [x] Auditor informou aplicação e pre/postflight PASS; login B real sem contas/anexos A, sem prova HTTP signer. Upload A pós-migration pendente (sessão do proprietário).

## 18/10 23:59 — anexos financeiros no fluxo existente
- [x] Corrigir path/basename e fences upload/remove/metadados; contrato/trigger atual confirmado SELECT-only canônico, servidor e monitores inalterados.
- [x] Regressões 186/186 (49 casos anexos) + staging4/4 e a905 2/2; rollback apenas painel, monitores preservados.
- [x] Evidência independente pós-publicação drafts >35s/revoke→pause/retry/restore registrada; financeiro 2 retries com causa desconhecida, sem alegar homologação de anexos.
- [x] Auditor revisou/publicou cc62c3d (deployment5d25d61e), upload/abertura A reais PASS e revoke/restore registrados; pós-migration upload A continua pendente acima, sem escrita hosted/publicação pelo agente.

## 18/10 23:47 — ativação financeira autorizada
- [x] Habilitar somente financeiro exclusivo, preservando produtor/B2B e Blob/global fechados.
- [x] Validar drafts/revogação/gates (185/185) e rollback financeiro false sem perder outro recorte; 5 manifests antigos fail-closed, stage4/4.
- [x] Entregar financial-preview-release e docs/auditorias/financeiro-preview-ativacao-20261018.review.md para revisão final externa; sem DDL/Edge/publicação ou homologação alegada.
- [x] Publicação e sessão real financeira informadas pelo auditor: drafts >35s, pause sem reload, restore sem draft (2 retries, causa desconhecida); registro em anexos-financeiros-20261019.review.md. Não certifica anexos/global.

## 18/10 23:42 — continuidade de drafts por confirmação
- [x] Reproduzir remount periódico (6 FAIL antes) e limitar refresh por confirmação ao B2B publicado.
- [x] Testar drafts por dois polls, mudança real/revoke/roles/inativação/expiração/revalidação/identity e restore sem ressuscitar drafts (183/183).
- [x] Preparar delta/rollback e resultados em principal-draft-release e docs/auditorias/principal-drafts-20261018.review.md (stage2/2); produtor true, financeiro false, anexos preservados; preflight produtor integral PASS informado pelo auditor.

## 18/10 23:37 — preferência produtor e ativação limitada
- [x] Separar preferência estável de autorização/cache por epoch e provar B sobrevivendo dois polls, revogação parcial e isolamento UID/tenant (2/2 FAIL antes, PASS após).
- [x] Ativar somente produtor após regressões/preflight de fonte, registrar delta/hashes/rollback (146/146 + stage2/2); financeiro/global/Blob fechados, sem hosted/publicação.
- [x] Publicação e sessão real produtor informadas pelo auditor: draft >35s, pause sem reload, restore draft vazio; registro em anexos-financeiros-20261019.review.md. Não certifica anexos/global.

## 18/10 23:32 — inativação interna financeira, candidata limitada
- [x] Registrar evidência real independente e inventariar autoridade self/h15/readiness/roles + guards internos.
- [x] Preparar menor extensão no monitor único com gate fechado, preservando B2B/produtor/RBAC e dados órfãos.
- [x] Testar /financeiro aberto, inativação/restore/roles/timeout/respostas tardias; entregar candidatos/rollback/preflight (108/108 + 2/2).
- [x] Documentar resultados e limites separados de revogação por entidade/entitlements, sem DDL/deploy/publicação.
- [x] Gate financeiro autorizado/ativado 23:47 após preflight integral PASS informado; login real/revisão final externa pendentes acima.

## 18/10 23:24 — produtor tela aberta, candidata limitada
- [x] Registrar evidência independente e confirmar RPC canônica self/h15/RLS que preserve múltiplos clientes.
- [x] Preparar gate produtor fechado + integração no único monitor e boundaries /app e /portal, preservando B2B/internos.
- [x] Testar mobile/desktop, revoke/restore, múltiplos clientes, troca A/B e respostas tardias; preparar rollback/preflight guardados.
- [x] Documentar 143/143 testes + 2/2 staging e limites em docs/auditorias/produtor-tela-aberta-20261018.review.md; sem hosted writes/publicação/global/Blob.
- [x] Ativação preview produtor autorizada 23:37 após correção preferência/testes; gate true. Homologação/live preflight/publicação externa ainda pendentes acima.

## 18/10 23:15 — monitor/anexos, recorte crítico após 24b5f807
- [x] Inventariar UI/emissores/Storage documentado e demonstrar falha de resposta tardia com lease consumida (4/4 testes falharam antes).
- [x] Corrigir somente fences existentes, testar adversários e preparar artefatos/rollback SHA256 fail-closed; gates/B2B/Edges intactos.
- [x] Executar PostgreSQL descartável com guards/candidata e writer histórico integrais: stamps, ordem, concorrência, ABA, snapshot/tempo e inversão 40P01.
- [x] Registrar resultados e limites em docs/auditorias/monitor-anexos-criticos-20261018.review.md, sem hosted/publicação.
- [ ] Certificação global/anexos: bloqueada por captura atual live de Storage/Edges/writers completos, closure de snapshot/tempo/locks e testes HTTP/JWT/sessões independentes; não autorizada nesta fase.

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
- [x] Rev 2.2 (revisão externa): A/B uniformizados com C — contagem de TODOS os não revogados antes da elegibilidade (M9: 1 elegível + 1 inelegível não revogado => NULL nos três); rollback com guarda de hashes md5 exatos (drift com marcadores rejeitado atomicamente); matriz M1-M12 sobre os corpos REAIS extraídos da candidata + corpo real Entrega 1 (fidelidade md5 4e0c374c... comprovada); valid_from auditado — sem contrato existente em partner_users, nenhuma regra inventada; Vitest 1/1 passou. Usuário autorizou continuação e assume backup (registrado; não pedir de novo).
- [x] Rev 2.3 (revisão externa ffca65827): harness não regrava mais hashes — verifica os 3 hashes fixos commitados e falha em divergência (geração só via --generate-hashes explícito); baselines extraídos do rollback e comprovados por hash de produção; candidata e rollback executados como ARQUIVOS INTEIROS (guards intactos); drift rejeitado pelo rollback inteiro com corpos candidatos preservados; matriz ampliada para M1-M15 afirmando os TRÊS corpos por cenário com roles/entitlements válidos, zero vínculo, ator/alvo NULL e cliente não associado; relatório corrige 31 policies (pg_policy/pg_get_expr) e remove alegação de equivalência global portal/escalares (uniformidade só de cardinalidade/elegibilidade); Vitest 1/1 exit 0. Contas de teste autorizadas pelo usuário; sessão externa AR Bio confirmada; nenhuma conta criada nem escrita hosted.
- [x] Instalação Entrega 2: IMPLANTADO em produção pelo auditor externo (cultivofarm_b2b_entrega2_helpers_rev23_20261018, commit bb283766); hashes instalados = fixos commitados, Entrega 1 inalterada, checksum de policies 6b919969 idêntico antes/depois, ACL/owner/search_path preservados; relatório pós-prod em docs/auditorias/vinculos-b2b-entrega2-pos-prod-20261018.review.md.
- [x] Homologação PARCIAL: smoke SQL authenticated (não JWT) + teste real navegador (portal positivo, /configuracoes negado, revogação real fecha helpers/portal após reload, restauração reabre) — registrado; rollback manual disponível sob avaliação, não executado.
- [ ] Críticos pendentes (gate fechado, sem próxima fase até resolvê-los): JWT cruzado A/B entre tenants (evidência real limitada 2026-10-18: sessão tenant B vê só 2 usuários B e cliente A retorna "não encontrado" — NÃO é matriz A/B completa); prova da UI de desvinculação/reativação (mutação foi SQL operacional); TTL/cache residual não medido — inspeção read-only feita: sem realtime em partner_users, reação hoje só em refetch (foco/navegação/reload); foundation de época (poll 10s/lease 15s desde início do request) existe mas gate AUTHZ_CACHE_FOUNDATION_ENABLED=false.
- [x] Fase revogação/cache — correção concreta com gate fechado: monitor passa a honrar server_remaining_ms do fingerprint (lease = min(15s, budget servidor - RTT monotônico), expire imediato se consumido); fetcher do useAuth repassa o campo; 5 testes novos (budget menor, RTT consome budget, desconto de RTT, ausência do campo, revogação/restauração); Vitest 36/36 exit 0, tsgo exit 0. Bloqueadores para abrir o gate listados no relatório pós-prod seção 5.1 (SQL fingerprint não instalado/wired, preflight monotônico, contenção anexos, homologação navegador, revisão independente).
- [ ] Auditar leitores diretos partner_users/PTC remanescentes (31 funções lexicais, 6 policies diretas) — próximo recorte.

## Fechamento P1 — contenção de mensagens B2B (produção canônica, sem homolog)
- [x] Candidata v2 revisada: 2 policies RESTRICTIVE (mensagem→pedido→tenant; anexo→mensagem) + `ALTER FUNCTION public.rpc_partner_message_counters(uuid) SECURITY INVOKER` (corpo/assinatura/owner/ACL preservados; RLS filha + policies passam a conter a contagem). Arquivo: `scripts/b2b-message-p1/candidate.sql.review`.
- [x] Preflight atualizado para hashes pós-Entrega 2 (get_user_partner_id b334c3a4…, b2b_commercial_context a31d198c…, get_partner_papel f84f898e…) + expectativa do contador (md5 5b049aa4…, prosecdef=true pré / false pós, ACL inalterada).
- [x] Rollback seguro mantido fail-closed (guarda de revisão) + DROP das 2 policies + restauração SECURITY DEFINER.
- [x] Harness local atualizado aos contratos atuais (revoked_at nos fixtures/helpers, cardinalidade 0/2+ fechada): contadores INVOKER contidos (FSF não conta AR; admin AR positivo), revogação nega e restauração devolve partner original; suite local PASS (exit 0).
- [x] Teste hosted BEGIN/ROLLBACK preparado (`scripts/b2b-message-p1/hosted-test-begin-rollback.sql.review`): identidades reais Admin AR/FSF via variáveis psql (falha fechado sem elas), fixtures AR mínimas em transação, sem desligar triggers nem simular emissor fiscal; insert forjado cross-tenant listado para verificação manual do erro exato.
- [ ] Aplicação em produção: NÃO executada pelo agente — aguarda revisão e aplicação pelo auditor via Supabase. Pós-condições: contador prosecdef=false com md5/ACL inalterados, 2 policies presentes, checksum geral de policies revisado.
- [x] Rev 2 monitor (revisão de integração): parser do fetcher useAuth não rebaixa mais server_remaining_ms inválido (string/objeto/bool) para null — repassa bruto e o monitor falha fechado; re-checagem state=valid/geração após armLeaseDeadline antes de onEpochChange/schedulePoll (relógio pode cruzar deadline na janela do arm). Testes: integração AuthProvider com string/objeto/bool (conteúdo oculto, sem fallback, sem poll) + unitário com relógio injetado cruzando na janela. Vitest focado 44/44, tsgo OK, build OK; 8 falhas da suíte completa são pré-existentes e não relacionadas (confirmado vs HEAD). Gate permanece false; evidência externa writers-live-20261018.json registrada, não é aprovação.
- [x] Rev 3 monitor: prova da janela do arm corrigida (cenário atinge "valid" antes de expirar no arm; assert de ordem valid<expired; sem a guarda o teste FALHA em onEpochChange — demonstrado; guarda restaurada, 29/29).
- [x] Helpers B2B revogação (pendência backend confirmada ao vivo): candidata f02cbcd8 REPROVADA na revisão; v2 refeita em scripts/b2b-helpers-revogacao/ — is_valid como folha comum (cardinalidade=1 antes da elegibilidade, owner não nulo, tenant=owner, papel↔role única), get_role reutiliza a folha sem LIMIT 1, actor_scope valida user_partner pela folha e restaura semântica antiga de partner_valid (interno/legacy não bloqueados); hashes PRE/POST fixos de pg_get_functiondef (PG local 17.9 reproduz os PRE live); rollback estrito exige hash POST exato antes de tocar; harness executa arquivos COMPLETOS com ON_ERROR_STOP (drift pré/pós, atomicidade, rollback exato); 60/60 checks PASS; callers.md corrigido (validate_partner_user_client_fn é trigger de partner_user_clients); relatório docs/auditorias/b2b-helpers-revogacao-v2-20261018.review.md; NÃO aplicado hosted.
- [x] Rev a1c27b3 (ajuste de autorização pré-aplicação): folha is_valid passa a exigir count TOTAL de user_roles=1 (contrato E2 b2b_commercial_context) — gestor+administrador negado nos 3 helpers; positivo B2B legacy REAL adicionado (role parceiro_b2b, papel gestor, profile.org=ORG_LEGACY→P_LEGACY, vínculo tenant=ORG_OWNER partner=P_LEGACY) com asserts completos; prova atômica reforçada (snapshots antes/depois de candidata e rollback recusados incl. função adulterada; falha de PÓS em cópia temporária com corpos PRE preservados). Hash POST de is_valid reapurado/fixado: 93520101987e599280460d3dadcf3a9f (demais inalterados). Harness 71/71 PASS.
- [x] Aplicação da candidata v2 dos 3 helpers: informada pelo auditor em produção canônica, migration 20261018222908, commit 80e8347; hashes/ACL/RLS e SQL independentes aprovados externamente. Login revogado negou após reload; restauração ativo versão 6. Não é prova de revogação em tela aberta.
- [x] 3 assertions de autorização da suíte ampla corrigidas (somente testes/docs, runtime das Edges intacto): d51-4 reescrito contra o wiring real Configuracoes.tsx→usuariosListQuery.ts (RPC fake, erro, user_id divergente); d51-5 testa o guard real catalog-superadmin-guard via alias @edge-shared (falha fechada active/platform false/string/null/error/throw, positivo true/true, ordem antes do service-role). Suíte security 427/427, tsgo OK. Evidência corrigida: d51-4 é page Configuracoes.tsx, não useAuth.
- [ ] Dívida remanescente: 5 falhas pré-existentes da suíte ampla não relacionadas a autorização — já falham no parent, fora deste escopo.

## Revogação em tela aberta — continuação 2026-10-18
- [x] Pós-implantação 23:00 documentado: gestor B2B real na prévia, revogação 6→7 às 22:57:54.531612Z; screenshot/AX pausado às 22:58:08.618Z, dados removidos/mesma URL sem reload/goto/foco/interação intermediária (limite superior ≈14,1s, não latência/SLA). Retry revogado pausado; restore 7→8 e retry recuperam mesma sessão/URL sem reload/login. Publicação já executada pelo auditor deployment16d6e45e-a43f-443c-b256-236669c379d2, domínio no mesmo index-Dk8zEZhV.js testado; Admin B dashboard/negação portal/retorno OK, vínculo ativo8/RLS checksum preservado/sem DDL. Windows staging c3a31bbb 8/8 rerun permitido PASS; independentes 9/9+4/4+4/4 PASS. Somente documentação nesta rodada, sem nova publicação.
- [x] Complemento de portabilidade: staging lê bytes/decode UTF-8 e grava bytes exatos, preserva LF/CRLF e hashes PRE/POST; 8/8 testes Python incluindo acentos e 3/3 configuração runtime PASS, build automático OK. Hash do script atualizado explicitamente no manifest: 92f87beb038c97ddb2043241bceb32321004ccb2b378b7d55ebd3ebfe6a2e7f2. Manifest canônico SHA256: 0b32a3b510078fc8d4e86948c1b92ea78ae14d70b57cbf02ca8767d9834ed997. Runtime intacto; receipt anterior histórico não reassinado automaticamente, auditor atualizará receipt/artefatos locais, sem publicação.
- [x] Liberação limitada 22:55: assinatura get_user_partner_id()/hash corrigidos; receipt e staged candidate/rollback PRE/POST exatos registrados; gate true somente b2b-context na prévia, Blob false. 76/76 testes (4 arquivos) + 6/6 guards Python PASS; build/typecheck automático OK. Nenhum monitor/guard/hook adicional alterado, sem hosted/publicação.
- [x] Complemento 22:51: pending inicial→valid→poll revogado→retry pending→restauração sem redirect em gestor/técnico; boundary antes da espera dos readers. 58/58 testes (2 arquivos) e 6/6 staging guards PASS, build/typecheck automático OK. Stamps live registrados como evidência externa + guarda SELECT-only não executada; sem ativação/hosted, produtores preservados.
- [x] Preparar recorte mínimo no monitor existente para B2B exclusivo usando get_my_commercial_partner_context, sem novo resolver; gate false, outros perfis sem monitor; pause/retry na mesma URL, cache/época/contextos/consumidores cercados e anexos legados explicitamente fora da certificação.
- [x] Executar integração React/relógio controlado: 29 novos casos, 175/175 testes direcionados (11 arquivos) PASS + 6/6 staging guards Python; timeout/offline/stale/revoke→restore/ABA observado/cache/Blob reais com transporte fake. Build/typecheck automáticos OK. Não JWT/SQL concorrente v6.
- [x] Entregar matriz verificável e preflight SELECT-only/guardas, manifest fixo e staging candidato/rollback fora do runtime, receipt de liberação obrigatório e rollback com hash POST exato+drenagem: docs/auditorias/b2b-tela-aberta-20261018.review.md. v6 amplo segue NO-GO; sem goldens inventados nem SQL hosted.
- [x] Prova real do gestor sem reload e publicação autorizada realizadas pelo auditor; registro no relatório existente, sem alegar auditoria global concluída.
- [ ] Ampliação além do aceite gestor: técnico/produtor/offline/suspensão/ABA transitório/downloadURLs não homologados em login real nesta rodada; dependem de autorização e provas próprias do auditor, fora desta entrega documental. Contratos amplos/v6 continuam fechados.
