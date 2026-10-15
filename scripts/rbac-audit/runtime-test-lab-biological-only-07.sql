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
-- Roteiro por claims SQL sobre ator REAL autorizado: NÃO equivale JWT/browser/ACL real.
-- mixed_order deve ser pedido isolado sem OS, com linhas bio/micro e não laboratoriais.
CREATE TEMP TABLE _lab07ctx(k text PRIMARY KEY,v text);
INSERT INTO _lab07ctx VALUES ('mixed_order', :'mixed_order'),('actor', :'production_actor');
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',:'production_actor',
 'role','authenticated','iat',extract(epoch FROM now())::bigint-5,
 'exp',extract(epoch FROM now()+interval '5 min')::bigint)::text,true);
DO $$ DECLARE oid uuid; before_items jsonb; after_items jsonb; expected_lab int;
 expected_nonlab int; first_result jsonb; replay_result jsonb;
BEGIN
 SELECT v::uuid INTO oid FROM _lab07ctx WHERE k='mixed_order';
 IF EXISTS(SELECT 1 FROM public.ordens_servico WHERE partner_order_id=oid) THEN RAISE EXCEPTION 'LAB07_REQUIRES_ISOLATED_NEW_ORDER'; END IF;
 SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id),
 count(*) FILTER(WHERE platform_private.lab_item_is_manufacturable(i.product_id,i.microrganismo_id)),
 count(*) FILTER(WHERE NOT platform_private.lab_item_is_manufacturable(i.product_id,i.microrganismo_id))
 INTO before_items,expected_lab,expected_nonlab FROM public.partner_order_items i WHERE i.order_id=oid;
 IF expected_lab=0 OR expected_nonlab=0 THEN RAISE EXCEPTION 'LAB07_REQUIRES_MIXED_ORDER'; END IF;
 first_result:=public.generate_production_orders_from_partner(oid);
 INSERT INTO _lab07 VALUES('mixed_os_count',(first_result->>'os_created')::int=expected_lab,first_result::text);
 INSERT INTO _lab07 VALUES('mixed_nonlab_count',(first_result->>'non_lab_items')::int=expected_nonlab,'');
 INSERT INTO _lab07 SELECT 'mixed_only_biological',NOT EXISTS(SELECT 1 FROM public.ordens_servico o
 WHERE o.partner_order_id=oid AND NOT platform_private.lab_item_is_manufacturable(o.produto_id,o.microrganismo_id)),'';
 replay_result:=public.generate_production_orders_from_partner(oid);
 INSERT INTO _lab07 VALUES('mixed_replay',(replay_result->>'os_created')::int=0,replay_result::text);
 SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) INTO after_items FROM public.partner_order_items i WHERE i.order_id=oid;
 INSERT INTO _lab07 VALUES('mixed_items_unchanged',before_items=after_items,'snapshots intactos');
 INSERT INTO _lab07 SELECT 'mixed_not_wholly_produced',status<>'produzido','' FROM public.partner_orders WHERE id=oid;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','',true);
-- Finalização completa de OS, preflights, Auth/RLS e concorrência: UNVERIFIED no ambiente real.
-- check-lab07-pglite.mjs executa o caso de conclusão mista localmente com schema/Auth stubs.
SELECT caso,ok,obs FROM _lab07 ORDER BY caso;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM _lab07 WHERE ok IS NOT TRUE) THEN RAISE EXCEPTION 'LAB07_RUNTIME_FAILED'; END IF; END $$;
ROLLBACK;
