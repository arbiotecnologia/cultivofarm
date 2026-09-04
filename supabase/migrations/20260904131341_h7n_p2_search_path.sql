-- H7n P2: deterministic search_path for immutable helpers.
alter function public.fn_h6b_num(numeric) set search_path = pg_catalog;
alter function public.fn_gtin_is_valid(text) set search_path = pg_catalog;
alter function public.fn_regulatory_storage_path_ok(text) set search_path = pg_catalog;
alter function public.fn_regulatory_storage_dossier_id(text) set search_path = pg_catalog;


