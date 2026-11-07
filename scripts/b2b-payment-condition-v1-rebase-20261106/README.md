# B2B_PAYMENT_CONDITION_V1 — rebase sobre o create LIVE c34e7404 (B3)

Status: **NÃO APROVADO PARA IMPLANTAÇÃO; NÃO APLICADO.** Só código e PostgreSQL descartável. Nada remoto, publicado,
cadastrado, cobrado, emitido ou enviado; PB-001036/teste4 intocados.

## Decisão aplicada (auditor, 2026-11-06)
Rebasear a candidata comprovada `scripts/financial-price-generator-20261029/integration/schema.sql.review` (sha256
`b1416978…`, 14103 caracteres) e `build.py` (sha256 `0210f7ad…`, 13768) — byte a byte iguais ao projeto isolado
aec6d152 ref 301bf597 e ao original ref d5aa368, conforme leitura do auditor — sobre os corpos LIVE. O contrato rev.2
`B2B_PAYMENT_METHOD_V1` (`../b2b-payment-method-order-20261106/`) virou histórico. O PRE aborta se ele, ou o create antigo
de 10 argumentos da candidata, estiverem presentes.

## Origem de cada parte
| Parte | Origem | Deltas |
|---|---|---|
| `b2b_condition_versions` | candidata | V1 prazo `DEFAULT 30` personalizável (0–3650); V2 taxa finita ≤100, 6 casas; V3 calendário fora do B3 (nulo); V4 boleto ≤3 **sem** prazo fixo 30; taxa explícita em 1x só para boleto/promissória/crédito; dinheiro/Pix/débito seguem 1x sem juros |
| `b2b_condition_assignments`, `b2b_condition_retirements` | candidata (verbatim) | + colunas de autoria/data |
| `b2b_order_condition_snapshots` | candidata | N1 cotação (sem valores), termos, hash, nome do meio, estimado/base NF; N2 FK para a versão |
| `b2b_choice` | candidata (verbatim) | — |
| `b2b_resolve_condition` | candidata | R0 parâmetro de trava; R2 vendedor canônico + travas + releitura; R3 revogação por parceiro; R4 versão obsoleta, meio ativo, categoria RECEITA ativa, plano sem juros próprios, prazo ≤ plano, atribuição comercial publicada; R5 crédito explícito validado no helper próprio; R6 retorno reduzido |
| `b2b_schedule` (Price) | candidata | P0 sem calendário; P1 datas nominais marcadas estimadas; Price original aceita n=1 com taxa explícita, sem taxa/default novo |
| create / simulate com escolha | **LIVE** c34e7404 / 37d4f45e | C0–C13 / S0–S10 (generate.py), sem capturas antigas de catálogo/embalagem; crédito sem COALESCE/EXCEPTION OTHERS |
| resposta de cotação | **LIVE** e57d3a64 | Mesma RPC: ramo condicionado recalcula Price, snapshot/recibo append-only, idempotência e reautorização; legado fora da ativação preservado |
| ativação por empresa, revogação por parceiro, escritores, leitor de opções/pedido, gatilho deferido | novos | — |
| gate fiscal, documentos, títulos, permits, calendário Paracatu | **fora (B4)** | continua fechado |

## Uma verdade monetária
Após carrinho LIVE, `b2b_schedule(líquido, taxa, n, hoje, prazo)` gera as parcelas; total = soma; juros = total − líquido.
O mesmo total alimenta crédito LIVE, hash (`fn_b2b_cart_hash` LIVE + escolha + condição reduzida + total), pedido, termos
(taxa/parcelas da versão), cronograma, snapshot, idempotência (fingerprint inclui a escolha) e ACK. Exemplo sintético:
1000 a 1,8% em 3x = 345,40/345,40/345,42 = 1036,22 em todos os pontos. O oráculo sintético de 1x é 1018,00,
com principal 1000,00 e juros 18,00. Essa taxa existe só nas fixtures locais: dinheiro/Pix/débito continuam exigindo 1x sem
juros; boleto/promissória/crédito aceitam 1x com taxa explícita. Nenhuma taxa/default foi cadastrada remotamente.

