
# Etapa 1 — Inventário e plano de limpeza (SEM alterações)

> Nada será alterado nesta etapa. Nenhum arquivo novo, nenhuma migration, nenhum DELETE/UPDATE/TRUNCATE/DROP. A entrega é o relatório e o desenho da migration+snapshot; os números finais precisam ser preenchidos rodando o coletor de leitura descrito em (B).

## A. Ambiente auditado

- Projeto Supabase alvo: ref mascarada `nav***fnk` (produção AR Bio Manager, `VITE_SUPABASE_URL` em `.env`).
- Confirmação de não-staging: staging fiscal usava ref `ika***hoq`; este ambiente é `nav***fnk` ≠ staging. **OK para inventário.**
- Sessão atual sem `PGHOST`/`psql` administrativo; sem tool de DB direta. Toda coleta de contagens será feita via um dos dois caminhos read-only já presentes no repo, sem escrever nada:
  1. `supabase/functions/admin-audit-produtos-orfaos/index.ts` (JWT + `has_role('administrador')`, service role apenas para SELECT).
  2. `restoration/produtos-orfaos-audit.sql` no SQL Editor do projeto.

## B. Fontes consultadas nesta etapa

- `src/integrations/supabase/types.ts` (gerado a partir do schema real do projeto).
- `restoration/produtos-orfaos-audit.sql` — 22 pares (tabela, coluna) já mapeados com FK para `produtos`.
- `supabase/functions/admin-audit-produtos-orfaos/index.ts` — mesma lista, com paginação e contagem exata.
- `.lovable/plan.md` e `restoration/README-fase-orfaos.md` — classificação prévia operacional × histórica.
- Código consumidor: `pages/dashboard/VisaoGeral.tsx`, `components/bi/*`, `pages/portal/*`, `components/visita/EncerramentoCard.tsx`, `lib/pdf/fichaTecnicaProdutoPdf.ts`, `components/protocolos/*`.

Para fechar a introspecção **sem depender só do types.ts**, a coleta abaixo (etapa 2 de leitura, ainda somente-SELECT) inclui varredura viva de `information_schema`:

```sql
-- 1. Toda FK apontando para produtos / protocolos / protocolo_itens
SELECT tc.table_schema, tc.table_name, kcu.column_name,
       ccu.table_name AS ref_table, ccu.column_name AS ref_column,
       rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_schema, constraint_name)
JOIN information_schema.constraint_column_usage ccu USING (constraint_schema, constraint_name)
JOIN information_schema.referential_constraints rc USING (constraint_schema, constraint_name)
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_schema = 'public'
  AND ccu.table_name IN ('produtos','protocolos','protocolo_itens','microorganismos')
ORDER BY tc.table_name;

-- 2. Colunas suspeitas de vínculo informal (sem FK) por convenção de nome
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name ~* '(produto|product|protocolo|microorganismo|micror|insumo).*_?id$'
ORDER BY table_name, column_name;
```

Essas duas queries fecham o requisito de **descobrir também vínculos sem FK formal** (regra 3/6).

## C. Mapa de dependências (a partir de `types.ts` + `audit.sql`)

Grupos por natureza — cada linha é uma referência viva no schema:

### C.1 Operacionais vivas (excluir órfãos → DELETE)
- `catalogo_volumes(produto_id)`
- `commercial_campaign_products(product_id)`
- `cq_parametros_referencia(produto_id)`
- `estoque_produto(produto_id)`
- `partner_product_prices(product_id)`
- `partner_simulation_items(product_id)`
- `product_crop_recommendations(produto_id)`
- `product_target_recommendations(produto_id)`
- `product_technical_profiles(produto_id)`
- `product_fiscal_profiles(product_id)`
- `produto_etiquetas(produto_id)`
- `programacao_producao(produto_id)`

### C.2 Histórico transacional (preservar linha → SET NULL, se coluna for nullable)
- `entregas(produto_id)`
- `estoque_embalagens(produto_id)`
- `formulacoes(produto_id, component_insumo_id)`
- `lotes(produto_id)`
- `ordens_servico(produto_id)`
- `ordens_servico_onfarm(produto_id)`
- `os_faturamento_base(produto_id)`
- `partner_order_items(product_id)` — **verificar nullability**; se NOT NULL, escalar como bloqueio antes de qualquer plano de DELETE (nota fiscal/contábil).
- `registros_consultor_recomendacoes(produto_biologico_sugerido_id)`

### C.3 Protocolos e microrganismos
- `protocolos`, `protocolo_itens`, `microorganismos` — cadeias `protocolo_itens → protocolos` e `protocolo_itens → produtos/microorganismos`. Introspecção em (B) confirma nomes reais e FKs; nada a excluir se a query de FK não retornar quebras.

### C.4 Dados protegidos (fora de escopo, nunca tocar)
Usuários, roles, `has_role`, configurações do sistema, migrations, funções, triggers, policies, views, seed do catálogo v1.3 (7 produtos: `SOLO-1`, `SOLO-2`, `BINS-01`, `BINS-02`, `BFUN-01`, `BINO-01`, `BSOL-01`).

