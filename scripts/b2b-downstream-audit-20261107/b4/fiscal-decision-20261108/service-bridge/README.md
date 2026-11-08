# Ponte fiscal service-only — candidato local INATIVO/NÃO APROVADO

Revisões `ab904bf`, `feb815603` e `1a65c9c`, preparadas em 08/11/2026 sobre B4 `7dde7f07…` e as capturas integrais H12/H13. Nenhuma operação hospedada, provedor, emissão, cobrança, envio ou publicação.

## Contrato candidato

- `platform_private.b2b_fiscal_invoice_bridge_v1(uuid)` recebe somente `service_role`; clientes e o alocador privado não ganham EXECUTE.
- NF totalmente sem vínculos B2B segue o fluxo existente e retorna `skipped=NON_B2B`. Qualquer vínculo parcial, item de pedido ou documento B4 existente torna a nota B2B e falha fechado se inválida.
- O callback H12 exige `_c_stat=100/150`, transmissão H13 `SUCCEEDED/AUTHORIZED` vinculada à mesma NF/chave/protocolo, ambiente `2` e XML assinado. A comprovação também é revalidada no replay; `nfeProc` continua ausente.
- Empresa, pedido, devedor, parceiro e owner precisam concordar. Itens usam o contrato B4 de cinco campos; o snapshot privado separado conserva também os valores líquidos, total do cabeçalho, referência, protocolo, transmissão, ambiente e origens.
- O digest completo torna divergências monetárias, de referência ou protocolo conflitos de replay. O snapshot é imutável por triggers e não recebe grants de cliente/serviço.
- Um permit privado por `txid_current()` autoriza somente documento/pedido/tenant/parceiro daquela NF. `created_by=NULL` é permitido apenas para título B2B com esse permit; outras origens sem ator continuam negadas e updates legados não exigem permit novo.
- O alocador B4 e o gerador de parcelas existentes são reutilizados. Não há GUC de autoridade, `auth.uid()` fictício ou usuário histórico fabricado.
- H13, H12 e a ponte direta usam a mesma ordem de row locks: **nota → transmissão**. H13 relê a transmissão com `FOR UPDATE` depois de travar a nota; a ponte direta também trava a evidência de transmissão depois da nota. Nenhum lock ou validação de autoridade foi removido.
- H13 preserva o retorno externo quando o fechamento falha. A pendência fica em `platform_private.fiscal_close_pending`, sem atualizar uma transmissão terminal imutável nem apagar `error_code` de outra origem; o retry sem reemissão limpa somente a pendência recuperada.
- NFS-e permanece `B2B_FISCAL_NFSE_CALLBACK_UNPROVEN`; cancelamento não executa reversão automática. Exceção manual continua sem habilitação.
- Rollback deny-only revoga ponte e callbacks, preservando NF, títulos, alocações, snapshots, histórico, tabelas e guards. Não restaura definições antigas.

Candidato `02-install.sql.review` SHA256: `5db2c160fd3a99bb847fe20a1d9764cbfed82d5cd80915be0eceb94eadfb9964`.

## Evidência atual da revisão 1a65c9c

### ANTES — caracterização da inversão de locks

- **196/196 checks, exit 0** em `../../review-458b6012/lock-order-1a65-before/`. Isso não significa 196 vulnerabilidades nem aprovação.
- Um gatilho temporário da bateria pausou H13 no `UPDATE` depois de adquirido o lock da transmissão. H12, em outra conexão e na mesma NF/transmissão, travou a nota e aguardou a transmissão; ao continuar, H13 aguardou a nota.
- O log real do PostgreSQL registrou `deadlock detected`. O oráculo usa o log porque H13 pode capturar a exceção e convertê-la em pendência de fechamento.
- A recuperação preservou o retorno `AUTHORIZED`, fechou a pendência privada e não criou documento/título no controle não-B2B.
- A primeira tentativa com parâmetro de lock negado ao papel e fixture B2B incompleta foi preservada em `lock-order-1a65-before-attempt-01/`; não conta como reprodução.

### DEPOIS — componente com costura declarada

- **198/198 checks, exit 0** em `../../review-458b6012/lock-order-1a65-after/`.
- H13 × H12 e H13 × ponte direta, sempre na mesma NF/transmissão, terminaram sem `deadlock detected`; os dois processos tiveram exit 0.
- A ponte direta percorreu o caminho que trava a nota e consulta/trava a transmissão, não apenas o retorno antecipado de NF pendente/não-B2B.
- Recuperação, replay, concorrência, guarda de transmissão terminal, envelope `cStat=104` + `protocolCStat=100`, parcialidade, tenant, legado e rollback deny-only permaneceram cobertos.
- O componente positivo usa a substituição local já declarada de `b2b_integration_dependencies`. **Não é prova positiva integrada de recebível fiscal.**

### Rebuild integral fresh — negativo real, não positivo financeiro

- **39/39 checks, exit 0**, stderr vazio, em `../../../order-e2e-new-20261108/evidence/`.
- O mesmo PostgreSQL descartável novo executou planos+B3+logística+B4+ponte, PRE/POST e rollback deny-only reverso.
- A fixture fiscal validou previamente todos os campos NOT NULL sem default e as constraints em transação revertida; `fiscal_xml_runs.idempotency_key` e as demais chaves são determinísticas e estáveis nos replays.
- O envelope real `104/100` foi executado duas vezes. A transmissão ficou `AUTHORIZED`, com pendência privada e `attempts=2`, enquanto a dependência real `b2b_integration_dependencies()` permaneceu `B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN`.
- Resultado integrado: **zero documento, zero alocação, zero snapshot e zero recebível**. `positive_fiscal_receivable=NOT_RUN_BLOCKED`; não houve substituição always-allow nesse rebuild.
- O rollback foi medido como `service_role`/`authenticated`, não como o proprietário superusuário. Fechou ponte/B4/planos e preservou evidência fiscal, chaves, pendência, planos e os dez gatilhos originais de recebíveis.
- Pontos exatos: `run.exitcode`, `checks.json`, `fiscal-fixture-contract.json`, `integrated-always-deny-callback.json`, `integrated-b4-fiscal-bridge.json`, `run.stdout.txt` e `run.stderr.txt`. As 82 tentativas anteriores estão preservadas em `attempt-*` e não foram somadas ao resultado final.

## Histórico e limites

- As baterias históricas `ab904bf`/`feb815603` (174/174, 175/175 e 188/188) permanecem nas pastas de evidência originais. Não são o resultado atual nem prova integrada.
- O resumo atual e seus caminhos estão em `validation-1a65c9c.json`; os hashes dos SQLs estão em `manifest.json`. O manifesto composto aponta para a execução fresh em `canonical-composition-feb815603/manifest.json`.
- Não há certificação JWT/RLS/Storage/browser, provedor, NF real ou homologação de produção. NFS-e/cancelamento automático seguem fechados.
- O candidato continua bloqueado para revisão independente e autorização específica de instalação. O isolamento mínimo de planos permanece em pacote separado; nenhum resultado local libera publicação ou escrita hospedada.
