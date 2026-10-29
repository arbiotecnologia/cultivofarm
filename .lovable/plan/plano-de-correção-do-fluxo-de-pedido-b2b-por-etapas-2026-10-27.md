# Plano de correção do fluxo de pedido B2B — por etapas

## Reconciliação em 28/10/2026 — plano original retomado

### Continuidade29/10 15:36 — decisões e testes de partes/crédito (Etapas6/9)
- [x] Decisões humanas: ARBio vende/emite/recebe/credora; FSFAgro compra/devedora. Limite numérico explícito finito não negativo obrigatório, zero não ilimitado; cadastro primeiro/settings depois. Não equivale a prova fiscal/contábil ou implantação.
- [x] Runner offline810PASS/0FAIL/1BLOCKED/1NOT RUN,651anteriores/14corridas preservados; incremento159=9RED/105GREEN/43contrato reduzido/2fragmento. Ownerselection e zeroprogression corrigidos só sandbox; exposição13.500, original10.300 e monetário7.550/eventos/estorno/replay preservados. Monetário37/proveniência42/Vitest10PASS;68arquivoshistóricos intactos/evidências1536.
- [x] Relatório `docs/auditorias/partes-credito-offline-20261029.md`, contratoDRAFT existente e regressão atualizados. Próximo gate fullimpl `billing_not_eligible:PAYMENT_TERMS_NOT_DEFINED`; items/terms vazios compostos sem fabricar aprovação/preço/origem/ticket. Contenções contábeis/origem intactas.
- [ ] Fornecer limite real e contrato calendário/parcelas/amortização/gatilho para condições vinculadas; evidência externa de emitente/credor/owner/devedor, razão/BI/proveniência/fullchain/JWTreal separada. Não reabrir decisões resolvidas; não emitirSQLimplantável nem ativar/produzir.

**NO-GO operacional.** Este é o mesmo plano de nove etapas, não um novo plano. Relatório: `docs/auditorias/reconciliacao-fluxo-pedido-b2b-20261028.md` e anexo de assinaturas/hash/ACL. Cruzado com o desenho `fluxo-do-pedido-b2b-do-parceiro-à-emissão-fiscal-2026-10-27.md` e A2. O desenho é objetivo, não prova de funcionamento.

Neste lote somente documentação e testes offline; nenhuma SQL hosted, GRANT, migration, fixture, sessão, runtime ou publicação. Instalações externas já relatadas são preservadas, não reaplicadas. Captura LIVE histórica não é recertificação atual. Contabilidade/fiscal reais e SU-518022 permanecem pendentes.

## Etapa 1 — Testes da tela da empresa parceira (concluída)
- [x] Simulação atualizada; 7/7 no resultado histórico.
- [ ] Aceite integral por perfil/tenant pertence à Etapa 9; estes sete testes não certificam o fluxo.

## Etapa 2 — Cobrança na entrega (A2 preparada, NÃO implantada)
- [x] LIVE capturado: generate `670ea34d37c4c4fd6612031ad763a3a7`, mark `e4008b029ce8d58f70f3fc88571d03be`, DEFINER/postgres/EXECUTE authenticated; BOLA permanece na última captura.
- [x] Histórico 47 checks e A2 76/76 locais/sintéticos; candidato transacional, pinos e contenção deny-only, sem restaurar vulnerabilidade.
- [ ] Revisão independente: org ator/entrega/recebível, papéis/vínculos/inativo, RECEITA global ativa, método ativo, replay/concorrência e parcelas imutáveis instaladas.
- [ ] Resolver inversão engine→financeiro versus gate→advisory→linha e revogação de organização/feature/vínculos antes de implantação isolada.
- [ ] Conciliar consumidores: método NULL, AMBOS, valor/agenda locais e fiscal em segunda transação. Aceite: título confirmado não parece falha total; sem retry/rebase automático; JWT A/B real.
- A2 contém B2B/onfarm e papéis externos/cumulativos: **não fecha cobrança B2B final** sem contrato posterior revisado.

## Etapa 3 — Itens de nota fiscal sem isolamento por empresa
- [x] Achado na captura de 27/10: escrita ampla em `fiscal_invoice_items`, sem RESTRICTIVE tenant.
- [ ] Reconfirmar writers/nota-pai e preparar fechamento mínimo, preservando leitura/contratos fiscais.
- [ ] Aceite: A/B/anon negativos e próprios positivos, CAS/atomicidade e isolamento via nota-pai; sem emitir fiscal real. Implantação não evidenciada neste levantamento.

## Etapa 4 — Lotes: fechar escrita direta
- [x] Geração manual e contenções específicas de lote instaladas externamente; geração REAL B limitada, não CQ/envase completos.
- [ ] Reconciliar ACL efetiva tabela/coluna e OnFarm: o inventário antigo de DML não pode sobrepor contenção instalada.
- [ ] Preparar apenas delta necessário; aceite: SELECT/RLS e RPCs postgres preservados, negativos diretos, CQ/binding/delete imutáveis; nenhum ticket fictício ou escape GUC.

