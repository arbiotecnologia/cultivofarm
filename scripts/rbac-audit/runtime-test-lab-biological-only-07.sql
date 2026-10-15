-- RUNTIME 07 — somente após revisão/aplicação independente. Transação sempre ROLLBACK.
-- Variáveis: produtos bio/químico/fertilizante/família NULL, micro, pedido isolado autorizado e ator produção real.
-- Este arquivo NÃO cria Auth, convites ou dados persistentes, e não executa preflight/hash como prova de aplicação.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('lab07.chemical', :'chemical_product', true);
CREATE TEMP TABLE _lab07(caso text PRIMARY KEY, ok boolean NOT NULL, obs text);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF; END $$;
INSERT INTO _lab07 VALUES
 ('bio', platform_private.lab_item_is_manufacturable(:'bio_product'::uuid,NULL),''),
 ('micro', platform_private.lab_item_is_manufacturable(NULL,:'micro'::uuid),''),
 ('quimico', NOT platform_private.lab_item_is_manufacturable(:'chemical_product'::uuid,NULL),''),
 ('fertilizante', NOT platform_private.lab_item_is_manufacturable(:'fertilizer_product'::uuid,NULL),''),
 ('familia_null', NOT platform_private.lab_item_is_manufacturable(:'null_family_product'::uuid,NULL),'não inferir'),
 ('duas_refs', NOT platform_private.lab_item_is_manufacturable(:'bio_product'::uuid,:'micro'::uuid),'ambíguo');
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ordens_servico','ordens_servico_onfarm','programacao_producao','lotes'] LOOP
  BEGIN EXECUTE format('INSERT INTO public.%I(produto_id) VALUES($1)',t) USING current_setting('lab07.chemical')::uuid;
   INSERT INTO _lab07 VALUES('insert_quimico_'||t,false,'aceito');
  EXCEPTION WHEN check_violation THEN INSERT INTO _lab07 VALUES('insert_quimico_'||t,SQLERRM='LAB_ITEM_NOT_MANUFACTURABLE',SQLERRM);
  WHEN OTHERS THEN INSERT INTO _lab07 VALUES('insert_quimico_'||t,false,SQLSTATE||' '||SQLERRM); END;
 END LOOP;
END $$;
-- Pedido misto real: chame generate_production_orders_from_partner com sessão produção/admin real fora de claims fabricados;
-- esperar os_created = linhas bio/micro, non_lab_items = linhas químicas/fertilizantes/NULL/duplas, itens do pedido intactos.
-- Repetição deve retornar os_created=0. Conclusão das OS biológicas não pode marcar pedido misto como produzido.
SELECT caso,ok,obs FROM _lab07 ORDER BY caso;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM _lab07 WHERE ok IS NOT TRUE) THEN RAISE EXCEPTION 'LAB07_RUNTIME_FAILED'; END IF; END $$;
ROLLBACK;
