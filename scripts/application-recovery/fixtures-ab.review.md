# Fixtures A/B — preparação revisável, sem execução hosted

Dados fictícios autorizados pelo proprietário. Não há pedido de autorização repetida; o auditor executa após revisão, preservando sessões reais financeiro A/admin B. **Nenhum fixture hosted criado nesta entrega.**

## Dados sintéticos concretos
O laboratório local já contém empresas A/B e cliente A/B, produto ativo, OS manual A/B, ator admin A/B e vínculo A. IDs fixos em `test-local.py` são **somente locais**. Não copiar IDs locais para Auth/produção nem gerar contas com e-mail real. Fotografia fixture deve ser PNG real de 3–10KiB com marca “TESTE”, não os 3 bytes sintéticos do harness.

Antes de criar hosted, selecionar via leitura catalog-only os IDs reais dos tenants A/B e do ator técnico autorizado já existente; financeiros não são convertidos em técnico. Auditor prepara uma OS sintética A e uma B via cadastro existente, produto ativo da OS e cliente/área no mesmo tenant. Não finalizar OS comercial, não gerar entregas/cobranças/recebíveis/comunicações. Se não houver pai técnico criado por caminho autorizado, registrar bloqueio — não inserir aplicação para contornar RPC.

## Passos do fluxo existente
1. Ator técnico A: `/aplicacoes` → Registrar Aplicação, selecionar OS fictícia A e responsável elegível A. Escolher explicitamente `mL/ha`, dose2, área3, total6mL; data civil/hora coerentes. Adicionar PNG real.
2. Registrar: observar prepare antes de upload e finalize depois; application/evidence/link com tenant A e mesmo path `{clienteA}/{appUUID}/{uuid}.png`. Não deve ocorrer RPC de finalização de OS/notificação.
3. Abrir foto e PDF pelo fluxo autenticado existente. Guardar evidência de bytes renderizados e nome do PDF, sem tokens/URLs assinadas. Esta é a futura homologação positiva, não o smoke vazio anterior.
4. Admin B: `/aplicacoes`/Ver Histórico não mostra A; tentativa direta da RPC com OS/locators A deve negar, com JWT atual separado de SQL claims. B pode cadastrar somente fixture B.
5. A: retificar fixture A com motivo “Correção sintética de dose”, manter foto. Nova versão tem origem/path antigo e predecessor não latest, metadados/vínculos atômicos. Duplo clique/retry não duplica.
6. Revogação/inativação CAS executada pelo auditor, upload em trânsito e retry: sem sucesso/callback em época velha; prepare/finalize/novo upload negados. Restore permite nova confirmação, não recupera dados privados automaticamente nem muda prazo do recibo.
7. Registrar IDs criados/paths exatos em ledger próprio e contagens antes/depois. Preservar fixtures até revisão; cleanup específico não está implementado/autorizado como exclusão automática nesta candidata.

Este documento é um roteiro e dados de laboratório, **não seed hosted completo**, nem homologação JWT/browser. Os pais sintéticos de produção e teste end-to-end positivo permanecem pendentes do auditor; os triggers completos de criação de OS não foram exercitados nesta entrega.