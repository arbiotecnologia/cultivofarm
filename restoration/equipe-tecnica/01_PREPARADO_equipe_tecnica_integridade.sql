-- PREPARADO — NÃO EXECUTADO
-- Diagnóstico read-only da Equipe Técnica. Idempotente e reversível por
-- construção (nenhuma escrita). Não cria, altera nem remove objetos.

-- 1) Papéis técnicos sem perfil correspondente (registros órfãos)
SELECT ur.user_id, array_agg(DISTINCT ur.role::text ORDER BY ur.role::text) AS papeis
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.user_id = ur.user_id
WHERE ur.role::text IN ('tecnico_agronomo', 'consultor_tecnico', 'gestor')
  AND p.user_id IS NULL
GROUP BY ur.user_id
ORDER BY ur.user_id;

-- 2) E-mails duplicados entre perfis com papel técnico
SELECT lower(btrim(p.email)) AS email, count(*) AS ocorrencias,
       array_agg(p.user_id) AS user_ids
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.user_id
WHERE ur.role::text IN ('tecnico_agronomo', 'consultor_tecnico', 'gestor')
  AND p.email IS NOT NULL AND btrim(p.email) <> ''
GROUP BY 1
HAVING count(*) > 1
ORDER BY ocorrencias DESC;

-- 3) Distribuição de status (profiles.ativo) na equipe técnica
SELECT coalesce(p.ativo, true) AS ativo, count(*) AS total
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.user_id
WHERE ur.role::text IN ('tecnico_agronomo', 'consultor_tecnico', 'gestor')
GROUP BY 1
ORDER BY 1;

-- 4) Colunas realmente existentes em public.profiles (validar CREA/cargo/etc.)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
