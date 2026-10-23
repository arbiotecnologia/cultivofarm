# C2-ORD v4 — P1 e eligibility instalados (REVIEW, restante inativo)

## 23/10 22:58 — CONTENÇÃO instalada externamente, writer fechado
Codex `c2_owner_orders_writer_containment` SUCCESS segundo proprietário: create_allowed SELECT false, eligibility ACL false para authenticated, correções financeiras/approval preservadas. Registro `applied/c2_owner_orders_writer_containment.md`. **POST release esperado não descreve mais o estado atual por decisão explícita; não reaplicar release/candidato antigo ou reparar isso como drift.** Baselines históricos intocados. UI local corrigida e testes ampliados partner/tenant/queries em revisão; sem auto-publicação ou writer até UI revisada/publicada e autorização independente.

## 23/10 22:56 — C2-ORD implantado externamente / bloqueio frontend
Codex implantou `c2_owner_orders_p1_composed` baseado b38e2c26, conforme proprietário: PRE/POST integrais na mesma transação SUCCESS, POST READ ONLY externo PASS, eligibility ACL preservada; nenhum pedido/título criado. Registro `applied/c2_owner_orders_p1_composed.md`. **Não reaplicar os scripts candidatos abaixo nem modificar os snapshots/baselines históricos**. As afirmações antigas de “restante inativo/writer fechado” documentam a revisão anterior; agora SQL foi implantado externamente, sem homologação pós completa e sem novos pedidos autorizados pelo agente.

Frontend publicado ainda f351d6d5 segundo proprietário. Erro real no preview catálogo reproduzido independentemente sem HMR: EntitlementOutlet intermediário renderizava Outlet sem repassar contexto do layout. Correção local encaminha o mesmo contexto após o gate de plano inalterado; sem modificar rotas/permissões/hooks de pedidos ou reabrir ACL. Testes providers/rota em `src/test/catalogo/partnerOutletContext.test.tsx`; sem reload/retry de recarga da sessão real, SQL ou publicação.

## 23/10 22:54 — implantação eligibility confirmada externamente
Proprietário confirma Codex `c2_billing_eligibility_internal_only`: somente REVOKE EXECUTE de PUBLIC/anon/authenticated, corpo MD5 `db977875e15ea49ce10fb3e5388d7dfb` intacto, postgres/service_role preservados, PRE/POST PASS. Registro em `applied/billing-eligibility-current-acl.md`; não reaplicar. Candidato v4 mantém guardas internal-only já coordenadas em `preflight.sql`, `candidate.sql.review`, `postflight.sql`, `rollback.sql.review`; nenhum guard exige grant antigo e nenhum desses scripts altera ACL do helper. Nove hashes dos corpos candidatos permanecem iguais à v3, revisão v4 identifica somente a dependência/guardas de contenção e registros coordenados. Writer continua fechado.

Negativo REAL B archive403: A continua `published`, `archived_at/by=NULL`, segundo proprietário; não houve nova tentativa pelo agente. Pendências antigas preservadas.

## 23/10 22:43 — rebase P1 instalado; status atual NO-GO
### Atualização22:52–22:54 — eligibility e arquivamento
Negativo **REAL API/JWT admin B** `rpc_cc_archive_assignment` HTTP403 `C2P1_FORBIDDEN`/42501 relatado pelo proprietário: encerra somente essa negação específica, não homologação geral; registros antigos abaixo sobre ausência do teste são históricos.

Consulta hosted READ ONLY canônica mostra eligibility **já internal-only**: authenticated=false, anon=false, service_role=true, owner postgres, MD5 `db977875e15ea49ce10fb3e5388d7dfb`, ACL postgres/service_role. Implantação Codex identificada depois pelo relato22:54 acima; não executada pelo agente. Único caller SQL direto atual: impl DEFINER/postgres. Não há cliente de produto repo; Edge harness contém só probe de ACL. Histórico/réplica com authenticated não é estado atual e não deve ser promovido. Detalhes: `billing-eligibility-callers.md` e `applied/billing-eligibility-current-acl.md`.