## D/E/F. Inventário — colunas a preencher via leitura

A tabela abaixo é o **template do relatório final**. Cada célula "<preencher>" vem da execução da Edge Function `admin-audit-produtos-orfaos` (ou do SQL de auditoria) sem qualquer escrita. Nenhum número é assumido.

```text
tabela                                | coluna                        | total | orfaos | distinct_ids | acao_proposta | risco
--------------------------------------+-------------------------------+-------+--------+--------------+---------------+------
catalogo_volumes                      | produto_id                    |   ?   |   ?    |      ?       | DELETE        | baixo
commercial_campaign_products          | product_id                    |   ?   |   ?    |      ?       | DELETE        | baixo
cq_parametros_referencia              | produto_id                    |   ?   |   ?    |      ?       | DELETE        | baixo
estoque_produto                       | produto_id                    |   ?   |   ?    |      ?       | DELETE        | médio (saldos)
partner_product_prices                | product_id                    |   ?   |   ?    |      ?       | DELETE        | baixo
partner_simulation_items              | product_id                    |   ?   |   ?    |      ?       | DELETE        | baixo
product_crop_recommendations          | produto_id                    |   ?   |   ?    |      ?       | DELETE        | baixo
product_target_recommendations        | produto_id                    |   ?   |   ?    |      ?       | DELETE        | baixo
product_technical_profiles            | produto_id                    |   ?   |   ?    |      ?       | DELETE        | baixo
product_fiscal_profiles               | product_id                    |   ?   |   ?    |      ?       | DELETE        | baixo (perfil recriável)
produto_etiquetas                     | produto_id                    |   ?   |   ?    |      ?       | DELETE        | baixo
programacao_producao                  | produto_id                    |   ?   |   ?    |      ?       | DELETE        | médio (plan. futura)
entregas                              | produto_id                    |   ?   |   ?    |      ?       | SET NULL      | alto se NOT NULL
estoque_embalagens                    | produto_id                    |   ?   |   ?    |      ?       | SET NULL      | baixo
formulacoes                           | produto_id                    |   ?   |   ?    |      ?       | SET NULL      | médio
formulacoes                           | component_insumo_id           |   ?   |   ?    |      ?       | SET NULL      | médio
lotes                                 | produto_id                    |   ?   |   ?    |      ?       | SET NULL      | médio
ordens_servico                        | produto_id                    |   ?   |   ?    |      ?       | SET NULL      | alto
ordens_servico_onfarm                 | produto_id                    |   ?   |   ?    |      ?       | SET NULL      | alto
os_faturamento_base                   | produto_id                    |   ?   |   ?    |      ?       | SET NULL      | alto (fiscal)
partner_order_items                   | product_id                    |   ?   |   ?    |      ?       | SET NULL*     | alto (fiscal, verificar NOT NULL)
registros_consultor_recomendacoes     | produto_biologico_sugerido_id |   ?   |   ?    |      ?       | SET NULL      | baixo
```

**Produtos candidatos (E):** o conjunto `IDs órfãos global` retornado pelo auditor — por definição, IDs referenciados que não constam em `public.produtos`. Justificativa: FK quebrada / referência a entidade inexistente (regra 2.a). Não existe candidato do tipo "produto no catálogo sem uso" — a limpeza **não remove** nenhuma linha de `public.produtos` (todos os 7 do v1.3 são preservados).

**Protocolos candidatos (F):** só entram se a query C.3 revelar `protocolo_itens.produto_id` ou `protocolo_itens.microorganismo_id` apontando para pai ausente, ou `protocolo_itens.protocolo_id` órfão (cadeia neto→filho→pai). Sem números confirmados via leitura, **nenhum protocolo é candidato nesta etapa**.

## G. Dados válidos preservados
- Todas as 7 linhas de `public.produtos` (catálogo v1.3).
- `microorganismos`, `protocolos`, `protocolo_itens` cujos vínculos resolvem — não são tocados.
- Configurações fiscais da empresa, certificados, RTC, `system_config`, `user_roles`, perfis de usuário.
- Migrations, funções, triggers, policies, views — nada de DDL.

## H. Ordem transacional de exclusão (folhas → raiz)

Uma única transação `BEGIN … COMMIT` com `SET LOCAL statement_timeout = '5min'` e `SET LOCAL lock_timeout = '30s'`. Ordem:

1. **SET NULL** nas históricas (não bloqueiam nada): `entregas`, `estoque_embalagens`, `formulacoes` (ambas colunas), `lotes`, `ordens_servico`, `ordens_servico_onfarm`, `os_faturamento_base`, `registros_consultor_recomendacoes`, `partner_order_items` (**apenas se nullable**; caso contrário, abortar com raise).
2. **DELETE** nas operacionais folha primeiro:
   - `catalogo_volumes`, `commercial_campaign_products`, `cq_parametros_referencia`,
   - `partner_simulation_items`, `partner_product_prices`,
   - `product_crop_recommendations`, `product_target_recommendations`,
   - `product_technical_profiles`, `product_fiscal_profiles`,
   - `produto_etiquetas`, `programacao_producao`,
   - `estoque_produto` (por último dentro do grupo — outros podem referenciar saldos).
