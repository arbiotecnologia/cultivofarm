
-- 1) Colunas na tabela entregas
ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS entregue_em timestamptz,
  ADD COLUMN IF NOT EXISTS recebido_por_nome text,
  ADD COLUMN IF NOT EXISTS recebido_por_cargo text,
  ADD COLUMN IF NOT EXISTS recebido_por_documento text,
  ADD COLUMN IF NOT EXISTS observacoes_confirmacao text,
  ADD COLUMN IF NOT EXISTS confirmado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS comprovante_entrega_obrigatorio boolean NOT NULL DEFAULT false;

-- 2) Tabela de documentos
CREATE TABLE IF NOT EXISTS public.entrega_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  tipo_documento text NOT NULL CHECK (tipo_documento IN ('RECIBO_ASSINADO','FOTO_ENTREGA','COMPROVANTE','OUTRO')),
  nome_arquivo text NOT NULL,
  arquivo_path text NOT NULL,
  mime_type text,
  tamanho_bytes bigint,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entrega_documentos_entrega_id ON public.entrega_documentos(entrega_id);
CREATE INDEX IF NOT EXISTS idx_entrega_documentos_tipo ON public.entrega_documentos(tipo_documento);

ALTER TABLE public.entrega_documentos ENABLE ROW LEVEL SECURITY;

-- Helpers para policies
-- pode visualizar
CREATE POLICY "entrega_docs_select" ON public.entrega_documentos
FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'administrador'::app_role)
  OR has_role(auth.uid(),'gestor'::app_role)
  OR has_role(auth.uid(),'administrativo'::app_role)
  OR has_role(auth.uid(),'financeiro'::app_role)
  OR has_role(auth.uid(),'consultor_tecnico'::app_role)
  OR has_role(auth.uid(),'tecnico_agronomo'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.entregas e
    WHERE e.id = entrega_documentos.entrega_id
      AND e.cliente_id = ANY(get_cliente_ids_for_user(auth.uid()))
  )
);

CREATE POLICY "entrega_docs_insert" ON public.entrega_documentos
FOR INSERT TO authenticated WITH CHECK (
  uploaded_by = auth.uid() AND (
    has_role(auth.uid(),'administrador'::app_role)
    OR has_role(auth.uid(),'gestor'::app_role)
    OR has_role(auth.uid(),'administrativo'::app_role)
    OR has_role(auth.uid(),'financeiro'::app_role)
  )
);

CREATE POLICY "entrega_docs_delete" ON public.entrega_documentos
FOR DELETE TO authenticated USING (
  has_role(auth.uid(),'administrador'::app_role)
  OR has_role(auth.uid(),'gestor'::app_role)
);

-- 3) Bucket privado
INSERT INTO storage.buckets (id, name, public)
VALUES ('entrega-documentos','entrega-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "entrega_docs_storage_select" ON storage.objects;
CREATE POLICY "entrega_docs_storage_select" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'entrega-documentos' AND (
    has_role(auth.uid(),'administrador'::app_role)
    OR has_role(auth.uid(),'gestor'::app_role)
    OR has_role(auth.uid(),'administrativo'::app_role)
    OR has_role(auth.uid(),'financeiro'::app_role)
    OR has_role(auth.uid(),'consultor_tecnico'::app_role)
    OR has_role(auth.uid(),'tecnico_agronomo'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.entregas e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND e.cliente_id = ANY(get_cliente_ids_for_user(auth.uid()))
    )
  )
);

DROP POLICY IF EXISTS "entrega_docs_storage_insert" ON storage.objects;
CREATE POLICY "entrega_docs_storage_insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'entrega-documentos' AND (
    has_role(auth.uid(),'administrador'::app_role)
    OR has_role(auth.uid(),'gestor'::app_role)
    OR has_role(auth.uid(),'administrativo'::app_role)
    OR has_role(auth.uid(),'financeiro'::app_role)
  )
);

DROP POLICY IF EXISTS "entrega_docs_storage_delete" ON storage.objects;
CREATE POLICY "entrega_docs_storage_delete" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'entrega-documentos' AND (
    has_role(auth.uid(),'administrador'::app_role)
    OR has_role(auth.uid(),'gestor'::app_role)
  )
);

-- 4) Trigger de validação da confirmação
CREATE OR REPLACE FUNCTION public.fn_validate_entrega_confirmacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anexos int;
BEGIN
  IF NEW.status::text = 'entregue'
     AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'entregue') THEN

    IF TG_OP = 'UPDATE' AND OLD.status::text = 'cancelada' THEN
      RAISE EXCEPTION 'Não é possível confirmar uma entrega cancelada.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF COALESCE(TRIM(NEW.recebido_por_nome), '') = '' THEN
      RAISE EXCEPTION 'Informe o nome de quem recebeu a entrega.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.confirmado_por IS NULL THEN
      RAISE EXCEPTION 'A entrega precisa ser confirmada por um usuário autenticado.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.entregue_em IS NULL THEN
      NEW.entregue_em := now();
    END IF;

    IF NEW.comprovante_entrega_obrigatorio THEN
      SELECT count(*) INTO v_anexos
        FROM public.entrega_documentos
        WHERE entrega_id = NEW.id;
      IF v_anexos = 0 THEN
        RAISE EXCEPTION 'É obrigatório anexar pelo menos um comprovante para confirmar esta entrega.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_entrega_confirmacao ON public.entregas;
CREATE TRIGGER trg_validate_entrega_confirmacao
BEFORE INSERT OR UPDATE OF status, recebido_por_nome, confirmado_por, entregue_em
ON public.entregas
FOR EACH ROW
EXECUTE FUNCTION public.fn_validate_entrega_confirmacao();
