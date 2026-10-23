# Promoção frontend P1 — 23/10/2026, não publicada

Somente hook financeiro runtime alterado; teste existente atualizado. RPC com CAS integral, NULL ausência e sem writer direto; selector/mutation aceitam owner ativo OU ownorg legado pelo registro RLS da organização atual. RPC/h15/perfil/roles/tenant continuam autoritativos. Dialog/rotas/Auth/feature flags/Edges/SQL e dados não alterados.

- SHA256 hook src e after: `28fd611ab45ac13cc9cb8da1202c3f08a55fe47d77a29815c0cc7f1229005888`.
- `frontend-promoted.patch`: diff aplicável ao baseline de revisão `useB2BFinanceiro.before.ts`.
- `SHA256SUMS`: fontes/diff/evidências exatos desta promoção; confira antes de publicação.
- 48/48 testes Vitest em 4 arquivos; SDK/Auth sintéticos, não JWT/RLS/UI hosted.
- `tsgo -p tsconfig.app.json` e node na cópia integrada: EXIT0 (logs vazios em sucesso). **tsc não executado**.
- `bun run build` na cópia integrada: PASS36,15s, aviso chunks grandes; preview automático build OK.
- Falha inicial 47/48: listagem alterava tenant antes da mutação no teste; teste de race passou a montar somente mutação. Nova execução 48/48.
- Revisão d99/PRE READ ONLY produção PASS relatados pelo proprietário. SQL P1 aguardando aplicação externa; não publicar sem POST/ACL/hash/API coordenados. Missing/denied RPC nunca faz fallback.
- ACL fiscal instalada pelo proprietário, somente registro relatado em ../../applied/c2_fiscal_resolver_internal_only.md; não reaplicar candidata/PRE fiscal antigos.
- Plano teste4 publicado e método pix permanecem intactos. Writer C2 fechado. Nenhum SQL/DML hosted, publicação, Edge ou alteração de sessões/roles/fixtures pelo agente.
- Sessão external_unmanaged: authenticated E2E indisponível; JWT/PostgREST/UI A/B, POST integral, monitor/multiperfil/anexos/fiscal/cancelamento/estorno/idempotência/preço continuam gates externos. Não declarar homologação integral ou GO de produção.

## Publicação segura pelo proprietário
Concluir aplicação independente P1 e POST exato; conferir RPC disponível e negar B/externos. Validar formulário A/ownorg/owner e CAS real, conferir SHA desta fonte, então autorizar publicação explicitamente. Reversão não pode restaurar writer direto ou ACLs anteriores.
