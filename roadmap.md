# F2-B — auditoria e preparação revisável

## 27/10 00:05 — clientes revisão fiscal e reprogramação
- [x] 00:19 auditor confirmou aplicações fiscal224ab7944abd13190fe8ea1044216218 e monitoringb32bf163ed7ccb989f4f0b653827d825; não reaplicar; contagem atual42. Parser completo/regressões e caminhos criação/status em conciliação local, sem fixture/SQL/publicação.
- [x] Callers/hooks/componentes auditados; draft update revisão positiva, reprogramação RPC/timestamp canônico sem writes diretos; PT409/403/404 uniformes/fences/travas sem retry.
- [x] 26 regressões novas de hooks reais com transporte/Auth simulados;153/153 totais em8arquivos, validação automática build OK00:09:37, git diff --check OK; caminhos/limites em applied/fiscal-draft-monitoring-client-review-20261027.md. Sem SQL/DDL/publicação.
- [x] Backend fiscal NULL/<=0/CAS e monitoramento tenant/origem/pós-lock/timestamp aplicados pelo auditor; provas fiscais reais específicas relatadas, não repetidas pelo agente.
- [x] Retorno JSON canônico fornecido e parser exige success true, alvo/data exatos e campos nullable válidos; nunca apenas id.
- [ ] Fixture/reprogramação JWT real A/B pelo auditor; agente apenas localiza caminhos e testa cliente com Auth/transporte simulados.

## 26/10 23:54 — concorrência RTC/IBS-CBS e conciliação independente
- [x] Corrigir leituras fora de ordem, leitura antes/durante save, duplo save e exceção/revogação:32 regressões falharam antes/passaram depois;162/162 finais em8arquivos, Auth/transporte simulados; validação automática build OK23:58:27, sem SQL/publicação.
- [x] Conciliar hashes/implantação global e company, race real relatada e44 funções40001 restantes; sem recaptura ou reaplicação.
- [x] Revisão NULL fiscal encerrada pela aplicação independente relatada27/10 00:19; sem reaplicação pelo agente.

## 26/10 23:42 — RTC CAS aplicado e interface global de serviços
- [x] Conciliação RTC registrada sem reaplicar SQL; hook real testa PT409/PT404, revisão preservada e ausência de retry.
- [x] UI tenant serviços somente consulta; IBS/CBS usa fence global existente; revogação/contexto testados. Rota Superadmin segue negada, sem nova entrada global.
- [x] 130/130 testes em7arquivos PASS (Auth/transporte simulados), build automático OK; relatório/diff em applied/fiscal_company_rtc_cas_http409_20261026.md.
- [x] Hardening servidor/CAS dos dois serviços aplicado pelo auditor às23:54; A/B ambos403/FISCAL_FORBIDDEN relatados, sem operações do agente.
- [ ] Canal global de edição de serviços não foi criado/autorizado. Cadastro direto e caches globais aguardam revisão completa.

## 26/10 19:01 — recuperação durável após fechar aba / mesma origem
- [x] Revisão19:45: predecessor canônico completo em recovery/advance, CAS de geração local dentro IndexedDB; controller antes0/3 depois3/3,46PG,17browser NovoPedido/HTTP controlado; sem limpeza arbitrária/publicação/SQLhosted. Revisão integrada/JWT real continuam pendentes.
- [x] Integração19:26: React canônico por capability servidor, fallback001b só RPC ausente antesativação; reserva server+IndexedDB/CAS/fences/payload, ACK UUID explícito e close sem avanço.94Vitest/44PG/16audit/17prototypebrowser/14Reactbrowser PASS, sintéticos/controlados; build automáticoOK; SQL inativo e sem publicação.
- [x] Complemento19:24: arquivo exato antes2PASS/11FAIL Node22+fakeIndexedDB; depois schema UUID estrito, CAS monotônico, terminais não despacham;17 browser PASS; candidato INATIVO, provas locks preservadas. Auditoria local citada pelo proprietário não está neste checkout.
- [x] Revisão065f8633: barreira sem lockescopo, fronteira bounded+import última committed semACK, pins LIVE READ ONLY, ACK/CAS/40P01 antes/depois/rollout/revogação/tenant/POST/contenção; 44 PostgreSQL +15 browser +31 componentes PASS, sintéticos/controlados; sem aplicar/publicar.
- [x] Registrar relato independente: 001b3cad publicado, backend 5cd aplicado; A closed/PB001033 único/committed, B 403/42501 target_outside_portfolio. Não repetir operações produtivas.
- [x] Preparar contrato servidor INATIVO + protótipo IndexedDB fora de runtime: 20 PASS PostgreSQL descartável/Auth sintética, 12 PASS Chromium/IndexedDB real/transporte controlado e 31 PASS regressões publicadas. Saídas e comandos no pacote durable-attempt-20261026.
- [ ] Revisão/implantação coordenada do candidato com pins+importação atômica+capability; frontend preparado, provas JWT/abas produtivas dependem do auditor. SQL inativo, sem hardgate impossível; versões antigas não recarregadas e chaves desconhecidas negadas pela candidata. Suíte externa40testes não disponível no checkout.
- [ ] Revisão independente, matriz completa/real A/B e eventual instalação/publicação pelo auditor; contabilidade A DRAFT e 36 falhas antigas permanecem abertas.

## 24/10 15:26 — compra B2B com pendência contábil honesta (pacote INATIVO)
- [x] `scripts/owner-orders-20261023/accounting-pending-request-20261024/`: rebase sobre LIVE 30dc8243 (scope 54c4327d), trava INSERT/UPDATE, sem oráculo, rollback parcial + restore-live completo condicionado; 67 PASS descartável (Auth sintética). UI mostra contabilidade pendente.
- [ ] Revisão independente/instalação pelo auditor do pacote acima; teste JWT/RLS real A/B; validação contábil real de A; tela de promoção ainda não existe.
- [ ] Revisão independente e aplicação pelo auditor; capturas de `LIVE-DEPENDENCIES.md`. Bloqueio: execução externa.
- [ ] Frontend: estado "aguardando validação contábil" e ação de promoção para o comercial, após revisão SQL.
- [ ] Validação contábil real de A; classificação fiscal MG e NF-e. Bloqueio: contabilidade/dados fiscais.

## 24/10 15:05 — catálogo da carteira comercial (pacote INATIVO ae29da6)
- [x] Captura LIVE `get_partner_catalog_secure` (uuid/V2) reproduzida MD5/owner/ACL; patch mínimo só no gate `forbidden_partner` via `c2_internal_order_target_reason`; PRE/POST/rollback com hashes; 47 PASS PostgreSQL descartável (Auth sintética).
- [x] Helpers LIVE reais (visibilidade/preço/volume) sem stubs, guardados em PRE/POST; fixture MG sintética identificada; 54 PASS descartável; criação não depende de b5.
- [ ] Revisão final e aplicação pelo auditor; PostgREST/JWT real A/B. Bloqueio: decisão/execução externa.
- [ ] Cenários MG interno/interestadual de classificação/regime/destinação no motor fiscal (fora deste pacote). Bloqueio: dados fiscais reais por produto/operação.
- [ ] Validação contábil real de A (DRAFT ⇒ capacidade `issuer_not_validated`). Bloqueio: contabilidade.

## 24/10 14:07 — acesso claro ao pedido canônico
- [x] Auditar parceiro/comercial em HEAD: consulta contida substitui carrinho, comercial analisa pedidos sem formulário autorizado de nova venda; nenhuma impersonação/novo writer.
- [x] Entradas contextuais/detalhes/percurso condicionado; 45/45 em5arquivosPASS com transporte/Auth sintéticos, build automáticoOK. Revisão docs/order-entry-clarity-20261024.md; candidate SQL SHA byte-exato b5e4acbf.
- [ ] Homologação real e continuidade pedido→financeiro→fiscal→entrega dependem de revisão independente, writer autorizado e contabilidade real A pendente; sem SQL hosted/publicação/sessões.

## 24/10 03:12 — parcelas manuais imutáveis
- [x] Captura SELECT canônica; AR/AP reproduziram23514 por UPDATE de parcelas imutáveis, nenhuma operação hosted mutante.
- [x] Pacote financial-installments-initial-20261024 independente INATIVO: contexto privado txid/título/ator/tenant, inserção inicial correta, PREPOST/rollback completo; fragmento futuro manual+B2B testado sem alterar final-integrated histórico.
- [x] 33/33Vitest em3arquivosPASS: PG descartável/Authsintética, AR/AP1/3,.99/3,.01/3negado/datas/atomicidade/A/B/cruzado/edição negada; erro persistente no diálogo. Build automáticoOK; sem build/typecheck manual ou JWT real.
- [ ] Implantação/homologação JWT dependem da revisão independente; sem hosted mutante/publicação/fiscal/writer/contabilidade.

## 24/10 01:52 — reconciliação tenant e base atual
- [x] Captura SELECT canônica78corpos/44triggers/policies/RLS; variante nova current-base-reconciliation-20261024, históricos preservados, tenantNULL23514 e propagação mantidos.
- [x] Cadeia reconciliada91checks/baseatual8checks; Vitest2/2 isoladoPASS; crédito123checks/1PASS. PREPOST completos uma transação/falhaPOST candidate e contenção preservam catálogo. Execução paralela teve timeout executor, não contadaPASS.
- [x] Independente wrapper não certificável: A/B createinterno positivo, wrapper/approve atuais negam42501B2B_INTERNAL_DOWNSTREAM_UNVERIFIED antes receipt; duasconexões sem reproduzir deadlock. Nenhum candidato independente pronto emitido.
- [ ] Implantação origem depende contabilidade realDRAFT/revisão/JWT; wrapper independente depende caminho funcional autorizado reproduzível na baseatual. Sem hostedmutante/publish/writer/sessões.

## 24/10 01:38 — correção crítica da composição transacional
- [x] Removidos somente delimitadores externos embutidos dos cinco comandos receipt-lock-order-review; uma transação por arquivo, pre/post READ ONLY, sem mudar corpos/guards/baselines.
- [x] Candidate/rollback/containment completos com falha deliberada no POST preservam hashes/owners/ACLs; todos checkpoints têm mesmo txid. Suíte2/2PASS, concorrência183checks96.50s/crédito123checks54.05s.
- [x] Revisão 07739e5c: lista admin de pedidos com escopo canônico, estado desconhecido pós-create, promoção core privado+wrapper INVOKER sem lock estrangeiro, UI de liberação explícita; 70/70 descartável + 13 Vitest.
- [ ] Implantação independente continua bloqueada pela revisão e contabilidade real pendente; writerfalse, sem hosted/publicação nesta correção.

## 24/10 01:10 — barreiras intermediárias e negativas estritas
- [x] Reproduzido deadlock40P01 na janela interna row/receipt por barreira de lock existente, sem alterar lógica; limite positivo/ramo formal pré-preparado localmente e negativasSQLSTATE42501+mensagens/controles positivos.
- [x] Variante receipt-lock-order-review troca somente ordem row/receipt do wrapper; PREPOST integrais/rollbackguardado/contenção compatível testados. Suíte2/2PASS concorrência177checks102.41s/crédito123checks59.53s; sem hosted/publish/baselines alterados.
- [ ] Concessão formal por approve_b2b_credit sem corpo atual capturado, JWT real e pós-entrega na_entrega não certificados; contabilidadeDRAFT/writerfalse e revisão independente bloqueiam implantação.

## 24/10 00:58 — create versus approve / locks de crédito
- [x] Duas conexões/corpos capturados: trigger de crédito serializa create-versus-approve nas duas ordens, sem deadlock/título prematuro; divergência hash explícita confirmada sem exploit demonstrado. Oito checks adicionais, total158.
- [x] Sem falha SQL demonstrada, nenhuma variante corretiva especulativa; baselines/rollback/origin-rebase intactos, implicações da contenção registradas em credit-lock-review.md.
- [ ] Revisão das janelas intermediárias/branches crédito formal e possível inversão row/receipt; JWT real/pós-entrega e implantação dependem de revisão independente e gate contábil humano; não certificados aqui.

## 24/10 00:47 — concorrência PostgreSQL e negativas
- [x] Exercitar duas conexões independentes:150checks/Vitest1/1PASS77.99s, create mesma chave exatamente um pedido; na_entrega pré-entrega nega, na_aprovacao separada primeira cobrança/concorrência sem duplicação.
- [x] Ampliar escritas A/B e revogação parcial com Auth sintética, preservar baselines/SQL históricos e documentar resultados/impedimentos em concurrency-review.md; nenhuma falha SQL exigiu correção.
- [ ] Produção permanece writerfalse/contabilidadeDRAFT; nenhuma operação hospedada/publicação autorizada neste recorte.

## 24/10 00:41 — implantação numérica pelo auditor
- [x] Registrar implantação independente c2_credit_percentage_numeric_capacity_only SUCCESS/PREPOST/8casosreadonlyPASS relatados, sem execução Lovable; não reaplicar candidato antigo.
- [x] Reconfirmar 123checks locais da função completa:Vitest1/1PASS54.70s; rebase PRE/POST/rollback apenas hashnovo demonstrado byte-exato, SQL/baselineshistóricos/ACL/writerfalse preservados.
- [ ] Composição segue inativa: revisão/quiescência/JWT e requisito contábil humano dependem do proprietário; implantação numérica não libera pedidos/fiscal.

## 24/10 00:32 — correção numérica de crédito separada
- [x] Preparar recorte exclusivo v_pct numeric(6,2) → numeric com PRE/POST/rollback hash/owner/ACL guardados, sem implantação.
- [x] Testar corpo capturado, limites/precedência/valores inválidos e cadeia create/idempotência/atomicidade/na_entrega:123 checks sintéticos, Vitest conjunto2/2PASS; concorrência/pós-entrega/JWT não certificados.
- [x] Demonstrar rebase somente do hash de dependência da composição em variante separada; esclarecer que exige patch numérico instalado antes, não é candidato aritmético.
- [x] Implantação aritmética concluída pelo auditor conforme atualização00:41; writer/gate contábil permanecem fechados, origem NO-GO por contabilidade/quiescência/JWT.