## Etapa 5 — Contratos OS, estoque/envase e entrega (autorizada; NO-GO)
- [x] Aprovar/programar OS **já têm EXECUTE authenticated**; preservar corpos/ACL. Criação manual OS continua direta e não tem RPC equivalente recuperada.
- [x] Pacotes inativos: Etapa 5 39 checks, estoque/envase 46, composto 31, todos locais/reduzidos. Wrapper confirmação entrega permanece sem EXECUTE authenticated.
- [x] Rodada 28/10: captura atual read-only (14/14 corpos estoque e seis tabelas sem drift); delta delivery-only INATIVO com PRE/POST, ACK filho obrigatório/expedição ambígua PT409 e containment deny-only. Composto histórico agora aborta antes de DDL por rebase A2 pendente.
- [x] PostgreSQL descartável: estoque **64/64** (motor/ledger/reserva interna capturados; Auth/schema sintéticos), composto **48/48** (motor/billing/avanço stubs). Item N batch/envase/expedição, replay, disputas e rollback DDL testados; não são integração completa nem JWT.
- [ ] Rebase do composto sobre A2: ele usa cobrança histórica incompatível com parcelas instaladas. Não considerá-lo composição A2 pronta.
- [ ] Aceite: motor/ledger/trigger completos, locks/revogação nos dois ordenamentos, transição canônica envase, autoridade B2B/onfarm e reserva parcial revisadas, PRE/POST atuais e JWT A/B real.
- [ ] Mapear contrato de criação manual OS, criação por pedido e cada ação entrega; não substituir por conversão visita nem inventar fluxo paralelo.
- [x] Mapeamento atual: manual INSERT distinto de publicação `rpc_planejamento_publicar_v1`→`publish_planning_to_lab`→generator pedido; entrega individual distinta de grupo multichamada; retorno distinto de cancelamento. Relatório `docs/auditorias/etapas5-6-contratos-os-entrega-estoque-20261028.md` com oito gates exatos; equivalência funcional ainda não implementada/provada.
- Bloqueadores preservados: `ENVASE_TRANSITION_REVIEW_PENDING`, B2B/onfarm, custo gate global, fiscal/contabilidade reais. Autorização já existe para preparar; bloqueio é técnico, não falta de autorização genérica.

## Etapa 6 — Migrar as telas de OS e Entregas
- [x] Inventário documentado: criação OS INSERT, entrega multi-RPC/compensação/status/rollback diretos, documentos antes de confirmação, diálogo financeiro com compromisso parcial.
- [x] Pacote independente local: diálogo existente com quatro estados/releitura e especificação/testes OS-entrega. Relatório `docs/auditorias/etapa6-consumidor-financeiro-20261028.md`.
- [x] Método ativo obrigatório/RECEITA apenas, UUID/tenant/origem/cliente verificados, draft em erro preservado; agenda só revisão. Nenhum generate/mark/fiscal enviado: A2 não instalada e valor canônico pré-cobrança sem ACL authenticated.
- [x] QueryClient real/Auth-transporte simulados: 14 testes financeiros, 5 contratos offline +42 regressões, **61/61 PASS**. ACK perdido/fiscal ERROR recuperados por registros simulados, não mutação real; invalidação exata e tardios fenced.
- [ ] Dispatch financeiro/retentativa fiscal só após contrato instalado/provado e revisão independente; nesta versão operação bloqueada sem simular sucesso.
- [ ] Criação OS/entrega: contrato equivalente provado antes de migrar; falha item N/expedição sem sucesso aparente, CAS/replay/cancelamento/retorno e cercas. Sem fallback direto quando RPC fechada.
- [x] Próximo pacote offline produzido sem repetir financeiro: **55/55 Vitest**, QueryClient real/transportes simulados em publicação existente. Duplo dispatch e `ok:false` são lacunas caracterizadas, não aceite; nenhum writer OS/entrega alterado.
- [ ] Publicação coordenada somente após contratos instalados e revisão independente; não fechar DML enquanto telas dependem dele. Writers OS/entrega intactos; consumidor financeiro local read-only não libera operação.

### Correção incremental do consumidor REAL — 28/10 02:12 UTC
- [x] Página Entregas + hook/diálogo existentes: baseline seis falhas, correções locais de single-flight, ACK positivo/UUID, reserva split, fences e invalidação scoped; retry OFF. Sem mexer em useProductionPlanning.
- [x] Item N/expedição/estorno negativos não anunciam sucesso nem fazem compensação fictícia; consulta explícita preserva draft, incerteza fica em quarentena por escopo/mount. Timeout 30s mantém trava até work resolver, sem prometer cancelamento remoto.
- [x] Revisão independente encontrou reserva split e timeout do diálogo; corrigidos com regressões. Vitest **332/332 em23 arquivos**, incluindo32 testes novos e2 integridade matriz; sintético, não somado aos620 históricos/188PG históricos.
- [ ] BLOCKED: publicação/instalação, atomicidade grupo/retorno/CAS/reconciliação durável, A2/envase/autoridade B2B/onfarm; nenhuma reabertura de wrapper/ACL.
- [ ] NOT RUN: JWT/Storage/browser autenticado/A/B/C, múltiplas abas/remount/produção; estado visual real sem sessão não certifica fluxo. Relatório `docs/auditorias/consumidor-real-entrega-20261028.md`.

