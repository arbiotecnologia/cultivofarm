# Continuação 01:33 — caminho mínimo, não clone integral

**Alvo exclusivo:** `vrlcdwmlytukrjezrrnf`. Sem remoto, produção, publicação, cópia de dados ou chamadas externas.

## Resultado executável

Etapa A aditiva gerada por `generate_closed.py`:

1. `01a-pre-foundation.sql.review` — PRE em transação, ausência exata dos objetos novos, UUID/PK do pedido, marcador fiscal homolog/OFF, cron zero, impressão dos sete event triggers aprovada pelo auditor.
2. `01b-install-foundation-closed.sql.review` — repete PRE dentro da mesma transação, cria seis relações privadas e sete funções privadas. Forecast/eventos imutáveis, gates de criação/ciclo desligados, allowlists vazias, zero EXECUTE/DML cliente. POST e invariância dos escritores/policies/ACL/papéis existentes antes de COMMIT.
3. `01c-post-foundation.sql.readonly` — objetos/RLS/ACL fechados, gates/allowlists/forecast/eventos vazios.
4. `01d-rollback-foundation-deny.sql.review` — só fecha gates/revoga funções; preserva estrutura e eventual história, nunca restaura corpo inseguro.

**Esta etapa não permite cancelar ou criar previsão.** Não instala leitor/ação pública, não substitui aprovações, pagamento, callback ou início fiscal. Retorna um avanço parcial real, não uma implantação completa do candidato.

Execução pelo auditor, somente após revisão dos bytes e confirmação do ref:

```text
psql <CONEXÃO JÁ CONFIGURADA PARA HOMOLOG, SEM DSN NO HISTÓRICO> -X -v ON_ERROR_STOP=1 -v approved_event_trigger_md5=<HASH APROVADO DA CAPTURA EXISTENTE> -f 01a-pre-foundation.sql.review
psql <MESMA CONEXÃO HOMOLOG> -X -v ON_ERROR_STOP=1 -v approved_event_trigger_md5=<MESMO HASH> -f 01b-install-foundation-closed.sql.review
psql <MESMA CONEXÃO HOMOLOG> -X -v ON_ERROR_STOP=1 -f 01c-post-foundation.sql.readonly
```

`event-trigger-pin.sql.readonly` contém somente a expressão para conferir o hash da captura específica; não é novo inventário geral. O valor pode ser calculado pelo auditor dos sete objetos já capturados. Não usar GUC como prova de alvo/autoridade. O marcador existente deve conter apenas homolog com emissão OFF; se ainda aponta original, o PRE aborta e **não o altera**.

## Definições recuperadas exatamente

Busca computada em PostgreSQL descartável por `md5(pg_get_functiondef)` sobre variantes locais, sem executar os corpos. Seis matches:

| Função | MD5 homolog | Fonte local exata |
|---|---|---|
| approve_partner_order | `778476b1d93df2069f78f1426823e106` | H4b, `matched/approve_partner_order.sql` |
| approve_b2b_credit | `9909cf85ef63a2adf3358ad71d20c73c` | H4b, `matched/approve_b2b_credit.sql` |
| approve_b2b_payment_terms_secure | `5fa8f5b2894ade8f6a6b4eb275961916` | migração 20260707205529, `matched/approve_b2b_payment_terms_secure.sql` |
| rpc_register_receivable_payment | `f59c6c09309dfa8bb5fedfa53f0873d0` | H6b, `matched/rpc_register_receivable_payment.sql` |
| rpc_fiscal_invoice_apply_authorization_v1 | `9c94985d80502c8aea8bfb5da3abdecd` | H12, `matched/rpc_fiscal_invoice_apply_authorization_v1.sql` |
| rpc_fiscal_sefaz_transmit_record_v1 | `e340a643e46c6cc0dea0fcebd207f612` | H13, `matched/rpc_fiscal_sefaz_transmit_record_v1.sql` |

Essas fontes recuperadas são **baseline de comparação, não arquivos para reinstalar**. Busca final de 68 variantes e caminhos/SHA completos em `evidence/canonical-body-matches.json`. Catálogo descartável usou tipos compostos vazios e check_function_bodies=off apenas para medir hash; não prova JWT/RLS nem execução fiscal/financeira.

## Somente três definições indispensáveis ainda ausentes das fontes com o hash informado

`02-required-definitions.sql.readonly` seleciona somente:

- `public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid,uuid)` — `96f6f30724c829cd4a78ce232bd5c84a`.
- `public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)` — `a518f355f035d485f720419e05e89906`.
- `public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)` — `b8fbd43d7a019fbf2f12d572bd79ba60`.

