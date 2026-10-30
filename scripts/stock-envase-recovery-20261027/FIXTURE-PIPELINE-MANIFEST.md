# Fixture canônica AR Bio — manifesto (REVISÃO, NÃO EXECUTADO HOSTED)

TESTE SEM VALOR COMERCIAL. Testa com claims autenticadas, não com JWT de navegador; a prova positiva de Storage continua separada, com sessão real.

- Script: `fixture-arbio-pipeline.sql.review` (sha256 `53ce5e74dcc008fba7975c880e94a075d5e8b23be6535520a39f9964d6a62f76`)
- Ensaio local: `test_pipeline_pg.py` → `test-pipeline-results.json` (**26 PASS / 0 FAIL**, 278 s), log `test_pipeline_pg-current.log.txt`
- Base local: restauração completa capturada + `release-combined` aplicado (a566faa4) + POST proof + install/POST v2.
- Nenhuma linha do fluxo foi criada com replica, gatilho desativado ou status forçado. Só os dados-mestre que já existem hosted (empresa, usuários, papéis, assinatura, cliente, fazenda, talhão, produto, referência CQ) foram carregados localmente.

## Caminho canônico executado
INSERT da OS `aberta` via RLS (mesmo payload de `OrdensServico.tsx`) → `rpc_aprovar_os_v1` → `rpc_programar_os_v1` → `rpc_cockpit_gerar_lote_v1` → `rpc_avancar_esteira_laboratorio(enviar_cq)` → `(registrar_cq, dados_sinteticos)` → `rpc_cockpit_registrar_envase_v1` (v2) → `rpc_cockpit_criar_entrega_v1` (grupo) → `rpc_entrega_cancelar_v1`.
O EXECUTE temporário dos três writers ainda não liberados é dado e revogado dentro da mesma transação, antes do COMMIT. O POST confirma que ficou fechado.

## Achados que viram pré-condição ou decisão (sem fabricar)
1. **Referência CQ é catálogo global**: `authenticated` não tem privilégio na tabela, e a tela também bloqueia. A fixture exige uma referência **existente, ativa e completa** do produto. Se não existir, a fixture PARA (`FIXTURE_PRE_REFERENCE_INCOMPLETE`): criar uma referência é decisão do Platform Superadmin.
2. **Produto** precisa ter `familia_catalogo='biologico'` (`lab_item_is_manufacturable`).
3. **`assumir_producao` está fechado no LIVE** (`CQ_OPERATION_CLOSED`). O lote é gerado a partir de programada/aguardando.
4. **Aviso interno aprovado (30/10/2026, autorização humana: "Autorizar somente o aviso interno identificado como teste")**: `trg_notify_lab_on_programacao`/`fn_notify_lab_on_programacao` grava "Nova demanda de produção" em `notificacoes_operacionais` para usuários elegíveis da AR Bio. A aprovação cobre só esse aviso, desta OS sintética e deste tenant; não cobre outro aviso, tenant, e-mail, cobrança, fiscal ou operação real. O gatilho não é desligado. O título é fixo no gatilho e não leva a marca; a marca entra na mensagem pelo nome do cliente. Por isso a pré-condição exige um cliente sintético com nome contendo `TESTE SEM VALOR COMERCIAL` (`FIXTURE_PRE_CLIENT_NOT_TEST_MARKED`), e o pós-check exige que todo aviso novo seja `nova_demanda_producao` com a mensagem marcada (`FIXTURE_POST_NOTIFICATION_NOT_TEST_MARKED`). `accept_inapp='true'` continua obrigatório; sem ele, tudo é desfeito.

## Pré-condições verificadas pelo PRE (falha fechada)
v2 instalado; capability não instalada; grants de baseline fechados; empresa `007bb519-…0048`; admin `a7d45277-…f39f` ativo, administrador, sem papel B2B/superadmin e sem `partner_users`; cliente/fazenda/talhão da empresa; produto fabricável; referência completa. O hash de `accounts_receivable` é impresso (`FIXTURE_PRE_FIN_HASH`) para comparar com o valor registrado (5 recebíveis, `9c1f86a6…`). A fórmula externa do hash não foi confirmada; o POST exige igualdade dentro da transação.

