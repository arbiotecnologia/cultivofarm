# Reconciliação do fluxo único B2B — 28/10/2026

**Parecer: NO-GO operacional.** Auditoria documental e testes offline; nenhuma SQL hosted (inclusive nova consulta), migration, GRANT, publicação, fixture, sessão, permissão, dado ou runtime alterado. Base examinada: `367ca43212b0fe7cc8e9bc35309a2b5d6b68dbbf`. Capturas existentes de 27/10 e A2 de 28/10 não são uma nova certificação do estado atual de produção.

## 1. Fontes e classificação

Plano mantido: `.lovable/plan/plano-de-correção-do-fluxo-de-pedido-b2b-por-etapas-2026-10-27.md`; desenho de referência: `.lovable/plan/fluxo-do-pedido-b2b-do-parceiro-à-emissão-fiscal-2026-10-27.md`. O desenho representa o percurso pretendido, não uma cadeia liberada.

- **LIVE capturado:** corpo/ACL/config registrado por catálogo, com data e origem; não prova execução funcional.
- **Implantação externa relatada:** recibo do auditor/proprietário no repositório; não atribuir execução ao agente nem ampliar o aceite.
- **Candidato INATIVO:** fonte `.review`/teste/patch, sem instalação. Existência de migration, função em types ou chamada em `src` não comprova instalação.
- **Homologação parcial:** prova apenas dos atores, caminhos e ordenamentos efetivamente ensaiados. Teste Auth sintética nunca é JWT/RLS real.

Destino exclusivo para eventual prova futura: `swzpzcwiasxmjutrmvkm`. Antes de qualquer operação de banco, atestação externa verificável do ref; literal SQL e `current_database()` não bastam. Não usar Cloud/ref alternativo nem cliente paralelo.

## 2. Estado das nove etapas

| Etapa do plano original | Estado real reconciliado | Falta para aceite |
|---|---|---|
| 1. Testes empresa parceira | 7/7 histórico reportado; não reexecutado neste lote | Manter regressões; não confundir com aceite comercial/financeiro |
| 2. Cobrança na entrega | Diagnóstico concluído; histórico 47/47 e A2 76/76 sintéticos; **ambos inativos** | BOLA, locks transitivos, autoridade/revogação, parcelas instaladas, consumidores e JWT A/B |
| 3. Itens fiscais | Achado de policy ampla na captura de 27/10; correção instalada não evidenciada neste levantamento | Nota-pai/tenant e writers fiscais completos; CAS/atomicidade/negativos A/B |
| 4. Escrita direta de lotes | Geração manual e contenções específicas instaladas relatadas; fechamento geral não demonstrado | Não presumir DML aberto pelo inventário antigo; verificar ACL por tabela/coluna, OnFarm e RPC/CQ/envase |
| 5. Contratos OS/entrega | OS aprovar/programar já acessíveis; criação manual não recuperada; entrega candidata **NO-GO** | Envase, motor/ledger real, integração A2 e contrato B2B/onfarm; não há release autorizado pelos testes |
| 6. Consumidores OS/entrega/cobrança | Escritores diretos e multi-RPC ainda presentes | Preparar/revisar patches sem ativação; contrato instalado antes da troca de writer |
| 7. Fechar DML OS/entrega/fiscal | Bloqueado pela migração efetiva de todos os consumidores | Publicação coordenada e provas dos callers antes do fechamento; SELECT/jobs preservados |
| 8. anon | Grant SELECT em oito tabelas no inventário histórico; leitura efetiva não provada | Inventário público completo, RLS/policies e permissões efetivas; retirada inativa só após compatibilidade |
| 9. Fluxo completo | **Não homologado** | JWT/browser A/B por perfil, revogação/concorrência, rastreabilidade e fiscal de homologação; fiscal/contabilidade reais continuam pendentes |

Numeração canônica é a deste plano. `order-flow-direct-writes-20261027/README.md` usou “Etapa 3” para fechamento e “Etapa 6” para cobrança em seções históricas: não são fases adicionais.

### Evidências instaladas e contenções