## Etapa 7 — Fechar escrita direta em OS, entregas e notas fiscais
- [ ] Só após consumidores migrados/publicados e RPCs compatíveis: fechamento por comando, SELECT/tenant/jobs privilegiados preservados.
- [ ] Inventariar/migrar antes `useFiscalDocuments`, `useFiscalReconciliation`, `NotasFiscais` e writers adjacentes da esteira; sem inferir fechamento global por um wrapper.
- [ ] Aceite: DML direto negado, RPC própria positiva, A/B/anon negativos e telas intactas; rollback contenção seguro.

## Etapa 8 — Higiene de acesso anônimo
- [x] Oito grants SELECT anon no inventário histórico; isso não prova leitura efetiva sob RLS.
- [ ] Provar consumidores públicos/policies/privilégios efetivos atuais antes do delta.
- [ ] Aceite: rotas públicas necessárias preservadas, anon sem acesso privado e authenticated legítimo intacto.

## Etapa 9 — Homologação final do fluxo
- [x] Alteração superveniente28/10 02:37UTC: candidata40% fixo todos prazos,0%até30d,1,8%>30d até6m inclusive,2%>6m até12m;>12 negar sem política excepcional aprovada. PDF **SUPERADO NAS TAXAS/DESCONTOS**, provas históricas preservadas.
- [x] Matriz nova `docs/auditorias/evidencias-arbio-fsf-override-20261028/matriz.csv`: PG41PASS/0FAIL/16BLOCKED/1NOT RUN; Vitest129/129 em8arquivos, sem somar históricos. PASS aritmético/especificação não homologação; relatório `docs/auditorias/arbio-fsf-politica-superveniente-20261028.md`.
- [x] **Decisão definitiva28/10 02:40UTC, prevalece sobre02:37 e PDF:**40%fixo/até30d juros0%;>30d até6m inclusive1,8% composto sobre TODO prazo desde data inicial SEM dedução30d;>6até12m2% sobre TODO prazo, NÃO marginal;>12bloqueado salvo exceção futura formal. Fórmula tabela snapshot×0,60×(1+taxa)^meses explícitos. Incidência integral e faixa única decididas pelo proprietário, não hipóteses.
- [ ] Gate vigente: calendário/dias/prazos fracionários/distribuição parcelas/billing e implantação comercial/jurídica **PENDENTES**.30/31dias e6m+1dia provam seleção normativa offline, NÃO PASS comercial de data/valor fracionário. Exemplo1m é duração numérica financiada explicitamente>30d a1,8%, NÃO conversão automática mês civil=30dias. Demais controles compatíveis/históricos preservados, produçãoOFF.
- [x] Runner existente revisado sem módulo runtime: PG47PASS/0FAIL/15BLOCKED/1NOT RUN em `docs/auditorias/evidencias-arbio-fsf-definitiva-20261028/`; regressões e contagem final Vitest no log da mesma pasta. Exemplos tabela100.000:1m61.080,00;3m63.298,67;6m66.778,69;8m70.299,56;12m76.094,51;30d60.000,00. Decimal60dígitos/centavos; rejeição de carência/marginalidade, taxa negativa/desconto41/vencimento passado/outro parceiro em schema/Auth reduzidos; snapshot apenas envelope de resposta anterior preservado, não guard persistido.
- [ ] Snapshot histórico persistido/replay/ACK/idempotência integral, parcelas/amortização/conciliação e RLS A/B **BLOCKED**; JWT/LIVE/browser/pagamento/fiscal **NOT RUN**. P0 saldo duplicado e P1 rateio/datas da bateria anterior não resolvidos por estesPASS. Backend capturado recebe taxa única/meses e suporta aritmética, não prova calendário ou bloqueio>12 real; nenhuma recapturaLIVE.
- [x] Arquivos desta decisão: DRAFT existente, `test-arbio-fsf-override.py`, `src/test/financeiro/arbioFsfReference.test.ts` e este plano; evidências novas separadas, memória/roadmap conciliados. Base0695c4dc3, checkout inicial limpo; entrega/runtime/migrations/contratos históricos intocados, nenhum revert ou conflito detectado. Hipóteses/evidências02:37 conservadas como históricas, não regras atuais. Build automático e diff-check verificados ao concluir; sem build/typecheck manual.
- [x] Referência AR Bio × FSF Agro julho/2026 incorporada como DRAFT específico fornecedor/revenda, não contrato vigente/tenant novo. Fonte provisória transcrição do proprietário; arquivo original cinco páginas não localizado. Especificação/relatório `docs/auditorias/arbio-fsf-politica-draft-20261028.md`.
- [x] Oito vetores tabela100.000 conferidos Decimal/corpo juros instalado, crédito capturado e regressões consumidores: PG17PASS/0FAIL/16BLOCKED/1NOT RUN; Vitest121/121 em9arquivos (14novos, demais sobrepostos). Matriz suplementar `docs/auditorias/evidencias-arbio-fsf-20261028/matriz.csv`; não transforma PASS aritmético em aprovação/quitado40% ou JWT.
- [ ] Gate AR/FSF histórico: taxas/descontos e quitação exclusiva do PDF substituídos pela alteração02:37UTC acima; fonte/validação jurídica, parceiro canônico ownerAR, mínimo/calendário/parcelas/billing/pro-rata/índice/alçadas continuam pendentes. Vencidos0d pedido/entrega>5d e garantias/histórico/acordos preservados, P0/P1/A2 contidos; nada aplicado.
- [x] Bateria financeira incremental offline 28/10: base R$10.000, fórmulas/contratos instalados lidos por SELECT canônico e expectativas Decimal independentes; nenhuma alteração na entrega ou regras comerciais. Relatório `docs/auditorias/bateria-financeira-b2b-20261028.md`.
- [x] Matriz financeira suplementar `docs/auditorias/evidencias-financeiro-b2b-20261028/matriz-financeira.csv`: PostgreSQL **29 PASS / 6 FAIL / 17 BLOCKED / 1 NOT RUN**, mais grupo Vitest **115/115** (15 novos; regressões existentes). Matriz original 9.180 cenários reais intacta, zero PASS real.
- [ ] **P0 BLOCKED:** gerador capturado preserva total financiado em original e também juros separados: R$10.300 vira saldo R$10.600 no consumidor; reproduzido isoladamente, cadeia integral/baixa real ainda não provada. Sem correção comercial automática.
- [ ] **P1 FAIL local:** rateio principal/juros diverge 1/5/2 centavos em 6x/12x/10%+6x; corpo manual aceita datas repetidas/retroativas no ambiente reduzido. Revisar todos triggers instalados antes de afirmar falha integral ou corrigir.
- [ ] Entrada/customização B2B, CAS/snapshots pós-aprovação, cancelamento, ausência de título para reprovação/CQ, na_aprovacao/na_entrega, features e A/B permanecem BLOCKED; manual sem juros suporta valores/datas personalizados no corpo instalado, não autoriza B2B paralelo. Mora/antecipação só ajustes monetários existentes, sem taxa automática inventada.
- [x] Auditoria segura do estado atual em28/10: matriz CSV rastreável de9.180 cenários planejados +grupos offline/gates FAIL separados, roteiro A/B/C e cleanup futuro, relatório `docs/auditorias/auditoria-final-fluxo-b2b-20261028.md`. Nenhuma combinação JWT/RLS real executada.
- [x] Falhas reproduzidas de dupla submissão/envelope negativo localizadas em publicação do planejamento (não ACK de entrega): patch mínimo canônico-only, trava síncrona, ACK/UUID alvo tipados, auth fence e retry OFF; sem abrir writer/ACL/rota. Dois testes produtor desatualizados corrigidos só nas fixtures e negativo canônico preservado; falso positivo detector aspas corrigido.
- [x] Rodada offline atual: Vitest288 ampla +171 contratos/segurança/BI +159 OS/CQ/envase/fiscal, grupos disjuntos **618/618 em42 arquivos**; PostgreSQL64 estoque +48 composto +76 A2 (**188** sintéticos, não JWT). Detalhes e limites por grupo no relatório.
- [x] Integridade da matriz:2/2 adicionais, total620 testes únicos/43 arquivos; reexecuções sobrepostas não somadas.
- [ ] **Gate obrigatório pós-implantação:** após implantação/publicação coordenadas, recapturar versões/ACL/guards/Storage/flags e executar matriz real controlada desktop/mobile com fixtures próprias, evidência por ID e cleanup auditável. Publicação não significa homologação.
- [ ] GO somente com zero P0 e caminho crítico P1 comprovado; P2 com aceite explícito. Métricas:0 vazamentos/duplicações/saldos inválidos,100% negativos críticos/replay/atomicidade/audit/snapshot, BI sem divergência;0 envios/NF reais neste recorte. Relatório independente sem inferir PASS real a partir de mocks.
- [ ] JWT/browser real A/B: parceiro gestor/cumulativo permitido versus técnico isolado, comercial, financeiro, produção, CQ, logística e fiscal de homologação.
- [ ] Pedido→OS→lote/CQ/envase→reserva/ledger→entrega→título/parcelas→fiscal rastreáveis; snapshots/valor servidor/replay/rollback preservados.
- [ ] Revogação via writers canônicos, espera bounded comprovada e dois ordenamentos de commit, timeout sem efeitos; nunca chamar revogar-e-tentar de teste durante espera.
- [ ] Fiscal/contabilidade reais continuam pendentes; não emitir/cobrar/enviar comunicações externas por este plano. SU-518022 adiado.

