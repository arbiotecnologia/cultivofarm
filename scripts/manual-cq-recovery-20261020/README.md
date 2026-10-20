# CQ manual — candidato para revisão, não implantado

**Delta 20/10 13:16 — contrato produto-only preparado, NÃO instalado.** `reference-product-only.sql.review` altera somente a representação da referência na tabela existente: micro pode ser NULL se produto está presente; trigger INVOKER sem exceções exige ao menos um item. Conserva ambas as FKs, linhas micro-only e produto+micro legadas, políticas, ACL e escritores fechados. Não infere associação e não autoriza cadastro/CQ/envase. É um delta de desenho executável no laboratório, ainda exige PRE/POST integrais e inventário de consumidores/writers/índices antes de ser instalável.

`reference-product-only-rollback.sql.review` restaura NOT NULL apenas sem qualquer linha micro NULL, inclusive inativa/histórica; com histórico recusa sem apagar/reparar/associar. Trigger de integridade permanece. Delta fora de `candidate.sql.review`: PRE/POST/rollback CQ continuam byte-fixados no schema anterior e **recusam** a mudança até recaptura e revisão explícitas. Hash atual schema `2e521a3b3c4e459e5ab9b5f8e52d06ee`; projeção read-only só de nullable `834a551c4d52b5a7d177ae98eb055dc3`.

Leitura canônica desta rodada confirmou NOT NULL/FKs e índice `cq_param_ref_micro_prod_uidx`: chave micro+coalesce(produto). Com micro NULL não garante unicidade de produto-only; o delta não altera índices legados nem deduplica dados. Duplicatas ativas são recusadas pelo core/hook sob os locks existentes. Writer futuro deverá revalidar unicidade/concorrência server-side; nenhum writer foi aberto. Proposta fictícia permanece não insertável no hosted atual, sem referência criada.

**Validação desta rodada:** 116 checks PostgreSQL descartável (referência positiva realmente produto-only/micro NULL, FKs, item obrigatório, rollback com histórico, idempotência, políticas/escrita fechada/legado intactos, concorrência e CQ completo); 67 Vitest PASS. Não são JWT/RLS/browser hosted. Recibo independente do proprietário: 10 testes formulário e typecheck app+candidatas18fc97 PASS, válido somente naquele snapshot; não certifica este delta SQL. Nenhum TS runtime/candidato mudou nesta rodada; não reexecutado typecheck manual do aplicativo (harness automático). Resultados abaixo são históricos, substituídos por este delta quando conflitantes.

**Pendência separada monitor:** proprietário observou em B publicado afa241, sessão criada19/10, `auth_refresh` 13:07:06.118 UTC; `load_timeout` 20.015s às13:07:26.139 e “Falha ao carregar dados do usuário”. Retry de perfil recuperou Clientes sem reload. Recuperação pontual comprovada pelo recibo, estabilidade **não PASS**, causa desconhecida. Nenhuma alteração no monitor nesta revisão CQ; investigação/correção exige revisão própria.

**20/10 13:13: baseline LIVE conferida read-only.** `manual_program_binding_containment` aplicada pelo proprietário; corpo/owner/ACL/trigger/hash agregado confirmados no Supabase canônico. Ver `BASELINE-manual-program-binding.md`. Montagem retomada somente para revisão: PRE/POST/rollback exigem a contenção sem defini-la/removê-la/substituí-la. Gate CQ false; nenhuma implantação autorizada.

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
5. `cq_remove_guc_definer_bypass` já implantada pelo proprietário em 20/10 02:45 UTC; **não reaplicar**. Leitura canônica confirmou autoria `329913a20fa9284bd794a034ca4cdfd0`, imutabilidade `1ffd8093e77aa56a8814ed6e292ef299`, owner postgres e ACL `{postgres=X/postgres,service_role=X/postgres}` em ambas. Recibo: teste authenticated transacional pós negou UPDATE finalizado mesmo GUC=on; rollback concluído, nenhum CQ fictício persistiu. Isso não homologa o fluxo CQ completo.

## Arquivos e ordem de revisão

