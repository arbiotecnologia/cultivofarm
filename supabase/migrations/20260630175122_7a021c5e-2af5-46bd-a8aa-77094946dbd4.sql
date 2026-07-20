ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS grupo_entrega_id uuid;
CREATE INDEX IF NOT EXISTS idx_entregas_grupo_entrega_id ON public.entregas(grupo_entrega_id) WHERE grupo_entrega_id IS NOT NULL;
COMMENT ON COLUMN public.entregas.grupo_entrega_id IS 'Agrupa múltiplas entregas registradas numa mesma operação (mesma OS, mesmo motorista, mesma data). Permite gerar comprovante consolidado.';