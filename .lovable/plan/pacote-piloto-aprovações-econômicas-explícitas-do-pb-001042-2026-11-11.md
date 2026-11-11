# Pacote piloto: aprovações econômicas explícitas do PB-001042 (somente espelho)

## Objetivo
Permitir, apenas para o piloto AR Bio escopado, registrar **aprovação comercial** e **aprovação de crédito** explícitas (autor + data, perfil competente, carteira/tenant verificados) num pedido sob `C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1` em `quote_responded`, e criar **uma** previsão (não exigível) + **um** evento quando ambas existirem — sem mexer no status operacional do pedido nem remover o bloqueio C2 global.

## Premissas (corrigidas)
- Aprovação comercial = aprovação do **pedido** (`public.approve_partner_order`), distinta da aprovação de termos; crédito = `approve_b2b_credit`. Corpos LIVE ficam intocados e continuam recusando o contrato C2.
- Pedido está `em_analise_comercial`; `quote_responded` é evento único do histórico (não status) e não é reescrito.
- Evidência econômica = linha de `platform_private.b2b_order_condition_quote_snapshots` (boleto, `due_basis=nf_issue`, estimado, principal e total 20) com vínculo exato de termos, organização, parceiro e ator de venda; incompleta/divergente → recusa.
- `00 10 01 11` = matriz (comercial, crédito) na camada econômica do piloto: só `11` cria previsão; `10`/`01` só registram; `00` nada.
- `c2_accounting_pending_guard` (669b1949) e o bloqueio C2 global ficam iguais: nenhuma marca operacional ou fiscal em `partner_orders` (status, `approved_at`, `credit_approved_at`, `internal_economic_snapshot`, `receivable_generated`, `ready_for_production`).
- Núcleo legado que aceita `reason_code OK` sem assinatura: para pedidos do piloto, toda nova criação de previsão/evento por **qualquer** entrada é negada, exceto o core do piloto com ticket privado de transação após as duas aprovações assinadas; demais pedidos e o núcleo legado ficam como estão.
- Previsão reutiliza a composição forecast/B4 revisada (pré-NF, não exigível); criação de previsão segue OFF em produção e só o piloto a liga via allowlist própria.

## O que será construído
1. **Ledger privado de aprovação econômica** (`platform_private.c2_pilot_economic_approvals`), append-only: pedido, tipo (`commercial`/`credit`), ator, perfil, tenant, data, hash da evidência da cotação. Uma linha por tipo/pedido (índice único); revogação só por nova linha.
2. **Duas RPCs novas** `public.c2_pilot_approve_commercial_v1` / `c2_pilot_approve_credit_v1` (INVOKER → core DEFINER privado):
   - ator ativo/h15, perfil competente (comercial: gestor_comercial/admin; crédito: financeiro/admin; **vendedor negado**), tenant vendedor = dono do pedido, parceiro na carteira/tenant;
   - allowlist piloto (ator/org/pedido, validade, revogação) — fail-closed se ausente;
   - evidência econômica lida da resposta cotada real (itens 2×25 kg×R$10, total 20, boleto 1x30 0%, `payment_terms`); qualquer campo ausente/divergente → recusa;
   - "resultado automático OK" e termos `not_required` **não** contam como aprovação;
   - locks ordenados (pedido → ledger), reautorização após espera, idempotência por chave, `PT409` para conflito.
3. **Composição da previsão**: quando o segundo registro fecha `11`, cria na mesma transação 1 previsão + 1 evento via core forecast existente; replay devolve o mesmo recibo.
4. **Tela** (rota já autorizada Solicitações B2B, painel do detalhe): botões "Aprovar comercialmente (piloto)" e "Aprovar crédito (piloto)" montados só se a capability de leitura confirmar elegibilidade; mostra autor/data e que fiscal/cobrança/envio seguem bloqueados.
5. **Pacote** `scripts/c2-pilot-economic-approval-20261111/`: `00-pre`, `01-install`, `02-post`, `03-rollback` (deny-only, preserva ledger/previsões), `04-pilot-enable` **separado** (allowlist), `AGENTS.md`, `SHA256SUMS`, evidências.

## Testes (Postgres descartável, espelho com corpos LIVE capturados)
- Pedido criado pela entrada normal e cotado pelo writer real (não por mutação de snapshot), dentro das regras atuais do leitor e permissões.
- Tentativa pelo núcleo legado com `reason_code OK` sem assinatura no pedido do piloto → negada, sem efeitos.
- Matriz 00/10/01/11 nas duas ordens; replay; duas conexões concorrentes no último aprovador → exatamente 1 previsão e 1 evento.
- Negativas com motivo/SQLSTATE: vendedor, outro tenant, fora da carteira, sem allowlist/revogada/expirada, evidência incompleta, RPCs LIVE ainda recusando, tentativa de alterar status.
- Nenhum título, NF, cobrança, envio, reserva ou entrega; 38 gatilhos e MD5 B4 preservados; leitores históricos (Financeiro 051e9d14, carteira Vendedor) inalterados.
- Rollback + reinstalação; testes da tela montada; typecheck/vitest dirigido.

## Dependências reais ausentes (serão listadas no relatório)
- Usuários reais com perfis comercial e financeiro da AR Bio para a homologação (não serão criados).
- Captura LIVE do core de previsão e do flag de criação off, se não houver no projeto.
- Prova JWT/RLS real após instalação pelo auditor.

Instalação somente pelo auditor após aprovação dos testes. Nada remoto, sem publicação, sem emissão/cobrança/envio.
