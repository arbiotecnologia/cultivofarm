-- =========================================================
-- FASE 12.10 — RLS HARDENING FOR INTEGRATED TECHNICAL VISITS
-- =========================================================

-- 1) Central helper: active user-client binding with temporal validity
CREATE OR REPLACE FUNCTION public.has_active_user_cliente_access(
  _user_id uuid,
  _cliente_id uuid,
  _levels text[] DEFAULT ARRAY['read','execute','manage']::text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _cliente_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
        FROM public.user_clientes uc
       WHERE uc.user_id = _user_id
         AND uc.cliente_id = _cliente_id
         AND uc.is_active = true
         AND (uc.valid_from IS NULL OR uc.valid_from <= now())
         AND (uc.valid_until IS NULL OR uc.valid_until >= now())
         AND uc.access_level::text = ANY(_levels)
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.has_active_user_cliente_access(uuid, uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_active_user_cliente_access(uuid, uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_active_user_cliente_access(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_user_cliente_access(uuid, uuid, text[]) TO service_role;

COMMENT ON FUNCTION public.has_active_user_cliente_access(uuid, uuid, text[]) IS
  'Fase 12.10: valida vínculo ativo user_clientes por cliente, access_level e janela de validade.';

-- 2) Useful indexes for hardened policy lookups
CREATE INDEX IF NOT EXISTS idx_visitas_checkin_registro_consultor
  ON public.visitas_checkin(registro_consultor_id);

CREATE INDEX IF NOT EXISTS idx_visitas_checkin_cliente_consultor
  ON public.visitas_checkin(cliente_id, consultor_id);

CREATE INDEX IF NOT EXISTS idx_visitas_logs_registro_consultor
  ON public.visitas_logs(registro_consultor_id);

CREATE INDEX IF NOT EXISTS idx_visitas_logs_usuario
  ON public.visitas_logs(usuario_id);

-- 3) Ensure Data API privileges exist for auth-only visit tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registros_consultor TO authenticated;
GRANT ALL ON public.registros_consultor TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visita_diagnosticos TO authenticated;
GRANT ALL ON public.visita_diagnosticos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas_checkin TO authenticated;
GRANT ALL ON public.visitas_checkin TO service_role;

GRANT SELECT, INSERT ON public.visitas_logs TO authenticated;
GRANT ALL ON public.visitas_logs TO service_role;

-- 4) registros_consultor — replace broad legacy policies with visit-aware policies
DROP POLICY IF EXISTS "Consultants manage records" ON public.registros_consultor;
DROP POLICY IF EXISTS "Registros consultor read access" ON public.registros_consultor;
DROP POLICY IF EXISTS registros_consultor_select_hardened ON public.registros_consultor;
DROP POLICY IF EXISTS registros_consultor_insert_hardened ON public.registros_consultor;
DROP POLICY IF EXISTS registros_consultor_update_hardened ON public.registros_consultor;
DROP POLICY IF EXISTS registros_consultor_delete_hardened ON public.registros_consultor;

CREATE POLICY registros_consultor_select_hardened
ON public.registros_consultor
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
    AND public.can_user_access_cliente(cliente_id)
  )
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
    AND (
      public.has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['read','execute','manage']::text[])
      OR (
        public.has_role(auth.uid(), 'cliente_produtor'::app_role)
        AND public.can_user_access_cliente(cliente_id)
        AND status IN (
          'aprovado'::status_registro_consultor,
          'finalizado'::status_registro_consultor,
          'convertido_os'::status_registro_consultor
        )
      )
    )
  )
);

CREATE POLICY registros_consultor_insert_hardened
ON public.registros_consultor
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
    AND (consultor_responsavel = auth.uid() OR created_by = auth.uid())
  )
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
    AND consultor_responsavel = auth.uid()
    AND public.has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['execute','manage']::text[])
  )
);

CREATE POLICY registros_consultor_update_hardened
ON public.registros_consultor
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
    AND (consultor_responsavel = auth.uid() OR created_by = auth.uid())
  )
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
    AND (consultor_responsavel = auth.uid() OR created_by = auth.uid())
    AND public.has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['execute','manage']::text[])
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
    AND (consultor_responsavel = auth.uid() OR created_by = auth.uid())
  )
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
    AND (consultor_responsavel = auth.uid() OR created_by = auth.uid())
    AND public.has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['execute','manage']::text[])
  )
);

CREATE POLICY registros_consultor_delete_hardened
ON public.registros_consultor
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
    AND (consultor_responsavel = auth.uid() OR created_by = auth.uid())
  )
);

-- 5) visita_diagnosticos — parent visit binding + producer final read
DROP POLICY IF EXISTS "Users can manage diagnostics for their own records" ON public.visita_diagnosticos;
DROP POLICY IF EXISTS visita_diagnosticos_select_hardened ON public.visita_diagnosticos;
DROP POLICY IF EXISTS visita_diagnosticos_insert_hardened ON public.visita_diagnosticos;
DROP POLICY IF EXISTS visita_diagnosticos_update_hardened ON public.visita_diagnosticos;
DROP POLICY IF EXISTS visita_diagnosticos_delete_hardened ON public.visita_diagnosticos;

