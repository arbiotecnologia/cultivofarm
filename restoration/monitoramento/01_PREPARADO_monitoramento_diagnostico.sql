-- PREPARADO — NÃO EXECUTADO
-- Diagnóstico read-only do módulo Monitoramento. Nenhuma escrita, nenhum DDL.

-- 1) Alertas em monitoramento sem data de vencimento (nunca entram nos filtros)
SELECT count(*) AS sem_data
FROM public.alertas_agronomicos
WHERE status = 'monitoramento' AND data_vencimento IS NULL;

-- 2) Divergência entre a data do alerta e a próxima visita do registro de origem
SELECT a.id, a.data_vencimento, r.data_proxima_visita
FROM public.alertas_agronomicos a
JOIN public.registros_consultor r ON r.id = a.registro_origem_id
WHERE a.status = 'monitoramento'
  AND a.data_vencimento IS DISTINCT FROM r.data_proxima_visita;

-- 3) Alertas apontando para registro de origem inexistente
SELECT a.id, a.registro_origem_id
FROM public.alertas_agronomicos a
LEFT JOIN public.registros_consultor r ON r.id = a.registro_origem_id
WHERE a.registro_origem_id IS NOT NULL AND r.id IS NULL;

-- 4) Distribuição de status (verifica se a tela cobre todos os casos abertos)
SELECT status, count(*) AS total
FROM public.alertas_agronomicos
GROUP BY 1
ORDER BY total DESC;

-- 5) Vencidos considerando o dia civil em America/Sao_Paulo (mesma regra da tela)
SELECT count(*) AS vencidos
FROM public.alertas_agronomicos
WHERE status = 'monitoramento'
  AND data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date;
