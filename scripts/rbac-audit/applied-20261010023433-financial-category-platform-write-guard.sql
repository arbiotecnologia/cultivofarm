-- Global catalog: tenant financial roles may read but may not mutate shared categories.
-- Trigger also covers SECURITY DEFINER writers; no ACL expansion.
CREATE OR REPLACE FUNCTION public.guard_financial_category_platform_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'superadmin'::public.app_role) THEN
  RAISE EXCEPTION 'FINANCIAL_CATEGORY_PLATFORM_WRITE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_financial_category_platform_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_financial_category_platform_write
BEFORE INSERT OR UPDATE OR DELETE ON public.financial_categories
FOR EACH ROW EXECUTE FUNCTION public.guard_financial_category_platform_write();