`billing-eligibility-invariant.sql` incorporado em PRE/candidato/POST/rollback: valida corpo/owner/ACL/privilégios efetivos e grafo textual direto; **nenhuma alteração de ACL, wrapper ou fiscal resolver**. Candidato mudou apenas nas guardas desta rodada; nove hashes de corpos revisados continuam os anteriores. Teste atual **69/69 checks PostgreSQL descartável via Vitest1/1 PASS**22:54: B/anon não invocam gate, owner/service conseguem, aprovação com impl real segue gerando título e rollback mantém ACL fechada. Auth e schema reduzidos: não JWT real do gate nem certificação transitiva integral. Writer e gates anteriores permanecem NO-GO.

Complemento independente relatado pelo proprietário22:50: os9 hashesv3 conferem; SQL simulado adminB→archive A retornou `C2P1_FORBIDDEN` com rollback, **não JWT real** e não executado pelo agente. Fence produção exige autorização `c2p1_settings_allowed(NEW.partner_id,true)` **e** ticket existente `has_ticket('c2p1_settings_write',NEW.partner_id)`, método ativo exato. Sem enfraquecer trigger ou emitir ticket automático. Teste sem settings reforçado para conferir `B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED` e estado financeiro/auditoria integral inalterado, sem título/parcelas/vínculo/cronograma parciais; cronograma contratual preexistente preservado byte a byte. Antes de pedido/cobrança, usar o caminho autorizado existente: `/financeiro/b2b` → Parceiro → Configurar parceiro → Salvar pela RPC CAS P1; sem fluxo paralelo. O erro reforçado é da candidata inativa, não uma correção já instalada. Reexecução22:52: harness68/68 via Vitest1/1 PASS. A primeira tentativa do teste reforçado falhou por exigir cronograma vazio apesar da fixture já conter cronograma; corrigida a expectativa para preservar estado anterior, sem alterar regras ou dados de produção.

f351d6d5 publicado e salvar/reabrir AUDIT homologado REAL admin A, conforme relato do proprietário. B UI sem A. P1 e fiscal ACL não reaplicados. Arquivamento negativo48dcac7d autorizado, botão ausente, nenhuma escrita real executada: pendente.

Captura nova READ ONLY no Supabase canônico confirmou create624f6e3d/approve09eb9e74/tg0f679538 e `b2b_actor_scope=c3f29977`; P1 settings_allowed57baa5fd/fencef87cc289/update1d64475b. Snapshot integral de funções/policies/colunas/triggers em `baseline-p1/snapshot.json`; demais corpos em `baseline-p1/`.

Achados críticos corrigidos SOMENTE no candidato:
1. Gerador tentava INSERT settings sem ticket P1 e sem método default. Agora falha `B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED`; somente RPC CAS P1 cria settings. Nenhum ticket novo/bypass.
2. `c2_order_actor_scope` **retorna void**, não uma linha: lê `b2b_actor_scope`. O corpo real resolve `org_partner` pelo vínculo quando owner não tem parceiro explícito. Owner com parceiro explícito divergente agora também fecha a capacidade, preservando precedência canônica.
3. Phase1 real negava admin do commercial owner sem org própria antes da aprovação/geração. Somente os dois endpoints revisados aceitam adicionalmente `c2p1_settings_allowed(partner,true)`; roles, priceable, h15, locks, crédito e gatilho continuam autoritativos. Helper phase1 e callers irmãos intactos.

### Caminhos exatos e sequência independente
- PRE integral READ ONLY: `scripts/owner-orders-20261023/preflight.sql` (inclui composição P1); companion: `p1-composition-preflight.sql`.
- Candidato transacional INATIVO: `scripts/owner-orders-20261023/candidate.sql.review`. Não aplicar sem PRE integral PASS no mesmo ref e revisão de locks/schema completos.
- POST assertivo READ ONLY: `scripts/owner-orders-20261023/postflight.sql` (hashes pós, ACL, scope/gatilho intactos e composição P1); expectativas dos corpos calculadas localmente em `postflight-expected.json`, não recibo hosted.
- Rollback de contenção: `scripts/owner-orders-20261023/rollback.sql.review`; fecha writer externo/projeção, preserva P1, ACL fiscal, aprovação atômica, destinatários e resolução estrita; não restaura baseline vulnerável.
- Testes: `scripts/owner-orders-20261023/test-local.py`, `src/test/saas/c2-orders-p1-postgres.test.ts`; comando `bun run test -- src/test/saas/c2-orders-p1-postgres.test.ts src/test/comercial/ownerOrderAccess.test.ts src/test/financeiro/partnerSettings.integration.test.tsx src/test/comercial/assignmentPublication.test.tsx`.

