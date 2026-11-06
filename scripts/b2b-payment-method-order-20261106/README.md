# B2B_PAYMENT_METHOD_V1 — escolha do meio de pagamento pelo comprador (B3)

Status: **PAUSADO — não candidato a instalação** até reconciliar com B2B_PAYMENT_CONDITION_V1 (ver RECONCILIATION-PRIOR-CANDIDATE.md). **NÃO APLICADO.** Nenhum SQL remoto, publicação, cadastro de meio, cobrança, documento ou envio.
Leituras de produção feitas somente em `swzpzcwiasxmjutrmvkm` (read-only) em 2026-11-06.

## Estado LIVE que motivou o pacote
- `payment_methods` é global (id, name, active): ativos "Boleto bancário" e "AUDIT-AR-20260922 - Sem transferencia".
- `commercial_payment_plans` é global; não tem meio de pagamento. Vínculo ao parceiro por `commercial_payment_plan_assignments`.
- `create_partner_order_secure` (c34e7404) não recebe meio; para comprador externo usa `installment_count` do plano e grava
  `partner_order_payment_schedule` com `current_date + max_days` (+30 d) — datas pré-NF (divergência B4, não alterada aqui).
- `generate_b2b_receivable_secure_impl` usa `partner_financial_settings.default_payment_method` (texto) e grava
  `partner_orders.payment_method = COALESCE(default,'pix')` (fallback a remover no B4; não tocado aqui).

## O que o pacote instala (02)
| Objeto | Papel |
|---|---|
| `public.b2b_payment_method_configs` (+ `_versions` append-only) | condição × meio **por empresa vendedora**, `version` CAS, 6 tipos no modelo; promissória/crédito nunca `active` (CHECK) |
| `public.partner_order_payment_method_snapshots` | snapshot imutável por pedido: config/versão/tipo/nome/dias/parcelas/taxa, `due_basis='nf_issue'`, `schedule_estimated=true` |
| `platform_private.b2b_payment_method_order_receipts` | idempotência do meio (chave do pedido + fingerprint config/versão/tipo/n) |
| `b2b_payment_method_config_save/list` | escritor/leitor do vendedor (admin/financeiro; empresa por h15; sem parceiro/técnico/superadmin) |
| `b2b_list_payment_method_options_secure` | opções do comprador (vendedor via `b2b_partner_catalog_reader`, condição publicada ao parceiro) |
| `simulate_b2b_payment_plan_with_method_secure` | revalida config e chama a simulação LIVE; acrescenta parcelas **estimadas** |
| `create_partner_order_with_method_secure` | mesmo lock de idempotência do LIVE, trava config `FOR SHARE`, chama o create LIVE, grava snapshot e recibo |
| `get_partner_order_payment_method_secure` | leitura do snapshot com as mesmas portas do leitor de condição instalado |
| constraint trigger `b2b_payment_method_required` (DEFERRED) | pedido criado por comprador externo sem snapshot falha no COMMIT: `B2B_PAYMENT_METHOD_REQUIRED` |

Regras: pagamento único (dinheiro/Pix/débito) = 1 parcela em base + `due_days` por condição; boleto 1..3 quando o plano tem
essa quantidade e a configuração permite; Price exige taxa explícita (`price_monthly_rate_percent`) e plano **sem** juros
próprios (`payment_method_price_interest_conflict`); parcelas vêm do plano, nunca do cliente. Meses seguintes no mesmo dia
ou último dia do mês. **Dias úteis Paracatu-MG + nacionais não são aplicados na estimativa** (B4, calendário selado).

## Ordem de implantação (decisão do auditor)
1. 01 PRE → 02 → 03 POST. A partir do COMMIT, o frontend publicado (29e9706) **não consegue criar pedido** como comprador
   externo (erro explícito). Publicar o frontend deste pacote logo depois; antes disso o vendedor precisa configurar meios
   (nenhuma configuração é criada pelo pacote).
2. Rollback 04: RPCs novos negam; exigência permanece (comprador externo bloqueado até nova revisão); dados preservados.

## Evidências
- `test-local-pg.py` → `evidence-local-pg.json`: **81/81** em PG descartável, estado instalado (cart fence 9c99095 + V2)
  reproduzido; corpos REAIS simulate/reader/h15 conferidos por md5 = LIVE. Costuras declaradas: create e leitor de condição
  (stubs), has_role/auth.uid/features do harness base. Não prova JWT/RLS/PostgREST hospedado.
- `fn-md5.json`: md5 dos corpos instalados/negação medidos no PG; `generated-md5.json`: md5 dos arquivos 01–04.