## 24/10 00:20 — contenção de pedidos externos existentes
- [x] Preparar rollback de contenção hash/ACL guardado para create/approve/generate externos, preservando origens internas e histórico; sem implantação.
- [x] Testar criação externa seguida contenção:84checks sintéticos, approve/generate negados sem efeitos/replay, drift corpo/ACL abortado; create interno positivo e negações downstream internas preservadas antes/depois (sucesso interno não certificado). Relatos/manifestos atualizados.
- [ ] Gate contábil/JWT real e quiescência antes de eventual operação hospedada dependem do proprietário; pfs real na_entrega active/auto true preservada.

## 24/10 00:14 — revisão independente 9c62ecab / pacote inativo
- [x] Registrar relato do proprietário: PRE estrutural integral readonly canônico PASS; PRE contábil 42501/C2_ACCOUNTING_PREREQUISITE_BLOCKED esperado. A preencheu CNPJ/razão social reais, continua DRAFT sem atestado; não alterar dados nem relaxar pré-requisito.
- [x] Corrigir mensagem externa de aprovação comercial sem promessa de produção; ramo interno capturado preservado, não homologado operacionalmente.
- [x] Testar na_entrega singleton/cumulativo: aprovação sem título e operação negada; reprodução revelou gerador manual permissivo pré-entrega, corrigido somente no impl externo com C2_EXTERNAL_DELIVERY_REQUIRED, eligibility intacta. numeric6,2 limite1/exposição180 reproduzido/rollback; proposta mínima separada `v_pct numeric`, não integrada.
- [x] Finalizar relatos e PRE/POST/rollback:69checks sintéticos/1VitestPASS; PRE/rollback byte-exatos, POST approve/impl atualizado, proposta numérica separada. Revisão read-only confirmou branches e destacou matriz de transições/concorrência issuer não certificadas; entrega positiva deliberadamente fechada. Manifestos verificados, writerfalse e nenhuma implantação.
- [ ] Bloqueio humano contábil e homologação JWT da composição continuam dependentes do proprietário; pendências históricas preservadas.

## 23/10 23:55 — bloqueio contábil e composição dos filhos
- [x] Registrar relato readonly: ownerA1ativoDRAFT/accounting_validated_atNULL; ownerBsemconfig. Adicionar `preflight-accounting.sql` obrigatório junto do PRE estrutural, sem alterações contábeis/DDL/DML hospedados.
- [x] Validar composição existente dos filhos:56checks PostgreSQL descartável PASS, incluindo DRAFT/NULL/ausência e seis negativos de administração por externos/B; aprovação/cobrança owner preservadas. Auth sintética, não homologação JWT. Pacote revisável inativo/writerfalse, sem deployment.
- [ ] Bloqueio humano: revisão contábil legítima do ownerA e configuração realmente validada pelo fluxo autorizado; NÃO inventar CNPJ/atestado/VALIDATED para PASS. Revisão independente whole-chain/PREPOST e JWT continuam pendentes, demais dívidas preservadas.

## 23/10 23:32 — conflito de origem interna no pedido externo
- [x] Registrar homologação independente c8dc171c/index-xrePLkS9: modal estável, Bombarbio1L180/simulação180; duas criações negadas403/42501 B2B_INTERNAL_ACTOR_DENIED, zero pedidos/títulos. Contenção c2_contain_writer_internal_origin_conflict helperfalse vigente, não reabrir.
- [x] Inspecionar chain completo:44triggers/50policies/78corpos; preparar composição inativa em `scripts/owner-orders-20261023/internal-origin-composition-20261023/` com origem server-owned/ticketprivado, PRE/POST integral, rollbackdeny-only.46checksPostgreSQL/1VitestPASS; Auth/fixtures sintéticas, sem provaJWT hosted. Sem SQL aplicado/publicação/sessões; baselines anteriores preservados.
- [ ] Revisão final independente/PREPOST canônico e homologaçãoJWT A/B/cumulativo/revogação dependem do proprietário; writer permanecefalse. Readiness/produção/entrega continuam fechadas no candidato. Pendência adicional percentual crédito numeric6,2 overflow em faixa extrema registrada, não corrigida neste recorte.

## 23/10 23:25 — confirmação independente e vetor completo
- [x] Registrar observação passiva CDP25responsesHTTP200/264–345ms: esta rodada não sugere gateway lento, conforme proprietário; sem atribuir prova a novas consultas do agente. Contenção23:21 vigente.
- [x] Vetor efetivo C2 singleton/cumulativo completo e fallback legacy revistos sem alterar decoder/contrato; testes concretos adicionados.51/51 focados e158/158 em11arquivos PASS. Integração14cenários prova revogação/tenantchange/ABA observado; ABA entre polls NÃO certificado. Build automático23:25:56OK; nenhum tipo/build manual. Pacote atualizado sem SQL/publicação/sessões/pedidos; contenção vigente.

## 23/10 23:21 — evidência real adicional e contenção
- [x] Registrar relato: timeOrigin1792797076368.5 estável/navigation navigate, sem reload, console vazio/diagnostics=[]; contenção independente c2_writer_containment_during_real_session_regression SUCCESS, helperSELECTfalse, financeiro preservado, zero pedidos. Não aplicar SQL/reabrir writer/publicar.
- [x] Duas revisões read-only independentes: baseline byte-exato9PASS/2FAIL vs atual11PASS; confirma perda periódica/refresh, não causa única hosted. Ring vazio compatível com probes B2B (diagnóstico environmental-only). Foco/visible usa revalidate explícito e desmonta por pending; NÃO alterado. Features/capabilities ausentes reproduzem Cliente comercial sem erro; refetch idêntico preserva modal. UserMenu real/defaults QueryClient reais,120/120 PASS em9arquivos; sem mudança runtime adicional nesta rodada, build automáticoOK.
- [ ] Prova HTTP local com SDK real e homologação da aba real/artefato: transporte atual imediato e shell parcialmente simulado não certificam origem do fallback real; depende de recorte de validação e revisão independente. Writer contido, sem SQL/publicação.

## 23/10 23:14 — regressão catálogo durante sondagens/renovação
- [x] Reproduzir perda modal/carrinho antespatch; AuthProvider/monitor/QueryClient/rota/NovoPedido/hook reais, só SDK/relógio/shell simulados. Sondagens idênticas não remontam; renovação oculta autoridade e reconstitui somente escolhas após vetor igual + catálogo/volumes frescos. Revogação/deadline/offline/troca/Retry descartam.110/110 regressões +5/5 saneamento PASS; build/typecheck automático OK, sem manual/JWT hosted.
- [x] Baselines byte-exatos/patch/hashes em scripts/owner-orders-20261023/catalog-monitor-fix-20261023; release9fc18e7a/index-DFNxASjt e reabertura Codex registrados como relato independente. Manifesto principal127/127 PASS,121 linhas anteriores preservadas. Sem SQL/publicação/sessões/pedidos reais. Pendências históricas preservadas.
- [ ] Homologação da aba real e publicação do novo patch: dependem da revisão e ação independente do proprietário; não executadas pelo agente.

## 23/10 23:03 — encerramento documental após revisão independente
- [x] Restaurar117 entradas de cadda8f7,115 linhas históricas byte-for-byte; atualizar só README/relatório já alterados, acrescentar4 novos, total121/121 PASS com sha256sum -c SHA256SUMS na pasta do pacote. SHA final486a01b078b5d5e94052ce60f770c77c84bdd0f868ed6fa0e2f7f188d7301540. Runtime/SQL/snapshots intactos nesta rodada.
- [x] Registrar relato independente: build cadda PASS34,8s/14testes PASS; aba real parceiro recuperou semreload, catálogo readonly visível apóscontenção e criação false; JWT B archive403/42501 C2P1_FORBIDDEN, A published intacta. Sem novo deploy.
- [x] Encerrar mudanças funcionais desta fila: só documentação/manifesto autorizados; publicação independente e reativação writer não executadas.

## 23/10 23:00 — NovoPedido real e expectativa histórica
- [x] Testar B2BRouteGuard/Layout/EntitlementOutlet/NovoPedido e hooks reais com QueryClient e transporte local instrumentado: partner/tenant, negação/loading sem queries descendentes; sem sessões/SQL/publicação.
- [x] Atualizar separadamente expectativa antiga financeiro=contas_receber, featureRouteMap intocado;21/21 testes em5 arquivos PASS, build monitor23:03:18 OK, patch/SHA para revisão. Sem typecheck manual/homologação JWT real.

## 23/10 22:58 — contenção independente e patch UI
- [x] Registrar c2_owner_orders_writer_containment SUCCESS relatado: create_allowed SELECT false, eligibility fechada, financeiro/approval preservados; POST release antigo não representa estado pós-contenção deliberado. Não reaplicar/reabrir writer.
- [x] Validar patch mínimo EntitlementOutlet:5/5 testes contexto exato, queries zero negado/pendente, troca partner/tenant e negação na troca com QueryClient real. Diff/SHA preparados; build monitor23:00:02 OK, sem typecheck manual/publicação ou alteração baseline SQL.
- [x] Recuperação da aba real semreload e catálogo readonly apóscontenção comprovados pelo relato independente23:03; criação false. Publicação continua independente, sem autorização ao agente. Demais pendências históricas intactas.

## 23/10 22:56 — C2-ORD implantado independente / bloqueio catálogo preview
- [x] Registrar Codex c2_owner_orders_p1_composed baseado b38e2c26, PRE/POST integrais mesma transação SUCCESS e POST externo PASS relatados; eligibility preservada, sem pedido/título, não reaplicar nem editar baseline antigo.
- [x] Reproduzir sem HMR contexto partner perdido no EntitlementOutlet intermediário real; teste falha com erro idêntico. Corrigir encaminhamento exato de contexto após gate existente, sem permissões novas.
- [x] Provider/rota com React Router real: reproduz erro idêntico antes;6/6 focados PASS depois, build observado OK. Suíte ampliada25 PASS/2 FAIL, ambas repetidas no gate anterior isolado (baseline19 PASS/2 FAIL), não corrigir fora do recorte. Sem reload/retry recarga, SQL/publicação; pós sessões reais ainda pendente, frontend publicado f351 e B403/A archived_atNULL registrados.

## 23/10 22:54 — implantação independente eligibility / v4
- [x] Registrar Codex c2_billing_eligibility_internal_only, somente REVOKE PUBLIC/anon/authenticated, corpo intacto db977875e15ea49ce10fb3e5388d7dfb e postgres/service_role, PRE/POST PASS relatados; não reaplicar.
- [x] Candidato v4 mantém guardas ACL atuais em PRE/candidato/POST/rollback sem reabrir grant; nove hashes de corpos v3 intactos. Writer fechado; nenhuma escrita hosted/publicação.
- [x] Registrar relato negativo REAL B archive403 e A published com archived_at/byNULL; não repetir teste, pendências antigas preservadas.

## 23/10 22:52 — superfície billing eligibility
- [x] Registrar negação REAL API archive A/admin B HTTP403 C2P1_FORBIDDEN/42501 relatada pelo proprietário; não repetir teste.
- [x] Callers repo/SQL auditados: nenhum cliente de produto, Edge só probe, SQL atual único impl DEFINER/postgres. Consulta READ ONLY canônica: authenticated/anon=false, service=true; internal-only já vigente, não atribuir implantação.
- [x] Guardas corpo/owner/ACL/call graph incorporadas em PRE/candidato/POST/rollback;69 PG checks via Vitest1 PASS, B/anon negados e owner/service/aprovação preservados. Sem ACL/schema/fiscal alterados, deploy ou liberação writer; homologação real do gate e cadeia integral permanecem pendentes da revisão independente.

## 23/10 22:43 — rebase restante C2-ORD sobre P1 instalado
- [x] Registrar relato f351d6d5 publicado e salvar/reabrir AUDIT homologado REAL admin A; P1/fiscal instalados e B UI sem A. Não recarregar sessões ou reaplicar.
- [x] Rebase v3: fallback org_partner real/teste divergência, remover INSERT settings, owner P1 nos dois endpoints approval/billing; PRE composição atual/POST hashes/rollback deny. 68 checks PG descartáveis +18 Vitest PASS; Auth/schema reduzidos, não JWT/homologação real.
- [ ] Revisão independente PRE/POST integral hosted/cadeia triggers/locks e create positivo/preço/hash/idempotência; writer continua fechado até implantação independente. Nenhuma sessão/dado real alterado.
- [x] Complemento22:50: registrar9 hashesv3 conferidos pelo auditor e SQL simulado adminB archive A `C2P1_FORBIDDEN`/rollback; reforçar teste settings ausente com erro claro e rollback financeiro integral, sem ticket/bypass.
- [x] Arquivamento negativo48dcac7d por adminB: REAL API/JWT autorizado relatado22:52, HTTP403 C2P1_FORBIDDEN/42501. Encerra só a negação específica; pendências antigas preservadas.

