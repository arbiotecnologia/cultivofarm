// Gera SQL para revisão manual; NÃO conecta nem executa no banco.
// Uso: node scripts/rbac-audit/build-hotfix-visit12-hosted-rollback.mjs AR_USER_UUID FSF_USER_UUID SA_USER_UUID > /tmp/catalog12-hosted.sql
import { readFileSync } from 'node:fs';
const actors = process.argv.slice(2);
if (actors.length !== 3 || actors.some(x => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x))) {
  throw new Error('Informe UUIDs reais dos atores AR, FSF e Platform Superadmin autorizados; nenhum ator é escolhido automaticamente.');
}
const candidate = readFileSync('scripts/rbac-audit/proposed-hotfix-catalog-visit12-current-schema.sql','utf8');
const visit = 'f19c8343-6205-487a-a237-df4d8ee06471';
let output = '-- REVISÃO/EXECUÇÃO MANUAL AUTORIZADA SOMENTE NO REF swzpzcwiasxmjutrmvkm.\n-- DDL TRANSACIONAL + LEITURAS; NÃO INSERE/ATUALIZA DADOS/AUTH. ROLLBACK OBRIGATÓRIO.\n-- Claims SQL NÃO são JWT/browser. Abortar qualquer erro e executar ROLLBACK.\n' + candidate.replace(/COMMIT;\s*$/, '');
const claims = uid => `SELECT set_config('request.jwt.claims','${JSON.stringify({sub:uid,role:'authenticated',exp:2100000000})}',true),set_config('request.jwt.claim.sub','${uid}',true),set_config('request.jwt.claim.role','authenticated',true);\nSET LOCAL ROLE authenticated;\n`;
output += claims(actors[0]);
output += `DO $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM public.tenant_catalog_visit_selection_page('${visit}','produto',NULL,50,0,NULL);
 RAISE NOTICE 'AR page rows: % (zero não prova disponibilidade de opções)',n;
 IF EXISTS(SELECT 1 FROM public.tenant_catalog_visit_selection_page('${visit}','produto',NULL,1,0,NULL) WHERE NOT selectable OR NOT in_page) THEN RAISE EXCEPTION 'AR page contract failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.tenant_catalog_visit_selection_page('${visit}','produto','''; DROP TABLE produtos;--',50,0,NULL)) THEN RAISE EXCEPTION 'unexpected literal match; review data'; END IF;
 BEGIN PERFORM * FROM public.tenant_catalog_visit_selection_page('${visit}','produto',NULL,0,0,NULL); RAISE EXCEPTION 'limit accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT * FROM public.tenant_catalog_visit_selection_page('${visit}','produto',NULL,50,0,
 ARRAY(SELECT produto_biologico_sugerido_id FROM public.registros_consultor_recomendacoes WHERE registro_consultor_id='${visit}' AND produto_biologico_sugerido_id IS NOT NULL LIMIT 50));
RESET ROLE;
`;
for (const [label,uid] of [['FSF',actors[1]],['SA',actors[2]]]) {
  output += claims(uid) + `DO $$ DECLARE v uuid; BEGIN
 FOREACH v IN ARRAY ARRAY['${visit}'::uuid,'00000000-0000-4000-8000-000000000099'::uuid] LOOP
  BEGIN PERFORM * FROM public.tenant_catalog_visit_selection_page(v,'produto',NULL,50,0,NULL); RAISE EXCEPTION '${label} unexpectedly authorized'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '${label} denied visit %',v; END;
 END LOOP; END $$;
RESET ROLE;
`;
}
output += `SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM * FROM public.tenant_catalog_visit_selection_page('${visit}','produto',NULL,50,0,NULL); RAISE EXCEPTION 'anon unexpectedly authorized'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'anon denied'; END; END $$;
RESET ROLE;
ROLLBACK;
SELECT to_regprocedure('public.tenant_catalog_visit_selection_page(uuid,text,text,integer,integer,uuid[])') IS NULL AS candidate_rolled_back;
`;
process.stdout.write(output);