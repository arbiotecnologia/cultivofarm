# Cockpit — isolamento frontend, recorte 18:08 UTC / 2026-10-15

## Resultado e proveniência
**GO focal local para contenção/cache; NO-GO leitura funcional, fabricação e publicação.** HEAD real inicial `13fb4833d37e8ef69908f286b5992868b0458feb`, checkout sem alterações pendentes; não utilizado espelho antigo. Auditoria por fonte local, sem banco remoto, DDL, novas permissões, dados ou sessão real. Nenhum hash hospedado revalidado nesta rodada.
Baseline externa preservada: helper prosrc `6dc6de9ce046847310973b5666249177`, definição `e690611cd0967e7697cdbecb8c40e984`; conversor `b112888e28d8a5727df713e0ae7bcd1b`; migrations aplicadas não alteradas/não reaplicar. ACL helper/view/MV/RPC segue fechada conforme evidência anterior, não reinspecionada remotamente.

## Achados HEAD e correção
- Lista `cockpit-laboratorio`, `profiles-esteira`, alertas reconhecidos, timeline, pendências, resumo e métricas tinham keys sem identidade/tenant e queries sem sinal de cancelamento. Descendentes em envase usam Promise.all/setters; composição usa product-profile/disponibilidade; não são leitores homologados por esta correção.
- Novo `useCockpitQuery` reutiliza **useTechnicalQuerySession** de visitas: perfil deve corresponder a user, ativo=true, organização não vazia, papéis resolvidos e loading=false. Scope inclui usuário/perfil/organização/papéis ordenados/readiness. Nunca equivale à autorização servidor, plano/RBAC/RLS.
- AbortSignal encaminhado às consultas lista/RPC, alertas, perfis (duas etapas), timeline, pendências, resumo (lotes/estoque), reserva e métricas. Fence pré/pós-resposta, epoch contra A→B→A e unmount; cancel/eviction de escopo anterior incluindo keys legadas.
- **COCKPIT_READ_AVAILABLE=false**, aditivo fail-closed; nenhum grant/flag existente foi aberto. refetch manual também é bloqueado pelo fence, pois enabled sozinho não o impede. Sem fallback por view/MV.
- Página usa workspace keyed pelo scope: troca de identidade/tenant/papéis/readiness desmonta estados, filtros, paginação, seleção, sheets, dialogs, tabs e locks. Quando fechado, retorna indisponibilidade **antes de montar filhos**. Assim nenhuma ação operacional/reconhecimento pode ser disparada pela página; nenhum setter/toast/navegação dos filhos antigos é iniciado neste recorte fechado.
- Perfis e filhos de leitura também ficam disabled diretamente pelo hook fechado. Métricas laboratorio fechadas em todos consumidores; Cockpit não inicia consulta paralela de métricas de visita. Métrica de visita compartilhada conserva leitor existente, ganha scope/fence/abort e ocultação quando indisponível; não certifica sua fonte.
- Não ampliados papéis, rotas, entitlement ou dependências. Métodos operacionais compartilhados em useEsteiraLaboratorio **não modificados**; outras páginas fora do Cockpit não estão homologadas. Fluxos legados de produção continuam dívida separada.

## Inventário filhos e alcance
| Consumidor | Tratamento focal / limite |
|---|---|
| EsteiraStepper / FinalizarOSButton | Não montados enquanto fechado; contratos operacionais intactos |
| GerarLoteDialog / RegistrarCQDialog / RegistrarEnvaseDialog / ReservarEstoqueDialog | Não montados; reset por key. Reserva query scoped/abort/OS+lote; demais mutations/setters legados não homologados para futura abertura |
| PendenciasInconsistenciasTab / InconsistenciaCard | Não montados; pendências scope/abort/gate, filtros reset por unmount |
| ProducaoResumoTab | Gate/scope/abort das duas leituras; indisponível sem dados |
| ComposicaoProducaoCard | Não montado; product-profile/disponibilidade e inferência micro continuam dependências para abertura |
| CQComparativoTable | Renderização sem consulta própria; não alcançado pela página fechada |
| SeedFixturesButton | Não importado/montado no HEAD Cockpit; prefix legado purgado; sem seed executado/alterado |
| useMetricasOperacionais | Laboratório contido globalmente; visita não consultada pelo Cockpit; consumidores ConsultorTecnico preservados com fence |