## Detalhes técnicos
- Todos os pacotes em `scripts/<tema>-20261027/` com `*.sql.review`, preflight de hashes/ACL/policies, postflight, contenção deny-only e testes PostgreSQL descartáveis (marcados como sintéticos).
- A2 está em `scripts/delivery-finance-a2-20261028/`; não editar SQL gerada nem executar candidata/containment no hosted.
- Ordem de dependências: exposição/pinos → consumidores independentes → contratos criação → composição A2/motor/locks → envase/B2B → instalação independente → migração/publicação → DML/anon → homologação completa. Inventários/testes independentes das etapas 3/4 podem avançar sem instalação.
- Protocolo: gate canônico antes de esperas, idempotência/advisory → linha → autoridade fresca após **cada** espera → CAS; verificar toda cadeia de locks filhos, não apenas wrapper.
- Validação desta reconciliação: **85/85 Vitest offline** em quatro arquivos existentes e **22/22 hashes A2 OK**; 76 A2 permanecem resultado histórico sintético, não reexecutado/JWT real. Relatório discrimina warnings e limites.


## Aditivo prioritário 28/10 20:24 — contrato canônico do saldo (Etapas6/9)

- [x] Captura LIVE somente metadados no refcanônico:93corpos/8tabelas/33triggers/40policies/38índices; nenhuma linha de usuário/título real. SHA2565291043aa23869274f31f9d24390d7525f1472001798186b990f68b6ad9576bb.
- [x] Integração PG descartável18corpos distintos:80PASS/14FAIL/8BLOCKED/1NOT RUN; baseline37PASS/10FAIL, experimento43PASS/4FAIL; Auth/tenant/RLS parcial não homologam produção. Vitest222/222 em12arquivos, sem repetir testes da taxa DRAFT nem somar históricos.
- [x] Matriz suplementar103casos em `docs/auditorias/evidencias-saldo-canonico-20261028/matriz.csv`; original9.180cenários reais intactos e0PASSJWT. Relatório `docs/auditorias/saldo-canonico-recebiveis-20261028.md`.
- [x] NO-GO documentado: original contém total financiado, juros operacionais passam a somas de eventos; conversão para principal perde financiamento. Experimento zero juros iniciais não supera UPDATE do writeralternativo. Runtime/SQLreview anteriores/entrega/históricos intactos; nenhuma candidata instalável emitida.
- [ ] P0: reconciliar cadeia B2B INSERT+UPDATE integral e remediação por proveniência; P0 adicional cancelamento sem tenant no corpo (JWT não executado); P1 definições BI/aging/crédito e rateio real centavos pendentes.
- [ ] Gates: fechamento transitivo helpers/FKs/RLS/tenant/SaaS/risco/fiscal, PRE/POST hash/ACL/policy/trigger+índices agregados e rollbackdeny-only somente após contrato seguro; revisão independente→instalação autorizada→JWT/browser/locks/concorrência/contabilidade. Calendário fracionário/parcelamento/billing seguem indefinidos; produçãoOFF.