## 23/10 21:18 — P1 aplicado externo; regressão salvar/reabrir
- [x] Registrar aplicação Codex migration20261023211007/PRE/POST/dados iguais, JWT B lista vazia/A própria publicada, publicação bafe3e23/deploybcca6f2f e método AUDIT salvo UI updated_at21:18:08.481422+00, na_entrega/prazo7 intactos em applied; relato externo, não reaplicar.
- [x] Reproduzir e corrigir hook+dialog com QueryClient real: cache canônico scope atual, cancel reads antigos/await invalidação, baseline somente após leitura inicial fresca, rascunho sujo/CAS/fences preservados.
- [x] 59/59 testes (11 integrados), tsgo app/node0 e produção cópia integrada PASS26,04s; diff/SHA cache-reopen-20261023. Artefato App público SHA igual à build anterior/commit/deploy anunciados corretos; sem banco/dados/writerC2/publicação.
- [x] Homologação real salvar/reabrir relatada22:43 em f351d6d5 publicado, admin A; não executada pelo agente nem homologação integral.
- [x] Arquivamento negativo B: API/JWT REAL autorizado relatado22:52, HTTP403 C2P1_FORBIDDEN/42501; homologação integral e pendências antigas preservadas.

## 23/10 21:06 — promoção frontend P1 autorizada, sem publicação
- [x] Promover somente hook RPC financeiro para src; selector/mutation owner ativo OU ownorg legado interno sob RLS, RPC/CAS autoritativos, sem writes diretos ou liberar writer C2.
- [x] 48/48 testes owner/ownorg/B/externos/CAS/fences/diálogo/publicação; tsgo app/node EXIT0, Vite production cópia integrada PASS36,15s (aviso chunks), preview OK. NÃO tsc/JWT/UI real; diff/SHA frontend-promotion-20261023.
- [x] Registrar relato ACL fiscal c2_fiscal_resolver_internal_only aplicada pelo proprietário em applied (corpo intacto, postgres/service_role), sem consulta nova nem cópia migration fabricada; nunca reaplicar.
- [x] Aplicação P1/POST e JWT leitura A/B relatados em21:18; método AUDIT salvo por UI externa. Substitui pendência de implantação e estado pix; writer C2 e homologações restantes fechados.

## 23/10 20:10 — P1 prioritário antes do writer
- [x] Complemento20:19 candidato inativo: history/list/upsert/delete/matrix/batch/publish/copy/simulate + RLS itens/rules e dois logs, vínculos assignment/rule, PRE família/trigger LIVE e rollback comum; 102/102 PG sintético + 5/5 SDK. Cópia default/logs globais e histórico sem alvo provado fechados, preservados. Sem pedido/título/hosted/publicação; ver limites README.
- [x] Candidata P1 inativa em scripts/owner-orders-20261023/p1-isolation: leitura/listagem e família assignment/sibling por destino, planos globais intactos; prova REAL B relatada, Arquivar NÃO acionado. 50/50 PostgreSQL sintético.
- [x] Preparar owner ativo/ownorg interno com h15/perfil/roles, CAS servidor, método ativo, PRE/rollback e patch financeiro inativo; 5/5 SDK candidato e19/19 regressões. Sem hosted SQL/dados/publicação.
- [ ] Gate P1: PRE/POST integral/closure de locks e hashes pós exatos, types/build candidato independente; default sem tenant e Superadmin sem autoridade interna fechados explicitamente. Ver README; não liberar writer.
- [ ] Homologação REAL A/B e revisão independente dos dois recortes antes de liberar writer; pendências antigas mantidas.

## 23/10 19:55 — revisão pós-914d06c
- [x] Complemento20:03 frontend local: seletor tenant/roles sem pedido, mesmo diálogo/métodos ativos, legado inválido explícito, rascunho sem reset/CAS concorrente e publicação com cancel/releitura; diff/hashes junto revisão fiscal. 44/44, TypeScript e build isolado PASS. Sem dados/SQL/publicação.
- [ ] Homologação real do formulário bloqueada: policy restritiva exige Superadmin ou org própria; teste4 has_partner_org=false. Não ampliar RLS nesta correção frontend; revisão de autoridade owner específica ainda necessária para admin tenant configurar teste4. Usuário financeiro/gestor sem SELECT partner_accounts também fica contido.
- [x] Preparar contenção fiscal ACL-only com pre/postflight/hashes, rollback e roteiro REST; 60/60 PG locais incluindo authenticated B/A sintético, sem alegar JWT hosted.
- [x] Testar C2-ORD com 6 corpos reais b2b_actor_scope/is_valid/contexto/readiness/h15 e hashes LIVE; legado/recorte instalado intactos.
- [x] Corrigir vigência civil do plano 23/10–30/10; 23/23 Vitest, tipos e produção em cópia isolada PASS; documentar caminho/bloqueio real do formulário financeiro.
- [ ] Revisão/aplicação fiscal e restante C2-ORD pelo auditor; REST/JWT real após aprovação e instalação. Nenhuma operação hosted/publicação automática.
- [ ] Configuração humana teste4 aguarda formulário funcional: não alterar fixture/parceiros; plano62147f24 e atribuição48dcac7d já existem, não duplicar. Pendências antigas continuam abertas.

## 23/10 17:55 — implantação coordenada C2 executada pelo auditor
- [x] Registrar evidências relatadas: migration integral `c2_integral_multiprofile_own_finance_reviewed` SUCCESS, postflight INVOKER/core ACL PASS, `b2b_actor_scope` intacto, legacy financeiro fechado, anon negado; Edge create-user v103 ACTIVE verify_jwt=true conteúdo exato 67bca16c; hosting deploy 86b2e88d iniciado, bundle build-mvl8yand com novo lifecycle; build Vite production 4763 módulos PASS, safeHome 12 PASS; UI real adminA lista6/lifecycle3, adminB lista2 sem A, parceiroA Financeiro com lista vazia autorizada; advisor diff sem findings novos.
- [x] Sincronizar SOMENTE `supabase/functions/create-user/index.ts` byte-exato com o candidato implantado (SHA256 931ba9fa46ebea265fd3fc9105e07f383c2f44ad3ff7879a84a2cd18b78ca095), verify_jwt=true preservado, sem mudança funcional — evita reversão da Edge hosted em próximo deploy automático. Redeploy automático da mesma Edge autorizado pelo proprietário.
- [ ] Homologação real integral A/B de atribuição cumulativa, revogação parcial/total e reativação em sessões reais: NÃO declarar multiperfil/revogação completos; pendências anteriores continuam abertas. Sem SQL/publicação pelo agente; roles/dados reais intocados.

## 23/10 17:20 — preparação release67bca16c autorizada
- [x] Driftcheck20 baseline/candidato/revisão exata; promover20 arquivos src sem SQL hosted/publicação/dados/sessões.
- [x] Edge canônica patch exato separado; não tocar supabase/functions pois mudanças podem disparar deploy automático proibido.
- [x] Cadeia src real260/260; TypeScript src PASS; Edge13/13/check PASS; build automático OK. SafeHome produtor introduzido corrigido/testado; fixtures antigas baseline30PASS, variante C2 atual28PASS.
- [x] Relatório/hashes20/Edge verify_jwt/rollback deny-only/REST postflight real em release-67bca16c; sem declarar JWT homologado.
- [ ] Build produção independente: log automático não informa mode/comando e dist ausente; execução no checkout do auditor pendente, sem afirmar certificação produção.
- [ ] Execução coordenada SQL/Edge/publicação e homologação real aguardam proprietário/auditor; atribuição cumulativa só novas abas versão nova, existentes sem reload.

## 23/10 — complemento de revisão C2 inativo
- [x] Histórico core privado + API INVOKER, réplica/rollback/preflight; SQL integral67 e histórico40 PASS.
- [x] Mensagem financeira contextual; leitores publicados singleton/admin6 PASS, integral134 PASS/tipos20 PASS; arquivos/contagens esclarecidos.
- [x] Evidências relatadas tipagem18/preflight readonly/gate/sessões disponíveis registradas, sem promover/aplicar.
- [ ] Convivência cumulativa em aba antiga não certificada: leitor antigo exige papel único; requisições pendentes/Edge/schema cache e revogação reais aguardam auditoria, sem reload ou bypass.

## 23/10 — cadastro cumulativo integral INATIVO
- [x] Corrigir formulário canônico candidato com três perfis externos, produtor sem parceiro, cliente/fazenda, payload coordenado e confirmação única lifecycle; manifesto 20 cópias.
- [x] Página real jsdom 15/15; integral 128/128; Edge sintética 13/13; tipos das cópias PASS; diff/provas/SQL e rollback preservados.
- [ ] Preflight/postflight e homologação real A/B aguardam revisão independente; não instalar/implantar/promover/publicar neste turno. Dados comuns multiperfil e gestão de vínculos cliente/fazenda na edição continuam fora do contrato revisado.

## 22/10 02:38 — CAS fiscal servidor, mesmo recorte
- [x] Reproduzir AFTER-only sem avanço de timestamp e reforçar candidata BEFORE monotônica/transacional; teste UPDATE direto com duas conexões/m mesmo token: uma linha/um conflito, stale sequencial e rollback token/auditoria; 34 SQL locais + 10 Vitest candidatos PASS.
- [x] Registrar relato Admin B: leitura fixtures e tentativa vazia INS-4 sem perfil criado; edição indevida ainda presente no runtime, corrigida apenas na candidata read-only interna.
- [x] Registrar evidência do auditor financeiro35/layout-filtros19/tsc candidato PASS; não equivale a SQL multiperfil ou produção homologados.
- [ ] Promoção fiscal e prova hosted CAS/auditoria/UI aguardam revisão independente; nenhuma alteração de dados reais, SQL hosted ou publicação.

## 22/10 02:29 — correção global fiscal e gates integrais C2
- [x] Preparar candidata fiscal Superadmin na plataforma com editor existente, leitores internos read-only, ativo/histórico, CAS/duplicidade e IBS/CBS fenced; 26 SQL locais + 10 Vitest candidatos + 59 regressões; SQL/preflight/rollback somente revisão.
- [x] Executar cadeia local C2 readers/provisionamento/lifecycle+rollback/ACL (34 checks), SQL complementar49, Edge9, contrato11 e seletor integrado3; guard estrutural fresco embutido, sem instalar.
- [ ] Gates integrais C2: migration em schema hosted completo e árvore AuthProvider/MobileLayout/provisionamento real aguardam validação independente; testes com Auth/RPC sintéticos não encerram este gate.
- [ ] Typecheck integral das cópias fiscais/C2 e UI fiscal global autenticada aguardam auditor; build automático runtime OK não valida cópias inativas.
- [ ] Homologação autenticada/JWT/RLS real aguarda revisão/aplicação independente; sem fixtures novas, SQL hosted ou publicação.

## 22/10 02:26 — fixtures existentes e conferência fiscal
- [x] Registrar evidência relatada INS-4 químico/Inseticida e SOLO-4 fertilizante/sem rótulo criados por Superadmin no formulário existente; inativos/fora B2B/sem dose/composição/fiscal; NÃO recriar nem modificar.
- [x] Corrigir aviso falso de famílias indisponíveis para criação pendente seguida da classificação canônica; fluxo existente25/25 testes.
- [x] Conferir chave efetiva wrapper ator/tenant/request e restringir invalidação ao ator capturado;59/59 testes fiscais com revogação pré-insert/RLS/CAS/negação de cache.
- [ ] Gate fiscal real: readonly canônico mostra SELECT por role sem tenant, perfil sem tenant e nenhum BEFORE updated_at listado; revisão modelo global/RLS e CAS concorrente real necessários antes de habilitar novos perfis. Nenhuma política/SQL alterada.
- [ ] Pacote financeiro/multiperfil conjunto segue NO-GO nos gates registrados; driftcheck financeiro PASS nesta rodada, nenhuma ativação/publicação.

## 22/10 02:22 — drift financeiro e matriz fiscal
- [x] Regenerar patch financeiro sobre HEAD corrigido, driftcheck SHA256 PASS e filtros17+layout financeiro2=19/19; suíte financeira35/35. Bind success/null e identidade arrayroles do HEAD preservados, sem restaurar scalar role/bind antigo.
- [x] Preparar variante financeira multiperfil por capacidades atuais em multiprofile/: projeção/validator coordenados, preflight separado e guard instalação explicitamente fechado; nenhuma instalação/SQL hosted.
- [ ] Gate financeiro conjunto: auditor deve capturar baseline PostgreSQL/ACL/owner pós-C2 e validar SQL/rollback/REST/UI integrais; fontes SHA não substituem hashes LIVE. Singleton e multiperfil não instalar sequencialmente com preflight antigo.
- [x] Matriz frontend fiscal existente documentada;55/55 testes incluindo formulário rascunho vazio/ator pausado, sem dados tributários inventados. Build automático OK; typecheck candidato independente e UI real continuam pendentes.

## 22/10 02:13 — continuação coordenada autorizada
- [x] Registrar homologação específica dos filtros pelo auditor: HEAD3b030e4/deployment05e50d06/bundleDesBQeTv; Químicos+busca preservados em r1s→r5g, sem reload. Renovação token/revogação integral ainda pendentes.
- [x] Implementar candidata concreta claim/finish/compensação, Edge fora deploy e patch coordenado8arquivos: 19PG com triggers capturados+49PG readers/lifecycle+9Deno+11Vitest. Preflight estrutural16relações e rollbackfamily deny-only preparados; runtime multiperfil inalterado.
- [ ] Gate C2 NO-GO: montagem integral/rollback/ACL, guard assertivo estrutural fresco, integração real selector/monitor/cadastro/MobileLayout e typecheck candidato completo; NÃO instalar/publicar até revisão auditor.
- [x] Refinamento fiscal revisável em FiscalProdutos/hook/validação existentes após NTs oficiais2025.002v1.52/2026.002v1.11;53/53testes, build automáticoOK; rascunho incompleto não é NF-e pronta, sem classificação/default inventados. Revisão scripts/fiscal-products-refinement-20261022/README.md.
- [ ] Homologação fiscal UI autenticada e typecheck independente: auditor; nenhuma NF-e/fixture criada. Refinamento não certifica RTC/operação final.
- [x] Fixtures humano-autorizadas criadas por Superadmin segundo evidência02:26 INS-4/SOLO-4; nenhum DML hosted pelo agente. Financeiro/documentos permanecem inativos/fechados.

