-- Seed sintético para homologação do módulo Campo e Assistência Técnica
-- Ambiente: STAGING (ikaauvsflpmamgxmkhoq)
-- Marker de segurança:
DO $$
DECLARE
  v_marker text;
  v_ref text;
BEGIN
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker LIMIT 1;
  IF v_marker <> 'STAGING' OR v_ref <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'Abortando: Este script deve rodar apenas no staging ikaauvsflpmamgxmkhoq. Encontrado: % / %', v_marker, v_ref;
  END IF;
END $$;

-- Limpeza de execuções anteriores (TESTE_CAMPO_E2E_)
DELETE FROM public.registros_consultor WHERE codigo_visita LIKE 'TESTE_CAMPO_E2E_%';
DELETE FROM public.clientes WHERE nome LIKE 'TESTE_CAMPO_E2E_%';

-- 1. Criar Cliente e Fazenda de teste
INSERT INTO public.clientes (id, nome, codigo_cliente)
VALUES ('00000000-0000-4000-a000-000000000001', 'TESTE_CAMPO_E2E_CLIENTE', 'TCE2E-01');

INSERT INTO public.fazendas (id, cliente_id, nome)
VALUES ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'TESTE_CAMPO_E2E_FAZENDA');

INSERT INTO public.talhoes (id, fazenda_id, nome, area_ha)
VALUES ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002', 'TALHAO_01', 50);

-- 2. Criar Objetivos de Visita
INSERT INTO public.objetivos_visita_sugestoes (id, objetivo, ativo)
VALUES 
  ('00000000-0000-4000-a000-000000000004', 'Diagnóstico de pragas', true),
  ('00000000-0000-4000-a000-000000000005', 'Recomendação técnica', true),
  ('00000000-0000-4000-a000-000000000006', 'Acompanhamento de aplicação', true);

-- 3. Criar uma Visita em Rascunho para o Harness
INSERT INTO public.registros_consultor (
  id, cliente_id, fazenda_id, talhao_id, consultor_id, 
  status, codigo_visita, data_visita, objetivo_visita
) VALUES (
  '00000000-0000-4000-a000-000000000007', 
  '00000000-0000-4000-a000-000000000001', 
  '00000000-0000-4000-a000-000000000002', 
  '00000000-0000-4000-a000-000000000003', 
  null, -- Será preenchido pelo harness
  'rascunho', 
  'TESTE_CAMPO_E2E_001', 
  now(), 
  'Visita de teste E2E'
);
