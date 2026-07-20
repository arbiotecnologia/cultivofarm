-- Primeiro, adicionar a restrição de unicidade para evitar duplicatas
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_produto_microrganismo') THEN
        ALTER TABLE public.formulacoes ADD CONSTRAINT unique_produto_microrganismo UNIQUE (produto_id, microrganismo_id);
    END IF;
END $$;

-- Limpar formulações antigas para esses produtos (evitar lixo se houver)
DELETE FROM public.formulacoes 
WHERE produto_id IN (SELECT id FROM public.produtos WHERE codigo IN ('SOLO-1', 'SOLO-2', 'BIO-INS-01', 'BIO-INS-02', 'BIO-FUN', 'BIO-INO', 'BIO-SOL'));

-- Função auxiliar para inserir formulação por código de produto e nome científico
CREATE OR REPLACE FUNCTION public.inserir_formulacao_por_nomes(p_codigo text, m_cientifico text, v_ml numeric)
RETURNS void AS $$
DECLARE
    v_prod_id uuid;
    v_mic_id uuid;
BEGIN
    SELECT id INTO v_prod_id FROM public.produtos WHERE codigo = p_codigo;
    SELECT id INTO v_mic_id FROM public.microrganismos WHERE LOWER(TRIM(nome_cientifico)) = LOWER(TRIM(m_cientifico));
    
    IF v_prod_id IS NOT NULL AND v_mic_id IS NOT NULL THEN
        INSERT INTO public.formulacoes (produto_id, microrganismo_id, volume_ml)
        VALUES (v_prod_id, v_mic_id, v_ml)
        ON CONFLICT (produto_id, microrganismo_id) DO UPDATE SET volume_ml = EXCLUDED.volume_ml;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Inserir Composições SOLO-1 (100 ml/ha)
SELECT public.inserir_formulacao_por_nomes('SOLO-1', 'Bacillus subtilis', 100);
SELECT public.inserir_formulacao_por_nomes('SOLO-1', 'Bacillus methylotrophicus', 100);
SELECT public.inserir_formulacao_por_nomes('SOLO-1', 'Bacillus amyloliquefaciens', 100);
SELECT public.inserir_formulacao_por_nomes('SOLO-1', 'Bacillus licheniformis', 100);
SELECT public.inserir_formulacao_por_nomes('SOLO-1', 'Bacillus pumilus', 100);

-- Inserir Composições SOLO-2 (200 ml/ha)
SELECT public.inserir_formulacao_por_nomes('SOLO-2', 'Trichoderma harzianum', 100);
SELECT public.inserir_formulacao_por_nomes('SOLO-2', 'Trichoderma asperellum', 100);
SELECT public.inserir_formulacao_por_nomes('SOLO-2', 'Paecilomyces lilacinus', 200);
SELECT public.inserir_formulacao_por_nomes('SOLO-2', 'Purpureocillium lilacinum', 100);

-- Inserir Composições BIO-INS-01 (100 ml/ha)
SELECT public.inserir_formulacao_por_nomes('BIO-INS-01', 'Beauveria bassiana', 100);
SELECT public.inserir_formulacao_por_nomes('BIO-INS-01', 'Metarhizium anisopliae', 100);

-- Inserir Composições BIO-INS-02 (100 ml/ha)
SELECT public.inserir_formulacao_por_nomes('BIO-INS-02', 'Bacillus thuringiensis kurstaki', 100);
SELECT public.inserir_formulacao_por_nomes('BIO-INS-02', 'Bacillus thuringiensis aizawai', 100);

-- Inserir Composições BIO-FUN (100 ml/ha)
SELECT public.inserir_formulacao_por_nomes('BIO-FUN', 'Trichoderma harzianum', 100);
SELECT public.inserir_formulacao_por_nomes('BIO-FUN', 'Bacillus velezensis', 100);

-- Inserir Composições BIO-INO (100 ml/ha)
SELECT public.inserir_formulacao_por_nomes('BIO-INO', 'Bradyrhizobium japonicum', 100);
SELECT public.inserir_formulacao_por_nomes('BIO-INO', 'Azospirillum brasilense', 100);

-- Inserir Composições BIO-SOL (100 ml/ha)
SELECT public.inserir_formulacao_por_nomes('BIO-SOL', 'Bacillus megaterium', 100);
SELECT public.inserir_formulacao_por_nomes('BIO-SOL', 'Bacillus aryabhattai', 100);

-- Remover função auxiliar
DROP FUNCTION public.inserir_formulacao_por_nomes(text, text, numeric);

-- Validação final
DO $$
BEGIN
    IF (SELECT count(*) FROM public.formulacoes WHERE produto_id IN (SELECT id FROM public.produtos WHERE codigo IN ('SOLO-1', 'SOLO-2', 'BIO-INS-01', 'BIO-INS-02', 'BIO-FUN', 'BIO-INO', 'BIO-SOL'))) < 18 THEN
        RAISE EXCEPTION 'Erro no backfill: total de formulações menor que o esperado (19 linhas).';
    END IF;
END $$;