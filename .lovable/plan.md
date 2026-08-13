# Auditoria somente leitura — "informações sumiram do Dashboard" (13/08/2026)

Nenhum arquivo foi editado, nenhuma migration aplicada e nenhum dado alterado. Todas as consultas ao banco foram `SELECT`.

## Diagnóstico principal

**Não houve perda de dados no banco de staging.** Os registros continuam íntegros; a última gravação em tabelas operacionais é de **12/08/2026**, ou seja, nada foi apagado em 13/08.

O que de fato mudou em 13/08 foram dois artefatos de configuração/tipagem:

1. `.env` voltou a apontar para o backend Sandbox (`yzszlzjpovmcteuxjznj`), enquanto o restante do projeto está vinculado ao staging (`ikaauvsflpmamgxmkhoq`).
2. `src/integrations/supabase/types.ts` foi regenerado a partir do Sandbox e ficou reduzido a **2.052 linhas** (a versão íntegra do staging tem 21.850 linhas).

## Evidências

**Conexão realmente usada pelo app (preview):** o módulo servido pelo Vite em `src/integrations/supabase/client.ts` mantém a URL/chave de **staging** (`ikaauvsflpmamgxmkhoq`) — confirmado lendo o bundle servido. Logo, o Dashboard continua lendo o banco correto; o `.env` divergente não redireciona as consultas do Dashboard.

**Impacto real do `.env` divergente:** apenas as chamadas diretas a Edge Functions que usam `import.meta.env`:
- `src/pages/configuracoes/ComunicacaoConfigTab.tsx:370-376`
- `src/components/protocolos/catalog/ProfileFieldAI.tsx:38-42`
Essas chamadas vão para o Sandbox e falham (ex.: "falha de rede").

**Impacto do `types.ts` reduzido:** `bunx tsgo -p tsconfig.app.json` falha com dezenas de erros (fiscal, regulatório, testes). Isso quebra typecheck/build/publicação, mas não oculta dados em runtime.

**Código de Dashboard não foi alterado:** o diff `019762de..HEAD` não toca em `src/pages/Index.tsx`, `src/pages/dashboard/*`, `src/components/executivo/*`, `src/hooks/useExecutivo*`, `src/config/navigation.ts` nem `src/lib/permissions.ts`. Nenhum filtro, rota ou card foi removido.

**RPCs do Dashboard existem no staging:** `rpc_executivo_resumo_geral`, `rpc_dashboard_geral_lab_resumo`, `rpc_executivo_financeiro_resumo` e `reservar_estoque_item` estão presentes (retornam "Não autenticado" quando chamadas fora de sessão — comportamento esperado).

**Console/rede do preview:** nenhum log e nenhuma requisição registrada no snapshot — não há evidência de erro de runtime no Dashboard neste momento.

**Contagens reais no staging (somente SELECT):**

| Tabela | Total | Observação |
|---|---|---|
| clientes | 3 | 1 "Fazenda Homologação LTDA", 1 `TESTE_ENTREGA_E2E_...`, 1 `F42-HARNESS-...` |
| ordens_servico | 2 | `pronto_entrega` e `finalizada` (11–12/08) |
| lotes | 3 | LT-2026-0001/0002 + 1 `TESTE_ENTREGA_E2E_LOT_...` |
| entregas | 6 | 1 entregue, 1 em rota, 4 `separado` de fixture E2E de 03/08 |
| estoque_produto | 2 | ambos `expedido` |
| produtos | 9 | 8 legítimos + `INO-5 TESTE_ENTREGA_E2E_PROD_...` |
| microrganismos | 26 | 25 legítimos + `F42-HARNESS-20260806121703-FA6EB0 MICRO` |
| fazendas / talhoes | 1 / 3 | — |

**Conclusão sobre a percepção de "sumiço":** o volume de dados operacionais no staging sempre foi pequeno; após a exclusão autorizada de *Azospirillum brasilense* e *Bradyrhizobium japonicum* (e das OS/lotes de teste vinculados), os cards passaram a exibir números menores. Isso é efeito da limpeza autorizada, não das alterações de 13/08. Nenhum dado legítimo remanescente está sendo ocultado por código.

## Arquivos afetados pelas alterações de 13/08

- `.env` — apontando para Sandbox (divergente de `client.ts` e `supabase/config.toml`).
- `src/integrations/supabase/types.ts` — stub do Sandbox (2.052 linhas).
- Limpeza de casts (sem efeito de ocultação): `AgendaTecnica.tsx`, `ClienteDetalhe.tsx`, `Entregas.tsx`, `Estoque.tsx`, `MonitoramentoAlertas.tsx`, `OrdensServico.tsx`, `Solicitacoes.tsx`, `FluxoTecnico.tsx`, `useMicroorganismRegulatory.ts` e outros ~20.
- Um ponto de atenção menor: em `Configuracoes.tsx` a queda de `(data || []) as ...` para `data as ...` remove o fallback de lista vazia (pode render `null` em vez de `[]`).

## Plano mínimo de restauração (a executar somente após sua aprovação)

Nenhuma etapa apaga ou altera dados.

1. **Restaurar `.env`** para o binding de staging do commit `019762de`: `VITE_SUPABASE_PROJECT_ID`/`VITE_SUPABASE_URL` = `ikaauvsflpmamgxmkhoq` e a chave anon correspondente. Corrige as chamadas de Edge Function.
2. **Restaurar `src/integrations/supabase/types.ts`** a partir de `c75bb87f` (21.850 linhas, schema do staging). Corrige typecheck/build.
3. **Reintroduzir o fallback `|| []`** no seletor de clientes em `Configuracoes.tsx` (correção defensiva de 1 linha).
4. **Validar:** `bunx tsgo -p tsconfig.app.json` em zero erros e `src/test/config/connection-binding.static.test.ts` em 8/8.
5. **Verificar o Dashboard logado** (sessão de administrador) para confirmar que `rpc_executivo_resumo_geral` e `rpc_dashboard_geral_lab_resumo` retornam os indicadores esperados com os registros existentes.

Observação de risco: a plataforma já regenerou `.env` e `types.ts` a partir do projeto Sandbox mais de uma vez. Se isso repetir após a restauração, o item raiz é o vínculo do projeto com o backend Sandbox — que deve ser tratado antes de qualquer publicação.

## Não recomendado

Nenhuma exclusão de dados é proposta. Os registros `TESTE_ENTREGA_E2E_*`, `F42-HARNESS-*` e `Fazenda Homologação LTDA` são identificáveis como fixtures, mas permanecem intocados nesta auditoria.
