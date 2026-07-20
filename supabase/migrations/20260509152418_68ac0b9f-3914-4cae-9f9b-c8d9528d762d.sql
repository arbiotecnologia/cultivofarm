ALTER TABLE public.ordens_servico_onfarm ADD COLUMN lote_pre_os_id uuid;
CREATE INDEX idx_os_onfarm_lote_pre_os_id ON public.ordens_servico_onfarm (lote_pre_os_id);