## Continuação 28/10 20:38 — harmonização canônica dos escritores (Etapas6/9)

- [x] Base1da2c3136inspecionada;105corpos metadata-only com OIDs/ACL/owners/MD5,10relações novas,16writerslexicais e17consumidores na matriz suplementar;64comparações sem drift, fechamento transitivo NÃO comprovado.
- [x] Runner existente ampliado sem duplicar módulos: loop exato de atribuições baseline versus hipótese preservando SUM(eventos), duas sessões/ACK/replay/estorno e diagnóstico de grupos1/4/5. PG122PASS/17FAIL/8BLOCKED/1NOT RUN (148casos);Vitest194/194em12arquivos, sem repetir cálculos aprovados da taxa nem somar históricos.
- [x] Contrato observado:original/net total financiado;juros inicial no schedule,interest operacional em conflito temporal LIVE;proposta limita juros aos eventos e não altera original/snapshots. Relatório `docs/auditorias/escritores-saldo-canonico-20261028.md`;matrizes/pinos em `evidencias-escritores-saldo-20261028/`.
- [x] SELECT histórico inativo retorna apenas contagens staff/h15 com supressão pequena; testes sintéticos, nenhum título LIVE. Conciliação manual por empresa/termos/eventos e autorização futura específicas, nunca UPDATE retroativo automático.
- [ ] NO-GO SQL/frontend/remediação: wrapper/core inteiro,Auth/H15/SaaS/tickets/origem/fiscal/risco/FKs/RLS/índices transitivos e importações/compensação não fechados. Não produzir candidate/PRE/POST/rollback unilateral; futuros pinos completos/deny-only somente após revisão independente.
- [ ] P0duplicação+replay encargo/cancelamento tenant;P1BI/aging e calendário/parcelamento/billing;duas sessões não comprovam espera crítica;JWT/RLS A/B,contabilidade,envase/B2B e entregas preservados BLOCKED.

## Continuidade executável 29/10 — regressão P0 e cadeia recursiva (Etapas6/9)

