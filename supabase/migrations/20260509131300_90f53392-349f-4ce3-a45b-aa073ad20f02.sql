-- Create a table for PDF versions
CREATE TABLE IF NOT EXISTS public.registros_consultor_pdf_versions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    registro_consultor_id UUID NOT NULL REFERENCES public.registros_consultor(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id),
    pdf_url TEXT NOT NULL,
    file_path TEXT NOT NULL,
    version_name TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.registros_consultor_pdf_versions ENABLE ROW LEVEL SECURITY;

-- Create policies for the table
CREATE POLICY "Consultores podem ver versões de seus registros" 
ON public.registros_consultor_pdf_versions 
FOR SELECT 
USING (true);

CREATE POLICY "Consultores podem inserir novas versões" 
ON public.registros_consultor_pdf_versions 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

-- Create storage bucket for visit PDFs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('visit-pdfs', 'visit-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for visit-pdfs bucket
CREATE POLICY "PDFs de visita são públicos para leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'visit-pdfs');

CREATE POLICY "Usuários autenticados podem enviar PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'visit-pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Usuários podem deletar seus próprios PDFs"
ON storage.objects FOR DELETE
USING (bucket_id = 'visit-pdfs' AND auth.uid()::text = owner::text);
