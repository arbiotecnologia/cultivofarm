-- P1B18:32: modelo interno A, fixtures VALUES fictícias SOMENTE LEITURA.
-- Não implementa autorização nem prova RLS/RPC/JWT; P é terceiro sem acesso A.
WITH marker AS (
  SELECT count(*) FILTER (WHERE project_ref = 'swzpzcwiasxmjutrmvkm') = 1
     AND count(*) FILTER (WHERE project_ref <> 'swzpzcwiasxmjutrmvkm') = 0 AS ok
  FROM public.fiscal_environment_marker
), cases(name,actor,active,role_ok,feature_ok,owner,resource_owner,creditor,issuer,
         client_owner,scope,expected) AS (VALUES
 ('internal_A','A',true,true,true,'A','A','A','A','A',true,true),
 ('P_to_A','P',true,true,true,'A','A','A','A','A',true,false),
 ('A_to_P','A',true,true,true,'P','P','P','P','P',true,false),
 ('same_cnpj_P_to_A','P',true,true,true,'A','A','A','A','A',true,false),
 ('linked_organization_P_to_A','P',true,true,true,'A','A','A','A','A',true,false),
 ('cross_tenant','B',true,true,true,'A','A','A','A','A',true,false),
 ('inactive','A',false,true,true,'A','A','A','A','A',true,false),
 ('no_org',NULL,true,true,true,'A','A','A','A','A',true,false),
 ('no_role','A',true,false,true,'A','A','A','A','A',true,false),
 ('no_feature','A',true,true,false,'A','A','A','A','A',true,false),
 ('legacy_owner','A',true,true,true,NULL,'A','A','A','A',true,false),
 ('resource_P','A',true,true,true,'A','P','A','A','A',true,false),
 ('creditor_P','A',true,true,true,'A','A','P','A','A',true,false),
 ('issuer_P','A',true,true,true,'A','A','A','P','A',true,false),
 ('customer_P','A',true,true,true,'A','A','A','A','P',true,false),
 ('no_scope','A',true,true,true,'A','A','A','A','A',false,false)
), evaluated AS (
 SELECT name,expected,COALESCE(active AND role_ok AND feature_ok
   AND actor = owner AND resource_owner = owner
   AND creditor = owner AND issuer = owner AND client_owner = owner
   AND scope,false) actual FROM cases
)
SELECT name,actual,expected,
  CASE WHEN marker.ok AND actual=expected THEN 'PASS' ELSE 'FAIL' END result
FROM evaluated CROSS JOIN marker ORDER BY name;