## 22/10 02:00 — sequência expressa: filtros → financeiro/multiperfil → fixtures/fiscal
- [x] Registrar orientação sem interromper filtros: auditor reproduziu 1 falha/13 com ready=true/pending=true/dataundefined; os 12 anteriores passavam. Correção local6be91d43 reforça ambas chamadas com ausência somente em sucesso/null e adiciona janela pendente e troca tenant/papel; NÃO equivale a homologação real.
- [x] Homologação específica filtros substituída pelo resultado auditor02:13: Químicos+busca preservados sem reload; renovação token/revogação integral seguem abertas.
- [ ] Prosseguir financeiro/multiperfil coordenados, ainda candidatos inativos até revisão; novos objetivos abaixo não substituem esses recortes.
- [ ] Na sequência, cadastrar químicos e fertilizantes/adubos FICTÍCIOS pelo fluxo canônico, identificados TESTE/SEM USO COMERCIAL, para positivos/negativos perfil/tenant/catálogo/recomendação/OS; sem uso real, dados fiscais ou agronômicos inventados. Nenhuma fixture criada nesta rodada.
- [ ] Preparar candidata fiscal na página existente /configuracoes/fiscal/produtos: reutilizar FiscalProdutos unificada, IbsCbsItemCard e product_fiscal_profiles por IDproduto; confirmar fontes/contrato vigente antes de alterar, sem cadastro paralelo.
- [ ] Consultar docs oficiais IBS/CBS/NF-e e regime/operação antes da implementação; classificação NCM/CEST/CFOP/tributação ausente vira pendência e bloqueia prontidão. Cobrir tenant, concorrência e rascunho/pronto; sem alterar perfis reais, emitir notas reais, SQL hosted automático ou publicação.

## 22/10 01:46 — filtros durante pausa e coordenação dos candidatos
- [ ] Homologação filtros REABERTA01:56: auditor observou reset real bundle index-kXPMojJ0.js/HEAD50e3f902; atualização da publicação confirmada posteriormente pelo auditor, filtros NÃO homologados. Correção local02:00 move memória abaixo AuthProvider/acima Routes; ambas chamadas só emitem null em query success com data null, nunca pendência/erro.63/63+30/30/types PASS; aguarda revisão e UI real, financeiro/multipapel inativos.
- [x] Complemento01:53: hook useMyCommercialOrders nega cache após refetch em erro; regressão real do hook reproduziu falha antes. Filtros e candidatos financeiro/multipapel preservados, sem SQL hosted/publicação ou mudança de entitlements.
- [x] Corrigir reset por desmontagem layout/grid e boundary ancestral: memória volátil de filtros acima da boundary, sem manter dados/autoridade/lease. docs/catalog-filter-pause-20261022-review.md.
- [x] Regressões pausa/retomada/renovação, mudança ator/tenant/contexto/A→B→A e rollback frontend; sem SQL hosted/reload/publicação. Homologação real após publicação pelo auditor permanece aberta.
- [x] Coordenar capacidade/menu/entitlements financeiros em SQL/patch frontend INATIVOS; adapters de readers/provisionamento/seletor C2.1 rejeitam contrato singular atual. Sem ativação runtime dessas candidatas.
- [ ] Multipapel integral: adaptar folha/readers/claim/finish/compensação/contextos/preferência/monitor junto dos writers e testar triggers completos/locks/JWT; adapters não certificam nem habilitam essa cadeia.
- [x] Coordenação parcial02:09 em scripts/contracts-c2-20261022/coordinated: readers + writers existentes49/49 PostgreSQL descartável e33/33Vitest; montagem de provisionamento NÃO validada integralmente. README NO-GO explicita ausência de patch Edge/seletor/monitor e gates de triggers/rollback; nenhuma promoção runtime, SQL hosted ou publicação.

## 22/10 01:33 — C2-CAT publicado, dashboard e financeiro próprio
- [x] Auditor confirmou HEAD318957a2e5f9117a49a365728af421687b22caf1/deploymentafa325c5-7fb8-4461-9d2d-11d47b01f1f4 e UI atualizada;30/30+tsc. UI real teste4 catálogo35itens(11produtos24micros), filtros químicos/adubos funcionam porém vazios: conteúdo não homologado positivo.
- [x] Reset reproduzido e corrigido localmente em01:46 por desmontagem/keys; publicação e UI teste4 reais da correção ainda pendentes, sem alterar monitor.
- [x] Corrigir TS2345 por fronteira runtime explícita dos campos obrigatórios; dashboard promovido localmente após revisão, 29/29 Vitest e types candidato PASS, sem publicar.
- [x] Preparar financeiro próprio INATIVO em scripts/partner-own-finance-20261022: inventário LIVE read-only, overload guardada, página/hook, preflight/postflight/rollback deny; 30/30 PostgreSQL sintético e 21/21 Vitest/types PASS. Obrigações perante fornecedor, não receitas/saldos internos; documentos fechados.
- [ ] Revisão independente do financeiro: entitlement e capability coordenada no menu/projeção ainda bloqueiam promoção; REST/JWT/RLS/UI real não homologados. Dashboard local aguarda publicação e UI real pelo auditor.
- [ ] Coordenar multipapel/readers/provisioning/seletor antes de instalar writersC2.1; demais pendências preservadas.

## 22/10 01:24 — ampliação funcional portal gestor B2B
- [x] Registrar orientação explícita: acompanhar empresa própria em dashboard/catálogo/financeiro/operações/equipe, sem gestor interno ou Outlet irrestrito; C2-CAT entregue95738f51, publicação e UI catálogo confirmadas posteriormente pelo auditor (registro01:33).
- [x] Registrar prova externa auditor pós-banco C2-CAT: administradorB cbdc4ef3… projeçãoHTTP200null e catálogo parceiroA403forbidden_partner; teste4 projeçãoHTTP200 catálogo/fichastrue. Não equivale a homologação UI; nenhuma recarga.
- [x] Inventário inicial/matriz em docs/portal-gestor-b2b-next-slice-20261022.md; fontes financeiras distinguem parceiro/fornecedor, sem afirmar autorização SQL não inspecionada LIVE.
- [x] Primeiro recorte candidato inativo scripts/manager-own-dashboard-20261022: indicadores exatos de pedidos observados, patch frontend, preflight read-only/reversão segura;24/24 testes sintéticos. Nenhuma mudança runtime/SQL/publicação.
- [x] Publicação/UI catálogo C2-CAT observadas pelo auditor; dashboard revisto e types corrigidos, promovido só localmente. Fichas não vazias, monitor/filtros e publicação/UI dashboard continuam pendentes.
- [ ] Coordenar multipapel/seletor existente gestor/técnico/produtor e provisioning em entrega separada após publicação C2-CAT; permissões ainda dependem de prova.

## 22/10 00:54 — C2 contratos funcionais multiperfil (candidata separada)
- [x] Complemento auditor15bd79dd registrado: tsc original falhou4TS2339; tipos jest-dom corrigidos no candidato e histórico paginado ator/antes/depois restrito em C2.1, sem afetar C2-CAT.
- [ ] Gate produção C2.1: reavaliar locks em testes com cadeia completa de triggers; harness reduzido/CAS não certifica essa integração, writers continuam fechados.
- [x] C2-CAT prioritário separado preparado em scripts/contracts-c2-cat-20261022: capacidade catálogo/fichas na projeção canônica e view owner read-only; nenhum canal financeiro/simulação/escrita adicional. 30UI/session +16SQL locais e39regressões; sem instalar C2.1 ou promover runtime.
- [x] C2-CAT auditor9743dd58:30/30Vitest, types corrigidos, seis hashes/ACL/owner; SQL aplicado externamente e projeção teste4HTTP200 C2_CAT_V1 ambas capacidadestrue. Promoção local somente4arquivos autorizada, sem reaplicar SQL/publicar.
- [x] C2-CAT publicação e UI catálogo confirmadas pelo auditor, dados35 e químicos/adubos vazios. Fichas não vazias e monitor “verificando acesso” permanecem pendentes; modelo explícito não homologado, lease/sessões preservados.
- [x] Registrar publicação externa C1B/rótulos ed9f8d2c, deployment1d249f08-4199-44e8-9e4e-4f4efc3dacb1 e111/111+tsc do auditor; sem reaplicar banco.
- [x] Inventariar contratos, consumidores e bloqueio commercial_owner da UI; preservar scope aplicado c3f29977 e modelo explícito não homologado. README scripts/contracts-c2-20261022 distingue catálogo autorizado de outros canais fechados.
- [x] Preparar primeiro recorte administrativo executável SQL/patches/testes/preflight/reversão segura em scripts/contracts-c2-20261022, sem hosted writes/runtime/publicação; NÃO instalar writers isolados com readers exclusivos.
- [ ] Completar evolução coerente dos readers/folha/capacidades/seletor produtor e provisioning canônico: singleton receipt/finish impede cadastro cumulativo; campo candidato não envia. Integração integral dos triggers, finanças e vigência B2B ainda não certificada.
- [ ] Revisão independente e homologação JWT/UI multiperfil; SU518022/anexos/monitor/XML/OS/CQ/termos/conteúdo técnico não vazio/CRUD rótulos reais seguem abertos.

## 21/10 21:25 — prioridade expressa: catálogo, depois contratos funcionais
- [x] Adiar pendências sem declará-las resolvidas; avanço substitui gate antigo. Backlog: docs/backlog-prioridade-catalogo-20261021.md.
- [x] C1 recorte interno revisável: inventário LIVE read-only, metadados/filtros de família técnico/agrônomo/comercial, legado e tenant preservados; 104/104 testes, types/build automático OK. docs/catalogo-c1-20261021-review.md. Não publicado.
- [x] C1B21:50: regra conservadora fornecedor+empresa parceira aceita expressamente; owner ausente/inativo negado sem backfill. Achado original de autoridade preservado nos documentos históricos; não requer nova autorização dessa regra.
- [x] C1B candidata inicial concreta em scripts/catalog-c1b-20261021 preparada sem aplicação/promoção; ambiguidade e rollback iniciais registrados historicamente. Revisão21:50 abaixo substitui proposta por regra aceita e remove reversão SQL insegura.
- [x] C1B correções candidatas: refetch erro/stale e tipos PDF, scope uuid[] uma vez, ficha real via whitelist RPC, rollback frontend mantendo filtro; testes26SQL+21UI+21regressões/types isolados PASS, sem promoção.
- [ ] C1B REST PostgREST real após migration independente: script rest_postflight.py pronto; migration não aplicada e sessões/casos REST ausentes nesta rodada, runtime permanece C1. Capacidades envase/volumes sem contrato comprovado bloqueadas, não presumir paridade integral.
- [x] 22/10 runtime C1B consumidores + rótulos v2 promovidos localmente (não publicado); SQL rótulos registrado com correção do auditor (composição preservada, md5 a62259c7), sem reaplicar. Ver scripts/catalog-labels-20261021/PROMOTION-20261022.md.
- [ ] Publicação pelo auditor; conteúdo técnico não vazio, UI real e matriz de perfis pendentes.
- [ ] Próxima fase: contratos de múltiplos perfis (não iniciada).
- [x] C1 publicado confirmado externamente21:50 bundle index-D0RgMmH6.js; consultor A filtros/reset e administrador B catálogo/simulador reais PASS limitados aos dados atuais. Não republicar C1; C1B não publicado.
- [ ] C2 seguinte, não implementar neste diff: contratos funcionais canônicos de atribuição/desvinculação/reativação/histórico, papéis cumulativos B2B+gestor+técnico+produtor, seletor autorizado e cadastro multiatribuições na empresa.

## 21/10 21:14 — atualização do wizard após sincronizar, baseline 9565a2b7
- [x] Atualizar somente consultas da visita/ator/tenant após recibo RPC e cleanup CAS confirmado; sem reload/Auth/polling/SQL/deploy/publicação.
- [x] 81/81 em7 arquivos: wizard real aberto com recomendação remota/etapa6 liberada; troca ator/tenant/logout, refetch tardio, CAS perdido e conflito sem publicação de cache antigo.
- [x] Atualizar revisão/hashes; commit automático na entrega. Homologação REAL9565a2b7 informada pelo proprietário, executada pelo auditor Codex: id43c0db07/versão1, não pelo proprietário pessoalmente nem pelo agente Lovable.
- [ ] Homologação real desta atualização do wizard e typecheck independente: dependem de revisão/publicação externa e recibo do auditor; origin-deny/CDN antigo permanecem pendentes, sem aplicação nesta rodada.

## 21/10 21:01 — recomendações, homologação externa 33425615
- [x] Corrigir enums/versão e replay de entradas comprovadas com parent explícito sem mapping; conflitos/negações preservados, origem alheia ou histórica não comprovada bloqueada.
- [x] 80/80 testes em 8 arquivos incluindo formulário real montado e botão Sincronizar; harness build OK21:06:58Z; relatório docs/recomendacao-sync-20261021-review.md com impacto irmão e limites de tipos/homologação.
- [x] Recuperação histórica homologada REAL9565a2b7 pelo auditor Codex, relatada pelo proprietário: id43c0db07/UUID2ab7fdbb/versão1; sem adoção/reparo/alteração de fila real pelo agente Lovable.
- [x] Homologação real da recuperação informada; atualização do wizard aberta em21:14 acima. Origin-deny consultor não aplicado; CDN antigo/SU-518022 não resolvido.