1. `preflight-readonly.sql`: catálogo, hashes/ACLs, tabelas/RLS/policies/triggers, dependências e FKs imediatas; ref exato obrigatório. Não executar em outro projeto.
2. `candidate.sql.review`: PRE + corpos/guards/reader + ACL mínima dos dois wrappers + POST, em transação. **Não aplicada**; não está em migrations/autodeploy.
3. `postflight-readonly.sql`: candidata exata, ACL contida preservada; sem dados operacionais.
4. `rollback.sql.review` e `rollback-postflight-readonly.sql`: reversão autocontida; definição original da RPC e hash conferidos em PG. Fecha authenticated nos dois wrappers, mantém história, guard CQ/pai e contenção de autoenvase; restaura guard de lote/escada original. Mantém reader corrigido e ambos os triggers de autoria/imutabilidade SEM escape GUC. Snapshots destes dois triggers em rollback já são contidos; fontes vulneráveis ficam somente em `historical-test-fixtures/` para reprodução PG descartável. Nenhum destes dois triggers é reescrito pelo candidato/rollback. Não restaura grants administrativos de lotes.
5. `frontend-candidate/` e `rollback/src/`: três componentes e o hook existente; nunca copiar antes do SQL revisado e da comparação independente. Sem tocar monitor/anexos/PDF/bindings.
6. `manifest.json`: SHA256 de cada artefato. `post-hashes.json`: hashes pg_get_functiondef produzidos no PG descartável.

## Validação reproduzível

```sh
python3 scripts/manual-cq-recovery-20261020/test-local.py
python3 scripts/manual-cq-recovery-20261020/prepare-validation.py
bunx vitest run --config scripts/manual-cq-recovery-20261020/vitest.config.ts
python3 scripts/manual-cq-recovery-20261020/assemble.py
```

- PG local: **102 checks**, Auth sintético, corpos STABLE e gatilhos capturados. Reproduz escape histórico dos dois DEFINER sob SET ROLE authenticated em tabela-probe com RLS tenant, isolada dos guards manuais; confere os dois hashes LIVE contidos, depois nega autoria forjada, mudança/exclusão final e confirma histórico após rollback. Inclui referências ausentes/inativas/incompletas/item alheio/fora especificação, concorrência, ator/cadeia e nova contenção LIVE de programação (seis mutações negadas com 42501, update inócuo permitido e volume preservado).
- Candidatos reais/transportes fake: **67 Vitest** (10 formulário, 17 hook/integração, 35 comparação, 5 preservação da baseline na montagem), incluindo aprovação sem referência negada antes da escrita.
- Regressão Gerar Lote: **51 testes**. Runtime, monitor e cliente conferidos byte-idênticos à base publicada; build automático OK.
- **Tipos:** tsgo da cópia isolada com hook/diálogos candidatos PASS (baseUrl removido somente na configuração temporária para compatibilidade do verificador). App/build do runtime seguem o harness automático. **Não executados nesta rodada:** PRE/POST integrais no catálogo hosted, migração, publicação, sessão real CQ A/B. Não contar clone parcial de schema como PRE integral nem PostgreSQL sintético como homologação real.

## Gates para aceite e riscos

**NÃO implantar/publicar sem revisão independente.** Falta comparar os corpos e todos os efeitos do schema integral, typechecks app/node+candidatas, rodar PRE canônico e validar ACLs/triggers finais. Depois da eventual implantação pelo proprietário, homologar ambos os sentidos A/B, leitura após CQ, revogação e legado sem reload/alterar sessões de observação.

