-- Extend public.produtos table
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS codigo TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS funcao_completa TEXT,
ADD COLUMN IF NOT EXISTS modo_aplicacao TEXT,
ADD COLUMN IF NOT EXISTS valor_ha_brl NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS versao_catalogo TEXT DEFAULT 'v1.2',
ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- Extend public.formulacoes table
ALTER TABLE public.formulacoes 
ADD COLUMN IF NOT EXISTS volume_ml NUMERIC;

-- Add unique constraint to formulacoes to ensure one microorganism per product
ALTER TABLE public.formulacoes 
ADD CONSTRAINT formulacoes_produto_microrganismo_unique UNIQUE (produto_id, microrganismo_id);

-- Seed A.R Bio 2025 Protocols (Idempotent)
DO $$
DECLARE
    v_prod_id UUID;
    v_mic_id UUID;
BEGIN
    -- 1. SOLO 1
    INSERT INTO public.produtos (codigo, nome, tipo, dose_ml_ha, modo_aplicacao, valor_ha_brl, funcao_completa)
    VALUES ('SOLO-1', 'Solo 1', 'solo', 500, 'sulco de plantio', 83.00, 'Tratamento de doenças de solo, promotor de crescimento, solubilização do fósforo e resistência a condições adversas (Estresse hídrico).')
    ON CONFLICT (codigo) DO UPDATE SET 
        nome = EXCLUDED.nome,
        tipo = EXCLUDED.tipo,
        dose_ml_ha = EXCLUDED.dose_ml_ha,
        modo_aplicacao = EXCLUDED.modo_aplicacao,
        valor_ha_brl = EXCLUDED.valor_ha_brl,
        funcao_completa = EXCLUDED.funcao_completa
    RETURNING id INTO v_prod_id;

    -- Composition Solo 1
    FOR v_mic_id, v_prod_id IN 
        SELECT m.id, v_prod_id FROM public.microrganismos m WHERE m.nome IN ('Bacillus aryabhattai', 'Bacillus subtilis', 'Bacillus velezensis', 'Trichoderma asperellum', 'E.M. (Micro-organism. Eficientes)')
    LOOP
        INSERT INTO public.formulacoes (produto_id, microrganismo_id, volume_ml, concentracao, unidade)
        SELECT v_prod_id, v_mic_id, 100, m.concentracao_ufc_ml, 'UFC/mL' FROM public.microrganismos m WHERE m.id = v_mic_id
        ON CONFLICT (produto_id, microrganismo_id) DO UPDATE SET volume_ml = EXCLUDED.volume_ml;
    END LOOP;

    -- 2. SOLO 2
    INSERT INTO public.produtos (codigo, nome, tipo, dose_ml_ha, modo_aplicacao, valor_ha_brl, funcao_completa)
    VALUES ('SOLO-2', 'Solo 2', 'solo', 500, 'sulco de plantio', 98.00, 'Ação nematicida e resistência a condições adversas (Estresse hídrico).')
    ON CONFLICT (codigo) DO UPDATE SET 
        nome = EXCLUDED.nome,
        valor_ha_brl = EXCLUDED.valor_ha_brl
    RETURNING id INTO v_prod_id;

    -- Composition Solo 2
    FOR v_mic_id, v_prod_id IN 
        SELECT m.id, v_prod_id FROM public.microrganismos m WHERE m.nome IN ('Bacillus amyloliquefaciens', 'Bacillus methylotrophicus', 'Trichoderma harzianum', 'Paecilomyces lilacinus')
    LOOP
        INSERT INTO public.formulacoes (produto_id, microrganismo_id, volume_ml, concentracao, unidade)
        SELECT v_prod_id, v_mic_id, CASE WHEN m.nome = 'Paecilomyces lilacinus' THEN 200 ELSE 100 END, m.concentracao_ufc_ml, 'UFC/mL' 
        FROM public.microrganismos m WHERE m.id = v_mic_id
        ON CONFLICT (produto_id, microrganismo_id) DO UPDATE SET volume_ml = EXCLUDED.volume_ml;
    END LOOP;

    -- 3. BIOINSETICIDA 01
    INSERT INTO public.produtos (codigo, nome, tipo, dose_ml_ha, modo_aplicacao, valor_ha_brl, funcao_completa)
    VALUES ('BIO-INS-01', 'BioInseticida 01', 'inseticida', 400, 'barra', 84.00, 'Controle de Broca-do-café, Cigarrinha-das-raízes, Cochonilha branca, Lagartas, Percevejos, etc.')
    ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id INTO v_prod_id;

    FOR v_mic_id, v_prod_id IN 
        SELECT m.id, v_prod_id FROM public.microrganismos m WHERE m.nome IN ('Bacillus thuringiensis kurstaki', 'Beauveria bassiana', 'Metarhizium anisopliae', 'E.M. (Micro-organism. Eficientes)')
    LOOP
        INSERT INTO public.formulacoes (produto_id, microrganismo_id, volume_ml, concentracao, unidade)
        SELECT v_prod_id, v_mic_id, 100, m.concentracao_ufc_ml, 'UFC/mL' FROM public.microrganismos m WHERE m.id = v_mic_id
        ON CONFLICT (produto_id, microrganismo_id) DO UPDATE SET volume_ml = EXCLUDED.volume_ml;
    END LOOP;

    -- 4. BIOINSETICIDA 02
    INSERT INTO public.produtos (codigo, nome, tipo, dose_ml_ha, modo_aplicacao, valor_ha_brl, funcao_completa)
    VALUES ('BIO-INS-02', 'BioInseticida 02', 'inseticida', 300, 'barra', 65.00, 'Controle de Cigarrinha do milho, Mosca branca, Pulgões, Vaquinha verde-amarela, etc.')
    ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id INTO v_prod_id;

    FOR v_mic_id, v_prod_id IN 
        SELECT m.id, v_prod_id FROM public.microrganismos m WHERE m.nome IN ('Beauveria bassiana', 'Isaria fumosorosea', 'E.M. (Micro-organism. Eficientes)')
    LOOP
        INSERT INTO public.formulacoes (produto_id, microrganismo_id, volume_ml, concentracao, unidade)
        SELECT v_prod_id, v_mic_id, 100, m.concentracao_ufc_ml, 'UFC/mL' FROM public.microrganismos m WHERE m.id = v_mic_id
        ON CONFLICT (produto_id, microrganismo_id) DO UPDATE SET volume_ml = EXCLUDED.volume_ml;
    END LOOP;

    -- 5. BIOFUNGICIDA
    INSERT INTO public.produtos (codigo, nome, tipo, dose_ml_ha, modo_aplicacao, valor_ha_brl, funcao_completa)
    VALUES ('BIO-FUN', 'BioFungicida', 'fungicida', 300, 'barra', 50.00, 'Controle biológico de doenças fúngicas')
    ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id INTO v_prod_id;

    FOR v_mic_id, v_prod_id IN 
        SELECT m.id, v_prod_id FROM public.microrganismos m WHERE m.nome IN ('Bacillus subtilis', 'Bacillus pumilus', 'E.M. (Micro-organism. Eficientes)')
    LOOP
        INSERT INTO public.formulacoes (produto_id, microrganismo_id, volume_ml, concentracao, unidade)
        SELECT v_prod_id, v_mic_id, 100, m.concentracao_ufc_ml, 'UFC/mL' FROM public.microrganismos m WHERE m.id = v_mic_id
        ON CONFLICT (produto_id, microrganismo_id) DO UPDATE SET volume_ml = EXCLUDED.volume_ml;
    END LOOP;

    -- 6. BIOINOCULANTE
    INSERT INTO public.produtos (codigo, nome, tipo, dose_ml_ha, modo_aplicacao, valor_ha_brl, funcao_completa)
    VALUES ('BIO-INO', 'BioInoculante', 'inoculante', 100, 'barra, sulco ou TS', 50.00, 'Fixação biológica de nitrogênio (FBN)')
    ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id INTO v_prod_id;

    FOR v_mic_id, v_prod_id IN 
        SELECT m.id, v_prod_id FROM public.microrganismos m WHERE m.nome IN ('Methylobacterium symbioticum')
    LOOP
        INSERT INTO public.formulacoes (produto_id, microrganismo_id, volume_ml, concentracao, unidade)
        SELECT v_prod_id, v_mic_id, 100, m.concentracao_ufc_ml, 'UFC/mL' FROM public.microrganismos m WHERE m.id = v_mic_id
        ON CONFLICT (produto_id, microrganismo_id) DO UPDATE SET volume_ml = EXCLUDED.volume_ml;
    END LOOP;

    -- 7. BIOSOLUBILIZADOR
    INSERT INTO public.produtos (codigo, nome, tipo, dose_ml_ha, modo_aplicacao, valor_ha_brl, funcao_completa)
    VALUES ('BIO-SOL', 'BioSolubilizador', 'solubilizador', 200, 'sulco de plantio', 50.00, 'Solubilizador de Fósforo')
    ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id INTO v_prod_id;

    FOR v_mic_id, v_prod_id IN 
        SELECT m.id, v_prod_id FROM public.microrganismos m WHERE m.nome IN ('Bacillus megaterium', 'Pseudomonas fluorescens')
    LOOP
        INSERT INTO public.formulacoes (produto_id, microrganismo_id, volume_ml, concentracao, unidade)
        SELECT v_prod_id, v_mic_id, 100, m.concentracao_ufc_ml, 'UFC/mL' FROM public.microrganismos m WHERE m.id = v_mic_id
        ON CONFLICT (produto_id, microrganismo_id) DO UPDATE SET volume_ml = EXCLUDED.volume_ml;
    END LOOP;

END $$;