## 21/10 20:01 — regressão de remoção financeira, publicação 6c9ef2f0
- [x] Corrigir receiver da RPC existente em DocumentosPanel; mock dependente de this reproduziu 7 falhas/42 PASS antes e 49/49 depois, incluindo fences/negação/invalidation; único caller de remoção financeira, sem refactor amplo.
- [x] Registrar 95/95 focados, build automático OK 20:02:31 UTC, SHA e evidências externas em README/REMOVE-REGRESSION.md; legado orgNULL sem legibilidade comprovada. Sem publicação/SQL/Edge/dados; cache CDN legado pendente.
- [ ] Homologação real do novo clique de remoção após revisão/publicação pelo proprietário; verificação de tipos sem recibo separado nesta rodada (execução manual proibida pelo ambiente).

## 21/10 18:39 — revogação HTTP de anexos, baseline c63bc6b
- [x] 19:01 revisão0708012d: registrar Edgev1+snapshot simples externamente aplicados, real A/B próprio200/1751 e cruzado403, XMLv97 externo; sincronizar3 fontes backend byte-exatas e frontend após86/86/checks, sem redeploy/publicação/SQL.
- [x] Corrigir allowlist SELECT por operação, deadline monotônico frontend, ZIP24arquivos/60MiB e prazosRPC/fence; testes canônicos86/86, Deno/types isolados/harness build OK, rollback deny.
- [ ] Homologação POST em revogação pelo proprietário; RPCbackup e deny legado ausentes mantêm ZIP fail-closed e GET antigo/CDN aberto. Sem aplicação automática.
- [x] Preparar transporte clientes-docs com provas independentes pré/pós-bytes, stream 10 MiB/prazo15s/cancel, integração isolada e rollback deny; 60/60 sintéticos + Deno check/bundle local PASS; sem promover runtime/Edge/SQL.
- [x] Inventariar leitores irmãos/ZIP e URL direta antiga; relatório distingue fluxo protegido candidato de endpoint antigo ainda não contido, sem atribuir cache/CDN/SW. XML v96/monitor byte-exatos.
- [x] Complemento 18:48: salvar B HIT200/1751 versus BYPASS400/NoSuchKey, mesmo ensaio e request IDs; CDN remoto confirmado externamente. Documentar API oficial de purga (sem execução), controle durável antes do HIT e pendências SU-518022 sem enviar.
- [x] Complemento 18:50: especificar purga server-side por DELETE /cdn, escopo exato sem bucket-wide/retries, preflight/ref/segredo e resultado UNKNOWN em timeout; sem executor operacional até controle durável/locator B/disponibilidade comprovados, sem produção ou envio externo.
- [x] Preflight externo 18:51: organização canônica FREE no dashboard, A/B restaurados; purga Pro+ não disponível por presunção, sem upgrade/endpoint service_role. Prioridade POST/bloqueio legado; expiração/invalidação segue gate aberto até prova.
- [ ] Bloquear GET legado no CDN/Storage original + invalidar cache aplicável: falta mecanismo/configuração Supabase comprovados e revisão; POST ou purga isolada não resolvem. Não alterar objetos/chaves/plano.
- [x] Types/build frontend candidato v2 integrado em montagem /tmp: PASS; build ativo não foi usado como prova da candidata.
- [x] Revisão632594 v2 concreta: SQL snapshot INVOKER/RLS, 2RPC+1Storage, canal server-only após prova exata, origin deny não aplicado, ZIP fence/prova final/rollback e CORS pin;76/76, Deno/types/build isolado32,44s PASS. Sem implantação; CDN FREE/SQL/JWT real continuam gates.
- [ ] Revisão independente e homologação HTTP A/B/URL antiga; XML v96, sessões, objetos, roles e monitor preservados.

## 21/10 — XML autenticado, baseline c7d5c962
- [x] Corrigir stream XML 10 MiB e corpo 16 KiB/5 s, testar cancelamento/length enganoso e preparar montagem portátil types/build; sem implantação automática, runtime c7 preservado.
- [x] Revisar 127ef060, reproduzir claims/primeira RPC travadas (16 PASS/2 FAIL), corrigir prazo de entrada; 23 Edge (inclui rollback) + 14 UI e 1901 regressões PASS/4 skipped, frontend candidato isolado.
- [x] Preparar diff, rollback deny completo e plano de fixture/inventário legacy sem tokens; monitor, Auth e demais runtime byte-exatos.
- [x] Baseline LIVE v94 recuperado externamente pelo proprietário (ZIP/painel + list_edge_functions): ACTIVE, JWT true, import_map false; index hash igual local, 14 fontes/dependências sem delta normalizado contra c7; não foi download neste sandbox.
- [x] Preflight externo 18:15: v94 ACTIVE/JWT true/import_map false/ezbr sem drift reportado; revisão 090c033a, 55/55 externos PASS.
- [x] Cinco erros Deno corrigidos candidata/rollback + XSD isolado: check/bundles PASS; 65/65 Edge/UI/comportamento, tipos app/node e build isolado 28,52 s PASS; sem implantação.
- [x] Edge v96 implantada/validada externamente (JWT true, import_map false, CORS app exato, selftest real A PASS); sincronização canônica +2 UI concluída, 76/76 e tipos/Deno/build 31,78s PASS; sem redeploy/publicação.
- [ ] E2E XML A/B: fixture ausente; próximo passo canônico rascunho/tributos/numeração e generate só após revisão e prova de ausência A1, parada 412, sem gate/INSERT artificial/SEFAZ.
- [ ] Inventário financial-receipts e horizonte expirado: faltam locators/logs/TTL/cutoff verificáveis; nenhuma URL/cache declarada revogada.

## Revogação técnica efetiva — baseline db1eee, 22:12
- [x] Reproduzir semântica real (5/15 FAIL antes), corrigir quatro leitores técnicos pela lista canônica e administrador explícito; Perfil/Retry real com transporte fake e MobileLayout independente, 343/343 em 12 arquivos; pacote/rollback contra db1eee verificados isoladamente, build OK. Monitor/banco/dados intocados.
- [ ] Homologação real pós-correção: aguarda revisão/publicação externa; 82 testes + tsc anteriores não provaram semântica da RPC nem revogação parcial real (falhou 22:11).

## Contextos técnicos indisponíveis — baseline 2f95d5be
- [x] Revisão bloqueante 22:02: ciclo reproduzido 11 chamadas/12 s com MobilePerfil e filho default reais; política herdada técnica estabiliza carga/foco/epoch (<5), mantém conteúdo oculto na incerteza e defaults externos. 324/324 em 12 arquivos; pacote/manifest/rollback atualizados. Sem banco/monitor/publicação; types independentes e homologação real aguardam auditor.
- [x] Corrigir falsa negativa em /app durante limpeza por época, consulta pendente/erro; conteúdo oculto e Retry canônico, guardas técnicas filhas coerentes.
- [x] 302/302 provider/guardas/query reais com transporte fake; negativa explícita, revogação parcial, tardios e timeout; scripts/monitor-context-recovery e rollback byte-exato contra 2f95d5be verificado isoladamente.
- [ ] Homologação real e estabilidade externa: dependem de revisão/publicação e sessões do auditor; sem SQL/publicação pelo agente.

## 19/10 18:10 — Retry/renovação sem loading infinito (pacote monitor-retry-loading contra 84edf6c)
- [x] Reproduzir: expiração do monitor antigo cancela Retry e deixa carregador órfão; requisição travada sem prazo (4/12 falham na baseline).
- [x] Dono do carregamento separado do fence, releitura limitada, prazo 20 s, Retry só cede a carregador novo/identidade; 12/12, tsgo app/node OK.
- [x] Log numérico load_restart/load_timeout; 7838 ms classificado como falha segura (ida ≥ lease/2).
- [ ] Auditor: revisão/publicação e homologação real (retirar só gestor em /financeiro/receber, renovação natural, restauração). Bloqueio: sessão real externa.

## 19/10 15:29 — suplemento diagnóstico separado
- [x] Serializar motivos/renovações allowlist em console local; ring80 e autoridade intactos; 27 testes PASS e artefato isolado baseline c30af/rollback exato em scripts/authz-diagnostics-supplement.
- [x] Revalidar programação sem modificar históricos: 40 checks PostgreSQL descartável, 95 testes OS/AuthProvider e staging candidata/rollback PASS com baseline original em árvore temporária. Stager histórico recusa diagnóstico novo; deltas separados, sem atualizar hashes protegidos. Build automático OK; typecheck externo pendente.
- [ ] Renovação real/anexos: aguardam observação com rascunho e homologação externa; evento 15:09:12 sem motivo legível não comprova timeout.

## 19/10 15:28 — evidência complementar independente
- [x] Registrar PRE 622048 hosted PASS limitado ao conjunto anteriormente coberto e Vitest independente 53/53; não estender à guarda suplementar atual.
- [x] Baseline fornecido a42d6 e entitlements 7f4ec7 conferidos no harness ANTES da montagem; 40/40 verificações locais, staging 6/6 e 22 hashes PASS; semântica, ACL baseline e produção preservadas.
- [ ] Auditor: concluir tsc app ainda em execução, PRE suplementar/POST atual e homologação real; sem aplicação/publicação pelo agente.

## 19/10 15:09 — revisão programação 622048
- [x] Substituir TEMP rollback por baseline byte-exato/autocontido a42d6 e ACL postgres/service_role; preservar pacotes c30af/e6a67.
- [x] Fechar catálogo transitivo real SaaS/invites/refresh, reduzir SHARE com FK/row locks e restringir primeiro recorte manual/responsável NULL.
- [x] Testar corpos STABLE/triggers alvo reais, concorrência e rollback definição/ACL; preparar PRE/POST integral para auditor, SQL executável e snapshot/delta, sem aplicar/publicar.
- [ ] Auditor: executar PRE/POST integral no schema hosted e checker app/node; homologar programação com JWT/browser real e avaliar carga/deadlocks do refresh global. Bloqueio: revisão/aplicação externa e sessão real, não disponíveis ao agente.

## 19/10 14:54 — programação inicial canônica
- [x] Registrar recibos externos de implantação aprovação/reader, publicação e6a67/c30af e inativação/retry A/B; roles intactas, sem homologação TOKEN_REFRESHED/anexos.
- [x] Recuperar candidata RPC existente sem autoaprovação/reprogramação; UI detalhes, guarda/fence/replay e pacotes aprovados preservados. EXECUTE ainda fechado.
- [x] Preparar fonte fixa e6a67/c30af, PRE/POST/rollback exato de sessão, testes locais negativos/revogação/concorrência e exportação checker.
- [x] Catálogo SaaS/refresh congelado na revisão 15:09; removida exceção incondicional, reduzidas SHARE e teste de triggers reais; carga/writers externos e schema integral hosted permanecem revisão do auditor.
- [ ] Auditor: revisão/implantação e homologação real programação; fabricação/CQ/estoque/anexos/v6/contratos não liberados. Sem hosted/publicação pelo agente.

## 19/10 14:22 — correção funcional monitor/Cockpit
- [x] Status fiel na lista do reader canônico; candidata isolada alinha filtro SQL, PRE/POST/rollback/hashes; quatro SQL approval/dados reais intocados.
- [x] Reconfirmação TOKEN_REFRESHED com fence e continuidade somente de enums não sensíveis/modal Nova OS; IDs/texto/área/data/arquivos/cache/respostas antigas descartados.
- [x] AuthProvider real/fake RTT3s e mudanças/tardios:92 focais+382 regressões PASS; PG reduzido status/filtro/A/B/NULL/rollback e recusa catálogo incompleto. Relatório monitor-cockpit-20261019-1422.review.md.
- [ ] Auditor: PRE/implantação/POST SQL separado, checker independente app/node e homologação real monitor/Cockpit/anexos; sem sessão automática external_unmanaged. Filtro server-side antigo até implantação.

## 19/10 14:18 — P0 alias e rollback approval
- [x] Alias class_row corrigido assembler/PRE/candidate/rollback/POST; corpos/expectativas intactos.
- [x] Rollback ff80ad SHA9c20bd... recuperado byte-exato; manifest/pre≠post/stage fixados e8/8 negativos/comparação Git PASS.
- [x] PG138/138: SQL completos recusam drift;6 IF exatos alcançam table ACL e mutações reproduzem42703;42/42 Vitest. PRE20 integral externo registrado, rollback UI antigo invalidado; sem hosted/publicação.

## 19/10 14:13 — complemento real OS/lifecycle
- [x] OS B real/bundle registrados; SELECT canônico confirma aberta/1 programação aguardando/0 lotes. NÃO duplicar OS/seed.
- [x] Badge deriva da presença do filho na view, não status OS; hashes live registrados, consulta-only/ações fechadas preservadas.
- [x] TOKEN_REFRESHED reproduz perda sem expiry;12 casos AuthProvider/opener real e transporte fake;101/101 PASS. Proposta posterior limitada/dados não sensíveis descrita, runtime intocado.
- [x] Relatório atualizado/proposta lifecycle posterior; hashes SQL/manifest intactos/staging4/4. Sem hosted DDL/DML/publicação; checker novo não certificado.

## 19/10 14:01 — recuperação focal aprovação OS
- [x] Recibos1671/tscapp+node/93 e seed implantado externo registrados; Storage4823 corrigido sem reaplicar.
- [x] Catálogo READ ONLY canônico auditado; candidata aprovação existente/helper com locks e alias/tenant, PRE/POST20 contratos e rollback fechado; programação/avanço não abertos.
- [x] PG126/126 local reduzido, Vitest48/48, staging4/4; completas guardas SQL recusam catálogo reduzido atomicamente, não equivalência integral. UI detalhes existente; programação/lote/CQ/avanço fechados.
- [x] Relatório os-aprovacao-recuperacao-20261019.review.md, hashes e snapshot1672/26 partes; sem hosted DDL/DML/publicação/mudanças de sessão/role/monitor/v6/contratos.
- [ ] Auditor: PRE/implantação/POST completos, checker app/node do snapshot novo e homologação aprovação A/B; avanço depende de reautorização/locks/cadeia lote/CQ ainda fechados.

