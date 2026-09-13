# Lotes — auditoria local 13/09/2026

## Escopo
Somente frontend/código local. Nenhum banco, Auth, Storage, RPC, secrets ou dados acessados; nenhuma publicação/sincronização. Valores de testes somente em memória. Constraints OS aplicadas e convalidated=true segundo usuário; migração preservada, não reaplicada.

## Arquivos alterados
- src/pages/Lotes.tsx
- src/lib/lotes/consulta.ts
- src/test/lotes/consulta.test.ts
- restoration/lotes/README.md
- restoration/ordens-servico/README.md (status declaratório)
- roadmap.md

## Correções
- Removida escrita de status/envio CQ desta página; avanço somente via Cockpit existente. Sem mudanças de rotas/permissões.
- Loading/erro/retry/vazio/resultados filtrados separados. Falha de qualquer consulta bloqueia conjunto parcial.
- Leitura em páginas estáveis, sem corte fixo 200/90 dias; envases por lote sem restrição cronológica. Deduplicação dos lotes; paginação visual 20, contadores, busca rotulada, filtros status/produto/microrganismo/OS/período e limpeza.
- AbortController, timeout 30s, versionamento e cancelamento na desmontagem. Atualização manual bloqueada durante carga; realtime de lote/envase/programação.
- Datas civis preservadas, timestamps America/Sao_Paulo. Campo de validade não existe no contrato de lotes: não inventado.
- Zero preservado; nulos/negativos/não-finitos exibidos como desconhecidos. Embalagens exigem quantidades inteiras positivas; envase incompleto invalida total. Excesso não aparece como completo. Saldo é de envase, não estoque disponível.
- Vínculo OS manual/onfarm via programação; ambiguidade bloqueia link contextual. Parâmetro os já existente no Cockpit codificado. Ausência/inacessibilidade explicitada.
- Controles nomeados, região de tabela rolável com foco por teclado, estados status/alert, paginação acessível. Sem homologação visual autenticada.

## Limites e riscos restantes
1. **Rastreabilidade completa não entregue inline**: planejamento/pedido, cliente/parceiro, CQ detalhado, validade por embalagem e eventos estoque/entrega continuam exigindo consulta contextual e etapa própria. Badge B2B antigo só cobria OS manual e foi removido para não representar cadeia parcial como completa.
2. RLS pode ocultar envases e subestimar totais; navegador não distingue ausência de inacessibilidade. Policies permissivas iniciais no histórico não comprovam estado atual de produção. Não certificar segurança real sem inspeção autorizada.
3. Paginação não é snapshot transacional; alterações concorrentes podem deslocar páginas. Totais refletem registros acessíveis. Grandes históricos podem atingir timeout. Agregação e paginação servidor precisam de etapa autorizada.
4. Geração de códigos, unicidade, papéis, transições e auditoria atômica continuam responsabilidade do servidor/Cockpit. Remoção de escrita nesta tela não impede chamadas externas. Não alterado GerarLoteDialog.
5. Nenhum SQL de alteração preparado: contratos de multilote, nulos históricos e policies reais não estão suficientemente estabelecidos para impor nova constraint/policy segura. Não inventar regras restritivas nem substituir policies por permissivas.

## Diagnóstico futuro proposto — NÃO EXECUTADO
Pré-condições: autorização específica, comprovação externa do destino canônico swzpzcwiasxmjutrmvkm, revisão de contratos; não usar canal gerenciado divergente.
```sql
BEGIN TRANSACTION READ ONLY;
SELECT id, codigo_lote, programacao_id, volume_produzido FROM public.lotes
WHERE volume_produzido < 0 OR volume_produzido::text IN ('NaN','Infinity','-Infinity');
SELECT codigo_lote, count(*) FROM public.lotes GROUP BY codigo_lote HAVING count(*) > 1;
SELECT programacao_id, count(*) FROM public.lotes WHERE programacao_id IS NOT NULL
GROUP BY programacao_id HAVING count(*) > 1;
SELECT id, lote_id, quantidade, volume_por_unidade FROM public.envase
WHERE quantidade <= 0 OR quantidade <> trunc(quantidade) OR volume_por_unidade <= 0
OR quantidade IS NULL OR volume_por_unidade IS NULL
OR quantidade::text IN ('NaN','Infinity','-Infinity')
OR volume_por_unidade::text IN ('NaN','Infinity','-Infinity');
SELECT id FROM public.programacao_producao
WHERE ordem_servico_id IS NOT NULL AND ordem_servico_onfarm_id IS NOT NULL;
SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('lotes','envase','programacao_producao');
ROLLBACK;
```
Múltiplos lotes por programação não são necessariamente duplicidade indevida. Não corrigir dados automaticamente. Ordem futura: diagnóstico → validar contrato/estado real → preparar SQL separado autorizado → aplicar com autorização → verificar definições/comportamento. Nenhuma alteração SQL nesta etapa, portanto nenhum rollback SQL necessário. Rollback frontend restrito às mudanças desta etapa; não restaurar escrita direta de status sem auditoria.