1. A2 `README.md:9–16`: `fn_generate_receivable_from_entrega(uuid,jsonb)` OID 41730, MD5 `670ea34d37c4c4fd6612031ad763a3a7`; `fn_mark_entrega_not_billable(uuid,text)` OID 41748, MD5 `e4008b029ce8d58f70f3fc88571d03be`. DEFINER/postgres, search_path public, EXECUTE authenticated. **Exposição permanece no último LIVE capturado.** MD5 A2 locais `8b6413222ee01e784f61df7d2a9ebe84` / `893c04fc4027ca6879addaa6d77f1c5f` NÃO são LIVE.
2. `os-delivery-reopening-20261027/README.md:7,30`: `rpc_aprovar_os_v1` MD5 `1023b9d5210534bee16147e2ce29ee12`, `rpc_programar_os_v1` `e374f0ba1698b37523b890dc91682eaf`, motor `rpc_estoque_operar_v1` `c71a9e848eff0a522cbaa3a7ec2949a5` já com EXECUTE authenticated. Cancelar reserva cockpit continua postgres/service. Aprovação/programação não precisam ser “reabertas”.
3. Wrapper `rpc_entrega_confirmar_v1` MD5 `cd39f9fe93514420976263d13856c17c`, ACL postgres/service, confirmado na captura A2. Criar/cancelar/confirmar cockpit também fechados segundo pacote Etapa 5. Helpers candidatos `stock_envase_scope_v1`/`delivery_recovery_scope_v1` ausentes na captura A2.
4. Generator `fn_generate_receivable_installments` `f632f15c9f46cb9889082fc533a27ea1` e guards de snapshots/hard-delete são dependências instaladas capturadas: nunca apagar/reinserir parcelas para adequar agenda.
5. `owner-orders-20261023/applied`: composição P1/owner relatada instalada em 23/10 22:56, **seguida de contenção writer false** às 22:58 e contenção de origem interna. Eligibility `db977875e15ea49ce10fb3e5388d7dfb` permanece internal-only; correção numérica de crédito instalada relatada em 24/10 não libera pedido/produção. Recuperação de tentativa 5cd/001b foi homologada parcialmente; composição durável e origem contábil não herdam esse aceite.
6. `roadmap.md`, seções 20/10 lote/CQ: geração manual e guardas de lote instaladas externamente; positivo REAL B LT-2026-0002 limitado à geração. Contenções CQ/binding/delete instaladas não equivalem à ativação CQ/envase. CQ/referência produto-only e transição permanecem gates independentes.
7. `stock-envase-recovery`, `os-delivery-reopening`, `delivery-stock-release`, `delivery-finance-a2`: **nenhum destes releases instalado** nas evidências cruzadas. Autorização anterior de aplicação não removeu seus NO-GO.

Inventário integral de assinaturas/hash/OID/ACL/config capturados: [anexo](reconciliacao-fluxo-pedido-b2b-20261028-inventario.md). ACL ausente no arquivo de corpos não é interpretada como grant ou deny.

## 3. RPCs e escritores frontend canônicos

| Trecho | Consumidor e contrato | Restrição/pendência |
|---|---|---|
| Catálogo → pedido | `useCreatePartnerOrder.ts:130–176`, `create_partner_order_secure`, cart hash/idempotency key/journal | Preço servidor; nunca auto-retry create; capability/writer contido prevalece |
| Comercial | `usePartnerOrderActions.ts:18–117`, approve/request-items/reject/delivery-date/notes; `useRespondB2BQuote.ts:62` | Aprovação comercial não concede fabricação; não impersonar comprador |
| Crédito/título B2B | `useB2BFinanceiro.ts:73,99,170–172,330`: generate/cancel receivable, settings CAS, approve credit | Finanças próprias do parceiro distintas das internas do fornecedor; na_aprovacao atômico/na_entrega posterior |
| Criação OS | `OrdensServico.tsx:270–302`, INSERT `ordens_servico`, UUID/trava local | Não há RPC equivalente recuperada. Conversão visita→OS e pedido→OS não substituem cadastro manual |
| Aprovar/programar | `OSDetalhesDialog.tsx:133–164`, `rpc_aprovar_os_v1`; `useEsteiraLaboratorio.ts:813–834`, `rpc_programar_os_v1` | Frontend de aprovação nega origem/link B2B; não retirar gate para produzir positivo |
| Lote/CQ/envase | `useEsteiraLaboratorio.ts:175–220,330–367`; `RegistrarCQDialog.tsx:46–65` | gerar_lote, registrar_envase, avançar esteira CQ; respeitar gates, referências e imutabilidade |
| Reserva/estoque | `useEsteiraLaboratorio.ts:479,547,615`; `motorEstoque.ts:94` | reservar_estoque_item, rpc_estoque_reservar, cancelar_reserva, motor; reconciliar múltiplos contratos |
| Criar/confirmar entrega | `useEsteiraLaboratorio.ts:641–718` cria/confirmar cockpit; `ConfirmarEntregaDialog.tsx:148–199` confirma wrapper | Callers não provam ACL liberada; documentos antes da RPC podem persistir em falha |
| Orquestração entrega | `Entregas.tsx:440,460–605,617–628,673` | Auditoria/reserva/criação por item/expedição multi-RPC; UPDATE direto de compensação/status/rollback |
| Cobrança/fiscal | `ConfirmarEntregaFinanceiroDialog.tsx:99–179` e `FiscalTab.tsx:49` | generate receivable → upsert fiscal **duas transações**; sem decoder/fence suficientes |
| Fiscal | `useFiscalDocuments.ts:248–261,288`; `useFiscalReconciliation.ts:156,195`; `NotasFiscais.tsx:39`; `useFiscalRascunho.ts:101,136` | Writes diretos fiscal_invoices + RPC draft/event/manual; homologação não é emissão real |

