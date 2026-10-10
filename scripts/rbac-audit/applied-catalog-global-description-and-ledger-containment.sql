REVOKE EXECUTE ON FUNCTION public.update_product_b2b_description(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.catalog_platform_admin_audit FROM PUBLIC,anon,authenticated;
