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

---

# H10 — Aplicado manualmente pelo operador

Em 13/09/2026, o usuário informou aplicação e verificação direta no CultivoFarm canônico.
Registro declaratório, sem nova consulta ou reaplicação nesta auditoria. As instruções abaixo são o histórico da preparação.

Script: `restoration/planejamento-producao/sql/20260913030000_h10_planejamento_producao_hardening.sql`
Nenhuma migração foi aplicada, nenhum banco foi acessado, nada foi publicado ou sincronizado.

## Objetos afetados quando for aplicado

- `public.production_planning` — política `planning_modify_staff` substituída por `planning_insert_producao`
  e `planning_update_producao` (mesmos papéis: administrador, producao, gestor); `DELETE` revogado de `authenticated`.
  `planning_select_staff` preservada (inclui `gestor_comercial`).
- `public.production_order_link` — mesma separação (`polink_insert_producao`, `polink_update_producao`),
  `DELETE` revogado; `polink_select_staff` preservada.
- `public.production_planning_publications` (NOVA) — ledger de publicações com `idempotency_key` único,
  índice único por `planning_id`, RLS ativa, apenas leitura para staff; escrita só pela RPC.
- `public.rpc_planejamento_publicar_v1(uuid, text)` (NOVA) — `SECURITY DEFINER`, `search_path` fixo em `public`,
  valida `auth.uid()` e papel, `pg_advisory_xact_lock` por planejamento, `FOR UPDATE` no planejamento,
  replay por chave e por planejamento, e só então chama `publish_planning_to_lab`.
- `public.publish_planning_to_lab(uuid)` — `EXECUTE` revogado de `PUBLIC`/`anon`/`authenticated`
  (permanece para `service_role` e para uso interno da nova RPC). A função não é alterada.

## Pré-condições

1. Backup/snapshot do banco autorizado.
2. Confirmar ref `swzpzcwiasxmjutrmvkm`.
3. Rodar a consulta de diagnóstico abaixo: precisa retornar zero linhas nas duas partes.

```sql
-- (a) itens de pedido com mais de um vínculo de OS
SELECT partner_order_item_id, count(*) FROM public.production_order_link
GROUP BY partner_order_item_id HAVING count(*) > 1;

-- (b) OS órfãs duplicadas por pedido/produto (sem vínculo registrado)
SELECT os.partner_order_id, os.produto_id, count(*)
FROM public.ordens_servico os
WHERE os.partner_order_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.production_order_link l WHERE l.ordem_servico_id = os.id)
GROUP BY os.partner_order_id, os.produto_id HAVING count(*) > 1;
```

Se houver linhas, o próprio script aborta com `h10_planejamento_duplicidade_historica` e nada é alterado.
A deduplicação é manual e exige autorização específica.

## Ordem de aplicação

1. Diagnóstico acima.
2. Aplicar o script completo em uma única transação.
3. Recarregar o cache do PostgREST (deploy/reload) para a nova RPC ficar visível.
4. Frontend já está preparado: usa `rpc_planejamento_publicar_v1` e cai no contrato legado
   enquanto a RPC não existir, sem quebrar a tela.

## Verificação pós-aplicação

```sql
SELECT policyname, cmd FROM pg_policies
 WHERE tablename IN ('production_planning','production_order_link','production_planning_publications');
SELECT has_function_privilege('authenticated','public.rpc_planejamento_publicar_v1(uuid, text)','EXECUTE');
SELECT has_function_privilege('authenticated','public.publish_planning_to_lab(uuid)','EXECUTE'); -- deve ser false
SELECT count(*) FROM public.production_planning_publications;
```

Teste funcional: publicar um planejamento duas vezes com a mesma chave — a segunda resposta deve vir
com `replay = true` e `os_created` idêntico, sem criar novas OS.

## Rollback

```sql
BEGIN;
REVOKE EXECUTE ON FUNCTION public.rpc_planejamento_publicar_v1(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.publish_planning_to_lab(uuid) TO authenticated;

DROP POLICY IF EXISTS "planning_insert_producao" ON public.production_planning;
DROP POLICY IF EXISTS "planning_update_producao" ON public.production_planning;
CREATE POLICY "planning_modify_staff" ON public.production_planning FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS "polink_insert_producao" ON public.production_order_link;
DROP POLICY IF EXISTS "polink_update_producao" ON public.production_order_link;
CREATE POLICY "polink_modify_staff" ON public.production_order_link FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor'));

GRANT DELETE ON public.production_planning TO authenticated;
GRANT DELETE ON public.production_order_link TO authenticated;
COMMIT;
```

A tabela `production_planning_publications` é preservada no rollback (histórico append-only);
sua remoção exigiria autorização explícita e não faz parte deste procedimento.

## Riscos residuais

- Enquanto a migração não for aplicada, a idempotência continua apenas local (trava de clique).
- `useUpdatePlanningDates` ainda grava direto na tabela: a validação de transição de status por RPC
  permanece como pendência separada (item 2 da lista acima).
- KPIs agregados e paginação seguem pendentes (itens 4 e 5).
