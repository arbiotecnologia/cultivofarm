# Fixtures A/B — preparação revisável, sem execução hosted

Dados fictícios autorizados pelo proprietário. Não há pedido de autorização repetida; o auditor executa após revisão, preservando sessões reais financeiro A/admin B. **Nenhum fixture hosted criado pelo agente nesta entrega.** Auditor informou13:25 pai REAL B: cliente `cc586e4a-8953-4f3c-9a38-57e3665d1667`, org `8f57c7dd-0557-4041-b401-7a00f7244626`, nome TESTE AUDITORIA APLICACAO B20261019 e fazenda TESTE AUDITORIA FAZENDA B20261019 criada por UI. Preservar/reusar, não duplicar nem limpar.

## Dados sintéticos concretos
O laboratório local já contém empresas A/B e cliente A/B, produto ativo, OS manual A/B, ator admin A/B e vínculo A. IDs fixos em `test-local.py` são **somente locais**. Não copiar IDs locais para Auth/produção nem gerar contas com e-mail real. Fotografia fixture deve ser PNG real de 3–10KiB com marca “TESTE”, não os 3 bytes sintéticos do harness.

Antes de criar hosted, selecionar via leitura os IDs reais dos tenants A/B e do ator técnico autorizado já existente; financeiros não são convertidos em técnico. Reusar pai B acima. Auditor prepara OS sintética via cadastro existente, produto ativo e cliente/área no mesmo tenant, **sempre aberta no INSERT** conforme trigger. Não finalizar OS comercial, gerar entregas/cobranças/recebíveis/comunicações, alterar status artificialmente, desabilitar guards ou conceder EXECUTE para forçar fixture.

## Gate de dependências e plano executável
1. Executar preflight SELECT-only da candidata após provar ref canônico; revisar/aplicar apenas pelo auditor. Helper leitura POST04067 permanece preservado.
2. Conferir UI existente do pai B/fazenda sem recriar; obter produto/responsável e talhão tenant-coerentes por leituras autorizadas.
3. Cadastro de OS existente cria **aberta**. RPCs de aprovação/avanço permanecem fechadas; portanto não existe hoje caminho autorizado certificado para promover esse pai a envase/pronto_entrega/entregue. Não aplicar candidata de cadastro esperando que resolva esse bloqueio.
4. **Dependência bloqueante explícita**: revisão própria futura do avanço canônico de OS, ou OS sintética prévia já elegível proveniente de fluxo autorizado comprovado. Não implementar/reabrir essas RPCs neste recorte, nem aceitar OS aberta/cancelada. Sem isso executar somente negativos com OS aberta e leituras, não alegar homologação positiva aplicação/PDF.
5. Quando a dependência for resolvida pelo fluxo canônico, seguir passos abaixo; retificação aceita envase/pronto_entrega/entregue **ou finalizada**, sempre do predecessor real autorizado. Retificação não exige finalizar OS e não altera status.

## Passos do fluxo existente
1. Ator técnico A: `/aplicacoes` → Registrar Aplicação, selecionar OS fictícia A e responsável elegível A. Escolher explicitamente `mL/ha`, dose2, área3, total6mL; data civil/hora coerentes. Adicionar PNG real.
2. Registrar: observar prepare antes de upload e finalize depois; application/evidence/link com tenant A e mesmo path `{clienteA}/{appUUID}/{uuid}.png`. Não deve ocorrer RPC de finalização de OS/notificação.
3. Abrir foto e PDF pelo fluxo autenticado existente. Guardar evidência de bytes renderizados e nome do PDF, sem tokens/URLs assinadas. Esta é a futura homologação positiva, não o smoke vazio anterior.
4. Admin B: `/aplicacoes`/Ver Histórico não mostra A; tentativa direta da RPC com OS/locators A deve negar, com JWT atual separado de SQL claims. B pode cadastrar somente fixture B.
5. A: retificar fixture A com motivo “Correção sintética de dose”, manter foto. Nova versão tem origem/path antigo e predecessor não latest, metadados/vínculos atômicos. Duplo clique/retry não duplica.
6. Revogação/inativação CAS executada pelo auditor, upload em trânsito e retry: sem sucesso/callback em época velha; prepare/finalize/novo upload negados. Restore permite nova confirmação, não recupera dados privados automaticamente nem muda prazo do recibo.
7. Registrar IDs criados/paths exatos em ledger próprio e contagens antes/depois. Preservar fixtures até revisão; cleanup específico não está implementado/autorizado como exclusão automática nesta candidata.

Este documento é um roteiro e dados de laboratório, **não seed hosted completo**, nem homologação JWT/browser. Pai B real informado já existe; elegibilidade de OS e teste end-to-end positivo seguem bloqueados como acima; triggers completos de criação/avanço de OS não foram exercitados nesta entrega.