### Evidência e limites
**68/68 checks PostgreSQL descartável + 18/18 Vitest** (um Vitest executa o harness68, não somar como provas independentes). Corpos reais capturados: scope/context/readiness, P1 CAS/fence/tickets, approve, wrapper/impl, eligibility, priceable, crédito, parcelas e phase1. Concorrência duas conexões: mesmo UUID e estado financeiro integral estável. Falhas tardias em vínculo/notificação desfazem aprovação/campos/título/parcelas/cronograma/auditoria; retry gera um título. Settings AUDIT/prazo7/CAS intactos, ownorg/owner positivos e B/externos negativos.

**Não é homologação real JWT/RLS/PostgREST**: Auth/has_role/entitlements/Superadmin/produtor e d51 reduzidos, schema não integral, triggers de governança/SaaS não executados. Create positivo/carrinho/preço/hash e concorrência de criação continuam NÃO certificados; create só percorre negativas do guard. PRE/POST integrais desta revisão ainda não executados hosted; composição estrutural exata requer auditor independente. Ausência de settings no gatilho ainda retorna sem geração (semântica existente), não prometer cobrança em toda aprovação. Sem alteração de UI/runtime, banco/dados/papéis/sessões, publicação ou liberação writer; monitor/anexos/fiscal/cancelamento/estorno/multiperfil B e pendências antigas permanecem abertas. Build automático da prévia OK22:49:21, não build/typecheck independente do SQL candidato.

Seções antigas abaixo são histórico; não usar seus PRE/ACLs/contagens ou status como autorização atual.

## 23/10 21:18 — P1 aplicado por Codex; cache/baseline corrigidos localmente
Relato implantação migration20261023211007/PRE/POST/dados iguais e JWT B sem atribuições/A própria publicada; método AUDIT salvo UI21:18:08.481422+00, prazo7/na_entrega intactos. Registro `applied/20261023211007_c2_private_assignments_financial_settings.md`. Nunca reaplicar P1/PRE antigos. Artefato publicado bafe3e23/deploybcca6f2f confirmado por metadados públicos e SHA App igual à build anterior.

Fix revisável em `p1-isolation/cache-reopen-20261023/`: somente hook+dialog/cache com retorno RPC canônico e leitura inicial fresca, CAS/dirty/fences preservados; 59/59 testes (11 integrados), tsgo app/node0 e produção26,04s PASS. NÃO publicado; banco/dados/writerC2/sessões intocados. Arquivamento B bloqueado pela revisão automática Codex pendente de confirmação específica, sem nova tentativa. Homologação real desta correção e pendências antigas continuam abertas. Seções anteriores abaixo são histórico, não status atual de implantação/método.

## 23/10 21:06 — promoção restrita frontend, sem publicação
Hook RPC P1 promovido localmente; ownorg legado e commercial owner ativos refletidos no selector e precheck, RLS/RPC autoritativos. 48/48 testes, tsgo app/node EXIT0 e Vite production da cópia integrada PASS36,15s. Detalhes/diff/SHA em `p1-isolation/frontend-promotion-20261023/`. SQL P1 não aplicado pelo agente, writer C2 não liberado. ACL fiscal `c2_fiscal_resolver_internal_only` implantada pelo proprietário segundo relato: registro `applied/c2_fiscal_resolver_internal_only.md`, corpo intacto/EXECUTE postgres+service_role; PRE/candidata fiscal antigos são históricos, não reaplicar. Método pix e plano publicado teste4 intactos; sem dados/publicação/sessão. Homologação JWT/UI real e gates antigos seguem abertos.

## Prioridade20:10 — P1, não liberar writer
Candidata/preflight/rollback/testes em `p1-isolation/README.md`: atribuições privadas por destino (inclui família RPC e sibling publicação de item), owner/ownorg settings com CAS servidor e método ativo. **50/50 PG sintético + 5/5 Vitest candidato + 19/19 regressões**; sem aplicar/publicar/dados/sessões. PRE/POST integral, tipos/produção candidato e JWT/UI A/B reais permanecem NO-GO. Este pacote supera o blocker owner somente como proposta INATIVA; runtime não promovido.

