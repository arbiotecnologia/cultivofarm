# Cockpit — candidato de fonte atual, ACL fechada

**Preparação local; liberação NO-GO.** HEAD inicial real c5566e68379c728f803d5a94c5013c63a956a22b. Nenhum app, DDL remoto, dados, Auth, grants, flags ou publicação alterados; sem subagentes. Ref canônico swzpzcwiasxmjutrmvkm comprovado por info antes das consultas SELECT. CLI diagnóstico recusou backend externo; ferramenta Supabase recuperou somente ledger/definições/ACL/colunas. Nenhuma prova hospedada de execução do candidato.

## Matriz de 17 itens
1. **Ledger exato:** arquivos applied-20261015180956/181119/181542 em scripts/rbac-audit, sem cabeçalhos/wrappers. JÁ APLICADOS EXTERNAMENTE; NÃO REAPLICAR. MD5 local sem LF final coincide com serialização de statements.
2. **Eventos/idempotência:** Renato relata FSF ROLE authenticated antes10eventos/1idem;10eventos sem tenant resolvido, não atribuir à AR. Depois5negações42501 e matriz5superfícies auth/anonfalse/servicetrue são evidência externa. Própria leitura confirma SELECT fechado e RLStrue nas duas tabelas.
3. **Bypass legado:** fn_avancar sem auth/tenant e autoria recebida; lab_request só papel conforme revisão externa. Própria consulta confirma três EXECUTE auth/anonfalse/servicetrue; corpos intactos, nenhuma liberação.
4. **Microprojeção:** migration externa preserva ofa.microrganismo_id/ACL, refresh interno já aplicado pelo revisor.10assertions PGlite fonte exata/enumtext semRLS e zero OS reais micro são provas externas, não próprias.
5. **Fonte atual:** proposed-cockpit-live-source-closed.sql reutiliza h7n→view→RPC; h7n lê _src_vw_esteira_laboratorio. MV somente tipo composto, nunca snapshot. Não duplica fluxo/status.
6. **Frescor:** fonte/MV3linhas0diferenças é snapshot externo. Triggers8tabelas não cobrem cadastros/aplicação/data diária. Fonte atual recalcula no snapshot de cada SELECT; demais leitores MV continuam não certificados.
7. **Ator/feature:** readiness técnico/h15 server-side, tenant não NULL e _saas_user_has_feature(ordens_producao) IS TRUE, conforme featureRouteMap. Não aceitar tenant do cliente/GUC; SA sem bypass.
8. **RBAC:** interseção conservadora helper vigente×rota: administrador/gestor/administrativo/producao. Financeiro/técnicos ausentes da rota ficam negados; operador presente na rota mas ausente do helper não é ampliado. Técnico com carteira revogada permanece negado (todos técnicos negados neste candidato); reabertura técnica exigiria contrato próprio.
9. **OS/origem/XOR:** manual exige organization_id atual e cliente do tenant; onfarm usa cliente explícito, sem coluna inventada. Colisão UUID de origens negada; produto OU micro, não ambos/nenhum. Volume NULL nunca autoriza fabricar.
10. **Cliente/fazenda/talhão/visita:** cliente e org obrigatórios; campos opcionais vazios não inferidos. Referência preenchida exige existência/tenant/pai e fazenda/talhão ativos; visita preenchida exige cliente/fazenda/talhão coerentes.
11. **Partner:** pedido/item/parceiro/client comercial/commercial_owner_organization_id atuais coerentes, parceiro ativo/não deletado, IDs de item exatos. Não inferir P=A nem usar organizations.partner_account_id.
12. **Programação/responsável:** TODAS programações relacionadas, não só última: org/XOR origem/OS/item. Perfil responsável ativo mesmo tenant; texto legado sem identidade é inelegível e não vira fallback de RPC/busca.
13. **Lote/CQ/envase/estoque:** todos descendentes de todas programações com tenant/pais/item; estoque sem org deriva lote explícito, envase/reservas coerentes. Filho inválido exclui OS inteira. Aliases legados de reserva não normalizados: exigida origem literal, possível exclusão segura a revisar.
14. **Entrega/aplicação:** XOR OS/origem/tenant/cliente/item/pedido, lote/estoque/parent/responsável atuais coerentes. Referências preenchidas órfãs/cruzadas excluem OS. Ausência opcional não equivale a global.
15. **Órfão:** programação/cliente semorg OSUI-4dd0c9eb relatada externamente preservada/inelegível; não consultada/modificada pelo agente. Descendentes futuros não listados não recebem certificação.
16. **RPC/paginação/ACL:** INVOKER, assinatura/JSON existentes; filtros após helper, total antes LIMIT/OFFSET;1–200/offset>=0 preservados, desempate origem/UUID. View não recriada. Preflight ledger/hashes/ACL e pós-condições ACL/owner/operações intactos. Nenhum GRANT.
17. **Provas/gates:**61 asserts novos PostgreSQL17 descartável +19 históricos;20/20 Vitest (18cache+2SQL). Corpos candidatos efetivos compilados; Auth/feature/tenant/fonte/schema reduzidos simulados. Inclui AR/FSF positivos, tenant pós-snapshot, filhos antigos/cruzados, NULL/órfãos/revogação/inativo, partner/micro/paginação, ROLE auth/anon42501. Não é full-schema/preflight/RLS/JWT/browser/concorrência hospedados; cache c556 revisão independente. Leitura/fabricação/programar/lote/publish NO-GO; ownership OFF.