- SHARE em catálogos/SaaS/invites e refresh materialized global permanecem custo/risco de lock e latência; não foi aferida carga hosted nem causa de gateway.
- FKs imediatas OS→programação/production_order_link/entrega/aplicação e parent locks sustentam ausência de filhos no caminho revisado. O pacote anterior contém prova de duas sessões dessas FKs; este pacote acrescenta corrida CQ/revogação. Escritores privilegiados, schema integral e filhos sem FK imediata exigem revisão: não afirmar cobertura global.
- Aprovação EXIGE referência ativa completa válida do item canônico: produto_id exato para produto (sem inferir/forçar micro); item somente micro exige referência sem produto e micro exato. Ambiguidade fecha. Sem referência só é possível registro sintético reprovado, nunca conformidade/aprovação. Teste positivo usa referência criada SOMENTE em PG descartável, não é evidência de referência válida da fixture real. O hook candidato agora resolve produto sem micro, sem fallback e com ambiguidade fechada; o runtime permanece intocado. A referência fictícia hosted ainda não existe neste trabalho e o schema exige micro NOT NULL: não inventar associação para homologar.
- `cq-integrity.sql.review` é snapshot LIVE contido para testes locais, não é montado no candidato/rollback. PRE/POST/rollback exigem os mesmos hashes e ACLs contidos: baseline antiga falha fechado. Nenhum purge solicitado; não restaurar escape por papel/claim/GUC.
- Direct DML administrativo amplo em OS/programação e MAINTAIN de CQ/referências preexistem; não foram revogados globalmente sem inventário. Guards contêm o recorte manual revisado, não certificam todas as rotas administrativas.
- Formulário candidato limita origem manual. Outros consumidores deste formulário (Cockpit) não são reativados; preservar seus gates. Qualquer efeito legado fora desse recorte deve ser revisado antes de expansão.
- Resultado laboratório sintético não prova fabricação física nem autoriza uso agrícola. CQ não habilita envase/reserva/entrega/termos/contratos.
## Delta da revisão independente 18fc97 — 20/10 13:04

Recibo do proprietário: **34 hashes PASS** na revisão anterior; não é certificação deste delta. Manifesto foi regenerado após as correções e exige nova comparação independente.

- `frontend-candidate/src/hooks/useCQReferencia.ts` substitui apenas o leitor existente quando aprovado. Produto tem precedência exclusiva, ativo=true, micro-only exige produto NULL e micro exato; limite 2 detecta ambiguidade. QueryKey inclui escopo do monitor/ator/tenant/papéis/época/item; dados ocultos em incerteza, cancelamento em mudança/unmount/timeout 12s e fence de lease na resposta. Cache descartável, sem retry de transporte. Não abre RPC nem infere vínculo. As validações completas da referência/conformidade continuam obrigatórias no core.
- `rollback/src/hooks/useCQReferencia.ts.review` é cópia byte-exata do runtime anterior. `prepare-validation.py` inclui `.ts` e aponta os imports para candidata somente em `/tmp`. Testes usam hook, scope e QueryClient reais; Auth/SDK boundary fake (não JWT/RLS hosted). Incluem produto sem micro, precedência, ausência sem fallback, micro-only, duplicata/inativo/item errado/erro, revogação, tenant/papel/item, epoch, lease ao completar, timeout e diálogo/tabela reais.
- `CQComparativoTable` não escreve dados; o diálogo candidato passa `canEdit=false`, mesmo quando o papel pode registrar CQ. Assim não oferece atalho de mutação. `ParametrosCQPage` permanece `TENANT_CAN_EDIT_GLOBAL_CATALOG=false` com fence que lança antes de upsert/delete. Não confundir papel CQ com capacidade de alterar catálogo global; ACL/RLS hosted não foram modificadas ou certificadas nesta rodada.
- Reprodução PostgreSQL descartável com gatilhos locais existentes: parent antigo permitiu `ordem_servico_id=NULL` antes de CQ e, na mesma transação, INSERT CQ fora do ticket manual. A transação foi revertida; não executada hosted. Switch OnFarm também passou no clone parcial, sem afirmar compatibilidade com todas as FKs hosted. OS `em_cq` permitiu `volume_total_ml=101` mantendo status. Corpos antigos estão apenas em fixtures históricas, nunca montagem/rollback.
- Guard corrigido congela id/vínculos/tenant/item da programação clássica com lote de organização não-NULL, desde antes de CQ; não existe ticket/GUC de exceção para troca de vínculo. OS com lote manual em_cq bloqueia mudanças semânticas mesmo com status igual (updated_at isolado não muda identidade). Transição programada→em_cq continua com ticket e demais campos iguais. Testes negam NULL/OnFarm/tenant/item e comprovam operações CQ legítimas; rollback conserva ambos os fences. Histórico null-tenant não é reparado.
- `fictional-reference.proposal.json`: valores completos **inventados exclusivamente para teste**, não especificação agronômica: pH 6–8, concentração mínima 100000000, aparência Normal, odor Caracteristico, contaminação Ausente. Produto exato e identificação sem valor comercial. **Não insertável:** micro NULL expressa ausência de associação, incompatível com NOT NULL/FK capturado. Nenhum writer canônico auditado liberado existe; abrir editor/grants ou escolher micro real seria bypass. O caminho preparado é proposta → revisão do contrato existente produto-only → autorização específica → preflight canônico → eventual cadastro exclusivo, sem modificar referências reais. Este contrato e sua implantação permanecem bloqueados para fase própria; não há DDL/DML ou novo fluxo no pacote.