## POST (falha fechada)
Contagens iguais em recebíveis/parcelas/recibos/documentos/NF/eventos fiscais/outbox/eventos de comunicação/faturamento-base/portal; hash de recebíveis igual; aviso interno só da OS e da empresa; entregas sem `receivable_id`/`partner_order_id`; tenant da OS = AR Bio.

## Retenção (linhas criadas, identificadas por `FIXTURE_IDS`)
| Tabela | Linhas | Rótulo |
|---|---|---|
| ordens_servico | 1 (termina `pronto_entrega`) | por ID (sem coluna de texto) |
| programacao_producao | 1 | por ID |
| lotes | 1 | `observacoes_tecnicas`/`responsavel_producao` TESTE SEM VALOR COMERCIAL |
| controle_qualidade | 1 | `responsavel` DADOS FICTICIOS SEM VALOR COMERCIAL |
| envase / estoque_produto | 1 / 1 | operador TESTE |
| estoque_movimentacoes | entrada, expedicao, estorno_expedicao, cancelamento_reserva | ledger imutável |
| entregas | 1 cancelada | motorista TESTE |
| laboratorio_esteira_eventos | eventos da esteira | por OS |
| notificacoes_operacionais | 1 por destinatário do laboratório | aviso interno |

Não há limpeza destrutiva: ledger, CQ, eventos e histórico são mantidos. Remover qualquer linha exigiria um pacote revisado à parte.

## Isolamento testado
O admin FSF com IDs da AR Bio é barrado no PRE. Cliente/fazenda FSF também são barrados. O admin FSF não lê a OS nem o lote (RLS) e tem o writer negado. O admin AR Bio lê a própria OS. Referência incompleta → nenhuma linha parcial é gravada.


## Revisão ad528283 (30/10/2026) — identificadores hosted e baseline
- Parâmetros exatos em `fixture-arbio-pipeline-params.psql` (achados read-only do auditor): org `007bb519…`, admin `a7d45277…`, cliente `8b138956…` "TESTE AUDITORIA B2B CLIENTE CONTROLE 20261009", fazenda `ff35e2a0…`, talhão `a3144e03…`, produto `1986af48…` "TESTE AUDITORIA BIOLOGICO APLICACAO 20261019" (ativo, biológico), referência `681dfe6d…` (ativa, completa, DADOS FICTICIOS SEM VALOR COMERCIAL). **Nenhuma escrita ou permissão no catálogo global é necessária.** `authenticated` pode LER a referência; só a escrita é negada (texto anterior corrigido).
- PRE: nomes exatos de cliente/produto iguais aos fixados e começando por `TESTE AUDITORIA` ou `TESTE SEM VALOR COMERCIAL` (`FIXTURE_PRE_NOT_TEST_MARKED`); apenas os quatro gates SaaS `estoque_embalagens`, `envase`, `ordens_producao`, `lotes_qualidade` (`FIXTURE_PRE_SAAS_GATES`); baseline financeiro da AR Bio `md5(jsonb_agg(to_jsonb(r) ORDER BY r.id)::text)` = `9c1f86a6ccec0f8c233d17994294af12` com 5 linhas (`FIXTURE_PRE_FIN_BASELINE_DRIFT`). POST mantém contagens/hash global iguais.
- POST do aviso: tipo `nova_demanda_producao`, título fixo do gatilho, mensagem começando por `<produto> · <cliente>` exatos. A mensagem hosted trará "TESTE AUDITORIA…", não o texto literal "SEM VALOR COMERCIAL" (vem dos nomes já existentes; nenhum dado é alterado).
- `cancel='false'` é o padrão hosted: entrega fica `separado` para o upload real; cancelar depois pelo `rpc_entrega_cancelar_v1` canônico.
- Estado exato (ensaio local): retida → movimentos `entrada`, `expedicao`; estoque `expedido`, qtd 1, reservada 1, ainda da OS. Após cancelar → mais `estorno_expedicao` e `cancelamento_reserva`; estoque `disponivel`, qtd 1, reservada 0, **sem vínculo à OS** (o cancelamento libera a reserva da OS; esse é o comportamento atual do motor).