## Revisão pós-914d06c — 23/10 19:55 UTC
### Complemento 20:03 — formulário financeiro e publicação
- Patch frontend em `frontend-settings.patch`, baseline byte-exato em `frontend-baseline/`, hashes em `frontend-settings.sha256`. Fonte runtime local corrigida; **não publicada**. Fiscal ACL-only intacto e não aplicado.
- `/financeiro/b2b` → seletor **Parceiro** → **Configurar parceiro** abre o mesmo `PartnerFinancialSettingsDialog`, sem fabricar pedido. Lista apenas parceiros ativos/não excluídos com `commercial_owner_organization_id` igual ao tenant atual, sob RLS existente. Papéis internos existentes; externo/técnico/produtor não ganha capacidades internas. Limite explícito 1000 resultados, sem afirmar inventário completo além dele.
- **Forma padrão** lê `payment_methods` global ativo sob RLS; grava o nome canônico existente (contrato atual), não UUID e não cria `pix`. Legado inválido/inativo ou nome ambíguo exige escolha explícita; ausência não seleciona fallback.
- Rascunho inicializa uma vez após leitura confirmada. Refetch igual preserva edição/CAS; baseline diferente bloqueia sem rebase. UPDATE condicional inclui id/parceiro/updated_at e todos os campos editáveis originais, inclusive nulos; carimbo é avançado pelo mesmo UPDATE. Ausência usa INSERT, nunca UPSERT; concorrência/23505/zero linhas bloqueiam. Duplo clique tem lock síncrono; resposta incerta não é reenviada automaticamente. Ator/tenant/época são rechecados antes/depois de cada await.
- Publicação mantém RPC canônica: cancela leituras de atribuição anteriores, invalida/refaz condições e planos selecionáveis, não fabrica status local `published`. Leitor de atribuição passa a chave/fence de contexto e aborta resposta tardia. Publicação confirmada da atribuição `48dcac7d-d4a0-4058-bdf4-5461fee89f45` é evidência READ ONLY e relato do auditor, sem escrita pelo agente.
- **Blocker real preservado:** `b2b_financial_settings_tenant_guard` restritiva permite Superadmin validado no servidor ou cadeia organização→partner_account_id; não aceita automaticamente o commercial owner. `partner_accounts` só concede listagem interna a administrador/gestor_comercial (além do self canônico). Portanto financeiro/gestor sem SELECT de parceiros não vê lista; admin tenant com teste4 sem org própria pode listar, mas não necessariamente ler/gravar settings. O patch **não altera policies nem cria RPC privilegiada**, não afirma que teste4 está configurável em sessão real. Uma capacidade/writer owner específico exige revisão SQL separada; nenhuma policy alargada nesta entrega.
- Validação focal: **44/44** em cinco arquivos, com `TZ=America/Sao_Paulo`; **TypeScript PASS** na cópia candidata e **Vite production PASS** (40,57s, apenas aviso de chunks grandes). SDK/servidor simulados explicitamente, sem PostgREST/JWT real. O conjunto inclui rascunho/refetch/CAS, nulidade, inserção concorrente, tenant B negado antes do UPDATE, método AUDIT e na_entrega concretos, publicação em corrida e sessão financeira. Tentativas iniciais de encontrar executáveis locais falharam; caminhos existentes corrigidos, sem instalar dependência nem alterar código para esconder falhas.
- READ ONLY canônico confirmou `has_partner_org=false` para teste4 e policy `b2b_financial_settings_tenant_guard=RESTRICTIVE`; atribuição48dcac7d está `published`. Nenhuma mutação real realizada. Pausas/lease/polling do monitor não alterados.

