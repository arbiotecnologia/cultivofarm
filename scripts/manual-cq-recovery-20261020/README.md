# CQ manual — candidato para revisão, não implantado

**Base publicada:** `afa2417fb2ac305636b9bc82786d62ae9af0a632`. Supabase único `swzpzcwiasxmjutrmvkm`.

Recibo do proprietário: lote LT-2026-0002 criado pelo diálogo REAL B, 100 mL; OS programada, programação aguardando, lote em_producao. Registro fictício, sem produção física/venda/uso agrícola. Nenhum dado operacional foi escrito pelo agente. Legado `cd49ce12-9d06-459c-b874-3c8d3a275423` permanece intocado.

## Recorte implementado apenas no pacote

- Mesmo `RegistrarCQDialog`, aberto pela OS canônica; frontend-candidate não substitui runtime. `MANUAL_CQ_REVIEWED=false`.
- `enviar_cq`: transação altera OS programada→em_cq, programação aguardando→aguardando_cq, lote em_producao→aguardando_cq. Exceção de transição específica com ticket privado, sem simular etapa em_producao da OS, autoaprovar OS ou criar lote adicional.
- `registrar_cq`: overload da mesma RPC, núcleo único; resultado e pH/concentração/aparência/odor/contaminação obrigatórios, referência server-owned, autoria servidor e identificação sintética. Lote aprovado/reprovado, programação aprovada apenas se aprovado; OS continua em_cq. **Nunca inicia envase**.
- h15/perfil ativo/readiness/SaaS/papel vivo, tenant OS=cliente=programação=lote, propriedade/talhão e item fabricável revalidados após locks. OnFarm/B2B/ambiguidade/responsável pré-atribuído/estoque/envase/entrega/aplicação ficam fora do recorte.
- Guard manual original preserva INSERT; UPDATE permite somente a transição CQ com ticket alvo/txid específico e campos restantes imutáveis. Guard CQ fecha INSERT direto e UPDATE/DELETE manuais; guards pai contêm avanço artificial.
- Replay por lote/fase/ator/hash, cadeia revalidada; resultado+evento+recibo atômicos. Nada de grants ao core privado, JWT stale ou GUC autorizador.
- Cancelamento/prazo real 12s na UI, snapshot/fence em papel/tenant/época/lease, descarte do formulário na incerteza e single-flight. Timeout é resultado **não confirmado**, não retry automático nem garantia de cancelamento da transação servidor.

## Achados reais que motivaram o delta

1. Fonte/ACL LIVE da RPC de avanço na leitura desta rodada: hash `c159638f8e2b7bcb4c8c04fd457592cb`, ACL postgres/service_role; **authenticated está fechado**, diferente de uma observação histórica. PRE exige o estado atual fechado, não inventa abertura existente.
2. Formulário atual faz INSERT CQ e aprovação separada. Candidata elimina essa escrita direta para este formulário.
3. Trigger CQ aprovado autoavança envase. Candidata contém manual; OnFarm fora do recorte conserva corpo legado, sem certificação.
4. Leitor `private.h7n_esteira_laboratorio` compara responsável CQ (profiles.id) com profiles.user_id. Correção candidata de um único predicado para profiles.id, mantendo tenant e ativo; sem novo reader ou ACL. Teste confirma OS consultável após CQ.

## Arquivos e ordem de revisão

1. `preflight-readonly.sql`: catálogo, hashes/ACLs, tabelas/RLS/policies/triggers, dependências e FKs imediatas; ref exato obrigatório. Não executar em outro projeto.
2. `candidate.sql.review`: PRE + corpos/guards/reader + ACL mínima dos dois wrappers + POST, em transação. **Não aplicada**; não está em migrations/autodeploy.
3. `postflight-readonly.sql`: candidata exata, ACL contida preservada; sem dados operacionais.
4. `rollback.sql.review` e `rollback-postflight-readonly.sql`: reversão autocontida; definição original da RPC e hash conferidos em PG. Fecha authenticated nos dois wrappers, mantém história, guard CQ/pai e contenção de autoenvase; restaura guard de lote/escada original. Mantém reader corrigido e ambos os triggers de autoria/imutabilidade SEM escape GUC. Fontes antigas em rollback são snapshots para PRE/reprodução, nunca executadas pela reversão. Não restaura grants administrativos de lotes.
5. `frontend-candidate/` e `rollback/src/`: somente dois componentes; nunca copiar antes do SQL revisado e da comparação independente. Sem tocar monitor/anexos/PDF/bindings.
6. `manifest.json`: SHA256 de cada artefato. `post-hashes.json`: hashes pg_get_functiondef produzidos no PG descartável.

