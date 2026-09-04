-- H7N ROLLBACK — P2 — remove search_path fixado dos 4 helpers IMMUTABLE (estado pré-H7N: proconfig nulo)
-- Reverte EXATAMENTE a migration 20260904131341_h7n_p2_search_path (staging ikaauvsflpmamgxmkhoq).
-- Estado anterior reconstruído a partir de restoration/homologacao-h7/97-h7n-p0p1-auditoria.md
-- e restoration/homologacao-h7/h7n-inventario/ (fn_inventory.tsv, viewdefs.sql).
-- Executar SOMENTE via guard-staging.sh + staging-psql.sh, dentro de transação.
-- NÃO executar em produção (navfzbwgwzruipouyfnk).
begin;

alter function public.fn_h6b_num(numeric) reset search_path;
alter function public.fn_gtin_is_valid(text) reset search_path;
alter function public.fn_regulatory_storage_path_ok(text) reset search_path;
alter function public.fn_regulatory_storage_dossier_id(text) reset search_path;
commit;
