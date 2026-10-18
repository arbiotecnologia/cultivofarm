-- F2-B3.2 SELECT-only. NÃO aprova implantação. Confirmar endpoint/ref externamente.
-- Executar/exportar em snapshot consistente READ ONLY pelo auditor, sem PII.
-- Primeiro bloco preserva exatamente o manifesto B3.1 (59 / 97e96aa537418f63d7a9b32574dbf7cc).
-- B3.1 READ-ONLY; ref deve ser comprovado no painel/endpoint antes de qualquer execução.
-- current_database(), literal de ref e GUC não comprovam destino nem autorizam ator.
WITH manifest AS (
 SELECT 'function:'||p.oid::regprocedure::text AS key,
 pg_get_functiondef(p.oid)||'|'||pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'NULL') AS value
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prokind='f' AND (p.prosrc ~ '\mpartner_technician_clients\M|\mpartner_user_clients\M'
 OR (n.nspname='public' AND p.proname IN ('validate_partner_user_client_fn','assign_b2b_user_client_secure',
 'unassign_b2b_user_client_secure','get_b2b_partner_clients_for_assignment_secure'))
 OR (n.nspname='platform_private' AND p.proname='b2b_commercial_context'))
 UNION ALL SELECT 'policy:'||schemaname||'.'||tablename||'.'||policyname,
 permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'NULL')||'|'||coalesce(with_check,'NULL')
 FROM pg_policies WHERE tablename IN ('partner_user_clients','partner_technician_clients')
 OR (coalesce(qual,'')||coalesce(with_check,'')) ~ '\m(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user|partner_user_clients|partner_technician_clients)\M'
 UNION ALL SELECT 'trigger:'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients') AND NOT t.tgisinternal
 UNION ALL SELECT 'constraint:'||c.relname||'.'||k.conname,pg_get_constraintdef(k.oid)
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
 UNION ALL SELECT 'table:'||c.relname,c.relrowsecurity::text||'|'||c.relforcerowsecurity::text||'|'||coalesce(c.relacl::text,'NULL')
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
)
SELECT md5(string_agg(key||'='||value,E'\n' ORDER BY key)),count(*) FROM manifest;
SELECT (SELECT count(*) FROM public.partner_user_clients) AS puc_rows,
 (SELECT count(*) FROM public.partner_technician_clients) AS ptc_rows;
SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('partner_user_clients','partner_technician_clients') ORDER BY table_name,ordinal_position;
SELECT conrelid::regclass::text,conname,pg_get_constraintdef(oid) FROM pg_constraint
 WHERE contype='f' AND confrelid IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass);
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
 WHERE (coalesce(qual,'')||coalesce(with_check,'')) ~ '\m(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user)\M'
 ORDER BY schemaname,tablename,policyname;

-- Manifesto ampliado: exportar TODAS as linhas, comparar antes/depois.
-- Sem hash fixo aprovado nesta fase; hash B3.1 NÃO cobre estes objetos.
WITH objects AS (
 SELECT 'column:'||n.nspname||'.'||c.relname||'.'||a.attnum AS key,
 jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
 'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),
 'acl',a.attacl::text,'comment',col_description(c.oid,a.attnum),
 'identity',a.attidentity::text,'generated',a.attgenerated::text,
 'dropped',a.attisdropped,'storage',a.attstorage::text) AS value
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
 UNION ALL
 SELECT 'index:'||i.indexrelid::regclass::text,
 jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready)
 FROM pg_index i WHERE i.indrelid IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass)
 UNION ALL
 SELECT 'relation:'||c.oid::regclass::text,
 jsonb_build_object('kind',c.relkind::text,'owner',pg_get_userbyid(c.relowner),
 'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
 'options',c.reloptions,'replica_identity',c.relreplident::text,'comment',obj_description(c.oid,'pg_class'))
 FROM pg_class c WHERE c.oid IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass)
 UNION ALL
 SELECT 'fk:'||k.conrelid::regclass::text||'.'||k.conname,
 jsonb_build_object('definition',pg_get_constraintdef(k.oid),'validated',k.convalidated,'deferrable',k.condeferrable)
 FROM pg_constraint k WHERE k.contype='f' AND
 (k.conrelid IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass)
 OR k.confrelid IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass))
 UNION ALL
 SELECT 'trigger-function:'||p.oid::regprocedure::text,
 jsonb_build_object('body_md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),
 'acl',p.proacl::text,'path',p.proconfig,'definer',p.prosecdef)
 FROM pg_proc p WHERE p.oid IN (SELECT t.tgfoid FROM pg_trigger t WHERE NOT t.tgisinternal AND
 t.tgrelid IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass))
)
SELECT key,value,md5(value::text) AS object_md5 FROM objects ORDER BY key;