## 19/10 13:46 — pré-requisito produto fabricável e diagnóstico
- [x] Registrar implantação/publicação e recibos independentes informados, com findings e limites reais; relatório aplicacao-prerequisito-produto-1346.review.md.
- [x] Seleção/validação biológico + dose finita positiva/decoder fail-closed e erro23514;93/93 testes dirigidos, build automático OK. Checker novo aguarda auditor, snapshot1671/26 partes materializado byte-exato.
- [x] Preparar seed sintético novo revisável/default ROLLBACK e plano dependente de aprovação/avanço fechados, sem reclassificar reais/status artificial/produção.
- [x] Auditor informou seed ROLLBACK+COMMIT/pós-consulta PASS; NÃO reaplicar. Homologação OS/aplicação depende da recuperação canônica, ainda não certificada.
- [x] Emitir somente expire sanitizado em console local sem mudar lease/escopo; staging4/4+export7/7, rollback/hash dedicado. Sem hosted DDL/DML/publicação/contratos/v6.

## 19/10 13:35 — P0 sintaxe da guarda SQL
- [x] CASE parentetizado e variável ACL renomeada para evitar42702, expectativas intactas; mutação reproduziu42601. Quatro SQL completos byte-exatos sem substituir guarda recusam schema reduzido comP0001; PG107/107, hashes atualizados. Sem produção/publicação.
- [x] Auditor informou13:37 preflight hosted READ ONLY integral PASS16 funções/ACL/search_path/owner/schema/triggers/policies; applications0/evidence0/receipt_destination_free=true. CASE e v_executor_roles propagados, fingerprint intacto; RPC fechada, sem DDL/DML. Evidência auditor recovery-preflight-corrected2-readonly.json; não é implantação/homologação positiva nem catálogo equivalente local.

## 19/10 13:32 — seleção de fazenda na Nova OS
- [x] Removida validação circular somente no combo Fazenda: saving/papel/cliente presente nas referências/carregamento/erro. Progressão no formulário e Radix reais com transporte fake; submit incompleto segue negado;25/25 testes dirigidos. Sem criar OS/publicar/DDL; pais B informados preservados.
- [x] Auditor confirmou progressão real cliente→fazenda→talhão no publicado76168eff; insert negado por item não fabricável, OS0. Não é positivo aplicação/anexo.
- [x] Auditor informou checker repetido no snapshot estável EXIT0 e monitor105/105 independente; não é homologação real nem valida alterações posteriores.

## 19/10 13:01 — recuperação canônica de aplicações
- [x] Revisão13:25: paridade carteira mixed-role/responsável/status OS, mobile coerente e diagnóstico admin ring80 sem PII/lease alterada; PG104/104 e Vitest194/194. Pai B real preservado; avanço canônico fechado é blocker positivo, sem bypass. Recibo externo tsc app EXIT0/119 independentes válido só no snapshot anterior1668.
- [x] Recibo final revisão13:25 em docs/auditorias/aplicacao-recuperacao-revisao-1325-receipt.md: staging recuperação4/4+diagnóstico4/4, snapshot novo1670/26 partes byte-exato. Checker novo aguarda auditor; build automático não é typecheck.
- [ ] Revisão/implantação própria do diagnóstico e captura reason/visibility/RTT/deltas nas pausas reais; causa admin B ainda desconhecida, sem publicação pelo agente.
- [x] Complemento13:17: exportação atual1668 arquivos (inclui imports transitivos fora src) em26 partes UTF-8 ≤200KB; manifesto a44fe574cc7893540b5449c2d6b0a9cca749101f3398e89048e23b0dff5dbbd8, materialização integral byte-exata e7/7 testes. GitHub antigo não usado; checker app não executado/runtime preservado. Instruções tsc -p app + install --ignore-scripts no pacote.
- [x] Auditar RPC fechada, unidades, referências, triggers/RLS/Storage reais; preparar manifest privado pelo mesmo RPC antes de upload, sem aplicação parcial/bucket aberto.
- [x] Candidata SQL guardada16 funções/schema/rollback fechado, desktop/mobile cercados, PostgreSQL local62/62 e Vitest119/119; roteiro fixtures A/B. Não é seed hosted completo nem homologação de SDK/JWT/trigger completo; riscos/writers/Storage legacy explicitados no relatório.
- [x] Checkout completo recuperável/config/lock e inventário SHA disponibilizados pelo export-checkout.py; checker app não executado (proibição do ambiente), types NÃO CERTIFICADOS.
- [ ] Revisão/implantação/homologação A/B pelo auditor; nenhuma escrita produção/publicação pelo agente, sem contratos B2B/v6.
- [ ] Seed hosted de pais sintéticos e provas JWT/Storage bytes reais dependem da revisão/implantação do auditor; não presumir papel técnico do financeiro A.

## 19/10 12:27 — existência/tenant no helper de aplicações
- [x] Candidata/rollback guardados no helper existente, origem OS/cliente auditada; PostgreSQL local71/71, regressão PDF44/44, staging7/7; sem produção/fixtures/contratos.
- [x] Build Vite/SWC não certifica types; esclarecimento e fontes/config/lock com hashes em application-access-integrity/typecheck-independent.md e independent-inputs.json. Pacote PDF byte-exato preservado.
- [x] Auditor informou aplicação de application_access_tenant_integrity_20261019/ee29d35e no ref canônico: guarda10 funções/ACL/schema e postflight integral PASS, POST04067ba43cea3eed845a1fd3735061e0; SQL claims A/B inexistente/NULL false e leitura0, não JWT real.
- [x] Pós-implantação12:38 registrado: browser real A/B somente smoke Ver Histórico/leitura vazia sem erros/reload/logout/troca de sessão; advisors mesmos INFO36/WARN2anon+336auth+1password. SQL/PDF byte-exatos, frontend PDF não publicado, app typecheck não certificado.
- [x] Auditor coletou corpos/MD5/ACL das44 assinaturas v6, todas presentes (v6-writer-bodies-20261019.json informado); não pedir corpos como ausentes. Locks/tempo/ABA não certificados, v6 OFF, contratos sem avanço.
- [ ] Homologação positiva PDF/anexo/revogação bloqueada por aplicações/evidências0 e RPC salvar fechada; sem fixtures/inserts/novo fluxo nesta entrega.
- [ ] Recuperação futura legacy_closed exige revisão específica de replay antes de reautorização/referências/metadados; não reabrir nem conceder EXECUTE.
- [x] Complemento auditor12:35: 30 hashes/staging7/7/13 casos PDF e seis MD5 LIVE registrados; recibo explicita tsconfig.app.json não executado, sem certificação app.
- [ ] Helper manage sem tenant: aguarda revisão específica autorizada de callers; Storage1 atual impõe tenant/pai, sem ampliar candidata de leitura.

## 19/10 12:13 — PDF de aplicações
- [x] Proteger PDF e ambos callers existentes por escopo, transporte autenticado, abort/timeout/limites e clique síncrono cercado, sem URLs assinadas/arbitrárias.
- [x] Testes144/144, staging7/7, candidata/rollback/hash/preflight SELECT-only não executado e inventário v6; build automático OK. Typecheck separado não certificado: harness automático sem recibo individual.
- [ ] Revisão/preflight/homologação real PDF aplicação dependem de auditor e fixture aplicação/foto/ator técnico autorizado; financeiro A não é positivo técnico presumido. Sem publicação/banco/reload.
- [x] Auditor informou base f91728b publicada e homologação real limitada recibos/financeiro/admin: PDF A renderizado, busca B vazia, inativação/retry/restore e estabilidade96s; sem prova JWT direto/global.

## 19/10 02:57 — ambiente financeiro/admin exclusivo
- [x] Reutilizar somente as opções ambientais revisadas no financeiro/admin empresa exclusivos; preservar monitor/probes, produtor/B2B/outros gates e recibos/Edges.
- [x] Testar drafts/opener com alternância ambiental e RTT3s >=90s, negação/tardios/offline/timeout/restore:312/312; candidata/rollback/preflight não executado/staging5/5; typecheck exit0/build automático OK.
- [x] Proprietário informou base f91728b publicada/homologada REAL no recorte financeiro/admin/recibos às12:13; A/B preservados, sem prova JWT direto/global.

## 19/10 02:43 — anexos de RecibosList
- [x] Cercar listagem, cancelamento e download existentes por ator/tenant/roles/epoch/recurso; usar locator canônico e opener autenticado, sem URL arbitrária.
- [x] Testar races, expiração, identidade, geração/existente e duplicação: 231/231; preflight SELECT-only não executado, staging5/5, rollback/hashes e relatório; build automático OK, typecheck independente final exit0.
- [x] Proprietário informou recibos50d72d6 revisado (15hashes/stage5/5/13locator+3invariantes/Edgev88/preflight) e publicado deployment6a525e60-08c6-4abf-9561-dcfd0c16c63b/bundleDBAYuiaw; homologação real NÃO PASSOU: pausa ambiental antes de inativação, tratada na fase02:57.
- [x] Inventário somente registrado: global v6, pdfAplicacao signer600/sem fence e guard final entrega-termo-pdf seguem fora desta correção.

## 19/10 02:20 — renovação antecipada RTT multipapel
- [x] Agendar renovação antes do deadline confirmado só no par exato (RTT/margem/jitter/piso 1s), sem estender lease nem aceitar resposta tardia.
- [x] Testes RTT3s contínuo, variável, alto, orçamento curto, tardia, erros/role/offline, clock suspenso, coalescência; mutação prova falha sem a opção; staging5/5, manifest 76/8.
- [x] Proprietário informou HEAD71decc2d publicado/homologado multipapel; abas não recarregadas por esta execução.

## 19/10 02:07 — pausas ambientais multipapel
- [x] Corrigir foco/visibility e polling hidden somente no recorte exato, preservando deadline15s/fail-closed e B2B.
- [x] Relógio fake/drafts/layouts/timeout/offline/perda de papel/tardios:399/399 PASS; candidata/rollback da base exatos, manifest separado75fontes/7artefatos e staging5/5 PASS; build automático OK, typecheck não certificado.
- [ ] Revisão independente e publicação/homologação da correção dependem do proprietário; não recarregar sessões reais.

## 19/10 01:47 — gestor + consultor exatos
- [x] Revisão terminal06df9901/68hashes/stage6/6/26probes fake e preflight integral canônico PASS informados pelo proprietário; autorizada só ativação da flag.
- [x] Ativação exclusiva multipapel true/assertion real; demais runtime byte-exatos, 68 hashes OFF intactos, staging ativo5/5 e regressões378/378 PASS; build OK/typecheck sem recibo.
- [x] Candidata OFF no monitor/probe existentes, boundaries desktop/Campo/seletor, sem ampliar RBAC.
- [x] 550/550 testes dirigidos/regressões PASS, staging6/6/SHA PASS, preflight fixo não executado e rollback original protegido.
- [ ] Publicação/homologação real de inativação/perda individual dependem do proprietário; typecheck depende de recibo.

## 19/10 01:25 — operador onfarm exclusivo
- [x] Ativação autorizada 01:34: somente gate operador true/assertion real, demais fontes src byte-exatas; provas OFF intactas, staging ativo5/5 e regressões397/397 PASS; build OK/typecheck sem recibo.
- [x] Estender somente monitor/probe/ProtectedRoutes existentes, gate operador OFF e recortes publicados preservados.
- [x] Corrigir seleção/acesso pendente para home canônica somente após readiness self/h15/role exclusivo, sem criar contexto técnico.
- [x] Testar drafts/revogação/restore/tardios/foco/guards/login: 446/446 finais; 8 falhas novas de cache corrigidas; seis históricas não reexecutadas globalmente.
- [x] Entregar preflight read-only não executado, manifest fixo/staging6/6/rollback e relatório operador-tela-aberta-20261019.review.md.
- [x] Proprietário informou revisão terminal 423afc90, 89 hashes, staging6/6, 45 probes fake e preflight integral canônico PASS; autorizou somente gate operador true.
- [x] Proprietário informou base publicada751ba501 e operador A homologado real+redirecionamento PASS, perfil restaurado; typecheck sem recibo não certificado.

## 19/10 00:57 — consultor técnico em tela aberta
- [x] Preparar extensão exclusiva no monitor/probe existente e boundary Campo inteiro/desktop, gate consultor OFF.
- [x] Executar 56 testes consultor, 258 regressões monitor/gates e 106 anexos; suíte ampla tem mesmas 6 falhas da base (8101 vs 8045 PASS), sem falha nova observada.
- [x] Entregar preflight read-only não executado, hashes fixos e staging/rollback6/6; relatório consultor-tela-aberta-20261019.review.md; sem banco/Edge/publicação.
- [ ] Typecheck com recibo separado depende do harness; build automático OK, não presumir typecheck independente.
- [x] Auditor informou revisão d509430a/76hashes/staging6/6/probes12+12+9 e preflight integral canônico PASS; ativar somente consultor true, provas OFF intactas.
- [x] Ativação: 364/364 regressões e staging-active5/5 PASS; demais runtime byte-exatos, sem repetir suíte ampla/banco/Edge/publicação.
- [x] Proprietário informou base publicada ff1366ec/bundle avQj65a e homologação real consultor draft/poll/revoke/retry negado/restore.

## 19/10 00:36 — administrador de empresa em tela aberta
- [x] Ativar somente admin com bytes revisados 62ddc9bc; 275 testes + staging-active4/4 PASS, typecheck/build automático OK; provas false preservadas, sem publicação.
- [x] Preparar recorte exclusivo no monitor único/probe compartilhado e boundary do shell, gate admin false.
- [x] Testar drafts/modais, revoke/restore, roles/tenant/timeout/tardios e regressões publicados: 275/275 sintéticos e staging4/4; typecheck/build automáticos OK.
- [x] Entregar preflight read-only integral, hashes/ACL/RLS e staging/rollback protegido; evidências externas/limites em administrador-tela-aberta-20261019.review.md.
- [x] Auditor informou preflight canônico integral/45hashes/stage4/4 PASS e autorizou ativação admin true; adendo de ativação registrado.
- [ ] Publicação pelo conector e homologação real admin em tela aberta aguardam o proprietário; sem DDL/Edge/publicação pelo agente.