- [x] SELECT metadata canônico:1.267corpos/343relações; fechamento conservador57raízes→454funções/150relações/5.826arestas,13candidatos dinâmicos; pg_depend/trigger/FK/rewrite/policy e ACL/aliases distinguem evidência estática de lexical.59comparações sem drift; captura sequencial não substitui PRE atômico.
- [x] Harness existente reutilizado:37assertionsPGPASS/0FAIL inesperados; RED exige violações10.300→10.600 e7.550→7.750, GREEN limita juros aos eventos apenas sandbox, preservando snapshot/baixas/estorno/replay.9helpersAuth/H15/RBACcapturados+FKsmonetárias; identidade mínima/claims locais nãoJWT. Wrapper inteiro anônimo nega sem efeito; positivo BLOCKED sem origem/ticketinventado.
- [x] Vitest188/188em11arquivos incluindo PG como1teste; matriz suplementar37PASS/0FAIL/6BLOCKED/1NOT RUN e logs/pinos em `evidencias-cadeia-financeira-20261029`. Relatório `cadeia-financeira-offline-20261029.md`; históricos não somados, taxas não repetidas, Entregas/runtime intactos.
- [ ] NO-GO: cadeia positiva/fiscal/origem e guardsACL/RLS/FKs completos, SQLdinâmico/importadores, semânticaBI/proveniência/ledger contábil e JWT A/B/esperas; não emitir *.sql.review até demonstração integral. Promoção futura exige PRE/POST completo, revisão, autorização e containmentdeny-only semGRANT/restauração vulnerável/remediação automática.
- [ ] P0 histórico cancelamento tenant e integrações permanece;P1 aging/competência/crédito/export/calendário/parcelas/billing pendentes. Envase/B2B/entrega e produçãoOFF preservados.

## Rodada29/10 — cancelamento de parcela entre empresas (Etapas6/9)

- [x] Harness existente: RPC capturada executada só em LOGIN authenticated/anon não privilegiados, helpersAuth/H15/RBACcapturados, ACL/RLS e todos triggers de parcelas.55assertionsPASS/0FAIL inesperados; matriz55PASS/0FAIL/1BLOCKED/1NOT RUN, sem somar históricos; Vitest9/9em3arquivos.
- [x] Refinamento P0: guardtenant nega foreignOPEN atomicamente; seis checksRED reproduzem oráculo cancelada/pagamento/inexistente nos dois ramos, antes do UPDATE. Transformação mínima offline uniformiza foreign/inexistente e conserva próprio/replay/baixas. Nenhum SQL implantável/runtime/produção/histórico alterado.
- [x] Relatório `docs/auditorias/cancelamento-parcela-autorizacao-20261029.md`, evidências subpasta cancel-authorization; revisão independente e hashes. Próprios MANUAL A/B positivos não equivalem a B2B positivo.
- [ ] BLOCKED B2B positivo: fixture inteira aborta no trigger risco→recalc_partner_risk_score não composto, com estado inalterado. Compor risco/parceiro/governança/origem, RLSpai/identidade/ACL/FKs antes de afirmar autoridade integral; sem ticket/bypass.
- [ ] NOT RUN JWT/RLSreal A/B, revogação pós-lock/concorrência, PREPOST/containmentde promoção. BI/proveniência/calendário/parcelas/billing e financeiro/envase/B2B/entrega continuam NO-GO; não emitir *.sql.review.

### Revisão14:28 — fechamento local da corrida de cancelamento
- [x] GREEN pagamentos estrangeiros reais emAR/AP, SQLSTATE+mensagem exatos/estado monetário integral; Auth/revogação no corpo transformado, própriosA/B/replay/baixas/motivos e valores preservados.
- [x] 14ensaios multissessão: holderPID exato empg_blocking_pids, revogação committed antes release; RED papel ainda cancela, GREEN pós-lock com helpers capturadosSTABLE nega emREAD COMMITTED. REPEATABLE READ retém snapshot demonstrado; hipótese nega outros isolamentos. Foreign não toma aquele lock estrangeiro no teste.
- [x] Nova execução189PGPASS/0FAIL inesperados(35capturado/62RED/92GREEN),1BLOCKED/1NOT RUN; Vitest9/9sem somar histórico. Saída nova cancel-authorization-revision-1428, hashes anteriores21OK/1divergente/4ausentes registrados, bytes preservados; reexecuções usam/tmp.
- [ ] NO-GO integral: riscoB2B/origem/identidade/RLS/FKs/BI/proveniência/JWTreal e isolamentoPostgREST; serialização integral revogação além da janela testada não provada. Sem runtime/SQLimplantável/produção/ativação.

