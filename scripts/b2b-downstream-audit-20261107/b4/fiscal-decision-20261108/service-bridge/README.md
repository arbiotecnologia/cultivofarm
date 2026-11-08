# Ponte fiscal service-only — candidato local INATIVO/NÃO APROVADO

Preparado em 08/11/2026 sobre B4 `7dde7f07…` e a captura H12 de `rpc_fiscal_invoice_apply_authorization_v1`. Nenhuma operação hospedada, provedor, emissão, cobrança ou publicação.

## Contrato candidato

- `platform_private.b2b_fiscal_invoice_bridge_v1(uuid)` recebe somente `service_role`; clientes e o alocador privado não ganham EXECUTE.
- NF pendente/rejeitada retorna `skipped` sem documento ou título. NF-e exige status `AUTHORIZED`, data, emissão, ambiente de homologação e chave de 44 dígitos; NFS-e exige confirmação e referência do provedor.
- Empresa é resolvida por `company_fiscal_settings` e conferida com `fiscal_invoices.organization_id`; pedido, devedor, parceiro e owner precisam concordar. Itens usam `partner_order_item_id`, quantidades/unidades reais e total líquido da NF, mas o dinheiro do título continua vindo dos snapshots B3/B4.
- Um permit privado por `txid_current()` autoriza somente documento/pedido/tenant/parceiro daquela NF. Não há GUC de autoridade, `auth.uid()` ou usuário histórico fabricado. O título de serviço tem `created_by=NULL` e trilha `fiscal_audit_log`; todo título sem ator fora desse permit é negado.
- O alocador B4 e o gerador de parcelas existentes são reutilizados. Replay usa a própria NF como documento e exige digest idêntico. Falha após autorização desfaz a transação e permite retry sem duplicação.
- O callback H12 chama a ponte tanto no fechamento quanto no retorno já autorizado, para recuperação. H13, NFS-e real e provedores não foram executados.
- Rollback deny-only revoga ponte e callback, preservando NF, títulos, alocações, histórico, tabelas e guards. Não restaura definições antigas.

## Evidência descartável

Execução final: **149/149 checks, exit 0**, incluindo os 128 checks da regressão B4 e 21 checks novos da ponte na mesma execução; não somar a outras rodadas. Cobriu PRE/POST/pins/ACL, pendente/rejeitado, dependência always-deny antes da costura local, falha pós-título, retry autorizado, replay, duas chamadas concorrentes, parcialidade, tenant estrangeiro, origem sem ator e rollback.

A contabilidade e os eventos fiscais são sintéticos; `b2b_integration_dependencies` foi substituída apenas no harness depois de comprovar a negação real. Isso não certifica integração fiscal, JWT/RLS/Storage, H13 ou homologação real.

Artefatos: `evidence/harness.stdout.txt`, `harness.stderr.txt`, `harness.exitcode`, `evidence-b4-shared-impact.json` e todas as tentativas `attempt-*`. Para novas execuções, usar `B4_EVIDENCE_OUT=<pasta-nova>` para não sobrescrever relatórios históricos.

Candidato `02-install.sql.review` SHA256: `b43550403d368b68e897de11778a142b09a4f142ba0d6646fb9a35d0ed6ae4c9`.

Continua bloqueado para revisão independente, revisão de cancelamento/NFS-e/H13 e autorização específica de instalação. Exceção manual segue sem habilitação.