-- Dependências transitivas catalogadas das relações E de seus tipos compostos.
-- Não prova ausência de SQL dinâmico/PLpgSQL/integrações fora do catálogo.
WITH RECURSIVE roots(classid,objid,objsubid) AS (
 SELECT 'pg_class'::regclass::oid,c.oid,0 FROM pg_class c WHERE c.oid IN
 ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass)
 UNION ALL
 SELECT 'pg_type'::regclass::oid,c.reltype,0 FROM pg_class c WHERE c.oid IN
 ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass)
), tree(classid,objid,objsubid) AS (
 SELECT * FROM roots
 UNION
 SELECT d.classid,d.objid,d.objsubid FROM pg_depend d JOIN tree t
 ON d.refclassid=t.classid AND d.refobjid=t.objid AND (t.objsubid=0 OR d.refobjsubid=t.objsubid)
)
SELECT classid::regclass::text AS catalog,pg_describe_object(classid,objid,objsubid) AS dependent
FROM tree ORDER BY catalog,dependent;

-- Views catalogadas: SELECT * é expandido na criação; recompilar após DDL pode ampliar saída.
SELECT n.nspname,c.relname,c.relkind::text,c.relacl::text,c.reloptions,
 md5(pg_get_viewdef(c.oid,true)) AS definition_md5,pg_get_viewdef(c.oid,true) AS definition
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('v','m') AND (pg_get_viewdef(c.oid,true) ~ '\m(partner_technician_clients|partner_user_clients)\M')
ORDER BY n.nspname,c.relname;

-- Heurística: funções com SQL dinâmico genérico podem NÃO conter nomes literais.
SELECT n.nspname,p.oid::regprocedure::text,p.prosecdef,p.proacl::text,p.proconfig,
 md5(pg_get_functiondef(p.oid)) AS definition_md5,
 p.prosrc ~* '\mEXECUTE\M|to_jsonb|row_to_json|SELECT[[:space:]]+\*' AS dynamic_or_rowshape
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prokind='f' AND (p.prosrc ~ '\m(partner_technician_clients|partner_user_clients|grant_origin|source_puc_id)\M'
 OR (n.nspname IN ('public','platform_private') AND p.prosrc ~* '\mEXECUTE\M'))
ORDER BY n.nspname,p.oid::regprocedure::text;

-- Herança/partições e publicação precisam revisão antes de ADD COLUMN.
SELECT inhrelid::regclass::text,inhparent::regclass::text FROM pg_inherits
WHERE inhrelid IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass)
 OR inhparent IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass);
SELECT pubname,puballtables,pubinsert,pubupdate,pubdelete,pubtruncate FROM pg_publication ORDER BY pubname;
SELECT pubname,schemaname,tablename FROM pg_publication_tables
WHERE schemaname='public' AND tablename IN ('partner_user_clients','partner_technician_clients') ORDER BY pubname,tablename;
-- Sem texto de query/client/user: mera triagem, não garantia contra concorrência após leitura.
SELECT relation::regclass::text,mode,granted,count(*) FROM pg_locks
WHERE relation IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass)
GROUP BY relation,mode,granted ORDER BY relation,mode,granted;
SELECT count(*) AS prepared_transaction_count FROM pg_prepared_xacts;

-- Default ACL NÃO se reaplica ao ADD COLUMN, mas rege objetos futuros/recriação de views.
SELECT pg_get_userbyid(d.defaclrole) AS owner,n.nspname,d.defaclobjtype::text,d.defaclacl::text
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
ORDER BY owner,n.nspname,d.defaclobjtype;
-- Antes de rollback: recusar TODA dependência das colunas, inclusive automática.
-- DROP COLUMN RESTRICT sozinho remove índices/constraints locais com dependência auto.
SELECT a.attname,d.deptype::text,pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent
FROM pg_attribute a JOIN pg_depend d ON d.refclassid='pg_class'::regclass
 AND d.refobjid=a.attrelid AND d.refobjsubid=a.attnum
WHERE a.attrelid='public.partner_technician_clients'::regclass
 AND a.attname IN ('grant_origin','source_puc_id') AND NOT a.attisdropped
ORDER BY a.attname,dependent;