### Continuidade autônoma14:50 — risco/cadastro/proveniência
- [x] Reutilizar harness:20corpos e cinco tabelas capturados;25metadados exatos(colunas/constraints/triggersenabled/ACL/RLS/policies). CalculatorA/B agora alcançaFKparceiro23503; cadastroA/B atingeC2P1_SETTINGS_WRITE_CLOSED e rollback15tabelas, sem ticket/guard inventado. CancelamentoMANUAL pós-composição conservaCANCELED/audit/10.300/estado alheio; foreign pago negado.14corridas reexecutadas.
- [x] Final263PASS/0FAIL inesperados/1BLOCKED/1NOT RUN(35capturado/62RED/96GREEN/25risco/25metadados/10GREENrisco/10barreirasBLOCKED esperadas); monetário37PASS18RED/19GREEN preserva10.300/7.550/eventos/estorno/replay. Vitest10/10em4arquivos, sem somar reexecuções/históricos.
- [x] Proveniência42PASS/0FAIL/1BLOCKED:13candidatos/14trechos=1EXECUTE/4textformat/9literais; alvosOS/onfarm resolvidos, não executados;17consumidores source-only sem drift. Evidências novas revisão1450/logs/hashes; discrepâncias históricas preservadas sem regravar manifestos. Revisão independente incorporada/testada.
- [ ] Decisão do proprietário: cadastro deixa settings ausentes para configuração posterior autorizada ou inicializa11valores+método explícitos atomicamente? FrontendINSERT e updater parceiro-existente não resolvem ordem dos triggers; sem definir contrato não preparar alteração lateral/permissiva. Relatório cancelamento indica arquivos/linhas/corpos e teste executável.
- [ ] NO-GO: origem/fiscal/contabilidade, identidade/order/fullRLS/BIproveniência/ledger e JWTreal/PostgREST permanecem; C2_ACCOUNTING_PENDING/B2B_INTERNAL_DOWNSTREAM_UNVERIFIED intactos. Nenhum SQL implantável/runtime/produção/ativação/remediação.

### Continuidade15:03 — decisão cadastro primeiro, financeiro posterior
- [x] Decisão humana implementada exclusivamente sandbox: cadastroA/B autorizado semsettings/defaults/método/tickets; foreign/anon negados. CoreCAS canônico configura onze valores explícitos, preserva tenant/RBAC/locks/audit/tickets internos e nega stale/revogação/incompleto.
- [x] 651PGPASS/0FAIL/1BLOCKED/1NOT RUN sem somar históricos:288GREENdiferidos/9RED/8consumidorinativo. Ausente/incompleto/inativo fecha risco/crédito/auto/link/eligibilidade/wrapper; completa resolveFKrisco, positivo B2B-shaped limitado não prova origem/pedido.14corridas/NULL43RED40GREEN/monetário10300/7550/eventos/estorno/replay preservados.
- [x] Monetário37PASS/proveniência42PASS1BLOCKED/Vitest10PASSsem erros finais; evidências novas1503/logsintermediários/hashes. Revisãofonte incorporada: CASEexplícito, pendingstatuses,autoisolado,estadoorder,ACLservice-only,legadoincompleto. Consumidor permanece proposta inativa, runtime intacto.
- [ ] Contratos contábil/origem devem demonstrar cadeia autorizada para retirar C2_ACCOUNTING_PENDING/B2B_INTERNAL_DOWNSTREAM_UNVERIFIED; configuração completa não os satisfaz. Calendário/parcelas, BIproveniência/ledger/fullorder/RLS/fiscal/JWTreal e homologação específica continuam NO-GO. Não produzirSQLimplantável/ativação/remediação.

### Rodada limitada14:58 — tipoNULL no cancelamento
- [x] BaselinecapturadoNULLkind+payablepróprio cancela/void/auditexato comoauthenticated;43REDcontroles separados, não autorização segura. Receivableprópria/foreign e payableforeign/IDNULL/motivosNULLvazioespaçoscurto/tiposválidos testados.
- [x] Hipóteseapenasoffline rejeita p_kindISNULL anteslookup com23514,40GREEN novos/estadoinalterado. DeltaúnicoIF explicito preserva guards/tiposválidos; total346PASS/0FAIL/1BLOCKED/1NOT RUN,14corridas/risco reexecutados;Vitest10/10em4arquivos(monetário/proveniência incluídos).
- [x] Evidênciasnovas revisão1458/diffmínimo/logs/hashes;51arquivoshistóricos preservados. Falha intermediária somente contagemVitest documentada; revisãofonte independente semexecução.
- [ ] Cadastro/settings continua decisãohumana pendente, NÃO tomada. NO-GOintegral/BIorigemfiscalJWTreal preservado; runtime/migrations/produção intocados.

## 29/10/2026 17:41 UTC — Price até 3 parcelas (offline)
- Decisões: limite R$100.000; geração só manual autorizada; 1–3 parcelas mensais, 1º vencimento base+30d, Price 1,8% a.m. (1x/30d 0%); 4+ rejeitado; Price substitui full-term só para novos planos; históricos intocados.
- Resultado: 155 verificações/0 FAIL; Vitest 57/57. Relatório `docs/auditorias/price-parcelamento-offline-20261029.md`.
- BLOCKED: evento âncora da data-base, pro-rata/período irregular, dia útil; geradores sem Price e gates contábeis/origem; JWT/RLS real. Produção NO-GO.

