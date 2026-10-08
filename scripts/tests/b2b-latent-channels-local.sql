CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT platform_private.has_role($1,$2) $$;
CREATE TYPE public.cliente_tipo_pessoa AS ENUM ('fisica','juridica');
ALTER TABLE public.clientes ADD COLUMN nome text,ADD COLUMN razao_social text,ADD COLUMN nome_fantasia text,
 ADD COLUMN tipo_pessoa public.cliente_tipo_pessoa,ADD COLUMN cpf_cnpj text,ADD COLUMN telefone text,
 ADD COLUMN endereco_municipio text,ADD COLUMN endereco_estado text;
CREATE TABLE public.partner_user_clients(user_id uuid,partner_id uuid,cliente_id uuid,active boolean,assignment_type text,can_create_simulation boolean,can_monitor boolean,assigned_at timestamptz);
CREATE TABLE public.partner_simulations(cliente_id uuid,partner_id uuid,created_by uuid,created_at timestamptz);
CREATE TABLE public.partner_orders(id uuid,partner_id uuid,cliente_id uuid);
CREATE TABLE public.partner_order_messages(id uuid,order_id uuid,status text,status_updated_at timestamptz);
CREATE SCHEMA storage;
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/'); $$;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Exact live permissive branding policies (foldername stub affects only files).
CREATE POLICY "branding logo read" ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='logos');
CREATE POLICY "branding logo upload parceiro" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='logos' AND (storage.foldername(name))[1]='parceiros' AND EXISTS(
 SELECT 1 FROM public.partner_users pu WHERE pu.user_id=auth.uid() AND pu.partner_id::text=(storage.foldername(objects.name))[2] AND pu.papel='gestor'));
GRANT SELECT ON public.partner_users TO authenticated;
RESET ROLE;
UPDATE public.profiles SET organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE public.user_roles SET role='administrador';
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
INSERT INTO public.profiles(user_id,organization_id,ativo,senha_provisoria) VALUES
 ('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,false),
 ('66666666-6666-4666-8666-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,false),
 ('77777777-7777-4777-8777-777777777777','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,false);
INSERT INTO public.user_roles VALUES('55555555-5555-4555-8555-555555555555','parceiro_b2b'),('66666666-6666-4666-8666-666666666666','parceiro_b2b'),('77777777-7777-4777-8777-777777777777','parceiro_b2b');
INSERT INTO public.partner_users VALUES('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','gestor'),('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','gestor'),('77777777-7777-4777-8777-777777777777','33333333-3333-4333-8333-333333333333','gestor');
INSERT INTO public.clientes(id,organization_id,nome,tipo_pessoa) VALUES
 ('88888888-8888-4888-8888-888888888888','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic A','juridica'),
 ('99999999-9999-4999-8999-999999999999','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Synthetic B','fisica');
INSERT INTO public.partner_user_clients VALUES
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888',true,'direct',true,true,now()),
 ('77777777-7777-4777-8777-777777777777','33333333-3333-4333-8333-333333333333','99999999-9999-4999-8999-999999999999',true,'direct',true,true,now()),
 ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','99999999-9999-4999-8999-999999999999',true,'cross-invalid',true,true,now());
INSERT INTO public.partner_orders VALUES
 ('a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',NULL),
 ('a2222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222',NULL),
 ('b3333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333',NULL);
INSERT INTO public.partner_order_messages VALUES
 ('a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','nao_lida',NULL),
 ('a2222222-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222222','nao_lida',NULL),
 ('b3333333-3333-4333-8333-333333333333','b3333333-3333-4333-8333-333333333333','nao_lida',NULL);
CREATE FUNCTION pg_temp.denied(label text,statement text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE '22023' THEN RAISE NOTICE 'PASS %',label; RETURN; END;
 RAISE EXCEPTION 'FAIL %',label; END $$;