## Hashes
Ledger MD5 (serialização statements; arquivo sem LF terminal):
- 20261015180956: a7503391ff26db06a1b7d26f3156a217
- 20261015181119: e2e9c9e96b0533db8c0635d891306052
- 20261015181542: 9e260c759499a8a68a1eeadac34207ce

Baseline próprio: h7n definição e690611cd0967e7697cdbecb8c40e984; RPC53c9fdb94780b9666ca9b602ad95a813; converterb112888e28d8a5727df713e0ae7bcd1b; integridadee8331dbe2bc538cf21fad123fb43f19b; fontec71226f594d27d92833686212415ccec; MV50e27806080f38e4adbd94f3bdf2db23; viewd72d5df7bacffdf8f4fc4282b804ab90.
Candidato SHA256 e3f792ba36a6866d06f49be6cb6981ad764d07584bf522f2c2d881e13855c31d; MD5 corpos entre delimitadores h7n4103991d12eea471fe833b07dfb6bd7e/RPC7d56fc8280126fa2e227f7b38f83c5ea. Não são definition hashes hospedados pós-aplicação.

## Validação, arquivos e rollback
Testes: scripts/tests/cockpit-live-source-local.py e src/test/cockpit-laboratorio/liveSourcePostgres.test.ts; executar com binários PostgreSQL no PATH via bun run test. Regressões tenantFencePostgres/cacheScope incluídas. Lint novo teste0, scanner focal zero segredos, diff-check PASS. Build automático observado OK18:25:29; nenhum typecheck/build manual por regra do ambiente, typecheck separado não comprovado nesta rodada. Lint global legado3294erros/126warnings FAIL da fase anterior, não reexecutado/não corrigido.

Candidato não aplicado: nenhuma reversão remota necessária. Futuro pre/post falhando deve abortar transação. Rollback futuro mantém ACL/flags fechadas, não restaura stale reader/grants nem executa arquivos applied; converter/operações intactos. Arquivo histórico proposed-cockpit-esteira-read-tenant-fence.sql não deve ser reaplicado.

Bloqueadores: revisão independente; compilação/preflight/pós-condições integrais hospedadas sob autorização própria; JWT/RLS/browser; perf/EXPLAIN e paginação concorrente; contratos técnicos/aliases de origem e outros leitores MV/filhos não listados. Não alegar auditoria completa nem PASS operacional. Commits são geridos pela plataforma; HEAD final registrado após os arquivos.