CREATE POLICY visita_diagnosticos_select_hardened
ON public.visita_diagnosticos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
      FROM public.registros_consultor r
     WHERE r.id = visita_diagnosticos.registro_id
       AND (
         (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
           AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid() OR public.can_user_access_cliente(r.cliente_id))
         )
         OR (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
           AND (
             public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['read','execute','manage']::text[])
             OR (
               public.has_role(auth.uid(), 'cliente_produtor'::app_role)
               AND public.can_user_access_cliente(r.cliente_id)
               AND r.status IN (
                 'aprovado'::status_registro_consultor,
                 'finalizado'::status_registro_consultor,
                 'convertido_os'::status_registro_consultor
               )
             )
           )
         )
       )
  )
);

CREATE POLICY visita_diagnosticos_insert_hardened
ON public.visita_diagnosticos
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
      FROM public.registros_consultor r
     WHERE r.id = visita_diagnosticos.registro_id
       AND (
         (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
           AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
         )
         OR (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
           AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
           AND public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['execute','manage']::text[])
         )
       )
  )
);

CREATE POLICY visita_diagnosticos_update_hardened
ON public.visita_diagnosticos
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
      FROM public.registros_consultor r
     WHERE r.id = visita_diagnosticos.registro_id
       AND (
         (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
           AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
         )
         OR (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
           AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
           AND public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['execute','manage']::text[])
         )
       )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
      FROM public.registros_consultor r
     WHERE r.id = visita_diagnosticos.registro_id
       AND (
         (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
           AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
         )
         OR (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
           AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
           AND public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['execute','manage']::text[])
         )
       )
  )
);

CREATE POLICY visita_diagnosticos_delete_hardened
ON public.visita_diagnosticos
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
      FROM public.registros_consultor r
     WHERE r.id = visita_diagnosticos.registro_id
       AND (
         (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
           AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
         )
         OR (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
           AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
           AND public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['manage']::text[])
         )
       )
  )
);

-- 6) visitas_checkin — no generic authenticated writes
DROP POLICY IF EXISTS "Consultants manage checkins" ON public.visitas_checkin;
DROP POLICY IF EXISTS admin_delete_checkin ON public.visitas_checkin;
DROP POLICY IF EXISTS auth_select_checkin ON public.visitas_checkin;
DROP POLICY IF EXISTS visitas_checkin_select_hardened ON public.visitas_checkin;
DROP POLICY IF EXISTS visitas_checkin_insert_hardened ON public.visitas_checkin;
DROP POLICY IF EXISTS visitas_checkin_update_hardened ON public.visitas_checkin;
DROP POLICY IF EXISTS visitas_checkin_delete_hardened ON public.visitas_checkin;

CREATE POLICY visitas_checkin_select_hardened
ON public.visitas_checkin
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
      FROM public.registros_consultor r
     WHERE r.id = visitas_checkin.registro_consultor_id
       AND r.cliente_id = visitas_checkin.cliente_id
       AND (
         public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['read','execute','manage']::text[])
         OR (
           public.has_role(auth.uid(), 'cliente_produtor'::app_role)
           AND public.can_user_access_cliente(r.cliente_id)
           AND r.status IN (
             'aprovado'::status_registro_consultor,
             'finalizado'::status_registro_consultor,
             'convertido_os'::status_registro_consultor
           )
         )
       )
  )
);

CREATE POLICY visitas_checkin_insert_hardened
ON public.visitas_checkin
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR (
    consultor_id = auth.uid()
    AND public.has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['execute','manage']::text[])
    AND EXISTS (
      SELECT 1
        FROM public.registros_consultor r
       WHERE r.id = visitas_checkin.registro_consultor_id
         AND r.cliente_id = visitas_checkin.cliente_id
         AND COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
         AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
    )
  )
);

CREATE POLICY visitas_checkin_update_hardened
ON public.visitas_checkin
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR (
    consultor_id = auth.uid()
    AND public.has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['execute','manage']::text[])
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR (
    consultor_id = auth.uid()
    AND public.has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['execute','manage']::text[])
  )
);

CREATE POLICY visitas_checkin_delete_hardened
ON public.visitas_checkin
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
);

-- 7) visitas_logs — remove broad read and generic inserts
DROP POLICY IF EXISTS auth_insert_visitas_logs ON public.visitas_logs;
DROP POLICY IF EXISTS auth_select_visitas_logs ON public.visitas_logs;
DROP POLICY IF EXISTS visitas_logs_select_hardened ON public.visitas_logs;
DROP POLICY IF EXISTS visitas_logs_insert_hardened ON public.visitas_logs;

CREATE POLICY visitas_logs_select_hardened
ON public.visitas_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
      FROM public.registros_consultor r
     WHERE r.id = visitas_logs.registro_consultor_id
       AND (
         (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
           AND public.can_user_access_cliente(r.cliente_id)
         )
         OR (
           COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
           AND (
             public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['read','execute','manage']::text[])
             OR (
               public.has_role(auth.uid(), 'cliente_produtor'::app_role)
               AND public.can_user_access_cliente(r.cliente_id)
               AND r.status IN (
                 'aprovado'::status_registro_consultor,
                 'finalizado'::status_registro_consultor,
                 'convertido_os'::status_registro_consultor
               )
             )
           )
         )
       )
  )
);

CREATE POLICY visitas_logs_insert_hardened
ON public.visitas_logs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
    OR (
      usuario_id = auth.uid()
      AND registro_consultor_id IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM public.registros_consultor r
         WHERE r.id = visitas_logs.registro_consultor_id
           AND (
             COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) <> 'visita'::natureza_registro_consultor
             OR (
               COALESCE(r.natureza_registro, 'ocorrencia'::natureza_registro_consultor) = 'visita'::natureza_registro_consultor
               AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
               AND public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['execute','manage']::text[])
             )
           )
      )
    )
  )
);