## 19/10 00:24 — comprovante de baixa no fluxo existente
- [x] Registrar aplicação externa financial_document_owner_integrity_20261019, probes SQL versus login B real.
- [x] Corrigir path owner-first idempotente e fences upload/metadados/callback, preservando a baixa registrada.
- [x] Testar retry/efeitos parciais/revogação/timeout: 229/229, stage2/2; rollback byte-exato só helper/diálogo e relatório comprovante-baixa-20261019.review.md; sem hosted DML.
- [ ] Comprovante de baixa vigente NÃO homologado: recebimento A estornado/legados orgNULL; sem registrar nova baixa para testar.

## 19/10 00:11 — integridade server-side financial_documents
- [x] Inventariar oito owner_types/callers e capturar contratos live; contagens sem expor linhas.
- [x] Preparar candidata/preflight/postflight/rollback integrais em scripts/financial-documents-integrity, sem aplicar hosted.
- [x] Testar PG local RLS/claims iat atual: 252 checks, oito owners e atomicidade; regressões 159/159. Relatório SERVER com limites/aceite independente.
- [x] Auditor informou aplicação/pre/postflight PASS, login B real sem contas/anexos A e upload/abertura Outro A pós-migration PASS; sem prova HTTP signer nem comprovante de baixa.

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
- [x] Detalhe OS: refresh da lista pós-programação e rastreabilidade via leitor canônico (scripts/os-detail-refresh-trace); pendente homologação browser real.

## Gerar Lote — recuperação mínima 2026-10-19 (pré-contratos)
- [x] Pacote revisável `scripts/lot-generation-recovery/`: candidata com cadeia viva antes/depois dos locks, manual-only, payload fechado, replay idêntico; preflight/postflight; rollback autocontido (baseline d37a0e47 + ACL exata); PG local real 48/48; Vitest 224/224; tsgo app/node 0.
- [x] Frontend: botão Gerar lote no detalhe da OS programada (formulário existente), cercas de sessão/época antes e depois do await, L→mL.
- [ ] Aplicação hosted + publicação: aguarda auditor (não executado pelo agente).
- [ ] Homologação real no navegador com admin B (OS 18ea0531): aguarda aplicação.
- [ ] Revisar escrita direta em `lotes` por policies RLS fora do RPC (bypass conhecido).

## Hotfix monitor + downloads financeiros 2026-10-19 (prioridade crítica)
- [x] Piso de renovação 5 s → 7,5 s (spike real 5094 ms); lease 15 s/single-flight/fail-closed inalterados; testes 5,1–7 s e 8 s fail-closed.
- [x] DocumentosPanel e HistoricoExportacoes sem signed URL: abridor autenticado Preparar/Baixar, snapshot no recurso, fences e revogação de Blob.
- [x] Pacote isolado sobre 3eeb3212: `scripts/monitor-attachments-hotfix/` (patch, baseline, rollback, manifest, hashes); tsgo app/node 0; 137/137 focados.
- [ ] Publicação e homologação real (renovação natural com rascunho, download A/B, negação): aguarda auditor.
- [x] HEAD publicável: runtimes/testes de lote restaurados a 3eeb (candidato em `.review`); delta runtime = 6 arquivos do hotfix; 435/435 focados, tsgo app/node 0.
- [ ] ReportShell/Edge generate-financial-report v89 ainda usa signed URL 1 h: próximo pacote.
- [ ] Imports legados de types.ts em 5 arquivos (2 testes de guarda falham também em 3eeb).

## Exportação de relatórios sem URL assinada 2026-10-19
- [x] Frontend ReportShell: locator validado + abridor autenticado Preparar/Baixar (compatível com Edge v89); 444 testes focais, tsgo 0.
- [x] Edge candidata sem assinatura em `scripts/financial-report-locator/edge/` (fora do deploy automático) + teste de delta exato.
- [ ] Capturar bytes LIVE v89 (sha ab4d5682…) e implantar candidata após publicação do frontend: auditor.

## 19/10 16:53 — relatório Contas a Receber
- [x] Documentação: LIVE v89 byte-idêntica ao repo-baseline; hash anterior era do pacote. Fonte da Edge sincronizada com v90.
- [x] Pacote `scripts/financial-report-receivables/`: preflight/candidata/rollback/postflight, Edge e telas `.review`; 27/27 SQL local + 6/6 helpers.
- [ ] Auditor: revisão independente, aplicar SQL, implantar Edge, integrar telas, typecheck e homologação real A/B. Demais 9 relatórios seguem fechados.

## 19/10 17:00 — receivables concluído + Retry gestor+consultor
- [x] Receivables: typecheck app/node dos 3 candidatos .review sobre cópia temporária EXIT 0; nada aplicado/publicado.
- [x] Monitor: Retry com leitura fresca, single-flight/fences, trava de sessão monitorada contra gestor-only/0/desconhecidos/superset; pacote scripts/monitor-retry-reresolve/ com rollback byte-exato (d767eb23). 10/10 novos, config 979/981 (2 preexistentes).
- [ ] Testes do Edge generate-financial-report (8) ainda esperam assinatura v89; runtime já é v90 — atualizar expectativas em revisão própria.
- [x] Achado 17:00 (timeout rtt 7740 após renovação): probe reduzida de 4+N para 2 idas sequenciais, sem lease/piso/grants novos; 12 testes de latência/negativos.
- [ ] Homologação real: estabilidade pós-renovação; retirada só gestor e só consultor; anexos; draft integral não coberto (área zera por contrato).

## 19/10 17:20 — revogação parcial + latência (pacote scripts/monitor-partial-revocation, baseline 1c2f29e)
- [x] Escopo residual monitorado gestor/consultor após par; Retry fecha readiness antes de await; 1390/1392 (2 preexistentes); rollback byte-exato.
- [ ] Homologação real B sem reload: retirar consultor→gestor; retirar gestor→consultor; estabilidade pós-renovação.

- [ ] Comprovantes de entrega via abridor autenticado (pacote scripts/delivery-receipt-attachments) — aguarda revisão independente e homologação real.
- [ ] Termo de entrega PDF binário autenticado (scripts/termo-pdf-download): candidato final aplicado no código (URL/chave canônicas, cancel não bloqueante); falta deploy Edge→publicação pelo auditor e homologação real A/B.
- [x] Isolamento entrega_termos REST/RPC implantado pelo auditor (termo_pdf_registration_acl_containment + entrega_termos_tenant_isolation_reviewed, PRE/POST PASS); ver docs/entrega-termos-migracoes-implantadas.md.

## 20/10 01:16 — geração canônica mínima, baseline 793bc012
- [x] Fonte/ACL/schema reconfirmados somente leitura; pacote `scripts/lot-generation-canonical-20261020/` com RPC manual programada, PRE/POST, rollback fechado autocontido, UI .review OFF e hashes. 70 checks PG descartável/Auth sintético; Vitest 147/147; tipos app/node EXIT 0. Runtime 793bc012 preservado.
- [x] Revisão/implantação lote e homologação REAL B confirmadas pelo proprietário em afa2417; LT-2026-0002 criado pelo diálogo, sem criação pelo agente. PDF ainda pendente; demais etapas não homologadas.

## 20/10 01:36 — contenção administrativa e bypass manual de lotes
- [x] Baseline ACL contida, guard privado INSERT/UPDATE manual e rollback sem reabrir privilégios; testes PG descartável para bypass/ACL e phantoms/FKs em duas sessões; impactos/limites em WRITE-CONCURRENCY-REVIEW.md. Não aplicado; avanço manual legado deliberadamente fechado, não certificado.
- [x] 20/10: proprietário confirmou revisão 31700a e aplicação de `manual_lot_canonical_generation_reviewed`, PRE/POST hosted integrais PASS; não reaplicar. Nenhuma sessão/fixture alterada pelo agente.
- [x] Runtime: somente quatro candidatas frontend aplicadas, Gerar Lote ON pelo diálogo canônico da OS, descrições acessíveis e dois testes novos. Manifesto/rollback em `scripts/lot-generation-canonical-20261020/runtime-activation/`; 248/248 testes em 12 arquivos, build automático OK. Monitor/bindings/outros gates/backend preservados; lote legado sem reparo.
- [x] Comparação/publicação afa2417 e 76 testes + tsc app/node PASS independentes confirmados pelo proprietário; não republicar.
- [x] Homologação REAL Gerar Lote B recebida; análise CQ e PDF permanecem pendentes, sem fabricação física ou valor comercial.

## 20/10 02:24 — CQ manual canônico, baseline afa2417
- [x] Recibo independente: lote LT-2026-0002 criado REAL B pelo diálogo publicado; 100mL, um evento, dados fictícios sem valor comercial. Lote legado sem reparo; PDF ainda não homologado.
- [x] Preparar `scripts/manual-cq-recovery-20261020`: núcleo único, formulário .review, tickets CQ específicos, PRE/POST/rollback contido, hashes e inventário. 59 checks PG descartável com Auth sintético; 9 testes de formulário candidato e 51 regressões Gerar Lote PASS. Runtime/monitor/cliente byte-idênticos a afa2417; nenhuma escrita hospedada/deploy/sessão.
- [ ] Revisão independente: PRE/POST integrais no catálogo canônico, typechecks app/node e candidata, efeitos/concorrência integral e comparação de bytes. Gate CQ false até aceite; testes locais não homologam sessão real.
- [ ] Homologação futura CQ A/B e legado: depende de revisão/implantação pelo proprietário; sem envase/reserva/entrega/contratos e sem termo assinado pelo agente.
- [x] Incorporar achado 02:42: eliminar escape GUC dos triggers DEFINER no candidato/rollback; reprodução isolada sob authenticated e RLS tenant; 73 checks PG sintéticos. Aprovação sem referência válida negada; referência positiva apenas em PG descartável, sem associação real.
- [x] 02:45: proprietário implantou cq_remove_guc_definer_bypass; leitura canônica conferiu corpos/hashes/ACL. PRE/POST/rollback devem exigir contenção já aplicada, sem reescrever triggers; nenhum CQ fictício persistiu conforme recibo. Gates OFF, revisão integral ainda pendente.

## 20/10 13:04 — revisão independente CQ 18fc97
- [x] Alinhar hook existente ao core (produto prioritário, sem fallback/associação inventada), monitor/cancelamento e testes do hook real; candidato/rollback/hashes/tipos.
- [x] Reproduzir escape por vínculos pais/edição OS em_cq e conter no candidato/rollback sem GUC.
- [x] Preparar proposta completa exclusivamente fictícia e verificar comparação somente leitura; sem inserir nem inventar vínculo.
- [ ] Cadastro hosted da referência fictícia: bloqueado por micro NOT NULL/FK e writer global contido; requer contrato existente produto-only revisado e autorização própria.
- [x] Revalidar pacote local: 90 checks PG/Auth sintético, 27 Vitest e tsgo isolado PASS; hashes/rollback, sem DDL/deploy e gate false. Nova revisão independente e homologação real continuam pendentes.

## 20/10 13:11 — contenção hosted anunciada e comparação CQ
- [x] Corrigir comparação candidata: referência incompleta/inativa, medidos ausentes e igualdade textual exata do core; sem mutação.
- [x] Bloquear montagem SQL até nova baseline de função/trigger; SQLs existentes marcados históricos, sem DDL.
- [x] 13:13: baseline LIVE conferida read-only e incorporada em PRE/POST/rollback sem redefinir/remover; 102 checks PG descartável, 67 Vitest e tsgo candidato PASS. Pacote requer nova revisão independente; gate false.
- [x] 62 Vitest e tsgo candidato PASS; comparação/rollback/hashes/relatório atualizados, runtime intocado.

## 20/10 13:16 — produto-only e estabilidade separada
- [x] Preparar contrato review-only na mesma tabela: micro opcional com item obrigatório, FKs/legado preservados, sem writer/grants/associação inventada; rollback bloqueia qualquer histórico produto-only.
- [x] Testes SQL completos CQ passam com referência sintética produto-only realmente NULL; formulário/hook/comparação mantêm gate OFF.
- [x] Registrar recibo independente: 10 testes formulário e typecheck app+candidatas18fc97 PASS, limitado àquele snapshot.
- [x] 13:23: integrar menor delta produto-only com CHECK, índice parcial, PRE/POST/rollback e proposta administrativa fictícia; autorização de preparação/cadastro necessário já concedida, execução nesta rodada proibida. Não abrir writer/editor tenant nem pedir nova autorização.
- [ ] Estabilidade monitor B afa241: auth_refresh 13:07:06.118 UTC → load_timeout 20.015s às 13:07:26.139; Falha ao carregar dados do usuário; Retry recuperou Clientes sem reload. Sessão criada19/10. Causa não determinada, estabilidade não PASS; correção depende de revisão separada, monitor intocado dentro CQ.

- [x] 13:29: contenção LIVE DELETE conferida read-only e consolidada como dependência imutável PRE/POST/rollback junto ao binding; 140 checks SQL descartáveis e 72 Vitest PASS, baseline/manifesto atualizados, gate false sem DDL ou deploy.
- [ ] Revisão independente do pacote integrado CQ/referência e PRE/POST hosted; execução/publicação proibidas nesta rodada, sem pedido de nova autorização de preparação. Monitor segue pendência separada.

