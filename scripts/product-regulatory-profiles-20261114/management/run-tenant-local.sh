#!/usr/bin/env bash
set -euo pipefail
H=$(dirname "$(realpath "$0")"); ROOT=$(realpath "$H/../../.."); D=$(mktemp -d /tmp/pg-dossier-tenant-XXXXXX); export PATH=/nix/store/z2f083ivabcgibvnmlva7da7dgn5q619-postgresql-17.11/bin:$PATH
chown lovable "$D"; RUN=(setpriv --reuid="$(id -u lovable)" --regid="$(id -g lovable)" --init-groups --)
"${RUN[@]}" initdb -D "$D/data" -U postgres -A trust >/dev/null
"${RUN[@]}" pg_ctl -D "$D/data" -o "-k $D -p 55442 -c listen_addresses=''" -l "$D/log" start >/dev/null
trap '"${RUN[@]}" pg_ctl -D "$D/data" stop -m fast >/dev/null; rm -rf "$D"' EXIT
P=(psql -h "$D" -p 55442 -U postgres -d postgres -v ON_ERROR_STOP=1)
"${P[@]}" -f "$H/fixture.sql" >/tmp/dossier-tenant-pg.log
"${P[@]}" -f "$H/install.sql" >>/tmp/dossier-tenant-pg.log
"${P[@]}" -f "$ROOT"/supabase/migrations/20261114014211_c1d6b4bb-7efe-47d6-96e0-472251c608af.sql >>/tmp/dossier-tenant-pg.log
"${P[@]}" <<'SQL' >>/tmp/dossier-tenant-pg.log
CREATE UNIQUE INDEX mrd_uq_micro_version ON public.microorganism_regulatory_dossiers(microorganism_id,version);
CREATE FUNCTION platform_private.product_dossier_link_integrity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP='UPDATE' AND (NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.dossier_id IS DISTINCT FROM OLD.dossier_id) THEN RAISE EXCEPTION 'immutable'; END IF; RETURN NEW; END $$;
CREATE FUNCTION platform_private.rpc_regulatory_product_document_access(uuid,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE TABLE public.microorganism_regulatory_publication_snapshots(dossier_id uuid);
CREATE FUNCTION public.fn_regulatory_storage_dossier_id(text) RETURNS uuid LANGUAGE sql AS $$ SELECT split_part($1,'/',2)::uuid $$;
CREATE FUNCTION platform_private.product_dossier_facts(p_dossier_id uuid) RETURNS jsonb LANGUAGE sql AS $$ WITH g AS (SELECT (auth.uid() IS NULL OR public.fn_regulatory_can_read()) AS ok) SELECT '{}'::jsonb $$;
SQL
"${P[@]}" <<'SQL' >>/tmp/dossier-tenant-pg.log
CREATE OR REPLACE FUNCTION platform_private.catalog_tenant_actor(mode text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
IF auth.uid() IS NULL OR public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
IF mode='mutate' AND auth.uid()='00000000-0000-4000-8000-000000000004'::uuid THEN RAISE EXCEPTION 'reader' USING ERRCODE='42501'; END IF;
RETURN CASE WHEN auth.uid()='00000000-0000-4000-8000-000000000003'::uuid THEN '00000000-0000-4000-8000-000000000011'::uuid ELSE '00000000-0000-4000-8000-000000000010'::uuid END;
END $$;
INSERT INTO public.produtos VALUES('00000000-0000-4000-8000-000000000022','QB','3',true,false,'00000000-0000-4000-8000-000000000011');
INSERT INTO public.formulacoes VALUES('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000011');
ALTER TABLE public.microorganism_regulatory_dossiers ADD COLUMN blocked_reason text, ADD COLUMN published_ncm text, ADD COLUMN published_cest text, ADD COLUMN effective_from date, ADD COLUMN effective_to date;
ALTER TABLE public.microorganism_regulatory_presentations ADD COLUMN units_confirmed boolean, ADD COLUMN gtin_confirmed boolean;
ALTER TABLE public.microorganism_ncm_candidates ADD COLUMN status text;
SQL
"${P[@]}" -f "$ROOT"/supabase/migrations/20261114023631_6b533f6a-83da-49a4-beb3-9181413c8017.sql >>/tmp/dossier-tenant-pg.log
"${P[@]}" -f "$ROOT"/supabase/migrations/20261114023655_639c12da-77ef-415f-877a-aeebf44c8cc2.sql >>/tmp/dossier-tenant-pg.log
"${P[@]}" -f "$H"/tenant-fixture/pre-facts.sql >>/tmp/dossier-tenant-pg.log
"${P[@]}" -f "$ROOT"/supabase/migrations/20261114023749_db6580fa-6eb9-4117-b42a-f7562a404be1.sql >>/tmp/dossier-tenant-pg.log
"${P[@]}" -f "$H"/tenant-fixture/live-facts.sql >>/tmp/dossier-tenant-pg.log
"${P[@]}" -f "$H/tenant-tests.sql" >>/tmp/dossier-tenant-pg.log

"${P[@]}" <<'SQL' >>/tmp/dossier-tenant-pg.log
ALTER TABLE public.microrganismos ADD COLUMN ativo boolean DEFAULT true, ADD COLUMN tipo text, ADD COLUMN concentracao_label text;
CREATE OR REPLACE FUNCTION public.fn_microorganism_regulatory_facts(p_microorganism_id uuid) RETURNS jsonb LANGUAGE sql AS $$ WITH g AS (SELECT true AS ok) SELECT to_jsonb(d) FROM public.microorganism_regulatory_dossiers d WHERE product_id IS NULL AND microorganism_id=p_microorganism_id AND deleted_at IS NULL AND (SELECT ok FROM g) LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_detail(p_microorganism_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE v_d public.microorganism_regulatory_dossiers; BEGIN SELECT * INTO v_d FROM public.microorganism_regulatory_dossiers WHERE product_id IS NULL AND microorganism_id=p_microorganism_id AND deleted_at IS NULL; IF v_d.id IS NULL THEN RETURN NULL; END IF; RETURN to_jsonb(v_d); END $$;
SQL
"${P[@]}" -f "$ROOT/supabase/migrations/20261114032614_e0db7d83-23ea-4e36-a673-4ef288c7dd72.sql" >>/tmp/dossier-tenant-pg.log
"${P[@]}" -f "$ROOT/supabase/migrations/20261114032912_5d0ed2bf-aa41-48db-842a-a928c183b26e.sql" >>/tmp/dossier-tenant-pg.log
"${P[@]}" -f "$H/fiscal-entry-tests.sql" >>/tmp/dossier-tenant-pg.log

cat /tmp/dossier-tenant-pg.log | tail -5
