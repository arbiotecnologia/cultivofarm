# Dashboard /dashboard/geral com valores vazios — auditoria somente leitura

## O que foi verificado agora (fatos)

1. `src/pages/Index.tsx` não renderiza cards: apenas redireciona por perfil (`getHomeForRole`). Os cards vêm de `src/pages/dashboard/DashboardUnificado.tsx` → `src/pages/dashboard/VisaoGeral.tsx`.
2. `VisaoGeral.tsx` usa exatamente duas fontes:
   - `useExecutivoResumo` → RPC `rpc_executivo_resumo_geral` (bloco executivo, prioridades, fluxo do dia);
   - `useQuery` → RPC `rpc_dashboard_geral_lab_resumo` (situação do laboratório).
3. Ambas as RPCs **existem** no projeto de staging `ikaauvsflpmamgxmkhoq` (chamada REST anônima retornou `42501 permission denied for function`, ou seja, a função existe e é restrita a usuário autenticado).
4. Divergência de ambiente ativa:
   - `.env` aponta para o Sandbox `yzszlzjpovmcteuxjznj`;
   - `src/integrations/supabase/client.ts` (usado em runtime pelos hooks) aponta para o staging `ikaauvsflpmamgxmkhoq`;
   - `src/integrations/supabase/types.ts` está com **2.052 linhas** (schema do Sandbox), contra **21.850 linhas** da versão íntegra de staging no commit `c75bb87f`. A restauração feita antes foi sobrescrita por regeneração automática da plataforma.
5. Não há logs de console nem requisições de rede capturados nesta sessão (snapshot vazio), e a sessão de preview está `signed_out` — portanto **não foi possível observar a resposta real das RPCs autenticadas**.

## Diagnóstico

Causa confirmada: **deriva de ambiente**. O código de runtime consulta o staging, enquanto `.env` e `types.ts` foram regenerados para o Sandbox (que só possui funções-stub e praticamente nenhum dado). Qualquer parte do app que dependa de `import.meta.env.VITE_SUPABASE_URL` (ex.: chamadas de Edge Function) e a tipagem do client passam a apontar para um projeto vazio.

Causa do "valores vazios" especificamente: **não confirmada**. O componente distingue erro (mostra card "Resumo executivo indisponível"), indisponibilidade por origem (mostra "Indisponível") e ausência de valor (mostra `—` ou `0`). Ver os valores em branco não corresponde a nenhum desses estados de forma óbvia — é preciso ler a resposta real da RPC autenticada antes de afirmar a causa.

## Plano mínimo de correção (a executar só após aprovação)

Etapa 1 — Confirmar o comportamento em runtime (sem edições)
- Com sessão autenticada no preview, capturar console + rede em `/dashboard/geral` e ler o payload de `rpc_executivo_resumo_geral` e `rpc_dashboard_geral_lab_resumo` (status HTTP, `resumo`, `dados_indisponiveis`).

Etapa 2 — Restaurar apenas o mínimo (2 arquivos)
- `.env` → valores de staging do commit `019762de` (`VITE_SUPABASE_PROJECT_ID` / `VITE_SUPABASE_URL` = `ikaauvsflpmamgxmkhoq` + anon key correspondente).
- `src/integrations/supabase/types.ts` → versão íntegra de `c75bb87f` (21.850 linhas).

Nenhum outro arquivo precisa mudar: `client.ts` e `supabase/config.toml` já estão corretos e `VisaoGeral.tsx` não foi alterado pelos commits recentes.

Etapa 3 — Validar
- `tsgo -p tsconfig.app.json`, `vite build`, `connection-binding.static.test.ts` e reconferência do dashboard autenticado.

Observação: se a Etapa 1 mostrar que as RPCs respondem 200 com `resumo` vazio, o problema é de dados/permissão no staging e não se resolve com a restauração de arquivos — nesse caso o próximo passo é auditar as RPCs no banco (somente leitura), sem alterar dados.

Nada foi editado, nenhum banco alterado e nada publicado.
