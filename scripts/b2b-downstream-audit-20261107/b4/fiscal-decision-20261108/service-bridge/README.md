# Ponte fiscal service-only — candidato local INATIVO/NÃO APROVADO

Revisão `ab904bf`, preparada em 08/11/2026 sobre B4 `7dde7f07…` e as capturas integrais H12/H13. Nenhuma operação hospedada, provedor, emissão, cobrança ou publicação.

## Contrato candidato

- `platform_private.b2b_fiscal_invoice_bridge_v1(uuid)` recebe somente `service_role`; clientes e o alocador privado não ganham EXECUTE.
- NF totalmente sem vínculos B2B segue o fluxo existente e retorna `skipped=NON_B2B`. Qualquer vínculo parcial, item de pedido ou documento B4 existente torna a nota B2B e falha fechado se inválida.
- O callback H12 exige `_c_stat=100/150`, transmissão H13 `SUCCEEDED/AUTHORIZED` vinculada à mesma NF/chave/protocolo, ambiente `2` e XML assinado. A comprovação também é revalidada no replay; `nfeProc` continua ausente.
- Empresa, pedido, devedor, parceiro e owner precisam concordar. Itens usam o contrato B4 de cinco campos; o snapshot privado separado conserva também os valores líquidos, total do cabeçalho, referência, protocolo, transmissão, ambiente e origens.
- O digest completo torna divergências monetárias, de referência ou protocolo conflitos de replay. O snapshot é imutável por triggers e não recebe grants de cliente/serviço.
- Um permit privado por `txid_current()` autoriza somente documento/pedido/tenant/parceiro daquela NF. `created_by=NULL` é permitido apenas para título B2B com esse permit; outras origens sem ator continuam negadas e updates legados não exigem permit novo.
- O alocador B4 e o gerador de parcelas existentes são reutilizados. Não há GUC de autoridade, `auth.uid()` fictício ou usuário histórico fabricado.
- H13 preserva o retorno externo quando o fechamento falha, mantém `FISCAL_AUTHORIZATION_CLOSE_PENDING`, permite retry sem reemissão e limpa somente esse erro após recuperação autorizada.
- NFS-e permanece `B2B_FISCAL_NFSE_CALLBACK_UNPROVEN`; cancelamento não executa reversão automática. Exceção manual continua sem habilitação.
- Rollback deny-only revoga ponte e callbacks, preservando NF, títulos, alocações, snapshots, histórico, tabelas e guards. Não restaura definições antigas.

## Evidência descartável

- ANTES: **174/174**, exit 0, como caracterização das vulnerabilidades — não como aprovação. Reproduziu não-B2B quebrado, `_c_stat=999` e ausência de transmissão criando título, NFS-e promovida sem contrato e replay com valor/referência/protocolo alterado aceito.
- DEPOIS: **175/175**, exit 0, na mesma bateria B4+ponte. Cobriu callbacks reais H12/H13 pendente/rejeitado/autorizado, falha pós-título, retry H13 sem reemissão, concorrência, parcialidade, digest completo, tenant estrangeiro, inserção/update legados e rollback deny-only.
- A contabilidade e os eventos fiscais são sintéticos. A dependência real foi comprovadamente negada antes da costura local e substituída somente no harness componente para exercitar os demais caminhos. Isso não certifica integração fiscal, JWT/RLS/Storage ou homologação real.

Artefatos: `evidence/review-ab904bf-before/`, `evidence/review-ab904bf-after/` e suas tentativas `attempt-*`. Não sobrescrever relatórios históricos; usar `B4_EVIDENCE_OUT=<pasta-nova>`.

Candidato `02-install.sql.review` SHA256: `3c0a2cdc80a3f3050355e8e13c6afc96abb397cf5511d5ccd71ac91eb9a31ba4`.

## Rebuild integrado — bloqueio separado

O rebuild do zero em `order-e2e-new-20261108` concluiu **34 controles** de planos+B3+logística, mas terminou exit 1 no PRE do B4: `B4_PRE_DRIFT:public.b2b_payment_condition_publish(...)`. O candidato de planos produz MD5 `c6fbe15906c5d893ab80e962ee162b3c`, enquanto o PRE B4 ainda exige `5d410cdba3c34298389302fb91d2fb16`. O PRE não foi contornado e B4/ponte não foram instalados nesse rebuild; composição fiscal e rollback integrado ficam NOT_RUN/BLOCKED.

Candidato continua bloqueado para revisão independente, reconciliação explícita dos pinos/contratos, cancelamento/NFS-e real e autorização específica de instalação.