## Evidências
- 20 testes novos; lote focado com OS/Cockpit/runtime: **55/55**.
- Ampliados: **134/135**; única falha no gate do `.env` gerenciado divergente conhecido, separado do runtime canônico aprovado. Teste não enfraquecido.
- Gate runtime aprovado: único createClient em client.ts, URL literal https://swzpzcwiasxmjutrmvkm.supabase.co, assert antes da criação, zero refs divergentes, zero imports gerenciados/variáveis dinâmicas na produção.
- cultivofarm.types.ts intacto: **21.850 linhas**, SHA-256 f270cfbd1c4b42fbff928b4ad6bff351b4c37fbc135d880c8bb104ca2ac8cd41.
- Build automático OK em 2026-09-13T03:07:26Z. Typecheck/build manuais proibidos neste ambiente; sem comprovação separada de typecheck.
- Sem E2E conectado, concorrência real ou homologação completa de rastreabilidade: serviços proibidos nesta etapa.

---

# Geração canônica de código de lote — 13/09/2026

## Fatos reais (auditoria autenticada somente leitura no CultivoFarm swzpzcwiasxmjutrmvkm)
Estes fatos SUBSTITUEM os achados anteriores baseados apenas em migrations antigas:

1. RLS de `public.lotes` **não** está aberta globalmente: leitura segmentada para administrativo/consultor_tecnico/financeiro, acesso amplo para administrador/gestor/producao e escopo OnFarm por funções de escopo. Policies **não** foram alteradas nem ampliadas.
2. **Não** existem grupos duplicados de `codigo_lote` nem volumes produzidos negativos/NaN/Infinity.
3. Já existem `UNIQUE(codigo_lote)` e índice único parcial em `programacao_id` quando não nulo.
4. `public.gerar_codigo_lote(_ano integer)`: SECURITY DEFINER, `search_path public`, sem EXECUTE para `anon`, EXECUTE para `authenticated`; usa MAX+1 **sem trava própria** → risco de colisão em criações simultâneas de programações diferentes.
5. `public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb)`: SECURITY DEFINER, `search_path public,pg_temp`, sem EXECUTE para `anon`, EXECUTE para `authenticated`; chama `fn_cockpit_assert_operador_origem`, valida IDs, usa advisory lock por programação e é idempotente — porém **aceita `codigo_lote` do cliente** e não usa `gerar_codigo_lote`.

Observação: o item 2 do diagnóstico antigo (RLS possivelmente permissiva, duplicidades) fica retificado pelos fatos acima.

## Alterações locais desta etapa
- `src/components/cockpit/GerarLoteDialog.tsx`: removidos `generateLotCode`, o campo editável e o botão "Gerar"; o diálogo informa que o código é gerado pelo servidor no padrão `LT-AAAA-0000`; trava de clique duplo preservada.
- `src/hooks/useEsteiraLaboratorio.ts`: `p_lote` não envia mais `codigo_lote`; novas mensagens para `COCKPIT_LOTE_CODIGO_NAO_ACEITO` e `COCKPIT_LOTE_CODIGO_CONFLITO`; o código exibido é exclusivamente `data.codigo_lote`; replay continua tratado como idempotência.
- `restoration/lotes/sql/20260913040000_lotes_codigo_canonico.sql` (**NÃO APLICADO**).
- `src/test/lotes/geracao-codigo.test.ts` (24 testes).

## Migração preparada — NÃO APLICADA
Caminho: `restoration/lotes/sql/20260913040000_lotes_codigo_canonico.sql`

Conteúdo: transacional, reexecutável, sem CASCADE/TRUNCATE/DROP destrutivo e sem DML em dados existentes.
1. Gate `app.audit_target_ref = 'swzpzcwiasxmjutrmvkm'` e pré-condições estruturais (tabelas `lotes` e `programacao_producao`, funções, assinatura da RPC, unicidade de `codigo_lote` e unicidade por `programacao_id`) — aborta com mensagem explícita, sem corrigir dados.
2. `gerar_codigo_lote(integer)` recriada com `pg_advisory_xact_lock(hashtext('gerar_codigo_lote:'||ano))` **antes** do cálculo sequencial; padrão `LT-YYYY-NNNN` preservado; `search_path = public, pg_temp`.
3. `rpc_cockpit_gerar_lote_v1` com a **mesma assinatura**, nesta ordem: autenticação/papel e normalização da origem → validação do payload JSON e recusa de `codigo_lote` do cliente → advisory lock por programação → `SELECT ... FOR UPDATE` da programação → validação do vínculo OS → replay idempotente → derivação do item canônico → validação do volume → código interno → `INSERT` → evento de esteira.