- Fiscal: candidata **ACL-only** em `fiscal/candidate.sql.review`, pre/postflight e rollback separado. O corpo permanece md5 `8bb99a3c335b5f9876d99d988dcf94b0`; não altera regra/isenção/globalidade, OID ou assinatura. Fecha EXECUTE direto de authenticated/PUBLIC/anon (inclui B sondando UUID A). Owner postgres e service_role preservados.
- Call graph LIVE capturado: único caller SQL = `generate_b2b_receivable_secure_impl(uuid)`, DEFINER/postgres; nenhum caller frontend/Edge direto localizado. Portanto a correção mínima não cria mais um resolver nem inventa permissões fiscais por UUID. Chamador legítimo continua executando como postgres após sua própria autorização; nenhuma regra fiscal muda. Rollback mantém contenção, não restaura ACL vulnerável.
- PostgreSQL descartável: **60/60 PASS**, incluindo reprodução do vazamento com `SET ROLE authenticated`/identidade sintética B e isenção sintética A, negação após candidata e rollback, service/owner e aprovação legítima gerando título através do resolver real. **Não é JWT/RLS hosted**, não é pedido/isenção real.
- `b2b_actor_scope`, `is_valid_b2b_partner_user`, `b2b_commercial_context`, readiness e h15 usam **6 corpos LIVE reais** com MD5 local conferido; não são stubs. Wrapper `c2_order_actor_scope` é o corpo candidato real. Positivos gestor/técnico cumulativo/mais produtor; negativos técnico-only, tenant divergente, vínculo futuro/revogado, proprietário inativo, senha provisória e gestor revogado. `assert_b2b_partner_scope` intacto; crédito/preços/conversão legados não ampliados. Dependências não-alvo continuam reduzidas (has_role, entitlement, visibilidade fase1, links produtor, eligibility, wrapper/parcelas/d51); nenhuma homologação integral alegada.
- Frontend candidato atual montado isoladamente em `/tmp/c2ord-frontend-review`, com `src` copiado e referências existentes: **TypeScript PASS**, **Vite production PASS** (37,21s; aviso de tamanho de bundle, sem erro). Primeira tentativa de tipos falhou por referências ausentes na montagem; montagem corrigida, sem mudar código para esconder erros. Vitest **23/23** em 3 arquivos; `TZ=America/Sao_Paulo`.
- Vigência do plano canônico capturado `2026-10-23 00:00:00+00` → `2026-10-30 00:00:00+00`: `CommercialPaymentPlansPage` passa a usar `formatCivilDateDisplay` no desktop/mobile; armazenamento/validação de vigência e timestamps de eventos intactos. Casos concretos 23/10 e 30/10 cobertos. Homologação de tela autenticada não disponível neste projeto external_unmanaged; não simular sessão real.

### Caminho exato do formulário e bloqueio real (não inventar opção)
**Gestão interna → Financeiro B2B (`/financeiro/b2b`) → linha de pedido do parceiro → ícone engrenagem “Configurar parceiro” → “Configuração Financeira — [parceiro]” → “Forma padrão” / “Gatilho de cobrança” → Salvar.**
Fonte: `src/pages/financeiro/FinanceiroB2B.tsx`, `PartnerFinancialSettingsDialog`; salva `partner_financial_settings` pelo hook existente. **Não** é “Forma de pagamento preferida” do cadastro comercial (esse outro campo grava `partner_accounts.forma_pagamento_preferida`).

**Baseline publicado:** só havia engrenagem em linhas de pedidos e valores fixos `pix/boleto/transferencia/dinheiro/cartao/prazo`. O complemento20:03 acima corrige o frontend local usando o mesmo diálogo; a limitação server-side da fixture permanece expressa, sem bypass. Nenhuma configuração foi gravada.

Estado-alvo **apenas** parceiro `7e52de9a-4bed-4d1e-8200-3255a805465c`: `default_payment_method='AUDIT-AR-20260922 - Sem transferencia'`, método ativo LIVE `3b73824e-f205-47b9-a499-06f02091b247`; `billing_trigger='na_entrega'` preservado. Plano `62147f24-299e-40dd-a6a0-05718b21c55f` e atribuição `48dcac7d-d4a0-4058-bdf4-5461fee89f45` publicados/vigentes 23/10–30/10 confirmados READ ONLY. `fixture-teste4.sql.review` agora só SELECT: remove proposta obsoleta de duplicar atribuição/arquivar no rollback.