3. **Nenhum DELETE em `public.produtos`.**
4. Todas as cláusulas filtradas por `<coluna> NOT IN (SELECT id FROM public.produtos)` — nunca por lista literal.

Isolamento: `READ COMMITTED` é suficiente (dados órfãos não sofrem inserção concorrente para os mesmos IDs).

## I. Snapshot / recuperação (a criar na etapa de execução, não agora)

- Schema `backup_orfaos_YYYYMMDD_HHMM`.
- Para cada tabela em (H), `CREATE TABLE backup_orfaos_….<tabela>_<coluna> AS SELECT * FROM public.<tabela> WHERE <coluna> IN (<ids órfãos>)` **antes** do UPDATE/DELETE.
- Manifesto `restoration/orfaos-cleanup-<ts>.md` com: ref mascarada, IDs órfãos, contagens por tabela pré, comando de snapshot, contagens pós, checksum `md5(string_agg(id::text, ',' ORDER BY id))` por tabela pré/pós.
- Recuperação: `INSERT INTO public.<tabela> SELECT * FROM backup_orfaos_….<tabela>_<coluna> ON CONFLICT DO NOTHING`.

## J. Assertions

**Pré (dentro da transação, antes de qualquer escrita):**
```sql
DO $$ BEGIN
  IF current_setting('cluster_name', true) IS NOT NULL
     AND current_database() <> '<db_esperado>' THEN
    RAISE EXCEPTION 'DB alvo inesperado';
  END IF;
  ASSERT (SELECT count(*) FROM public.produtos) = 7, 'catalogo v1.3 alterado';
END $$;
```
Guard adicional por project ref: comparar `current_setting('app.settings.jwt_secret')` **não** funciona; usar um parâmetro passado por variável psql (`\set expected_ref nav...fnk`) e abortar se divergir.

**Pós (mesma transação, antes do COMMIT):**
- Recontar cada par (tabela, coluna) da matriz D: `orfaos = 0`.
- `SELECT count(*) FROM public.produtos` continua = 7.
- Nenhuma tabela de (C.4) sofreu alteração — verificar via `xmax` amostral ou simplesmente por escopo do script (não referencia essas tabelas).

**Fora da transação (após COMMIT):**
- `bun run typecheck`, `bun run build`, `bunx vitest run` — sem regressões.
- Reexecução do auditor: `distinct_ids_orfaos_global = 0`.
- Smoke UI: `/dashboard`, `/portal-parceiro/*`, `EncerramentoCard`, `FichasTecnicas`.

## K. Riscos e bloqueios

1. **`partner_order_items.product_id NOT NULL`** — se confirmado, `SET NULL` é impossível; opções: (i) manter e documentar como dívida técnica, (ii) preservar linha e nulificar via coluna sombra, (iii) DELETE com aprovação contábil explícita. **Bloqueia execução até decisão.**
2. **`os_faturamento_base`** ligada a NF-e — mesmo SET NULL pode invalidar rastreabilidade fiscal. Requer OK explícito antes de ir a produção.
3. Triggers em `estoque_produto`/`movimentacoes_estoque` podem recalcular saldos — validar que o DELETE não dispara efeitos colaterais indesejados (ler `pg_trigger` para as tabelas em (H)).
4. Ausência de `psql` direto nesta sessão: a **execução** da etapa 2 exigirá SQL Editor do Supabase ou Edge Function dedicada (fora de escopo desta etapa 1).
5. RLS: script deve rodar como `postgres`/service role no SQL Editor — não é executável via anon/authenticated.

## L. Contagem prevista de exclusões

**Não estimável sem a leitura ao vivo.** A matriz em (D) já tem `total` e `orfaos` marcados `?`; a execução do auditor read-only preenche esses valores e vira o número final por tabela. Qualquer estimativa aqui seria chute e contraria a regra 8.

## M. Recomendação

**INCONCLUSIVO nesta etapa** — o desenho está pronto e seguro, mas dois insumos precisam ser coletados (ainda somente-leitura) antes de declarar APTO:

1. Rodar `admin-audit-produtos-orfaos` (ou `restoration/produtos-orfaos-audit.sql`) para preencher a matriz (D) e a lista de IDs em (E).
2. Rodar as duas queries de `information_schema` em (B) para confirmar que não há FK/vínculo informal fora das 22 já mapeadas e para checar `is_nullable` de `partner_order_items.product_id` (risco K.1).

Com esses dois resultados em mãos, o plano vira **APTO PARA LIMPEZA** ou, se K.1 confirmar `NOT NULL`, **CORRIGIR PLANO** antes de qualquer escrita.

Próximo passo sugerido (ainda leitura): você me autoriza a executar os dois SELECTs de introspecção + o auditor via SQL Editor / Edge Function e trazer a matriz preenchida?