## Testes e validações próprias
- **105/105 Vitest, 6 arquivos:** cacheScope18, refinamentos7, auditoria9, origemGuard4, composicaoCalc25, reservaCalc42.
- Cache tests usam QueryClient e página efetivos, **Auth/transport simulados**, nunca produção/contas/Supabase. Cobre resposta A atrasada após B, abort, eviction, ABA, logout, loading, perfil inativo/divergente, tenant ausente, papéis revogados, disabled, refetch fechado, purge das nove famílias legadas; página não chama from/rpc nem monta dialogs.
- Teste origemGuard tinha mock Auth incompleto (`roles` ausente): atualizado para contrato existente; nenhuma regra operacional alterada. Primeiro ensaio33 PASS/4 FAIL por esse mock, final105 PASS.
- Lint hook/teste novo **0**. Sete arquivos tocados **107 erros/1 warning**, contagens por arquivo **iguais ao HEAD inicial** (comparação eslint --stdin): página11/1, esteira57/0, métricas13/0, pendências3/0, resumo5/0, reserva13/0, teste origem5/0. Lint global **FAIL3294 erros/126 warnings**; não alegar lint PASS global nem delta global auditado.
- Scanner de segredos repositório **zero**; diff-check PASS. Build/typecheck automáticos: erro intermediário PageHeader.description corrigido; último sinal18:15:15 **build OK**, sem erro TypeScript. Build/typecheck manuais não executados por restrição do harness.
- Sessão **external_unmanaged**: browser autenticado indisponível nesta rodada; não pedir credenciais/não alegar login ou teste real. Teste signed-out não comprovaria troca de tenant; não usado como prova. Nenhum flow real de leitura é possível com ACL fechada.

## Dependências SQL separadas — NÃO EXECUTADO
`proposed-cockpit-esteira-read-tenant-fence.sql` é **histórico já aplicado externamente** via20261015175232, NÃO reaplicar. Mantido byte a byte, sem candidato de grant novo.
Cadeia documentada: MV → _src_vw_esteira_laboratorio → vw_os_integridade_esteira → OS/pais/programação/lotes/CQ/envase/estoque/entregas/aplicações. Fence h15/cliente do helper não reaplica RLS sobre snapshot materializado.
1. Auditar processo de refresh, execução autorizada, atomicidade, timestamp de frescor e tratamento fail-closed de snapshot obsoleto; não executar REFRESH aqui.
2. Conferir origem pela FK/tabela explícita, XOR OS tradicional/onfarm, referências cliente/fazenda/talhão e parceiro same-tenant ativos; NULL/não resolvido nunca global.
3. Revisar projeção onfarm `NULL::uuid microrganismo_id` contra coluna real e produto OU micro sem inferência histórica; não fabricar receita/dose/volume.
4. Provar tenant e integridade descendentes pelo pai atual antes de consumir IDs/nomes da MV; joins/CQ/envase/reserva/entrega não herdam tenant por presunção.
5. Cache corrigido não remove esses bloqueadores nem valida readers product-profile/disponibilidade, BI/Consul­tor ou ações antigas. Qualquer abertura exige revisão independente e autorização explícita, sem grant isolado.
Fabricação/volume NULL, programar/lote/publish, ownership OFF, diagnóstico/CNPJ fora do recorte.

## Arquivos e rollback
Código: src/hooks/useCockpitQuery.ts (novo); src/pages/CockpitLaboratorio.tsx; src/hooks/useEsteiraLaboratorio.ts; src/hooks/usePendenciasEsteira.ts; src/hooks/useMetricasOperacionais.ts; src/components/cockpit/ProducaoResumoTab.tsx; src/components/cockpit/ReservarEstoqueDialog.tsx.
Testes: src/test/cockpit-laboratorio/cacheScope.test.tsx (novo); src/hooks/useEsteiraLaboratorio.origemGuard.test.tsx.
Documentos: AGENTS.md (regra estrutural no bloco gerenciado), roadmap.md, este relatório, complemento cockpit-leitura-recorte-20261015.md.
Rollback seguro: manter gate=false/indisponibilidade e ACL fechada; se necessário desabilitar a página, não restaurar keys globais/leitores ou métodos abertos como rollback. Sem SQL inverso, remoção de dados, migração, renumeração ou restauração de corpo vulnerável. Reexecutar testes após correção substitutiva.
Commits gerados automaticamente pela plataforma; nenhuma operação git stateful executada pelo agente. Checkpoint de testes `4315f000e6dda465380797fb2a053e5043a1c0e0`; conjunto nominal e commit final consultáveis no histórico entregue. Não publicação.