### Gates ainda abertos
Revisão independente/aplicação fiscal e restante C2-ORD; REST com JWT real após aplicação (roteiro `fiscal/rest-negative.py`); idempotência concorrente/preço/hash com carrinho real; caminho canônico de configuração sem pedido; monitor financeiro intermitente, cancelamento/estorno, multiperfil B e demais pendências antigas. Sem SQL hosted/DML/deploy/roles/sessões/reload/publicação nesta entrega.

> Seções abaixo são histórico v2/v3 anterior; achados “fiscal não corrigido”, stubs de scope e atribuição ausente foram superados **somente no candidato local** descrito acima. Produção não mudou.

## Já instalado em produção (pelo auditor, via MCP) — não reaplicar
`applied/20261023192728_c2_orders_tenant_notifications_atomic_approval.sql` é a cópia byte-exata de
`supabase_migrations.schema_migrations` (md5 `5744e639…`, SHA-256 `40ec89d6…`). Contém só (G) destinatários
e (E) aprovação atômica. Hashes pós conferidos READ ONLY: create `624f6e3d…`, approve `09eb9e74…`,
tg `0f679538…`, helpers `d4936c87…`/`70b38109…` (ACL postgres-only). Não copiado para `supabase/migrations/`:
esse diretório é gerido pela ferramenta de migração da plataforma (não há CLI no sandbox) e gravar lá
arrisca reexecução; a cópia fica aqui como registro auditável.
Contenção do instalado: `rollback-installed-containment.sql.review` (helpers → `SELECT NULL::uuid WHERE false`,
ACL e aprovação atômica preservadas, sem reabrir vazamento).

## Restante (candidate.sql.review v3)
A guard/autoridade, B **wrapper** `c2_order_actor_scope` (substitui a mudança no assert: `assert_b2b_partner_scope`
fica byte-exato e os callers legados — crédito, preços, conversão — continuam negando o técnico cumulativo),
C create/simulate, D título, F projeção. Conversão de simulação (`convert_*`) chama o assert antes de create,
logo continua fechada para o cumulativo (não ampliada).

## Auditoria fiscal real (`fn_fiscal_requirement_resolve`, md5 `8bb99a3c…`)
- SECURITY DEFINER, EXECUTE para authenticated; lê `fiscal_requirement_exemptions` (scope_type/scope_id) e
  `fiscal_operation_policies` (canal/operação/UF) — ambos **globais**, sem tenant; sem uso de auth.uid().
- Hosted: 0 políticas ativas e 0 isenções ⇒ retorno fail-closed `required=true / PENDING_PARAMETRIZATION`;
  o título nasce marcado como pendente fiscal, nada é emitido.
- teste4 sem `uf` ⇒ só políticas sem UF casariam. Achado menor: qualquer autenticado pode sondar se um UUID
  tem isenção (revela id/motivo/approved_by). Não corrigido; registrar para recorte fiscal.

## Fixture teste4 (`fixture-teste4.sql.review`, NÃO executado)
Atribui o plano existente AUDIT-C2-20261023 ao parceiro 7e52de9a… e troca só a forma de pagamento desse
parceiro para o método existente de auditoria (evita criar `pix` global). billing_trigger continua `na_entrega`.
Cliente b2bd6b53… já está no tenant dono 007bb519 (ok para `B2B_CUSTOMER_TENANT_MISMATCH`).

---
# C2-ORD v2 — compra do cliente comercial pelo fluxo canônico (REVIEW, inativo)

Autoria: agente Lovable, a partir de 10ae3078. Leitura hosted somente `SELECT`/`pg_get_functiondef`.
Nada aplicado, publicado ou implantado. Nenhum pedido, título, fiscal, fixture ou papel criado/alterado.