Escritores adjacentes: `useEsteiraLaboratorio.ts:126,156,411,782,798,842` (eventos/produção/estoque avulso/programação). Harnesses Edge service_role são privilegiados e mutantes: **não executar como teste de compatibilidade**. Inventário não certifica consumidores externos, SQL dinâmico ou todos os portais mobile.

## 4. P0 e dependências por ordem

**P0-A — BOLA financeiro:** papel global + entrega por ID + replay sem tenant. RLS não protege automaticamente DEFINER postgres. Revisão independente deve decidir contenção mínima deny-only versus correção composta; agente não executa nenhuma. Rollback antigo que restaure corpos vulneráveis/ACL histórica não é opção segura.

**P0-B — composição obsoleta:** release estoque/entrega incorpora cobrança histórica, NÃO A2. A2 eliminou DELETE/reinsert e restringe origem/ator. Rebase futuro exclusivamente pelo assembler, pinos atualizados e pós-hashes reais locais; não concatenar SQL antigo e anunciar integração.

**P0-C — lock/revogação:** engine `6eb78ceebe90196ac5b95bfc127dd63b` adquire advisory/linhas antes da marcação financeira; A2 entra gate→advisory→entrega. Caller privilegiado pode inverter locks. FOR UPDATE comum no composto corrigiu 40P01 apenas em ensaio reduzido. Provar motor/ledger/financeiro/trigger reais juntos, duas conexões, ambos ordenamentos. Revogação de organização/user_clientes/features não tem protocolo comum integral demonstrado. Gate global exclusivo tem custo; convites NOWAIT/55P03 não são revogação garantida.

**P0-D — compromisso parcial da tela:** método NULL; categoria AMBOS oferecida embora A2 exija RECEITA; preço editável não é valor canônico; agendas livres podem divergir do generator imutável; fiscal em segunda transação falha após recebível. Invalidação só no sucesso global conserva estado aparentemente não faturado. “Indeterminado” convertido em false não comprova isenção.

**P0-E — continuidade operacional:** criação manual OS direta sem contrato recuperado; criação entrega por item/reserva/expedição/compensação não atômica, falha expedição só warning. Fechar DML agora interromperia telas; liberar wrappers agora contorna dependências não provadas. Definir mapeamento de cada ação existente, inclusive em_rota, cancelar e retorno, antes da migração.

**P0-F — gates de produto/tenant:** envase `ENVASE_TRANSITION_REVIEW_PENDING`; B2B/onfarm/reserva parcial recusados nos candidatos. Plano completo inclui B2B, mas A2 contém deliberadamente origens externas/cumulativas; não anunciar A2 como cobrança B2B final. Fiscal itens exige isolamento via nota-pai; contabilidade/tributação reais bloqueiam prontidão.

```text
Atestação/pinos atuais + revisão da exposição financeira
   → compatibilidade consumidores (pacote independente abaixo, INATIVO)
   → contrato criação OS/ações entrega sem substituição paralela
   → composição locks A2 + motor/ledger e revogação
   → transição CQ/envase e contrato B2B/onfarm revisados
   → instalação independente com PRE/POST atuais
   → migração/publicação coordenada consumidores
   → fechamento DML somente com todos callers migrados
   → higiene anon + JWT/browser A/B completo
   → fiscal de homologação; fiscal/contabilidade reais continuam pendentes
```

Etapas 3/4 podem receber inventário/testes independentes em paralelo, mas não implantação antecipada sem prova de compatibilidade. Não impor uma ordem única de todos locks filhos por frase genérica: cada cadeia deve provar a ordem completa, gate antes de esperas de autorização e revalidação após cada espera.

