-- Local-only additions to the previous isolated reduced schema, not hosted DDL.
ALTER TABLE public.profiles ADD COLUMN nome text DEFAULT 'Pessoa fictícia';
ALTER TABLE public.user_clientes ADD COLUMN id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.user_clientes ADD COLUMN access_level text DEFAULT 'execute';
CREATE TABLE public.produtos(id uuid PRIMARY KEY,ativo boolean DEFAULT true);
GRANT SELECT ON public.produtos TO authenticated;
CREATE TABLE public.lotes(id uuid PRIMARY KEY,produto_id uuid,organization_id uuid,status text);
GRANT SELECT ON public.lotes TO authenticated;
ALTER TABLE public.ordens_servico ADD COLUMN produto_id uuid;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN produto_id uuid;
ALTER TABLE public.aplicacoes ADD COLUMN data_aplicacao date;
ALTER TABLE public.aplicacoes ADD COLUMN hora_inicio timestamptz;
ALTER TABLE public.aplicacoes ADD COLUMN hora_fim timestamptz;
ALTER TABLE public.aplicacoes ADD COLUMN responsavel_id uuid;
ALTER TABLE public.aplicacoes ADD COLUMN responsavel text;
ALTER TABLE public.aplicacoes ADD COLUMN modo_aplicacao text;
ALTER TABLE public.aplicacoes ADD COLUMN produto_usado_id uuid;
ALTER TABLE public.aplicacoes ADD COLUMN lote_usado_id uuid;
ALTER TABLE public.aplicacoes ADD COLUMN dose_aplicada numeric;
ALTER TABLE public.aplicacoes ADD COLUMN volume_calda_l_ha numeric;
ALTER TABLE public.aplicacoes ADD COLUMN volume_total_aplicado_ml numeric;
ALTER TABLE public.aplicacoes ADD COLUMN area_aplicada_ha numeric;
ALTER TABLE public.aplicacoes ADD COLUMN equipamento text;
ALTER TABLE public.aplicacoes ADD COLUMN equipamento_modelo text;
ALTER TABLE public.aplicacoes ADD COLUMN bico_tipo text;
ALTER TABLE public.aplicacoes ADD COLUMN pressao_bar numeric;
ALTER TABLE public.aplicacoes ADD COLUMN temperatura_c numeric;
ALTER TABLE public.aplicacoes ADD COLUMN umidade_pct numeric;
ALTER TABLE public.aplicacoes ADD COLUMN vento_kmh numeric;
ALTER TABLE public.aplicacoes ADD COLUMN condicoes_climaticas text;
ALTER TABLE public.aplicacoes ADD COLUMN latitude numeric;
ALTER TABLE public.aplicacoes ADD COLUMN longitude numeric;
ALTER TABLE public.aplicacoes ADD COLUMN resultado_inicial text;
ALTER TABLE public.aplicacoes ADD COLUMN observacoes text;
ALTER TABLE public.aplicacoes ADD COLUMN created_by uuid;
ALTER TABLE public.aplicacoes ADD COLUMN parent_id uuid REFERENCES public.aplicacoes(id);
ALTER TABLE public.aplicacoes ADD COLUMN versao integer DEFAULT 1;
ALTER TABLE public.aplicacoes ADD COLUMN motivo_retificacao text;
ALTER TABLE public.aplicacoes ADD COLUMN is_latest boolean DEFAULT true;
ALTER TABLE public.aplicacoes ADD CONSTRAINT local_origin CHECK (num_nonnulls(ordem_servico_id,ordem_servico_onfarm_id)=1);
CREATE TABLE public.aplicacao_evidencias(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),aplicacao_id uuid NOT NULL,tipo text,
 url text,storage_path text NOT NULL,legenda text,mime text,tamanho_bytes bigint,created_by uuid,versao_origem_id uuid REFERENCES aplicacoes(id));
GRANT SELECT ON public.aplicacao_evidencias TO authenticated;
ALTER TABLE public.aplicacao_evidencias ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.aplicacao_evidencias_vinculos(aplicacao_id uuid REFERENCES aplicacoes(id),evidencia_id uuid REFERENCES aplicacao_evidencias(id),PRIMARY KEY(aplicacao_id,evidencia_id));
GRANT SELECT ON public.aplicacao_evidencias_vinculos TO authenticated;
ALTER TABLE public.aplicacao_evidencias_vinculos ENABLE ROW LEVEL SECURITY;
CREATE SCHEMA storage;
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb,version text,UNIQUE(bucket_id,name));
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.storage1_path_strict(p text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT p IS NOT NULL AND p !~ '(^/|\.\.|%|\\)' AND cardinality(string_to_array(p,'/'))=3;
$$;
-- Local reduced role/link resolver; not a certified copy of all client access branches.
CREATE FUNCTION public.can_user_create_aplicacao_for_cliente(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.h15_actor_organization() IS NOT NULL AND EXISTS(SELECT 1 FROM public.clientes WHERE id=c AND organization_id=public.h15_actor_organization())
 AND (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'administrativo')
 OR public.has_role(auth.uid(),'aplicador') OR public.has_role(auth.uid(),'operador_onfarm')
 OR ((public.has_role(auth.uid(),'cliente_produtor') OR public.has_role(auth.uid(),'consultor_tecnico') OR public.has_role(auth.uid(),'tecnico_agronomo')) AND c=ANY(public.get_cliente_ids_for_user(auth.uid()))));
$$;
CREATE FUNCTION public.can_user_manage_aplicacao(a uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.aplicacoes WHERE id=a) AND (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'administrativo') OR public.has_role(auth.uid(),'consultor_tecnico') OR public.has_role(auth.uid(),'aplicador'));
$$;