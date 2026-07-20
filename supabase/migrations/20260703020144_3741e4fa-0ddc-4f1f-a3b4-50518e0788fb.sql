ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS motorista_telefone text,
  ADD COLUMN IF NOT EXISTS motorista_documento text,
  ADD COLUMN IF NOT EXISTS veiculo_placa text,
  ADD COLUMN IF NOT EXISTS veiculo_tipo text,
  ADD COLUMN IF NOT EXISTS hora_saida_prevista time,
  ADD COLUMN IF NOT EXISTS data_chegada_prevista date,
  ADD COLUMN IF NOT EXISTS hora_chegada_prevista time;