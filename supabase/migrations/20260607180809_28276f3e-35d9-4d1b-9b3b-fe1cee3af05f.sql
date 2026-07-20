-- 1. Limpeza de políticas existentes para garantir um estado limpo
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN (
            'ordens_servico', 'ordens_servico_onfarm', 'programacao_producao', 
            'lotes', 'controle_qualidade', 'envase', 'estoque_produto', 
            'estoque_movimentacoes', 'entregas', 'aplicacoes', 
            'laboratorio_esteira_eventos', 'reservas_auditoria'
        )
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- 2. Políticas para ORDENS_SERVICO
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor total access on ordens_servico" 
ON public.ordens_servico FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor'));

CREATE POLICY "Producao/Adm/Consultor read ordens_servico" 
ON public.ordens_servico FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'producao') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'consultor_tecnico'));

CREATE POLICY "Cliente read own ordens_servico" 
ON public.ordens_servico FOR SELECT TO authenticated 
USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

-- 3. Políticas para ORDENS_SERVICO_ONFARM
ALTER TABLE public.ordens_servico_onfarm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor total access on ordens_servico_onfarm" 
ON public.ordens_servico_onfarm FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor'));

CREATE POLICY "Producao/Adm/Consultor read ordens_servico_onfarm" 
ON public.ordens_servico_onfarm FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'producao') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'consultor_tecnico'));

CREATE POLICY "Cliente read own ordens_servico_onfarm" 
ON public.ordens_servico_onfarm FOR SELECT TO authenticated 
USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

-- 4. Políticas para PROGRAMACAO_PRODUCAO
ALTER TABLE public.programacao_producao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor/Producao access on programacao_producao" 
ON public.programacao_producao FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'));

CREATE POLICY "Adm/Consultor read programacao_producao" 
ON public.programacao_producao FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'consultor_tecnico'));

-- 5. Políticas para LOTES
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor/Producao access on lotes" 
ON public.lotes FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'));

CREATE POLICY "Adm/Consultor read lotes" 
ON public.lotes FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'consultor_tecnico'));

-- 6. Políticas para CONTROLE_QUALIDADE
ALTER TABLE public.controle_qualidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor/Producao access on controle_qualidade" 
ON public.controle_qualidade FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'));

CREATE POLICY "Adm/Consultor read controle_qualidade" 
ON public.controle_qualidade FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'consultor_tecnico'));

-- 7. Políticas para ENVASE
ALTER TABLE public.envase ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor/Producao access on envase" 
ON public.envase FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'));

CREATE POLICY "Adm read envase" 
ON public.envase FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'administrativo'));

-- 8. Políticas para ESTOQUE_PRODUTO
ALTER TABLE public.estoque_produto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor/Producao access on estoque_produto" 
ON public.estoque_produto FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'));

CREATE POLICY "Adm read estoque_produto" 
ON public.estoque_produto FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'administrativo'));

-- 9. Políticas para ESTOQUE_MOVIMENTACOES
ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor/Producao access on estoque_movimentacoes" 
ON public.estoque_movimentacoes FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'producao'));

CREATE POLICY "Adm read estoque_movimentacoes" 
ON public.estoque_movimentacoes FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'administrativo'));

-- 10. Políticas para ENTREGAS
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor/Adm total access on entregas" 
ON public.entregas FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'administrativo'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'administrativo'));

CREATE POLICY "Producao/Aplicador read entregas" 
ON public.entregas FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'producao') OR has_role(auth.uid(), 'aplicador'));

CREATE POLICY "Cliente read own entregas" 
ON public.entregas FOR SELECT TO authenticated 
USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

-- 11. Políticas para APLICACOES
ALTER TABLE public.aplicacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor/Aplicador total access on aplicacoes" 
ON public.aplicacoes FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'aplicador'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR has_role(auth.uid(), 'aplicador'));

CREATE POLICY "Adm/Producao/Consultor read aplicacoes" 
ON public.aplicacoes FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'producao') OR has_role(auth.uid(), 'consultor_tecnico'));

CREATE POLICY "Cliente read own aplicacoes" 
ON public.aplicacoes FOR SELECT TO authenticated 
USING (
    EXISTS (SELECT 1 FROM public.ordens_servico os WHERE os.id = aplicacoes.ordem_servico_id AND os.cliente_id = ANY(get_cliente_ids_for_user(auth.uid())))
    OR 
    EXISTS (SELECT 1 FROM public.ordens_servico_onfarm oso WHERE oso.id = aplicacoes.ordem_servico_onfarm_id AND oso.cliente_id = ANY(get_cliente_ids_for_user(auth.uid())))
);

-- 12. Políticas para LABORATORIO_ESTEIRA_EVENTOS
ALTER TABLE public.laboratorio_esteira_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor total access on laboratorio_esteira_eventos" 
ON public.laboratorio_esteira_eventos FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor'))
WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor'));

CREATE POLICY "Producao read laboratorio_esteira_eventos" 
ON public.laboratorio_esteira_eventos FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'producao'));

-- 13. Políticas para RESERVAS_AUDITORIA (se existir)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reservas_auditoria') THEN
        ALTER TABLE public.reservas_auditoria ENABLE ROW LEVEL SECURITY;
        EXECUTE 'CREATE POLICY "Admin/Gestor read reservas_auditoria" ON public.reservas_auditoria FOR SELECT TO authenticated USING (has_role(auth.uid(), ''administrador'') OR has_role(auth.uid(), ''gestor''))';
    END IF;
END $$;