## Blockers da revisão independente → correção
| # | Achado (hosted) | Correção no candidato |
|---|---|---|
| 1 | `assert_b2b_partner_scope` nega qualquer `parceiro_b2b_tecnico` antes do ramo gestor; projeção v1 excluía técnico | Técnico negado só quando **não** tem `parceiro_b2b`; cumulativo segue ramo gestor (singleton + parceiro). Novo `platform_private.c2_owner_order_guard` chamado por `create_partner_order_secure` e `simulate_b2b_payment_plan_secure` logo após o assert (convert_* reutiliza create) |
| 1b | create/simulate só checavam `fn_b2b_plan_selectable` (global): parceiro podia enviar plano ativo não atribuído | Guard exige atribuição `published`/`partner`/vigente do plano ao parceiro (`c2_owner_plan_assigned`) |
| 2 | Impl escolhia categoria qualquer (fallback tipo/inativa) e forma de pagamento silenciosa (`NULL` se ausente) | `RECEITA` ativa estrita, forma ativa e **única** pelo nome configurado, `client_id` no mesmo tenant; erros `B2B_REVENUE_CATEGORY_NOT_CONFIGURED`, `B2B_PAYMENT_METHOD_NOT_CONFIGURED`, `B2B_CUSTOMER_TENANT_MISMATCH` |
| 2b | Tenant do título só via `organizations.partner_account_id` (0 para clientes comerciais) | Fallback ao tenant dono ativo; emissor interno validado por `h15_actor_organization() = tenant` (o assert de parceiro negava admin interno sem `org_partner`) |
| 3 | `tg_auto_b2b_receivable` engolia falha (`financeiro_auto_falhou`) ⇒ aprovado sem título | Com `billing_trigger='na_aprovacao'`, falha relança `B2B_APPROVAL_BILLING_FAILED` e desfaz a aprovação; `na_producao_finalizada`/`na_entrega` mantêm semântica atual |
| 5 | `create_partner_order_secure` notificava **todo** `administrador`/`gestor_comercial` (sem tenant/perfil ativo) com número e total | Destinatários = `platform_private.c2_order_internal_recipients`: só admin/gestor_comercial com perfil ativo no tenant dono ativo; parceiro sem dono ⇒ ninguém |
| 6 | `approve_partner_order` notificava `partner_users` sem filtrar revogação/perfil | `c2_order_partner_recipients`: vínculo vigente, perfil ativo no tenant do vínculo e `is_valid_b2b_partner_user`; `approve_partner_order` entra no hash guard (`8e266945…`) |
| 4 | Preflight/rollback fracos | Preflight assertivo (11 hashes + ACL + gatilho + schema global + conflito org) e rollback que fecha o writer no servidor |

Observação estrutural: `financial_categories` e `payment_methods` **não têm `organization_id`** no schema canônico
(catálogos globais, RLS `is_financial_staff`). Esse é o desenho correto: **não** se cria coluna nem migração de
tenant nesses cadastros. A correção limita-se à seleção determinística (receita ativa por `created_at, id`;
forma ativa única pelo nome configurado), sem fallback. O preflight só alerta se o schema mudar.

**Correção da hipótese inicial (v1 deste README):** foi afirmado que a impl escolhia categoria/forma "sem filtro
de tenant" e que `d51_5_validate_tenant_links` poderia recusar o título por isso. Errado: `d51_5` valida apenas
`customer_id → clientes.organization_id` e o tenant de parcelas/pagamentos, nunca categoria/forma. O tenant é
verificado onde existe ownership: tenant do título (dono), cliente do título (`client_id` no mesmo tenant),
emissor interno (h15) e destinatários de notificação.

## Autoridade do writer (`c2_owner_order_create_allowed`)
`uid = auth.uid()` · `parceiro_b2b` vigente em `user_roles` · contexto `C2_MULTIPROFILE_V1`/`commercial_owner`,
`manager=true`, `partner_id` igual · parceiro sem org própria · `b2b_phase1_partner_visible` · vínculo não
revogado, perfil ativo, `profile.org = pu.tenant = owner = contexto.tenant` · entitlements `pedidos_b2b` e
`catalogo_precos`. Sem ACL para PUBLIC/anon/authenticated. A projeção usa a mesma função (`order_capabilities`).

## Rollback (`rollback.sql.review`)
`c2_owner_order_create_allowed` → `false` (guard nega todo cliente comercial externo; projeção false) e assert
volta byte-exato (md5 `f86f43f9…`). **Mantém** aprovação atômica, resolução estrita e escopo do título.
Também mantém os destinatários restritos (não reabre o vazamento). Atenção: fecha também a compra direta de cliente comercial via RPC que hoje já existia sem menu.