**Resultado:** candidata local, gate false, sem deploy/migration/publicação/sessões. Hook testado em integração local, não ativado nem homologado em navegador real A/B. Envase/reserva/entrega/contratos continuam fechados.

## Delta 13:11 — comparação e recibo de contenção

- Recibo independente hosted: zerar vínculo OS da programação permitiu alterar lote para 101; transação revertida sem persistência. Não é prova executada pelo agente. Bloqueio 13:11 foi resolvido pelo recibo 13:13 e leitura canônica descrita abaixo.
- Tabela candidata exige referência ativa, ambos os limites pH finitos/ordenados no intervalo 0–14, concentração mínima finita não negativa e três textos não vazios. Referência incompleta/inválida é indicada explicitamente. Medidos ausentes, inválidos/não finitos, pH fora 0–14, concentração fora 0–1e30 e textos fora 1–200 impedem indicação APROVADO.
- Igualdade textual usa comparação sensível a maiúsculas/minúsculas após remover somente espaços das extremidades, igual a `btrim` do core. Divergências contam como falha, não warning. Limites numéricos inclusivos. Nenhuma mutação ou autorização adicionada; `canEdit=false` permanece no diálogo candidato.
- Rollback da tabela é cópia byte-exata do runtime, que continua intocado. Configuração temporária de testes/tipos aponta diálogo/hook/tabela aos candidatos, sem copiar para src.
- **62 Vitest PASS**: 35 avaliação/tabela + 10 formulário + 17 hook/integração; **tsgo candidato PASS**. Montagem bloqueada comprovada. 90 checks SQL são resultado anterior, não reexecutados nesta rodada nem certificação da nova contenção hosted. Build runtime depende do harness; não homologado browser A/B nem publicado.

## Delta 13:13 — contenção aplicada, preservada na montagem

- SELECT canônico confirmou `guard_manual_program_binding_v1()` hash `7c168ffa9393207fb3388c9546c19d05`, postgres, ACL `{postgres=X/postgres}`, search_path vazio, SECURITY DEFINER e trigger BEFORE UPDATE habilitado. Agregado programação `3cd248f967d379787235709a45a8f4e8` confirmado. Recibo de testes hosted é do proprietário, não homologação executada pelo agente.
- PRE/POST/rollback verificam a dependência LIVE exata; agregado POST/rollback exclui somente `aa_manual_cq_parent_v1`, preservando `aa_manual_program_binding_v1`. Montagem não cria/altera/remove função ou trigger LIVE nem muda sua ACL. Snapshot separado é exclusivo do laboratório.
- No laboratório, histórico vulnerável é reproduzido antes da instalação da contenção LIVE; depois, com guard pai histórico, seis mutações authenticated/GUC forjada recebem 42501 MANUAL_PROGRAM_BINDING_IMMUTABLE. Update inócuo passa e lote direto falha; volume100/vínculo preservados. Guard CQ candidato e LIVE coexistem: o guard CQ executa antes por ordem alfabética quando ambos estão presentes. Rollback conserva os dois fences e verifica hash/ACL/trigger LIVE.
- **102 checks PostgreSQL descartável + 67 Vitest + tsgo candidato PASS**. Nenhuma escrita hosted, DDL, deploy, publicação ou mudança de sessão. Runtime permanece intocado e gate false. Pacote regenerado disponível para nova revisão independente; PRE/POST integrais hosted e homologação CQ A/B ainda pendentes, assim como referência fictícia produto-only (micro NOT NULL/FK e writer contido). Envase e demais etapas permanecem fechados.
