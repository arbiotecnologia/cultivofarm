// PostgreSQL PGlite isolado. Auth/tenant/schema simulados; hashes reais dos helpers preservados.
// Uso: node scripts/rbac-audit/check-hotfix-visit12-current-schema.mjs /tmp/catalog12-tools/node_modules/@electric-sql/pglite/dist/index.js
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const id = n => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12,'0')}`;
let pass=0;
const check=(name,ok)=>{assert.ok(ok,name); console.log('PASS',name);pass++;};
const denied=async(name,fn,code)=>{let e;try{await fn();}catch(err){e=err;}check(name, e?.code===code);};
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULLIF(current_setting('test.uid',true),'')::uuid$$;
CREATE TABLE organizations(id uuid,ativo boolean,status text);
CREATE TABLE fiscal_environment_marker(project_ref text);
INSERT INTO fiscal_environment_marker VALUES ('swzpzcwiasxmjutrmvkm');
CREATE TABLE registros_consultor(id uuid PRIMARY KEY,cliente_id uuid,fazenda_id uuid,talhao_id uuid,created_by uuid,consultor_responsavel uuid,status text);
CREATE TABLE produtos(id uuid PRIMARY KEY,nome text,ativo boolean,familia_catalogo text);
CREATE TABLE microrganismos(id uuid PRIMARY KEY,nome text,ativo boolean);
CREATE TABLE catalog_tenant_visibility(organization_id uuid,entity_type text,produto_id uuid,microrganismo_id uuid,hidden boolean);
CREATE TABLE registros_consultor_recomendacoes(id uuid PRIMARY KEY,registro_consultor_id uuid,produto_biologico_sugerido_id uuid,microrganismo_id uuid,recomendacao_tecnica text);
CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.sa',true)='true'$$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$SELECT current_setting('test.org')::uuid$$;
CREATE FUNCTION public._saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION platform_private.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE TYPE app_role AS ENUM ('administrador','gestor');
CREATE FUNCTION platform_private.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION public.can_view_catalog_internal(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.technical_actor_ready(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid() IS NOT NULL$$;
CREATE FUNCTION public.technical_refs_in_actor_tenant(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1=platform_private.h15_actor_organization()$$;
CREATE FUNCTION public.technical_client_link(uuid,uuid,text[]) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION public.is_visit_responsible(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION public.is_active_visit_participant(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.can_manage_technical_visit(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT public.can_view_technical_visit($1,$2)$$;
CREATE FUNCTION public.is_technical_visit_editable_status(text) RETURNS boolean LANGUAGE sql AS $$SELECT $1 IN ('rascunho','em_andamento')$$;
CREATE FUNCTION public.rpc_upsert_recomendacao_visita(uuid,uuid,jsonb,integer) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;` .replace('CREATE FUNCTION public.can_manage_technical_visit','CREATE FUNCTION public.can_manage_technical_visit'));
// SQL-language validation references require the view helper to exist first.
