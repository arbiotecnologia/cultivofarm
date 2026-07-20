
DO $$ BEGIN
  CREATE TYPE public.recomendacao_comentario_autor_tipo AS ENUM ('produtor','tecnico','gestor','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.recomendacao_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recomendacao_id uuid NOT NULL REFERENCES public.registros_consultor_recomendacoes(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL,
  autor_tipo public.recomendacao_comentario_autor_tipo NOT NULL,
  autor_nome text NOT NULL,
  mensagem text NOT NULL CHECK (length(btrim(mensagem)) > 0),
  lido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rec_coment_recomendacao ON public.recomendacao_comentarios(recomendacao_id, created_at);
CREATE INDEX idx_rec_coment_autor ON public.recomendacao_comentarios(autor_id);

GRANT SELECT, INSERT, UPDATE ON public.recomendacao_comentarios TO authenticated;
GRANT ALL ON public.recomendacao_comentarios TO service_role;

ALTER TABLE public.recomendacao_comentarios ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pode_acessar_recomendacao(_user_id uuid, _recomendacao_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.registros_consultor_recomendacoes r
    JOIN public.registros_consultor rc ON rc.id = r.registro_consultor_id
    WHERE r.id = _recomendacao_id
      AND (
        public.has_role(_user_id, 'administrador'::app_role)
        OR public.has_role(_user_id, 'gestor'::app_role)
        OR public.has_role(_user_id, 'tecnico_agronomo'::app_role)
        OR public.has_role(_user_id, 'consultor_tecnico'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_clientes uc
          WHERE uc.user_id = _user_id AND uc.cliente_id = rc.cliente_id
        )
      )
  );
$$;

CREATE POLICY "Ler comentários da recomendação acessível"
ON public.recomendacao_comentarios FOR SELECT
TO authenticated
USING (public.pode_acessar_recomendacao(auth.uid(), recomendacao_id));

CREATE POLICY "Inserir comentário próprio em recomendação acessível"
ON public.recomendacao_comentarios FOR INSERT
TO authenticated
WITH CHECK (
  autor_id = auth.uid()
  AND public.pode_acessar_recomendacao(auth.uid(), recomendacao_id)
);

CREATE POLICY "Marcar como lido"
ON public.recomendacao_comentarios FOR UPDATE
TO authenticated
USING (public.pode_acessar_recomendacao(auth.uid(), recomendacao_id))
WITH CHECK (public.pode_acessar_recomendacao(auth.uid(), recomendacao_id));

CREATE TRIGGER trg_rec_coment_updated
BEFORE UPDATE ON public.recomendacao_comentarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.recomendacao_comentarios REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recomendacao_comentarios;