## 20/10 13:32 — loader de renovação, candidato separado
- [x] Reproduzir baseline11s+11s com timeout20s e adoção parcial; candidata separada com leituras paralelas atômicas, aborto e uma recuperação transitória pós-renovação, sem alterar runtime/CQ/lease.
- [x] Testar AuthProvider real com transporte fake: 3s/8s/20s/hung, A/B, gestor+consultor, revogação parcial, offline/signout/unmount e respostas antigas; regressões preservadas em cópias compatíveis abortSignal, tipos candidatos PASS.
- [x] Artefato scripts/monitor-loader-renewal-20261020 separado com rollback byte-exato, hashes e limites de homologação; sem publicar/DDL ou afirmar gateway resolvido.
- [ ] Revisão independente e homologação real A/B do candidato de loader; runtime intocado, ativação/publicação não autorizadas nesta rodada.

## 20/10 18:28 — revisão13a01, política automática ativa
- [x] Adaptar apenas scaffolding das 42 expectativas; esgotar tentativa automática antes de Retry, preservar asserts.
- [x] Validar config integral +41 anteriores +17 novos com política ativa, sem neutralização; registrar admin.
- [x] Se PASS, ativar fontes exatas b3a65696/b6d7f4 e fornecer manifesto/rollback preservando CQ nullable; sem publicação/banco/sessões.

- [x] Revisão13a01 concluída: scaffolding6 arquivos, asserts preservados; candidato1135/1135 e runtime1077+58 PASS sem neutralização. Types candidata/app/node0, build automáticoOK; fontes exatas ativadas, CQnullable/gates preservados. Manifesto/diff/rollback verificados em active-policy-validation. Admin intermitente também baseline, sem relaxar teste; estabilidade real permanece pendente do operador, nenhuma publicação/sessão/banco.

## 21/10 00:57 — anexos de emissão de recibo, base117f9c1
- [x] Corrigir apenas abertura ativa de EmitirReciboButton pelo abridor autenticado da lista; preservar emissão/RLS e monitor/CQ/gates.
- [x] Testar baseline e patch (tenant/revogação/stale/erros), validar compilação e preparar hashes/preflight/rollback sem restaurar abertura vulnerável.
- [x] Auditar Edge e inventariar assinadores/callers restantes separadamente; nenhuma emissão real, banco, sessão, reload ou publicação.
- [ ] Revisão independente e implantação posterior da Edge sem assinatura; homologação real do recibo indisponível sem recebimentos e proibida nesta rodada. Não considerar assinaturas já emitidas revogadas.

## 21/10 12:32 — Edge recibos e assinatura Storage
- [x] Edge promovida byte-exatamente sem assinatura; runtime110/110 e config1194/1194; compilação automática OK, rollback503 em cópia e hashes; nenhum deploy.
- [x] Contrato upstream investigado; candidata restritiva SELECT/INSERT/UPDATE apenas financial-receipts, PRE/POST/rollback fail-closed e61 checks PG sintéticos; nenhum SQL hosted.
- [x] Relatório storage-review/REPORT.md: URLs antigas/cache sem revogação instantânea; objeto e monitor/CQ/OS/gates/sessões preservados; previewAuthStorage delta anterior intacto.
- [ ] Proprietário: revisão/deploy Edge, snapshot+versão/contrato HTTP live para montar/revisar SQL, aplicação e homologação autenticada sem novos recibos/pagamentos; cache legado sem prova de esgotamento.

## 21/10 13:03 — Recibo cancelado servindo PDF ISSUED
- [x] Frontend status-bound + reconfirmação no clique (publicado 56e5b32b)
- [x] Edge candidata implantada v93 pelo proprietário e promovida byte-exata à fonte canônica
- [ ] Acesso direto ao objeto ISSUED histórico/URLs antigas — autorizado, investigação/correção em rodada própria (SQL)
- [ ] Layout PDF candidata `edge-layout-review` — aguarda revisão; não implantada

## 21/10 15:45 — recuperação de pausa /clientes sem aumentar carga
- [x] Floor 12 s (d5e0a318) rejeitado; monitor revertido byte-exato para 51048f (10 s).
- [x] Retomada segura só de navegação (cliente + aba) após reautorização; 9 testes, 1103/1103 config+clientes, typecheck OK; pacote/rollback em scripts/monitor-pause-resume-20261021.
- [x] v2 após da691664: retomada só em timeout confirmado (useAuth), só aba Documentos, TTL desde a pausa; 7 integrados com AuthProvider real; 1106/1106; rollback de 4 arquivos verificado.
- [ ] Revisão independente/publicação (proprietário). Cancelamento de transporte do probe expirado: pendente. Gateway v2 e homologação real dos demais perfis: externos.

- [x] financial-docs canal POST: snapshot, Edge JWT=true, frontend e deny GET aplicados/publicados externamente; baseline fc2225f1 e remoção lógica B homologadas pelo proprietário, objeto preservado/POST403. Financeiro A próprio/cross/revogação/restauração e upload137B/download hash igual reportados; não aceite global.

## 21/10 — revisão do canal técnico HTTP, sem execução hosted
- [x] Inventário de leitores por bucket e confirmação read-only do guard/RLS técnico no ref canônico; preservar evidências externas e aba antiga.
- [x] Preparar pacote técnico POST/snapshot INVOKER pré+pós, limites e integração candidata no transporte existente; policy review e rollback deny-only.
- [x] Testes sintéticos adversariais e integrados: 114/114, Deno check/bundle; não equivalem a JWT/RLS real.
- [ ] Revisão independente/POST técnico A/B e matriz list/upload/update/delete: faltam provas reais e autorização de execução; paths checkins/solicitacoes não correspondem ao guard e permanecem NO-GO.
- [ ] Comprovantes técnicos de entrega/aplicação e demais GET privados: exigem provas próprias de registro/tenant, não cobertos pelo snapshot de visita.
- [ ] GET/CDN históricos: sem purga suportada no FREE ou expiração da URL original comprovada; SU-518022 apenas ack, nenhum contato/upgrade.
- [ ] Perfis restantes/renovação e aba C8KAaC21: homologação real pelo proprietário; sem reload/sessões pelo agente. Não avançar catálogo/contratos.

## 21/10 — C1B catálogo B2B e candidata de rótulos por família
- [x] C1B: migration aplicada em produção pelo auditor (sem DML); REST real: consultor A 403 nas overloads técnicas, admin B 200 [] — sem homologação positiva não vazia; aguarda sessão B2B teste4. Interseção fornecedor+parceira foi escolha técnica do auditor sob autorização. Runtime C1B NÃO promovido/publicado.
- [x] Candidata rótulos por família em scripts/catalog-labels-20261021: tabela catalog_family_labels + RPCs platform_* gated, seed só dos 7 rótulos atuais, trigger dinâmico substitui CHECK literal, diálogo/painel alimentados por RPC. 29/29 SQL local, 11/11 vitest, tsgo OK, build OK; SHA256SUMS 270cbb56.
- [ ] Revisão independente da candidata de rótulos; NÃO aplicar DDL/DML hosted nem publicar sem autorização. Reversão estrutural só documental.
- [ ] Retomar depois: promoção B2B (C1B runtime), contratos cumulativos canônicos (atribuir/desvincular/reativar/histórico) — não implementados.

## 21/10 — C1B-SCOPE: desbloqueio do forbidden_partner (candidata, não aplicada)
- [x] Evidência do auditor: teste4 (beb25695) recebe 403 forbidden_partner nas 3 RPCs; sessão B2B existe.
- [x] Inventário read-only: 0/5 organizações com partner_account_id; único partner_users (teste4, gestor) no tenant fornecedor 007bb519 = commercial_owner. Modelo A (organização parceira) nunca populado; Modelo B (vínculo no tenant fornecedor) é o canônico — incompatibilidade estrutural preexistente.
- [x] Candidata em scripts/catalog-c1b-partner-scope-20261021: CREATE OR REPLACE b2b_actor_scope com fallback ao vínculo validado (is_valid_b2b_partner_user intocada, md5 verificado); org com parceiro prevalece e divergência nega; revogação/inativo/tenant divergente/multipapel negam. 15/15 harness local; SHA256SUMS bcf3f4d1.
- [ ] Auditor revisar/aplicar candidata e repetir testes na sessão B2B (teste4). Verificar entitlement catalogo_precos no postflight (impedimento separado se faltar).
- [ ] Incompatibilidade multipapel (count(user_roles)=1) registrada para a fase de contratos funcionais — não aberta nesta correção.

## 23/10 — Regressão pausa transitória /configuracoes (pós-C2) — correção local, não publicada
- [x] Recuperação AUTOMÁTICA de timeout com mesmo fingerprint não incrementa época; Retry MANUAL mantém o bump revisado (teste dedicado); ineligible/mudança de fingerprint/escopo divergente continuam incrementando.
- [x] Rascunho externo retido guarda baseline CAS completo (escopo/ator/tenant/alvo/updated_at/papéis/versão), tentativa e estado não confirmado; baseline divergente bloqueia em conflito sem rebase; mesmo CAS recupera com a mesma chave de idempotência.
- [ ] PartnerLifecycleFields (checkboxes/motivo de perfis) SEM retenção: pausa ainda descarta a seleção; não prometer preservação.
- [ ] Homologação real A/B: entrada pelo “Trocar de portal” bloqueada por pausas/remount na rodada 18:02–18:04Z; pós-revogação “sem permissão” e Voltar → /portal-parceiro/pedidos pausado — não reproduzido localmente nem certificado.
- [ ] 38 falhas em 7 arquivos de teste idênticas (nome a nome) às de 28699adf, anterior a esta rodada; origem anterior não atribuída nem corrigida.

## 23/10 — C2-ORD v2: compra do cliente comercial (candidato REVIEW, não aplicado)
- [x] Blockers corrigidos no candidato: cumulativo gestor+técnico compra, técnico isolado não; guard server-side em create/simulate com plano atribuído; título no tenant dono com categoria/forma/cliente estritos; aprovação `na_aprovacao` atômica com a cobrança.
- [x] Preflight hosted READ ONLY PASS (11 hashes/ACL); harness descartável 35/35 com rollback que fecha o writer.
- [ ] Revisão independente + aplicação pelo auditor; postflight REST/JWT real.
- [ ] Configuração: 5/5 configurações financeiras com forma de pagamento inexistente (`pix`); 3 clientes comerciais sem plano atribuído.
- [x] Hipótese corrigida: categorias/formas são globais por desenho (sem DDL de tenant); d51_5 valida só cliente/parcelas/pagamentos.
- [ ] Idempotência concorrente/troca de preço apenas estática; fiscal por tenant não auditado; listagem de planos ignora vínculo revogado.
- [x] C2-ORD v2: notificação de novo pedido restrita a admin/gestor_comercial ativos do tenant dono; aprovação só a vínculos vigentes/perfis ativos (43/43 local).
- [ ] Sessão real A financeiro: verificando→vazio→pausada, retry voltou vazio — candidato não instalado, não reproduzido; investigar sem aumentar verificação nem reload.
- [x] 20261023192728 (G destinatários + E aprovação atômica) instalado pelo auditor; cópia exata em scripts/owner-orders-20261023/applied; candidato v3 rebased sem reaplicar; contenção preparada.
- [x] Guard multiperfil via wrapper só de create/simulate; assert legado intacto (49/49 local).
- [x] Plano e atribuição teste4 já existentes confirmados READ ONLY; arquivo de fixture convertido para SELECT-only, sem duplicação/arquivamento. Contenção fiscal candidata pronta, não instalada.
- [ ] Método teste4 aguarda formulário canônico funcional: engrenagem só aparece em pedido e seletor fixo não oferece método ativo AUDIT; não criar pedido para acessá-lo. Fiscal continua pendente parametrização em produção.
- [ ] Prévia A: /sem-permissao intermitente e nó desanexado por remontagem — pendência do monitor, sem reload.

## 24/10 02:46 — composição final integrada
- [x] Variante final-integrated-20261024: origem reconciliada e wrapper row-before-receipt na mesma transação; histórico preservado.
- [x] Uma suíte focal 1/1 PASS: barreira 40P01 antes/fix depois, tenants A/B, negações exatas e POST falho integral candidato/contenção.
- [x] Entrega integrada revisável concluída; sem hosted mutante/publicação/writer.
- [ ] Implantação/homologação independente: bloqueada pela contabilidade real A DRAFT e revisão do auditor.
- [ ] Venda comercial para carteira: pacote inativo `scripts/commercial-order-entry-20261024/` pronto para revisão; aguarda captura READ ONLY do leitor de catálogo LIVE, revisão independente e instalação pelo proprietário.
- [ ] Pedido interno A: aguarda validação contábil real do emissor A (DRAFT).
- [ ] Compra própria externa: writer contido (c2_owner_order_create_allowed=false) até release independente.

## 26/10 17:56 — fechamento durável de tentativa (INATIVO)
- [x] Plano c1583a15 (Web Locks) rejeitado: marcado como não implementado; nenhum código dele existia.
- [x] Pacote attempt-closure-20261026: candidate/preflight/postflight/rollback contenção e total-se-vazio; 51 PASS sintéticos.
- [x] Revisão 457951ca: barreira trigger no caminho de escrita (create antigo em voo), revalidação pós-lock em close/create, negativas SQLSTATE exatas, timeouts em candidate/rollbacks; 89 PASS sintéticos.
- [x] Backend 5cdaf5d aplicado pelo auditor (b2b_order_attempt_closure_guarded_20261026).
- [x] Interface publicada 001b3cad e homologação real A/B relatadas pelo proprietário em26/10 19:01; PB001033 único/close closed/committed/B403, sem execução produtiva do agente.
- [ ] Recuperação após fechar aba/entre abas: pacote INATIVO durable-attempt-20261026, NO-GO pelos gates19:01 acima; entre origens não homologado.
