# Cancelamento B2B e fiscal — candidato somente no espelho

## Escopo aprovado
- Preparar pacote separado para revisão e implantação posterior, sem SQL remoto, publicação ou serviços externos.
- Pedido já aprovado: Gestor Comercial ou Administrador da empresa vendedora cancela somente saldo não faturado, com motivo e histórico.
- Confirmação fiscal final válida e vinculada cancela a nota e seu título exato totalmente em aberto. Qualquer pagamento exige reconciliação pelo Financeiro, sem baixa/estorno automático.
- Não reabrir previsão, repor estoque ou disponibilizar expedição; devolução física continua separada.

## Implementação candidata
1. Reutilizar encerramento residual e reconciliação fiscal existentes, sem confundir reprovação de pedido com cancelamento.
2. Validar ator/empresa/parceiro antes dos locks e novamente após esperas; preservar gates próprios, CAS, snapshots, vínculo NF→título e histórico.
3. Classificar confirmação efetiva, registro não vinculado, rejeição, pendência e consulta necessária a partir dos contratos reais do projeto. Casos não decididos falham fechados; registro genérico EVENT_REGISTERED não basta.
4. Preparar alterações da UI e endpoints normais como fontes candidatas no pacote, não ativadas no aplicativo de produção/prévia conectada. Mostrar saldo cancelável, motivo e resultado fiel; pagamentos apresentam necessidade de Financeiro.

## Validação local
- Clone isolado r12, entradas canônicas e callback simulado; nunca inserir estados finais de cancelamento/título/saldo.
- Positivos/negativos antes/depois de previsão, parcial/expedição, título aberto e pago parcialmente; duas empresas e perfis permitidos/negados.
- Repetição, concorrência pagamento/autorização/cancelamento, revogação durante espera, rollback e recuperação sem duplicação.
- Testes de UI candidata e endpoints, registro de cada tentativa, SQLSTATE e ausência de efeitos fora do escopo.

## Entrega técnica
- Pequenos pacotes PRE/INSTALL fechado/POST/rollback deny-safe gerados e executados pelos mesmos bytes no espelho, com pins corpo/owner/ACL/configuração e hashes.
- Separar pins já confirmados pelo auditor de novas dependências capturadas localmente, que ainda precisam conferência de produção.
- Relatório com comandos, IDs fictícios, resultados, limites e dependências de prontidão; nenhum aceite JWT/RLS/Storage ou provedor real.

## Limite conservador
Sem acrescentar novos significados fiscais: se o contrato existente não comprovar vínculo final do evento com a NF, conservar pendência e documentar o bloqueio, sem considerar códigos de registro isolados como cancelamento efetivo.