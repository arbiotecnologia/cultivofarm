# Planejamento de Produção — auditoria frontend (somente leitura de banco)

Auditoria e correções restritas ao frontend em `/operacao/planejamento` e `/operacao/planejamento/:id`.
Nenhum acesso, migration, RPC, RLS, Edge Function, Storage, Auth ou secret foi criado ou alterado.
Nenhum dado de teste foi criado. Não houve publicação nem sincronização GitHub.

## Corrigido no frontend

- Estados separados de carregamento, erro, vazio e "sem resultado de busca"; vazio nunca mais é exibido no lugar de falha.
- Botão de atualizar e "tentar novamente" em ambas as telas; KPIs exibem "—" enquanto não há dado confiável.
- Data de hoje calculada em `America/Sao_Paulo` (antes usava data UTC, o que antecipava/atrasava o selo "Atrasado" por um dia).
- Deduplicação por `partner_order_id` no cliente, com contador de linhas duplicadas ignoradas.
- Status `replanejar` passou a ter rótulo, cor e opção de filtro; status desconhecido não quebra a tela.
- Valor do pedido ausente exibe "—" em vez de R$ 0,00; volumes nulos ou negativos exibem "—".
- Busca por número do pedido e parceiro (sem acento/caixa), contador "N de M", ordenação de fila com atrasados primeiro.
- Detalhe: destruturação segura do retorno do RPC, erro/404 tratados, timeline ordenada cronologicamente.
- Datas previstas validadas (término não anterior ao início; término exige início) com bloqueio do salvar.
- Geração de OP com trava contra clique repetido e revalidação de estado fresco, bloqueando pedido encerrado,
  não liberado, sem itens ou com quantidade inválida.
- Rótulos acessíveis em filtros, busca, campos de data e ações da tabela.

## Riscos que dependem de banco/RLS/RPC — apenas documentados

1. **Autorização é apenas visual.** `canManageProduction` esconde botões pelo papel do usuário. A garantia real
   precisa estar nas policies de `production_planning` (UPDATE) e nas funções `publish_planning_to_lab` e
   `get_production_planning_detail`. Verificar em auditoria de banco autorizada.
2. **Atualização de datas via UPDATE direto.** `useUpdatePlanningDates` grava direto na tabela; sem checagem de
   transição de status no servidor, um planejamento `entregue`/`cancelado` ainda pode ter datas alteradas.
   Correção adequada: RPC `SECURITY DEFINER` com `search_path` fixo validando papel e status.
3. **Idempotência de `publish_planning_to_lab`.** Não há chave de idempotência no contrato atual; duas chamadas
   concorrentes de usuários distintos podem gerar OS duplicadas. A trava implementada é apenas local.
4. **Filtro por status é feito no servidor, KPIs no cliente.** Com filtro ativo, os KPIs refletem só o subconjunto
   carregado. Uma RPC de métricas agregadas resolveria de forma correta.
5. **Ausência de paginação.** A consulta traz todas as linhas; com volume alto, contadores e ordenação ficam caros.

Nenhum script SQL foi preparado ou executado nesta etapa.

## Vínculo canônico

Preservado: `src/integrations/supabase/client.ts` continua sendo o único `createClient`, apontando para
`https://swzpzcwiasxmjutrmvkm.supabase.co` com `assertCanonicalSupabaseBinding`. Nenhum arquivo novo importa
`src/integrations/supabase/types.ts`, lê variáveis de conexão ou referencia refs divergentes.
