-- P1B: fixtures VALUES fictícias, SOMENTE LEITURA, sem RLS/RPC/JWT.
-- Não representa autorização implementada nem vínculo real aprovado.
WITH marker AS (
  SELECT count(*) FILTER (WHERE project_ref = 'swzpzcwiasxmjutrmvkm') = 1
     AND count(*) FILTER (WHERE project_ref <> 'swzpzcwiasxmjutrmvkm') = 0 AS ok
  FROM public.fiscal_environment_marker
), cases(name,actor,active,role_ok,feature_ok,owner,partner_tenant,creditor,issuer,
         client_owner,scope,status,expired,revision,expected) AS (VALUES
 ('own_A','A',true,true,true,'A','P','A','A','A',true,'APPROVED',false,1,true),
 ('own_P_shared','P',true,true,true,'A','P','A','A','A',true,'APPROVED',false,1,true),
 ('cross_tenant','B',true,true,true,'A','P','A','A','A',true,'APPROVED',false,1,false),
 ('inactive','A',false,true,true,'A','P','A','A','A',true,'APPROVED',false,1,false),
 ('no_org',NULL,true,true,true,'A','P','A','A','A',true,'APPROVED',false,1,false),
 ('no_role','A',true,false,true,'A','P','A','A','A',true,'APPROVED',false,1,false),
 ('no_feature','P',true,true,false,'A','P','A','A','A',true,'APPROVED',false,1,false),
 ('legacy_owner', 'P',true,true,true,NULL,'P','A','A','A',true,'APPROVED',false,1,false),
 ('same_A_P','A',true,true,true,'A','A','A','A','A',true,'APPROVED',false,1,false),
 ('cross_creditor','A',true,true,true,'A','P','B','A','B',true,'APPROVED',false,1,false),
 ('cross_issuer','A',true,true,true,'A','P','A','B','A',true,'APPROVED',false,1,false),
 ('cross_customer','A',true,true,true,'A','P','A','A','B',true,'APPROVED',false,1,false),
 ('no_scope','P',true,true,true,'A','P','A','A','A',false,'APPROVED',false,1,false),
 ('draft','A',true,true,true,'A','P','A','A','A',true,'DRAFT',false,1,false),
 ('expired','A',true,true,true,'A','P','A','A','A',true,'APPROVED',true,1,false),
 ('wrong_revision','A',true,true,true,'A','P','A','A','A',true,'APPROVED',false,2,false)
), evaluated AS (
 SELECT name,expected,COALESCE(active AND role_ok AND feature_ok
   AND actor IN (owner,partner_tenant) AND owner <> partner_tenant
   AND creditor IN (owner,partner_tenant) AND issuer IN (owner,partner_tenant)
   AND client_owner = creditor AND scope AND status='APPROVED'
   AND NOT expired AND revision=1,false) actual FROM cases
)
SELECT name,actual,expected,
  CASE WHEN marker.ok AND actual=expected THEN 'PASS' ELSE 'FAIL' END result
FROM evaluated CROSS JOIN marker ORDER BY name;