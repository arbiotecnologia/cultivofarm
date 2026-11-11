# Auditoria local PB-001042: diagnóstico e cancelamentos

## Limites
- Somente código, capturas existentes e PostgreSQL descartável; nenhuma chamada remota, publicação ou alteração do runtime.
- Preservar r12 positivo encerrado, histórico, `approved_*`, bloqueio C2 e todas as portas fiscais, financeiras e físicas.
- Usar pedido fictício fiel ao PB, não o PB real. Autenticação e provedor no espelho são costuras declaradas, não prova de produção.

## 1. Diagnóstico econômico versus operacional
- Inventariar consumidores das duas sobrecargas de elegibilidade antes de modificar seu diagnóstico.
- Reconstituir composição r12 e restauração limpa com usuários fictícios antes das constraints; conferir FKs e MD5 do leitor `70dba08838cd4d5eea29f37f5f8a3373`.
- Testar aprovação comercial econômica explícita do piloto, evidência cotada íntegra, tenant/parceiro e concessão vigente/revogada. Informar sua existência e pendência operacional/contábil sem marcar faturável, expor autores/IDs indevidos ou tratar aprovação automática como explícita.
- Se o contrato suportar a correção, entregar delta aditivo e independente, com rollback seguro e regressões dos fluxos antigos.

## 2. Cancelamento: entradas e integração real local
- Mapear UI, RPCs, helpers e callbacks efetivamente usados para pedido, NF e documento fiscal.
- Exercitar entradas normais antes/depois de previsão, parcial, autorização, recusa/pendência, confirmação de cancelamento pelo callback simulado, duplicação e corrida com autorização em conexões distintas.
- Verificar título com pagamento, previsão/residual, estoque e entrega; negativas de identidade/tenant, atomicidade e rollback.
- Não inserir resultados finais nem presumir estorno financeiro ou reposição de estoque. Caminhos sem transição suportada permanecem bloqueados e registrados com causa e dependência.

## 3. Entrega por prontidão
- Evidências novas append-only: comandos, versões, SQLSTATE, IDs fictícios, valores antes/depois, exit codes e hashes.
- Correções demonstráveis em pacotes pequenos gerados com PRE, INSTALL inativo/fechado, POST e rollback; pins de corpo, owner, ACL e dependências, sem migrations operacionais.
- Separar correções prontas de cenários bloqueados por decisão de negócio. Nenhuma regra de cancelamento/estorno/reposição será inventada.

## Detalhes técnicos
- Reutilizar fontes/harness r12 e a restauração `prep_restore.sh`, adaptando apenas caminhos locais e entradas de teste em cópia temporária.
- Chamadas SQL usam exclusivamente socket local explícito, sem variáveis de conexão hospedada.
- Testes de integração dirigem writers/callbacks reais; fixtures limitam-se a identidade, configuração e evidência fiscal sintética declarada.
- Não executar suíte completa sem necessidade; executar testes focados e conferir o estado de compilação automático antes do encerramento.

## Assunção
Aprovação econômica do piloto e autorização operacional são fatos diferentes; o diagnóstico não concede nenhuma permissão nova.