# Leitor V2 — cobertura da impressão digital e limite ABA (revisão eceeb0e2)

Análise estática (migrations do repositório + pacotes B4/composição). ACL/corpos LIVE não foram relidos nesta rodada.

## Cobertura: tabelas lidas pelo leitor e pelo motor B4 (corpos composição feb815603)
| Tabela | Lida por | Na impressão digital |
|---|---|---|
| public.accounts_receivable | leitor, proven/allocation/legacy | sim (`ar`) |
| public.accounts_receivable_installments | leitor, proven/allocation/legacy | sim (`ari`) |
| public.receivable_payments | legacy | sim (`rp`) |
| public.financial_audit_log (INSERT de parcela) | legacy | sim (`fal`) |
| public.partner_accounts | leitor, legacy | sim (`pa`) |
| public.partner_orders | leitor, legacy | sim (`po`) |
| public.partner_order_financial_links | legacy | sim (`pofl`) |
| public.partner_order_payment_schedule | legacy | sim (`pops`) |
| platform_private.price_schedule_snapshots | proven, allocation, legacy | sim (`pss`) |
| platform_private.b2b_document_allocations | leitor, allocation, legacy | sim (`da`) |
| platform_private.b2b_authorized_documents | allocation | sim (`ad`) |
| platform_private.b2b_allocation_reversals | leitor | sim (`rv`) |
| platform_private.b2b_financial_forecasts | leitor | sim (`ff`) |
Fora: profiles/user_roles/saas_features (autorização verificada uma vez no início, como os demais leitores).

## ABA = linha inserida E apagada, ambas confirmadas, dentro de uma execução do leitor
UPDATE ou DELETE de linha pré-existente sempre muda a impressão (ctid/xmin novos ou linha ausente). O que não é detectado: uma linha nova que é confirmada e depois apagada com commit, as duas coisas dentro dos poucos milissegundos de uma execução.

| Tabela | DELETE pelo app autenticado | Writers com DELETE encontrados |
|---|---|---|
| accounts_receivable / installments | sem GRANT DELETE; trigger BEFORE DELETE (h6d) | DELETE de parcelas em gerador antigo removido em 20261007134548 (no-deletion) |
| receivable_payments | REVOKE DELETE (h6d) | nenhum |
| partner_order_financial_links | sem GRANT DELETE; trg_block_pofl_delete | nenhum |
| partner_orders | sem GRANT DELETE; trigger BEFORE DELETE | migrations pontuais 20260624 (one-off, não são writers) |
| partner_accounts | sem GRANT DELETE | nenhum |
| partner_order_payment_schedule | sem GRANT a authenticated | proposta/repropostas de termos (20260729*): DELETE+INSERT na MESMA transação → linhas novas, impressão muda; afeta só pedidos antes de NF, que o leitor não usa para valor |
| financial_audit_log | — | prune h8e: só linhas antigas (cutoff), nunca uma recém-inserida → muda a impressão e o leitor recalcula |
| tabelas B4 platform_private | sem grant de cliente; triggers imutáveis (update/delete/truncate) | nenhum |
| b2b_financial_forecasts | sem grant de cliente | writers privados de previsão: UPDATE de estado, sem DELETE no pacote |

Conclusão: nenhum caminho legítimo do app foi encontrado que faça INSERT+DELETE confirmado de linha do escopo dentro de uma leitura. Sem reprodução mínima de mistura por DELETE legítimo. Restam owner/SUPERUSER/service_role com DML direto (fora do app) e writers LIVE que difiram dos fontes do repositório. Não é atomicidade global: é detecção de mudança confirmada no escopo, com no máximo 3 tentativas.
