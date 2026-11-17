-- ===== Descoberta (idêntica no dry-run e na execução). Só colunas uuid/uuid[]; texto/jsonb apenas RELATADOS e recusados.
CREATE TEMP TABLE qa_seed(id uuid PRIMARY KEY, kind text NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE qa_hit(tbl regclass, rowhash text, id uuid, col text, seed_kind text, lvl int, j jsonb, PRIMARY KEY (tbl, rowhash, col, seed_kind)) ON COMMIT DROP;
CREATE TEMP TABLE qa_text(tbl regclass, col text, rowhash text) ON COMMIT DROP;
CREATE TEMP TABLE qa_refuse(reason text, tbl regclass, rowhash text, id uuid) ON COMMIT DROP;
DO $$ BEGIN IF to_regclass('qa_b2bfin.manifest') IS NOT NULL THEN
  EXECUTE 'INSERT INTO qa_seed SELECT id, kind FROM qa_b2bfin.manifest WHERE kind NOT IN (''partner'',''partner_user'') ON CONFLICT DO NOTHING'; END IF; END $$;
INSERT INTO qa_seed VALUES ('cdb78993-89e4-48db-956e-f40b014a8146','partner'),('9d53f280-f828-4af8-a08c-3574263dc466','partner'),('6100c3ac-ff5b-4596-a0e3-92665a5dcaab','partner'),('7d15eddb-38b6-43dd-bbf5-43936155321d','user'),('5db79a8e-82af-419d-ae66-87a98c02fbec','user'),('c3ed723f-1017-478e-99b2-25b48b3ab77e','user'),('1d0ea582-1d46-4152-8fbe-f425c74942c1','user'),('51652ab6-da23-4a3d-8f29-417af15cc761','user'),('019fe16e-4a05-4ca1-8480-c2727b92dfa2','override'),('d69bf60a-faa2-4cc0-80df-fd8dc913e9e9','override'),('1aca4276-7043-4616-8dd5-839d2e4e86de','override'),('1eac8c31-6b09-43fd-bbec-e523a812e6ba','override'),('fcb4c72d-2040-4bbc-98fd-145f1463ec04','subscription'),('2624ff4a-c4dd-4885-af23-beb8463d2209','subscription') ON CONFLICT DO NOTHING;
DO $$
DECLARE c record; lvl int;
BEGIN
 FOR lvl IN 1..3 LOOP
  FOR c IN SELECT a.attrelid::regclass t, a.attname col, format_type(a.atttypid, NULL) ty
     FROM pg_attribute a JOIN pg_class r ON r.oid = a.attrelid JOIN pg_namespace s ON s.oid = r.relnamespace
     WHERE r.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped AND s.nspname IN ('public','platform_private')
       AND format_type(a.atttypid, NULL) IN ('uuid','uuid[]') LOOP
   EXECUTE format('INSERT INTO qa_hit SELECT %L::regclass, md5(to_jsonb(x)::text), CASE WHEN (to_jsonb(x)->>''id'') ~ ''^[0-9a-f-]{36}$'' THEN (to_jsonb(x)->>''id'')::uuid END, %L, s.kind, %s, to_jsonb(x) FROM %s x JOIN qa_seed s ON %s ON CONFLICT DO NOTHING',
     c.t, c.col, lvl, c.t, CASE c.ty WHEN 'uuid' THEN format('x.%I = s.id', c.col) ELSE format('s.id = ANY (x.%I)', c.col) END
       || CASE WHEN c.col = 'id' THEN ' AND s.kind NOT LIKE ''derived:%''' ELSE '' END);  -- id próprio nunca autojustifica
  END LOOP;
  INSERT INTO qa_seed SELECT DISTINCT id, 'derived:' || tbl::text FROM qa_hit WHERE id IS NOT NULL ON CONFLICT DO NOTHING;
 END LOOP;
 FOR c IN SELECT a.attrelid::regclass t, a.attname col FROM pg_attribute a JOIN pg_class r ON r.oid = a.attrelid JOIN pg_namespace s ON s.oid = r.relnamespace
     WHERE r.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped AND s.nspname IN ('public','platform_private')
       AND format_type(a.atttypid, NULL) IN ('text','jsonb','json') LOOP
  EXECUTE format('INSERT INTO qa_text SELECT %L::regclass, %L, md5(to_jsonb(x)::text) FROM %s x WHERE x.%I::text ~ (SELECT string_agg(id::text, ''|'') FROM qa_seed) AND md5(to_jsonb(x)::text) NOT IN (SELECT rowhash FROM qa_hit WHERE tbl = %L::regclass)', c.t, c.col, c.t, c.col, c.t);
 END LOOP;
 -- Recusas (nenhuma é contornável):
 INSERT INTO qa_refuse SELECT DISTINCT 'tabela_protegida', tbl, rowhash, id FROM qa_hit h JOIN pg_class r ON r.oid = h.tbl
  WHERE r.relname ~ '^(saas_|catalog|catalogo|commercial_|fiscal_|organization(s|_profile|_status))' OR r.relname IN ('financial_categories','payment_methods','configuracoes_sistema','bank_accounts','etiqueta_templates');
 INSERT INTO qa_refuse SELECT DISTINCT 'outro_tenant', tbl, rowhash, id FROM qa_hit
  WHERE coalesce(j->>'organization_id', j->>'tenant_id') IS NOT NULL AND coalesce(j->>'organization_id', j->>'tenant_id') NOT IN ('525fea87-e27e-43f7-af7b-a30064188332','85ba8b71-8514-4ec9-90d3-bfc7ab3ed214');
 INSERT INTO qa_refuse SELECT 'ator_qa_em_linha_de_negocio', h.tbl, h.rowhash, min(h.id::text)::uuid FROM qa_hit h JOIN pg_class r ON r.oid = h.tbl
  WHERE r.relname !~ '(audit|_log|logs|history|events|receipts|epoch|sessions|preferences)'
  GROUP BY h.tbl, h.rowhash HAVING bool_and(h.seed_kind = 'user' AND h.col NOT IN ('user_id','id'));
 INSERT INTO qa_refuse SELECT DISTINCT 'fixture_proibida', tbl, rowhash, id FROM qa_hit WHERE j::text ~ 'd7edc250-25a4-4ee2-8b62-27c1645cdfc0|5fa6d35b|c909c862';
 INSERT INTO qa_refuse SELECT DISTINCT 'referencia_so_textual', tbl, rowhash, NULL::uuid FROM qa_text;
 IF (SELECT count(DISTINCT (tbl, rowhash)) FROM qa_hit) > 2000 THEN INSERT INTO qa_refuse VALUES ('volume_implausivel', NULL, NULL, NULL); END IF;
END $$;
SELECT 'QA_CLEAN_PLAN' k, h.tbl::text tabela, h.id, h.rowhash, string_agg(DISTINCT h.col || '<-' || h.seed_kind, ',') vinculos, min(h.lvl) nivel FROM qa_hit h GROUP BY 2, 3, 4 ORDER BY 2, 3;
SELECT 'QA_CLEAN_REFUSALS' k, reason, tbl::text, id, rowhash FROM qa_refuse ORDER BY 2, 3;
SELECT 'QA_CLEAN_DIGEST' k, md5(coalesce(string_agg(x, ',' ORDER BY x), '')) digest, count(*) linhas FROM (SELECT DISTINCT tbl::text || ':' || rowhash x FROM qa_hit) d;
