-- PREPARADO — NÃO EXECUTADO
-- Diagnóstico read-only do Fluxo Técnico. Nenhuma escrita, nenhum DDL.

-- 1) Decisões duplicadas para o mesmo registro (indício de falta de idempotência)
SELECT registro_consultor_id, status_aprovacao, count(*) AS ocorrencias
FROM public.aprovacoes_tecnicas
GROUP BY 1, 2
HAVING count(*) > 1
ORDER BY ocorrencias DESC;

-- 2) Registros aprovados com ação "gerar_os" porém sem OS vinculada
SELECT r.id, r.status, r.proxima_acao_recomendada
FROM public.registros_consultor r
LEFT JOIN public.ordens_servico_onfarm os ON os.registro_consultor_id = r.id
WHERE r.status IN ('aprovado', 'convertido_os')
  AND r.proxima_acao_recomendada = 'gerar_os'
  AND os.id IS NULL;

-- 3) OS com recomendação de origem inexistente (vínculo órfão)
SELECT os.id, os.numero_os, os.registro_consultor_id
FROM public.ordens_servico_onfarm os
LEFT JOIN public.registros_consultor r ON r.id = os.registro_consultor_id
WHERE os.registro_consultor_id IS NOT NULL AND r.id IS NULL;

-- 4) Status de OS fora da ordem canônica conhecida pela interface
SELECT os.status, count(*) AS total
FROM public.ordens_servico_onfarm os
WHERE os.status::text NOT IN (
  'aberta','aprovada','programada','em_producao','em_cq',
  'envase','pronto_entrega','entregue','finalizada','cancelada'
)
GROUP BY 1
ORDER BY total DESC;

-- 5) Decisão registrada sem alteração de status do registro correspondente
SELECT a.id, a.registro_consultor_id, a.status_aprovacao, r.status AS status_registro
FROM public.aprovacoes_tecnicas a
JOIN public.registros_consultor r ON r.id = a.registro_consultor_id
WHERE r.status::text = 'enviado_aprovacao'
ORDER BY a.created_at DESC
LIMIT 100;