Não há pedido de repetir 01–05. A captura completa de ACL/constraints/policies/sete event triggers mencionada não veio como arquivo nesta mensagem: recebemos hashes/nomes de colunas, não seus valores integrais. Para fixar deltas nas relações existentes, usar os trechos **já capturados** de accounts_receivable/installments/payments, partner_orders/items/payment_terms/schedule, fiscal_invoices/items/events/transmissions e dos event triggers, sem nova consulta geral. Sem esses valores não inventar PRE de ACL, tipos/NOT NULL/constraints ou corpos de guardas.

## Menor cadeia seguinte e incompatibilidades reais

**B — Condição/origem imutável:** reusar condição canônica e motor financeiro privado para um pedido novo autorizado, com calendário e snapshots reais da fixture. Nada de inserir forecast/título final ou backfill de pedido histórico. Homolog tem simulate_b2b_payment_plan_secure, mas não simulate_b2b_payment_condition_secure/create_partner_order_condition_secure e suas snapshots. A receita anterior `fixture_source.py` não é executável nesse baseline; permanece inativa.

**C — B4/ponte e fechamento fiscal:** instalar só alocação/proveniência/money-reader/bridge necessárias, não estoque/envase/entrega. `accounts_receivable.b2b_document_id` deve referenciar b2b_authorized_documents, não ser FK improvisada em fiscal_invoices. Reconciliar idempotency_key de pagamentos e protocol_c_stat da transmissão: campos ausentes no inventário, mas exigidos pelos corpos canônicos. H6b recuperado já consulta idempotency_key, ausente no campo reportado: não executar pagamento antes de resolver essa incompatibilidade com captura de constraints/índices.

**D — Hooks e cancelamento:** deltas sobre os seis corpos recuperados e os três específicos acima, mantendo ticket/escopo/reautorização e ACL estreita. Aprovação homolog H4b põe ready_for_production=true e cria notificações; envolver somente com forecast não torna isso seguro. O recorte requer contener efeitos indesejados mantendo os guardas reais. Apply H12 do alvo não confere sozinho toda a transmissão/tenant e callback não gera título B4: não tratá-lo como autorização completa só pelo nome v1.

**Incompatibilidade adicional do próprio candidato:** sua capacidade permite `aprovado_previsto`/`faturado_parcial`, mas o DDL/helper canônico recuperado cria `aguardando_fiscal` e não inclui aprovado_previsto. Portanto UI residual sem faturamento não abre sobre essa fundação. Isso precisa delta explícito e teste concreto, não modificar estados ou alegar que a instalação basta. A etapa A conserva o estado canônico e não publica capacidade.

**E — Sessões reais + simulador:** homolog-only provider adapter deve receber intenção registrada, ator/tenant/RBAC atuais e concessão curta exata; retornar cStat 100/135/155 simulado via callback privado, sem HTTP externo e sem GRANT service-only à sessão. NF/título/parcela derivam dos comandos canônicos; R$1 deve persistir por payment RPC antes do callback final em outra transação. Não implementado/ativado enquanto B–D não estiverem provados.

Para as alternativas: **não é obrigatório clone limpo nem replicar toda produção**. A fundação A é independente. Se não for autorizado reconciliar os guardas/constraints e snapshots existentes de B–D, uma base limpa separada evitaria sobrescrever baseline histórico, mas seria outra decisão e outro alvo; não criada. Manter homolog atual é o caminho recomendado sob revisão pontual, não repinning genérico.

## Evidência

- `evidence/foundation-roundtrip.json`: **18/18** — PRE/INSTALL/POST/rollback/reinstalação limpa descartável, DML/EXECUTE negados, replay instalador negado, marcador produção/cron ativo/event-trigger drift negados antes do DDL. Sete event triggers sintéticos declarados; corpos reais do homolog não foram carregados. Invariância exclui apenas gatilhos internos da FK nova no pai; gatilhos de negócio permanecem pinados.
- Sem títulos, pagamentos, estoque ou usuários sintéticos inseridos nessa rodada. A reinstalação limpa remove somente schema da base descartável; rollback entregue nunca remove objetos/história do alvo.
- Não executado: fluxo cancelamento autenticado, B4 integrado, fixture fiscal real/simulada hospedada, browser da cópia, typecheck separado. Suíte UI anterior continua evidência isolada, não GO homolog.
- Hashes gerados em `SHA256SUMS`, inclusos fontes/SQL/evidências; instalação operacional completa permanece bloqueada pelas três definições e pelos trechos estruturais já capturados, não por nova decisão comercial.