## 5. Próximo pacote independente: compatibilidade e recuperação dos consumidores

**Selecionado para preparação futura:** recorte da Etapa 6, diálogo financeiro existente + especificação/testes de criação OS/entrega. Neste lote apenas documentação/testes existentes; nenhum patch runtime/candidato SQL novo. Backend A2 continua separado e NO-GO.

### 5.1 ConfirmarEntregaFinanceiroDialog

- Mesma tela; leituras prontas/autorizadas por ator/tenant/entrega/época, ocultar cache em erro/403 e reconsulta explícita sem reload. Catálogos globais permanecem globais; fence do consumidor não inventa tenant de categoria/método.
- Método existente ativo obrigatório, categoria global RECEITA ativa, valor canônico observado; não inferir preço B2B do produto. Não oferecer agenda arbitrária como suportada por A2: equivalência ao generator ou conflito revisável, sem apagar parcelas.
- Captura/trava síncrona por tentativa; verificar escopo após cada await, inclusive invalidação e callback. Validate UUID do retorno string atual e leia título sob autorização; **não exigir envelope que a assinatura atual não retorna**. Sem novo reader/RPC especulativo.
- Estados explícitos: não enviado / rejeitado / resultado incerto / recebível confirmado / fiscal pendente. Confirmação financeira persistida não vira erro total se fiscal falhar; invalidar/reler somente cache do contexto correto e nunca gerar título novamente automaticamente.
- Resultado incerto conserva intenção para consulta, sem re-dispatch até prova canônica. PT409 preserva revisão/rascunho; revisão nova só por reconsulta e confirmação do usuário. Timeout/40001/55P03 genuínos não são retry financeiro autorizado.
- Fiscal exigido não prova emissão pronta; retomada fiscal apenas no contrato já autorizado, sem emissão real nem mudança tributária/isenção presumida.

**Testes a adicionar nesse próximo pacote:** QueryClient real com SDK/Auth simulados: método ausente/inativo, categoria AMBOS negada, agenda divergente, UUID inválido, dupla submissão, ACK perdido, falha fiscal após título, nenhuma geração repetida, cache com erro 403, troca ator/tenant/época durante RPC/invalidation, fechamento/reabertura e conflito sem rebase. Estes testes ainda não foram implementados/executados neste lote.

### 5.2 Criação OS/entrega — dependência explícita, não nova API

- Distinguir cadastro manual, conversão visita e origem pedido B2B. Documentar assinatura realmente existente para cada ação; ausência de RPC manual é bloqueador, não licença para inventar endpoint.
- Preservar tela e rascunho; não trocar INSERT OS por RPC visita/cockpit que tenha outra autoridade/origem. Eventual extensão do contrato único precisa de revisão própria antes de runtime.
- Entrega: servidor deve dominar reserva/expedição/criação por contrato canônico; compensação best-effort não é atomicidade. Sem fallback direto quando wrapper está fechado; disponibilidade precisa vir do contrato/gate vigente, sem criar bypass.
- Checklist futuro de testes: falha no item N sem entrega/reserva parcial; expedição falha sem sucesso aparente; cancelamento/retorno/CAS; envelope inválido; perda de resposta/replay; ator alterado durante awaits; anexos persistidos não removidos arbitrariamente. Provas locais não concedem EXECUTE.

## 6. Validação deste lote e limites

- `bun run test -- src/test/security/h9d-inventario.static.test.ts src/test/entregas/registroEntrega.test.ts src/test/entregas/validarEntrega.test.tsx src/test/cockpit-laboratorio/consultaOnly.test.tsx`: **4 arquivos, 85/85 PASS**. Inventário estático e UI/transporte simulados; warnings act/React Router presentes. Não testa a correção futura do diálogo financeiro.
- `sha256sum -c SHA256SUMS` na pasta A2: **22/22 OK**; integridade dos artefatos, não SQL instalado.
- A2 **76/76**, estoque/envase **46/46**, Etapa 5 **39/39**, composto **31/31**: resultados históricos locais distintos, não somados como cobertura integrada, nem reexecutados neste lote. Composto simula motor/cobrança/Auth/schema; A2 carrega apenas parte dos triggers LIVE.
- Nenhum teste browser/JWT real, fluxo financeiro real ou typecheck/build manual: runtime não mudou. Não inventar certificação pela ausência de erro de preview.
- Contabilidade real, fiscal real, SU-518022 e release estoque/envase/entrega permanecem pendentes. Critério final: recibos independentes atuais de instalação, UI publicada e cadeia A/B real, nunca checklist sintético sozinho.