# Plano de correção do fluxo de pedido B2B — por etapas

## Reconciliação em 28/10/2026 — plano original retomado

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
- [ ] Rebase do composto sobre A2: ele usa cobrança histórica incompatível com parcelas instaladas. Não considerá-lo composição A2 pronta.
- [ ] Aceite: motor/ledger/trigger completos, locks/revogação nos dois ordenamentos, transição canônica envase, autoridade B2B/onfarm e reserva parcial revisadas, PRE/POST atuais e JWT A/B real.
- [ ] Mapear contrato de criação manual OS, criação por pedido e cada ação entrega; não substituir por conversão visita nem inventar fluxo paralelo.
- Bloqueadores preservados: `ENVASE_TRANSITION_REVIEW_PENDING`, B2B/onfarm, custo gate global, fiscal/contabilidade reais. Autorização já existe para preparar; bloqueio é técnico, não falta de autorização genérica.

## Etapa 6 — Migrar as telas de OS e Entregas
- [x] Inventário documentado: criação OS INSERT, entrega multi-RPC/compensação/status/rollback diretos, documentos antes de confirmação, diálogo financeiro com compromisso parcial.
- [x] Pacote independente local: diálogo existente com quatro estados/releitura e especificação/testes OS-entrega. Relatório `docs/auditorias/etapa6-consumidor-financeiro-20261028.md`.
- [x] Método ativo obrigatório/RECEITA apenas, UUID/tenant/origem/cliente verificados, draft em erro preservado; agenda só revisão. Nenhum generate/mark/fiscal enviado: A2 não instalada e valor canônico pré-cobrança sem ACL authenticated.
- [x] QueryClient real/Auth-transporte simulados: 14 testes financeiros, 5 contratos offline +42 regressões, **61/61 PASS**. ACK perdido/fiscal ERROR recuperados por registros simulados, não mutação real; invalidação exata e tardios fenced.
- [ ] Dispatch financeiro/retentativa fiscal só após contrato instalado/provado e revisão independente; nesta versão operação bloqueada sem simular sucesso.
- [ ] Criação OS/entrega: contrato equivalente provado antes de migrar; falha item N/expedição sem sucesso aparente, CAS/replay/cancelamento/retorno e cercas. Sem fallback direto quando RPC fechada.
- [ ] Publicação coordenada somente após contratos instalados e revisão independente; não fechar DML enquanto telas dependem dele. Writers OS/entrega intactos; consumidor financeiro local read-only não libera operação.

## Etapa 7 — Fechar escrita direta em OS, entregas e notas fiscais
- [ ] Só após consumidores migrados/publicados e RPCs compatíveis: fechamento por comando, SELECT/tenant/jobs privilegiados preservados.
- [ ] Inventariar/migrar antes `useFiscalDocuments`, `useFiscalReconciliation`, `NotasFiscais` e writers adjacentes da esteira; sem inferir fechamento global por um wrapper.
- [ ] Aceite: DML direto negado, RPC própria positiva, A/B/anon negativos e telas intactas; rollback contenção seguro.

## Etapa 8 — Higiene de acesso anônimo
- [x] Oito grants SELECT anon no inventário histórico; isso não prova leitura efetiva sob RLS.
- [ ] Provar consumidores públicos/policies/privilégios efetivos atuais antes do delta.
- [ ] Aceite: rotas públicas necessárias preservadas, anon sem acesso privado e authenticated legítimo intacto.

## Etapa 9 — Homologação final do fluxo
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
