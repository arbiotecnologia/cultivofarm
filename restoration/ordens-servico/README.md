# Ordens de Serviço — auditoria local, 13/09/2026

## Limites e status
Nenhum acesso a banco, Auth, Storage, RPC, funções ou secrets. Nenhuma publicação, sincronização GitHub ou criação de dados.
H10: aplicado/verificado manualmente pelo usuário, sem verificação independente e sem reaplicação.
Esta é uma auditoria de código, não homologação autenticada nem comprovação da configuração de produção.

## Achados e correções
- Listagem ignorava erros de sete consultas e anunciava sucesso antes do retorno: falhas agora bloqueiam resultados parciais e têm retry; resposta antiga não sobrescreve nova carga.
- Busca alfabética podia corresponder a todos os códigos por `includes('')`: busca normalizada sem esse atalho.
- Datas civis preservadas; timestamps e períodos em America/Sao_Paulo; sete dias não incluem futuro.
- Lista deduplicada por origem/id, ordenação com desempate, paginação local 20, limpeza integral e contadores explicitamente limitados a 90 dias/200 por origem. Não é paginação global do banco.
- Criação: Zod, existência/vínculos cliente-fazenda-talhão, item/dose/área/volume positivos finitos, data civil válida, prioridade e modo enumerados. Trava síncrona e fieldset desativado durante envio.
- UUID de submissão preservado após falha/resultado incerto: repetir no mesmo componente não cria outra chave primária; conflitos exigem conferir histórico. Não garante idempotência entre abas, recarga ou usuários.
- Ação de criar restrita visualmente a administrador/gestor, conforme políticas de INSERT encontradas; produção tem UPDATE no histórico de RLS, não INSERT. Sem alteração de autorização real.
- Esta tela não edita nem avança status; texto deixou de prometer edição inexistente. Pedidos B2B continuam originados no Planejamento, sem duplicação nesta tela.
- Rastreio: chave de cache inclui origem; erros propagados, sem consultar UUID vazio; multiplicidade deixa de ser truncada silenciosamente para primeiro registro e encaminha ao Cockpit.
- Zero preservado em métricas de CQ; resultado desconhecido não é declarado reprovado. Volumes inválidos na lista exibem traço, volumes pequenos não arredondam para zero.
- Busca, campos e controles principais com nomes acessíveis; limpeza e paginação por botões; título de detalhe quebra linha.

## Arquivos alterados
- src/pages/OrdensServico.tsx
- src/lib/ordens-servico/validacao.ts
- src/components/ordens-servico/{OSDetalhesDialog,RastreabilidadeProducaoTab}.tsx
- src/test/ordens-servico/validacao.test.ts
- restoration/planejamento-producao/README.md (status declaratório H10)
- roadmap.md e este diretório.

## Riscos de servidor e escopo pendente
1. INSERT direto manual ainda requer validação de vínculo, item ativo, dose e finalidade no servidor; frontend não garante isso. A unidade contratada é mL/ha × ha; não inventada conversão comercial.
2. Idempotência entre sessões e transições precisam de contrato atômico revisado. H10 cobre publicação de planejamento, não toda criação avulsa/onfarm. Não consolidar policies sem comparar estado real autorizado; policies permissivas somam permissões.
3. `BaseFaturamentoSection` incorporada na lista contém edição comercial e transições diretas fora da esteira laboratorial; auditada como risco, não homologada nesta entrega. Falha de leitura pode aparentar base ausente; deve bloquear antes de edição comercial. Alteração financeira requer etapa própria.
4. Rastreamento multilote/múltiplos envases requer visualização completa; nesta etapa falha explícita em vez de resumo enganoso. Estoque/eventos sem discriminador inequívoco de origem requerem contrato servidor. Nenhum link novo inventado para entidades sem rota comprovada.
5. Limite de 200/90 dias e limites do serviço nas referências não cobrem histórico global. Sem SLA/timeout de escrita artificial: interromper espera não desfaz INSERT. Mensagem genérica orienta conferência antes de retry.
6. Não houve E2E autenticado, auditoria real de RLS, teste de concorrência real, inspeção visual autenticada ou alteração de dados. Não certificar acessibilidade/segurança completa com testes estáticos.

## Migração proposta — NÃO APLICAR nesta etapa
`restoration/ordens-servico/sql/20260913030000_os_numeric_guard.sql`
Somente CHECKs adicionais em `public.ordens_servico` e `public.ordens_servico_onfarm`, sem DML, sem novas tabelas/funções/grants/policies. Nulos preservados, zero/negativos/não-finitos rejeitados. Base: tipos canônicos e migrations `20260617005026_17538776-af7a-496c-9602-a8df4b87c326.sql`, `20260703144353_2c465fbb-f860-4b3b-8db4-30d662ebddc8.sql`.
Não é correção completa de RLS/idempotência. Reexecução aborta explicitamente se nome já existir, sem substituir constraints. Histórico inválido aborta integralmente, sem reparação automática.

### Pré-condições e diagnóstico (operador autorizado, futuro)
Comprovar destino exato canônico fora do SQL, backup e janela para lock; revisar contratos em que zero possa ter significado histórico. Não aplicar sem aceite dessas regras.
```sql
SELECT 'manual' origem, id FROM public.ordens_servico
WHERE volume_total_ml <= 0 OR area_hectares <= 0
 OR volume_total_ml::text IN ('NaN','Infinity','-Infinity') OR area_hectares::text IN ('NaN','Infinity','-Infinity')
UNION ALL
SELECT 'onfarm', id FROM public.ordens_servico_onfarm
WHERE volume_total_ml <= 0 OR area_hectares <= 0
 OR volume_total_ml::text IN ('NaN','Infinity','-Infinity') OR area_hectares::text IN ('NaN','Infinity','-Infinity');
SELECT partner_order_item_id, count(*) FROM public.ordens_servico
WHERE partner_order_item_id IS NOT NULL GROUP BY partner_order_item_id HAVING count(*) > 1;
SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('ordens_servico','ordens_servico_onfarm');
```
Não executar se diagnóstico numérico retornar registros. Duplicidades não são corrigidas automaticamente.
Ordem: diagnóstico → revisar policies/contratos → autorização específica → comprovar ref e setar gate de sessão → executar script inteiro → verificar constraints.
```sql
SELECT conrelid::regclass, conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conname IN ('ordens_servico_audit_positive_numbers_v1','ordens_servico_onfarm_audit_positive_numbers_v1');
```
Esperado: duas CHECKs validadas; comparar definição, não somente nomes.
Rollback remove somente os dois CHECKs novos, sem apagar dados/objetos de negócio:
```sql
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.ordens_servico DROP CONSTRAINT IF EXISTS ordens_servico_audit_positive_numbers_v1;
ALTER TABLE public.ordens_servico_onfarm DROP CONSTRAINT IF EXISTS ordens_servico_onfarm_audit_positive_numbers_v1;
COMMIT;
```
Nenhum DROP destrutivo, CASCADE, TRUNCATE ou correção de registros integra o pacote.