## Ordem de travas
```text
create:  advisory b2b_idem (LIVE) -> reautorização LIVE -> replay
         -> versão FOR SHARE -> atribuição FOR SHARE -> plano FOR SHARE -> atribuição comercial FOR SHARE
         -> payment_methods FOR SHARE -> financial_categories FOR SHARE -> releitura do vendedor
         -> b2b_packaging_lock (LIVE) -> advisory b2b_credit (LIVE) -> resolve sem trava (igual ao primeiro) -> INSERT
quote:   advisory b2b_quote -> pedido FOR UPDATE -> reautorização completa ANTES de replay
         -> versão/atribuições/plano/meio/categoria FOR SHARE -> advisory b2b_credit -> itens -> reautorização
publish/retire/assign: advisory b2bcond:<org>:<plano>:<meio> -> reautorização -> versão vigente FOR UPDATE -> CAS
ativação: advisory b2bcond_act:<org> -> reautorização -> linha FOR UPDATE -> CAS
```

## Tela
Motor Comercial B2B → Meios de pagamento: administrador/financeiro publicam versões (CAS, prazo inicial 30 vindo do
servidor, taxa explícita), aposentam e liberam/revogam por parceiro; só administrador liga piloto/obrigatória; gestor
comercial consulta. No pedido, o comprador escolhe entre versões vigentes liberadas; envio exige ACK com a mesma escolha.

## Crédito explícito e cotação (revisão 194331e)
`platform_private.b2b_credit_checked` exige configuração ativa completa e limite numérico finito ≥0. NULL/ausente, negativo,
NaN/Infinity, configuração inválida e erro transitório abortam; zero explícito permanece zero e qualquer exposição positiva
o excede. A comparação usa o total Price, não o principal. A UI recusa `credit:null`/ausência de `credit_checked` e informa
indisponibilidade sem enviar.

A resposta da cotação usa a MESMA RPC LIVE. Com snapshot da condição, reautoriza o vendedor, revalida versão/atribuição,
recalcula uma única economia Price e grava snapshot econômico + recibo append-only. Replay idêntico devolve o mesmo ACK;
payload divergente é `quote_idempotency_conflict`. Antes de devolver um recibo já existente, origem, papel, perfil, tenant,
vínculo e visibilidade são revalidados depois do advisory + row lock. Origem externa/interna usa sua guarda REAL respectiva;
não há stub permissivo nem promoção de origem ausente. A ordem versão→crédito é igual à do create.

Sem snapshot, o comportamento legado permanece, inclusive a comparação original `credit_limit > 0`: zero só limita no ramo
`v_has_condition`. O rollback nega apenas o ramo com condição e não bloqueia cotação legada de empresa não ativada.

## Evidência (PG descartável, não é prova hospedada)
`test-local-pg.py` → `evidence-local-pg.json`: **185/185**, incluindo NULL/zero/negativo/NaN/erro transitório, limite entre
1000 e 1036,22 e no limite exato, cotação/idempotência/revogação, create interno positivo com fixture isolada e guards REAIS,
rollback e o oráculo de parcela única em publicação/resolução/simulação/create/leitor/persistência. UI montada: **29/29** em
`evidence/review-194331e/single-rate-focused.json`. A fixture interna tem UMA configuração fictícia VALIDADA; ao removê-la, a mesma guarda volta a negar
`B2B_INTERNAL_ISSUER_AMBIGUOUS`. Nenhuma guarda foi desligada para o positivo.

Costuras declaradas: as do harness B2, `payment_methods`/`financial_categories` mínimas, leitor de termos com portas mínimas,
pins de colunas trocados só na cópia temporária. A injeção transitória ocorre só no PG descartável e o corpo REAL de crédito
é restaurado byte a byte e conferido por md5.

Revisão 2140b058: 13 verificações novas cobrem replay com recibo existente sob revogação de papel/perfil/tenant, guards de
origem interna e externa REAIS, ordem estática e concorrente versão→crédito com create/config_publish/quote, e os dois lados
do limite zero (AR Bio com condição bloqueia; FSF legado preserva `>0`). As tentativas 183/185 e 184/185 foram preservadas;
a final passou 185/185, exit 0. Nenhuma suíte Vitest foi repetida neste delta. Evidências em `evidence/review-2140b058/`.

