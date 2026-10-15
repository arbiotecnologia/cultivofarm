# Filtros globais nas Edge Functions com service_role — PREPARADO, NÃO APLICADO

Não editado em `supabase/functions/*` de propósito: edições lá são implantadas automaticamente, e a coluna
`owner_organization_id` ainda não existe no banco. Aplicar este patch **no mesmo ciclo** em que 01–03
forem implantados (ordem: DDL → Edge).

Versões implantadas confirmadas pela revisão: ai-refresh-fichas v73, ai-generate-ficha-campo v76,
ai-sugerir-alvos v73, admin-audit-produtos-orfaos v77.

| Função | Linha (base 0fe35743+) | Consulta | Patch |
|---|---|---|---|
| ai-generate-ficha-campo | 58 | `.from('produtos')` | `.is('owner_organization_id', null)` |
| ai-generate-ficha-campo | 70 | `.from('formulacoes')` | `.is('owner_organization_id', null)` |
| ai-generate-ficha-campo | 88 | `.from('microrganismos')` | `.is('owner_organization_id', null)` |
| ai-sugerir-alvos | 41 / 46 / 56 | produtos / formulacoes / microrganismos | `.is('owner_organization_id', null)` em cada |
| admin-audit-produtos-orfaos | 78 | `.from("produtos")` | `.is("owner_organization_id", null)` |
| ai-refresh-fichas | — | nenhuma leitura direta das 5 tabelas por `.from` | auditar RPC/loader usado antes de abrir o gate |

service_role ignora RLS: sem esse filtro, uma ficha global poderia ser gerada a partir de item privado.
`resolverMicroorganismItem` é puro; o loader que o alimenta segue UNVERIFIED.