## Validação reproduzível

```sh
python3 scripts/manual-cq-recovery-20261020/test-local.py
python3 scripts/manual-cq-recovery-20261020/prepare-validation.py
bunx vitest run --config scripts/manual-cq-recovery-20261020/vitest.config.ts
python3 scripts/manual-cq-recovery-20261020/assemble.py
```

- PG local: **73 checks**, Auth sintético, corpos STABLE e gatilhos capturados. Reproduz escape real dos dois DEFINER sob SET ROLE authenticated em tabela-probe com RLS tenant, isolada dos guards manuais; depois nega autoria forjada, mudança/exclusão final e confirma histórico após rollback. Inclui referências ausentes/inativas/incompletas/item alheio/fora especificação, além dos testes anteriores de concorrência, ator e cadeia.
- Formulário candidato real/transportes fake: **10 testes**, incluindo aprovação sem referência negada antes da escrita.
- Regressão Gerar Lote: **51 testes**. Runtime, monitor e cliente conferidos byte-idênticos à base publicada; build automático OK.
- **Não executados nesta rodada:** typechecks manuais (harness da plataforma é responsável), PRE/POST integrais no catálogo hosted, migração, publicação, sessão real CQ A/B. Não contar clone parcial de schema como PRE integral nem PostgreSQL sintético como homologação real.

## Gates para aceite e riscos

**NÃO implantar/publicar sem revisão independente.** Falta comparar os corpos e todos os efeitos do schema integral, typechecks app/node+candidatas, rodar PRE canônico e validar ACLs/triggers finais. Depois da eventual implantação pelo proprietário, homologar ambos os sentidos A/B, leitura após CQ, revogação e legado sem reload/alterar sessões de observação.

- SHARE em catálogos/SaaS/invites e refresh materialized global permanecem custo/risco de lock e latência; não foi aferida carga hosted nem causa de gateway.
- FKs imediatas OS→programação/production_order_link/entrega/aplicação e parent locks sustentam ausência de filhos no caminho revisado. O pacote anterior contém prova de duas sessões dessas FKs; este pacote acrescenta corrida CQ/revogação. Escritores privilegiados, schema integral e filhos sem FK imediata exigem revisão: não afirmar cobertura global.
- Aprovação EXIGE referência ativa completa válida do item canônico: produto_id exato para produto (sem inferir/forçar micro); item somente micro exige referência sem produto e micro exato. Ambiguidade fecha. Sem referência só é possível registro sintético reprovado, nunca conformidade/aprovação. Teste positivo usa referência criada SOMENTE em PG descartável, não é evidência de referência válida da fixture real. O leitor UI existente pode não resolver produto sem micro: aprovação permanece bloqueada; não inventar associação para homologar.
- `cq-integrity.sql.review` remove integralmente app.cq_purge_fixture dos dois DEFINER sem substituto por papel/claim/GUC. Nenhum purge solicitado; rollback retém esse hardening global de imutabilidade/autoria.
- Direct DML administrativo amplo em OS/programação e MAINTAIN de CQ/referências preexistem; não foram revogados globalmente sem inventário. Guards contêm o recorte manual revisado, não certificam todas as rotas administrativas.
- Formulário candidato limita origem manual. Outros consumidores deste formulário (Cockpit) não são reativados; preservar seus gates. Qualquer efeito legado fora desse recorte deve ser revisado antes de expansão.
- Resultado laboratório sintético não prova fabricação física nem autoriza uso agrícola. CQ não habilita envase/reserva/entrega/termos/contratos.