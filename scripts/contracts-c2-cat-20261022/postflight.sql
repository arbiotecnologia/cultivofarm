-- SELECT only. Structural checks are NOT JWT/REST certification.
SELECT md5(pg_get_functiondef('platform_private.b2b_actor_scope(uuid)'::regprocedure))='c3f2997746f24bc2efd15db5c0ccc862' AS scope_unchanged,
 md5(pg_get_functiondef('public.get_my_commercial_partner_projection()'::regprocedure))='730a17482e07d1bc350edfaea907cd1f' AS wrapper_unchanged,
 md5(pg_get_functiondef('public.is_valid_b2b_partner_user(uuid,uuid)'::regprocedure))='93520101987e599280460d3dadcf3a9f' AS validator_unchanged;
SELECT pg_get_userbyid(proowner) AS owner,proacl::text AS acl,pg_get_functiondef(oid) AS definition
FROM pg_proc WHERE oid='platform_private.b2b_commercial_partner_projection()'::regprocedure;
-- After independent installation: real caller POST /rest/v1/rpc/get_my_commercial_partner_projection
-- must read C2_CAT_V1; manager catalog=true, sheet follows entitlement;
-- technical catalog=false; revoked/future/foreign/no-link denied or capabilities=false.
-- Old context call and catalog overloads unchanged; positive sheet content remains UNVERIFIED.