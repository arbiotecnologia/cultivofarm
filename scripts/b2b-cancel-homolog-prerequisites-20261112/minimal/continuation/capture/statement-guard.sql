CREATE OR REPLACE FUNCTION platform_private.homolog_validation_block_receivable_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN RAISE EXCEPTION 'HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED: criacao de titulos desabilitada durante preparacao AR Bio/FSF' USING ERRCODE='42501'; END $function$
;