Suíte concorrente: a base limpa `347baf8`, com os mesmos dois workers, reproduziu exatamente **27 unhandled errors**
(760 arquivos/10.769 testes aprovados; exit 1). 25 eram a fixture `financialOpenSession` sem resposta para
`tenant_display_name_v1`; 2 eram timeouts internos `onTaskUpdate` do worker. Somente a fixture foi corrigida, sem mudança
de runtime, e seu foco passou **26/26**, exit 0 e sem unhandled errors. JSON completo, recorte de erros e exit codes estão
em `evidence/review-194331e/`. A repetição global foi interrompida por limite de janela após 114 arquivos, exit 143;
seus logs parciais estão preservados como `final-full-partial.*`, sem JSON completo e sem valor de aprovação.

Timeout `onTaskUpdate` (07/11, `evidence/vitest-ontaskupdate-20261107/`): causa comprovada — dois testes PG
(`c2-orders-origin-composition`, `c2-credit-numeric`) usavam `execFileSync` por mais de 60 s, bloqueando o event loop do
worker além do timeout RPC de 60 s do Vitest (independe do pool; `forks` já é o padrão no 3.2.4 e foi removido). Sonda mínima:
bloqueio síncrono 65 s reproduz, 55 s e espera assíncrona 65 s não. Foco pré-correção em `c59e80d` 7 arquivos/8 testes, 2
unhandled, exit 1; após converter para `execFile` assíncrono (mais cinco testes síncronos de prazo > 60 s, asserções
inalteradas) e adicionar guarda estática, foco 12/13 exit 0 sem unhandled e suíte completa em `31a6f54` 762 arquivos/10.779
testes, 6 ignorados, 0 erros, exit 0. B3 PG 185/185; typecheck 0.

## Limitações abertas
### Achado bloqueante: contagem de itens e vencimento (07/11)
O delta Q4 consumia a âncora `SELECT count(*) INTO v_count_items` sem repô-la, deixando comparações com NULL.
O gerador agora a repõe após versão→crédito e antes das guardas de vazio/duplicidade/completude; SQL gerado não foi editado à mão.
Rollback já conservava a contagem original e foi retestado com pedidos de dois itens, sem reabrir o ramo condicionado.

Bateria final **226/226**, exit 0: pedidos reais sintéticos de dois itens em INSTALL novo/legado e rollback legado;
1/2 retorna `quote_incomplete`, duplicados `quote_duplicate_line`, item estrangeiro `quote_item_not_found`, vazio
`empty_cart` com todos os triggers ativos. Cada negação compara integralmente pedido/itens/termos/cronograma/snapshots/
recibo/notificações; positivos completos persistem principal 200 e ambos subtotais 100. Rollback novo permanece deny-only.

Não foi inventada regra de prazo: publicação e resolução já recusavam `deadline_days > max_days`. Fixture publicada com
30 dias e plano posteriormente reduzido a 29 prova `payment_condition_deadline_exceeds_plan` em resolução/create/quote,
sem persistência nem clamp. Com max_days restaurado a 30, termos e primeira data do cronograma coincidem.
UI B3 **23/23**, exit 0; tipos exit 0; build observado OK. Não houve nova suíte completa, nem aprovação para implantação.
Artefatos incluindo tentativa inicial com erro de fixture em `evidence/review-quote-completeness-20261107/`;
01–04 regenerados e comparados byte a byte com o gerador e os pins finais. O PRE mantém os pins LIVE, sem captura remota.

- Datas estimadas (referência = data do pedido/resposta), sem dia útil Paracatu-MG; vencimento definitivo e calendário ficam no B4.
- Revogar um parceiro numa versão é definitivo para ela; liberar de novo exige nova versão.
- Cópia frontend adiada da candidata (`scope-audit-20261103/deferred/source/`) não foi importada; a UI atual cobre o fluxo.
- Sem JWT/RLS/PostgREST/navegador autenticado. Positivo interno é componente sintético, não E2E nem autorização de operação.
- Nenhuma cobrança, documento fiscal, aprovação ou operação posterior foi executada; PB-001036/teste4 intocados.
