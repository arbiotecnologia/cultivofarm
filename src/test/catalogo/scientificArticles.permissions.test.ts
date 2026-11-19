import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {canAccess,ROLE_LABELS} from '@/lib/permissions';

it('o leitor de artigos de microrganismos respeita a mesma matriz das fichas',()=>{
 const sql=readFileSync('scripts/scientific-articles-release-20261119/10-install-closed.sql.review','utf8');
 const match=sql.match(/unnest\(ARRAY\[([^\]]+)\]::public\.app_role\[\]\)/);
 expect(match).not.toBeNull();
 const serverRoles=[...match![1].matchAll(/'([^']+)'/g)].map(m=>m[1]).sort();
 const routeRoles=Object.keys(ROLE_LABELS).filter(role=>canAccess(role,'/base-tecnica?tab=microrganismos')).sort();
 expect(serverRoles).toEqual(routeRoles);
 expect(canAccess('financeiro','/base-tecnica?tab=produtos')).toBe(true);
 expect(serverRoles).not.toContain('financeiro');
});