## 29/10/2026 17:49 UTC — NF+30 e correções do motor Price (offline)
- Decisão: 1º vencimento = emissão da NF + 30 dias; geração manual não reinicia prazo.
- Validação de entradas, exposição não negativa, rejeição de planos não representáveis em centavos, oráculo independente; 212 verificações/0 FAIL; Vitest 57/57.
- BLOCKED: base de exposição (principal × total financiado), clamp/dia útil/pro-rata dos vencimentos seguintes, PG ponta a ponta (geradores sem Price, gates de cobrança/contabilidade), JWT/RLS real. Produção NO-GO.

## 29/10/2026 17:53 UTC — autoridade única da política candidata (offline)
- Política candidata com uma só regra ativa (Price/100000/manual/1–3/NF+30); modelo de juros integrais e faixas 6/12 meses movido para arquivo histórico substituído, usado só por testes históricos. Leitor recusa regras antigas em novos planos. 228/0 FAIL; Vitest 57/57. Produção NO-GO.

## 29/10/2026 18:00 UTC — limite com juros, vencimentos e dia útil (offline)
- Decidido e aplicado: limite sobre total com juros; 2ª/3ª no mesmo dia dos meses seguintes (último dia se curto, sem deriva); próximo dia útil sem juros extras; sem pro-rata. 269/0 FAIL; Vitest 57/57.
- BLOCKED: calendário real de feriados (CALENDAR_SOURCE_REQUIRED), composição PG com Price, fiscal/contábil, JWT/RLS real. Produção NO-GO.

## 29/10/2026 18:10 UTC — Calendário Paracatu-MG 2026 (offline)
- Dataset oficial versionado e selado por hash, localidade Paracatu-MG obrigatória; ajuste de dia útil real testado. 2027+ sem cobertura: plano inteiro bloqueado (`CALENDAR_COVERAGE_EXCEEDED`). Motor 307/0 FAIL. Produção NO-GO pelos gates restantes.
- Correção 18:16: cobertura 2026 é limitação do dataset (não decisão do proprietário); NF 2026-10-29 em 3x já bloqueia (28/01/2027), 1x/2x passam; motor 314/0 FAIL (42 CALENDAR_REAL).

## 29/10/2026 18:25 UTC — Calendário v2 2026–2027
- 2027 calculado pelas leis recorrentes vigentes (v1 2026 imutável); cobertura até 31/12/2027, 2028+ bloqueia plano inteiro. Motor 362/0 FAIL. Produção NO-GO.

## 29/10/2026 18:40 UTC — Gerador Price candidato (PG descartável)
- Candidato inativo com calendário selado, snapshot/recibo imutáveis e reuso do RPC/contexto capturados; 189/0 FAIL como componente. Continua negado por configuração de pagamento oficial, origem fiscal NF, contabilidade C2 e exposição canônica. Produção NO-GO.

## Revisão 18:45 — gerador Price (candidato anterior 1f85d817 → `1fcb1dca…`), PG descartável apenas
- **Serialização por devedor:** advisory lock `price-debtor|org|cliente` após o lock da chave (ordem fixa chave→devedor para todos); reautoriza sessão/staff/tenant depois da espera; exposição lida após o lock em snapshot fresco de READ COMMITTED. REPEATABLE READ/SERIALIZABLE recusados antes de qualquer lock/escrita (`PRICE_ISOLATION_READ_COMMITTED_REQUIRED`, 0A000).
- **Corrida provada:** atores U/U2, chaves diferentes, mesmo devedor; cada pedido (R$20.000 financiado) cabe isolado, soma excede: espera confirmada por `pg_blocking_pids`, exatamente 1 sucesso + 1 `LIMIT_EXCEEDED_BLOCK`, 1 título/recibo. Outro devedor não serializa. Staff revogado durante a espera → negado após o lock, estado inalterado. Seam de revogação sintético (`test_staff_revoked`).
- **Recibos:** trigger BEFORE TRUNCATE adicionado; DELETE/TRUNCATE testados.
- **d51_5:** corpo capturado (md5) e triggers em 4 tabelas compostos sobre fixture sintética `clientes(id,tenant)`; cliente estrangeiro e parcela re-apontada negados. Não é prova de RLS real.
- **Teto numérico:** limite agora 999.999.999.999,99 (numeric(14,2)); 1e12, 1e20 e 26 dígitos rejeitados com `TABLE_AMOUNT_INVALID`, sem overflow; no RPC o teto cai em `LIMIT_EXCEEDED_BLOCK` antes de qualquer escrita.
- **Correção de relato:** "10300 com baixa 7550, saldo 2750" é só verificação de preservação de fixture, não a regressão P0. Os testes P0 ORIGINAIS foram reexecutados sem alteração: RED 10600/7550/7750, GREEN 10300/7550/7550 — 37 PASS/0 FAIL.
- Resultados: PG gerador 217/0 FAIL. Exposição/settings/NF/contabilidade continuam deny-only, com stubs SINTÉTICOS. Evidência `price-generator-pg-review-1845/`. Não é E2E nem homologação.