## Matriz demanda → pedido → financeiro
| Etapa | Caminho canônico | Título |
|---|---|---|
| Carrinho/simulação | `simulate_b2b_payment_plan_secure` (assert + guard, preço `fn_resolve_b2b_cart`) | nenhum; devolve `cart_hash` |
| Envio | `create_partner_order_secure` (assert + guard, `cart_hash` recomputado, lock `b2b_idem:partner:key`, fingerprint) | nenhum; cria termos + cronograma snapshot |
| Mesmo key | replay do `result_snapshot`; hash diferente ⇒ conflito | nenhum |
| Aprovação | `approve_partner_order` → UPDATE status → `tg_auto_b2b_receivable` | **nasce aqui** se `na_aprovacao`; falha ⇒ aprovação abortada |
| Produção/entrega | mesmo gatilho | nasce em `produzido`/`entregue` conforme configuração; falha só registrada (inalterado) |
| Duplicidade | lock `b2b_receivable:<pedido>` + `partner_order_financial_links` | 2ª chamada `duplicado=true` |
| Parcelas | gatilho genérico + cronograma | soma = cronograma |
| Cancelamento/estorno | `cancel_b2b_receivable_secure` | FECHADO |

## Preflight hosted READ ONLY executado (23/10 ~19:15Z, ref swzpzcwiasxmjutrmvkm)
11 hashes e ACLs = esperado; candidato não instalado; 0 parceiros com dono + org própria; 1 categoria
RECEITA ativa; **5/5 configurações ativas com forma de pagamento não resolvível** (`pix` inexistente; só
existe método de auditoria); 3 parceiros comerciais sem atribuição de plano; 0 pedidos comerciais em 90d;
0 `financeiro_auto_falhou`; 0 aprovados sem vínculo. Todas as 5 configurações são `na_entrega`.
Consequência após instalar: geração passará a falhar explicitamente até cadastrar a forma de pagamento; em
`na_entrega` a entrega segue e a falha é registrada (semântica atual).

## Testes (`test-local.py`) — PostgreSQL 17 descartável, auth sintético, dependências stub
49/49 PASS (inclui 8 negativos A/B de notificação): fidelidade md5 local = hosted dos 7 corpos; blocker 1 reproduzido no baseline; candidato com
hashes reais; ACL; gestor/cumulativo/técnico/A→B/uid forjado; plano não atribuído; create/simulate usam guard;
revogação de papel, vínculo e entitlement; projeção; categoria/método/cliente/tenant interno; 1 título no
tenant dono com 3 parcelas = 300; duplicidade; parceiro não emite; `na_entrega` preservado; `na_aprovacao`
atômico; rollback byte-exato, writer fechado, dados preservados, sem aprovação sem cobrança.

Hosted READ ONLY (19:20Z): hoje há 3 destinatários internos ativos em 3 empresas distintas — um pedido
de qualquer empresa notificaria as outras 2; 0 notificações `pedido_b2b_*` já emitidas; 0 vínculos revogados.

## Pendência: sessão A financeiro verificando→vazio→pausada
Candidato SQL **não instalado** (confirmado hosted) e frontend sem mudança nesta rodada ⇒ não é efeito do
candidato. Telemetria local da sessão sem eventos relevantes; não reproduzido. Pausas fail-closed e intervalo
de verificação preservados; investigação segue aberta.

## Limites exatos
- Execução completa de create/approve com notificações reais não ocorreu no harness: helpers testados direto
  e substituição conferida no corpo instalado.
- Não é prova hosted/JWT/RLS/PostgREST nem homologação. Stubs: `b2b_actor_scope`, contexto, entitlements,
  eligibility, fiscal, wrapper do título, gatilhos de parcelas e d51.
- Idempotência concorrente e alteração de preço/hash: corpos de create intactos (lock e comparação de hash
  só verificados estaticamente); não executados com carrinho real no harness.
- Fiscal: `fn_fiscal_requirement_resolve` não recebe tenant; não auditado além do vínculo de cliente.
- `rpc_b2b_list_selectable_payment_plans` não filtra `pu.revoked_at` (listagem apenas; o guard bloqueia o envio).
- Frontend sem mudança nesta rodada: `useMyPartner` já usa só `order_capabilities` para `parceiro_b2b`
  (cumulativo incluso); teste `ownerOrderAccess` 3/3.
- Pendências antigas, cancelamento/estorno, multiperfil B e estabilidade do monitor seguem abertas.

## SHA-256
Ver `SHA256SUMS`.