### Correções da revisão bloqueante
- **Vínculo programação ↔ OS validado na RPC** (a `fn_cockpit_assert_operador_origem` só autentica/normaliza): origem `onfarm` exige `p_os_id = ordem_servico_onfarm_id`; `manual`/`b2b` exigem `p_os_id = ordem_servico_id`; ambos preenchidos, ou o campo incompatível com a origem preenchido, falham como `COCKPIT_LOTE_VINCULO_AMBIGUO`. Divergência = `COCKPIT_LOTE_VINCULO_INVALIDO`, sem criar lote nem evento.
- **Item canônico derivado só da programação bloqueada**: `produto_id`/`microrganismo_id` foram removidos do payload do navegador; se a programação não tiver nenhum dos dois, falha com `COCKPIT_LOTE_ITEM_CANONICO_AUSENTE` (nada é inventado ou alterado).
- **Payload e volume validados**: `p_lote` precisa ser objeto JSON (`COCKPIT_LOTE_PAYLOAD_INVALIDO`); `volume_produzido` é obrigatório, numérico, finito e estritamente positivo (`COCKPIT_LOTE_VOLUME_INVALIDO`). Volume produzido pode divergir do planejado — nenhuma igualdade é imposta.
- **`unique_violation` diferenciado por constraint/índice**: índice sobre `programacao_id` relê e devolve replay idempotente; índice sobre `codigo_lote` repete no máximo 3 vezes e então `COCKPIT_LOTE_CODIGO_CONFLITO`; qualquer outra violação é relançada, sem mascaramento.
- **Privilégio mínimo em `gerar_codigo_lote`**: EXECUTE revogado de `PUBLIC`, `anon` e `authenticated`. Ela é interna e continua acessível pela RPC `SECURITY DEFINER`, que executa como proprietária. Rollback desse ponto: `GRANT EXECUTE ON FUNCTION public.gerar_codigo_lote(integer) TO authenticated;`.
- EXECUTE da RPC mantido apenas para `authenticated`; `anon` sem acesso.

Nenhuma policy RLS é criada ou alterada.

### Pré-condições
- Confirmar externamente o ref `swzpzcwiasxmjutrmvkm`.
- Nenhuma outra migração em curso sobre `public.lotes`.

### Diagnóstico prévio (somente leitura)
```sql
BEGIN TRANSACTION READ ONLY;
SELECT p.proname, p.prosecdef, p.proconfig, pg_get_function_identity_arguments(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('gerar_codigo_lote','rpc_cockpit_gerar_lote_v1','fn_cockpit_assert_operador_origem');
SELECT indexrelid::regclass, pg_get_indexdef(indexrelid) FROM pg_index WHERE indrelid='public.lotes'::regclass AND indisunique;
SELECT codigo_lote, count(*) FROM public.lotes GROUP BY codigo_lote HAVING count(*)>1;
SELECT count(*) FROM public.lotes WHERE codigo_lote !~ '^LT-[0-9]{4}-[0-9]{4}$';
ROLLBACK;
```

### Ordem de aplicação
1. Rodar o diagnóstico e registrar a saída.
2. `SET app.audit_target_ref = 'swzpzcwiasxmjutrmvkm';` na mesma sessão.
3. Executar o arquivo SQL inteiro.

### Verificação posterior
```sql
SELECT proname, prosecdef, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND proname IN ('gerar_codigo_lote','rpc_cockpit_gerar_lote_v1');
SELECT pg_get_functiondef('public.gerar_codigo_lote(integer)'::regprocedure) LIKE '%pg_advisory_xact_lock%' AS tem_lock;
SELECT has_function_privilege('anon','public.gerar_codigo_lote(integer)','EXECUTE') AS anon_exec; -- deve ser false
SELECT has_function_privilege('authenticated','public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)','EXECUTE') AS auth_exec; -- true
```
Verificação funcional: gerar um lote pelo Cockpit sem informar código e confirmar padrão `LT-YYYY-NNNN`; repetir a ação na mesma programação e confirmar retorno idempotente.

### Rollback exato
Reaplicar as definições anteriores, presentes no histórico:
- `gerar_codigo_lote`: `supabase/migrations/20260520042622_e17699a6-158c-40fe-8c29-911a6a3c12f3.sql`
- `rpc_cockpit_gerar_lote_v1`: `supabase/migrations/20260828000000_os_e2e_entrega_lote_finalizacao.sql`
Ambas são `CREATE OR REPLACE`; nenhum objeto é criado ou removido por esta migração, portanto o rollback não afeta dados. Após o rollback, o frontend passará a falhar com `COCKPIT_LOTE_CODIGO_OBRIGATORIO` — restaurar também o commit anterior do diálogo/hook.

## Evidências desta etapa
- `npx vitest run src/test/lotes src/test/cockpit-laboratorio src/test/config`: **86 aprovados, 1 reprovado** — a única falha é o `binding-gate.integration.test.ts` por causa do `.env` gerenciado divergente, já conhecido e externo ao runtime canônico.
- `npx tsgo --noEmit`: sem diagnósticos.
- Runtime canônico preservado: único `createClient` em `src/integrations/supabase/client.ts` com `https://swzpzcwiasxmjutrmvkm.supabase.co`, `cultivofarm.types.ts` intacto, zero imports do `types.ts` gerenciado.
