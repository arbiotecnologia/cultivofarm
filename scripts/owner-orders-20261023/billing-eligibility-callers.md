# Call graph eligibility — revisão23/10/2026

## Produto e SQL atual
- `src/integrations/supabase/types.ts:21427` e `cultivofarm.types.ts:18187`: somente tipos; nenhuma chamada de produto localizada em src.
- `supabase/functions/fase-e-runtime-harness/index.ts:222–226`: probe ACL, não consumidor de negócio; deve receber negação com ACL internal-only. Não alterar/deploy Edge.
- SQL hosted READ ONLY, busca prosrc em todos schemas: só `public.generate_b2b_receivable_secure_impl(uuid)`, DEFINER/postgres, chama helper com seu owner. Baseline local `baseline/public.generate_b2b_receivable_secure_impl.sql:52`.
- Candidato reusa esse caller e os endpoints existentes: wrapper revalida phase1/owner canônico/roles/priceable antes impl; impl valida h15/tenant de emissor, cliente/dono, locks. Testes A/B e revogação permanecem locais/sintéticos.

## Histórico, não ativar
- `supabase/migrations/20260917000000_h6c_financeiro_snapshot_b2b_credito.sql:190–196,264–265,382–425`: definição/gate/caller históricos.
- `supabase/migrations/20260731020033_e36b5779-7dd3-48fd-bafe-3b662742b1de.sql:9–50`: caller antigo.
- `supabase/migrations/20260731015931_d970d467-904a-45df-bf56-1852d1973aea.sql:154–207`: definição e grant histórico authenticated.
- `supabase/migrations/20260731021902_27970caa-7f82-44de-81ab-e8b2c09a94f8.sql:428–445`: revogação histórica authenticated e grant service.
- `scripts/contracts-c2-20261022/integral/replica.sql:2005,6982–6986`: réplica com grant authenticated vulnerável; NÃO promover como ACL atual.
- `restoration/promocao-producao-h9/promotion-sql/20260731020033__promocao.sql:61`, `20260731015931__promocao.sql:170` e `restoration/homologacao-h6/20260917000000_h6c_financeiro_snapshot_b2b_credito.sql:420`: cópias históricas.
- Testes/snapshots/inventários não são consumidores novos. Auditoria de todos caminhos repo feita por subagente read-only; SQL atual confirmado separadamente pelo agente.

Internal-only basta para superfície direta identificada, **não certifica autorização transitiva de todos endpoints**. Busca exata não detecta nomes montados em SQL dinâmico nem cliente externo ao repo. Sem wrapper novo, ACL alterada, função fiscal modificada ou liberação writer. PRE/POST/rollback bloqueiam deriva do corpo/owner/ACL/caller direto.