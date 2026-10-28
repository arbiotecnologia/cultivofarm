# Fase A2 — auditoria financeira da entrega

**INATIVO / NO-GO para implantação sem revisão independente.** 28/10/2026, UTC. Apenas SELECT de catálogo no Supabase externo canônico `swzpzcwiasxmjutrmvkm`; nenhuma chamada financeira real, dados, roles, sessões, SQL mutante, migration, GRANT, publicação ou liberação operacional. Contabilidade real/fiscal e SU-518022 permanecem fora deste recorte.

## 1. Evidência LIVE e origem

Configuração `supabase/config.toml` e binding externo informado apontam ao ref canônico; read_query usado exclusivamente para catálogo. `current_database()=postgres` e um literal de ref NÃO comprovam destino; `app.settings.supabase_url` retornou NULL. A atestação do ref é a configuração/binding da ferramenta, não um SELECT inventado. Antes de implantação, auditor deve atestar novamente o destino por canal externo verificável; se não puder, abortar.

| Função | OID LIVE | MD5 pg_get_functiondef LIVE | MD5 proposta PostgreSQL local |
|---|---:|---|---|
| fn_generate_receivable_from_entrega(uuid,jsonb) | 41730 | 670ea34d37c4c4fd6612031ad763a3a7 | 8b6413222ee01e784f61df7d2a9ebe84 |
| fn_mark_entrega_not_billable(uuid,text) | 41748 | e4008b029ce8d58f70f3fc88571d03be | 893c04fc4027ca6879addaa6d77f1c5f |

Ambos hashes conferem com evidência de 27/10; corpos SECURITY DEFINER/postgres, search_path=public, ACL postgres/service_role/authenticated EXECUTE. `rpc_entrega_confirmar_v1` permanece sem EXECUTE authenticated; zero funções candidatas stock_envase_scope_v1/delivery_recovery_scope_v1 instaladas. Nenhuma alteração de RLS. RLS habilitada não prova a segurança das policies nem restringe por si só um DEFINER postgres.

Capturas: `live-functions.json` (37 corpos/metadados); `live-table-catalog.txt` (colunas, ACL, políticas, índices, triggers); `live-tables-pins.json` (16 fingerprints). Triggers de perfis/papéis/parceiros usam `cf_user_guards_v1.acquire_gate` (b0dd9a14d5fd799a40df0975baf4c5a6); convites têm `a00_cf_invitation_gate` enabled O, NOWAIT, corpo a9046ea9d2c93152d292ba40be549e2a. Organizations não participa desse mesmo protocolo no conjunto consultado.

## 2. Achados confirmados, sem exploração produtiva

- **Crítico BOLA/IDOR LIVE:** papel financeiro global, entrega lock por ID sem organização, replay retorna recebível sem conferir titularidade; marcação idem. Não houve ataque A/B real pelo agente.
- Categoria LIVE apenas existente, sem RECEITA/active; método opcional/sem ativo; falta gate/reautorização após espera.
- Candidato anterior já restringia entrega, mas replay não comprovava org/origem/cliente do recebível e não comparava intenção; marcação repetida sobrescrevia motivo/auditoria.
- **Dependência instalada ignorada pelo teste anterior:** generator f632f15c9f46cb9889082fc533a27ea1 cria parcelas; hard-delete guard c/ helper exige contexto histórico. DELETE/reinsert do candidato anterior pode falhar ou depender de escape inseguro. A2 elimina esse DELETE; não cria GUC/ticket falso nem altera generator.
- Parcelas automáticas podem arredondar para zero/negativo; A2 verifica o snapshot gerado e aborta a transação.
- Autorização por helpers STABLE após esperas merece cuidado: A2 usa SELECT direto em função VOLATILE/READ COMMITTED, copiando requisitos ativos/primeiro acesso/convites; rejeita isolamento diferente.

## 3. Proposta e redução conservadora de autoridade

Somente dois corpos substituídos, assinatura/retorno/owner/ACL preservados; nenhum helper novo/GRANT/RLS/trigger. Search path proposto `pg_catalog, public, pg_temp` e referências de tabelas qualificadas; `lock_timeout=3s`; instalação `statement_timeout=15s`.

Ordem: **gate FOR UPDATE → autoridade fresca → advisory entrega_faturar:id → autoridade → entrega tenant-scoped FOR UPDATE → autoridade → checks/replay → locks compartilhados categoria/método/centro de custo → autoridade → valor canônico/guard → inserção/verificação → estado/auditoria**, tudo numa transação.

Ator: perfil ativo, org ativa, senha_provisoria=false, papel administrador/gestor/financeiro, sem convite processing/JWT anterior ao access_valid_after. Nega papel parceiro_b2b, parceiro_b2b_tecnico ou cliente_produtor cumulativo e qualquer partner_users; nega origens partner_order_id/onfarm. **Isso é contenção deliberadamente mais restrita, não equivalência de todas permissões anteriores**; gestor B2B não recebe finanças internas do fornecedor. Ampliar esses casos exige contrato canônico de autoridade e revisão separada, não vínculo/role de cliente.

Entrega e cliente devem pertencer à org do ator; recebível replay e pós-insert precisam mesma org, DELIVERY, origin_id, customer_id e status não cancelado. Link inconsistente/múltiplo/orphan rejeita, sem retornar ID nem reparar história. Categoria global ativa RECEITA, método global ativo obrigatório, centro de custo global ativo se informado, sem fallback. Cadastros bloqueados FOR SHARE para estabilidade durante a transação.

Replay de cobrança compara valor normalizado, categoria/método/agenda/datas/custo/exigência fiscal; rejeita divergência PT409; datas omitidas usam as já persistidas no replay. Agenda vazia/null representa automática; agenda explícita exige cardinalidade/unicidade e equivalência ao snapshot. Description/notes/motivo manual são metadados da primeira execução e **não são reaplicados no replay**; não anunciar novo texto aplicado. Normalização monetária ainda exige revisão do limiar canônico de 0,01 herdado (não alterado neste recorte).

Marcação: somente entregue/não faturada; mesma justificativa normalizada replay neutro, outra justificativa PT409, sem sobrescrever concorrente. Validações 23514; conflito PT409; autorização 42501; timeout genuíno 55P03 preservado, sem retry.

Custom schedule divergente do generator existente: **PT409 e rollback**, nunca DELETE/reinsert. Não oferecemos agenda arbitrária sem extensão revisada de inserção inicial. Títulos/parcelas automáticos são conferidos em org/count/sum/valor positivo/finito/data válida.

## 4. Arquivos e execução exclusivamente offline

- `assemble.py`, `proposed-functions.sql.review`, dois `.diff`: transformação fail-closed do candidato anterior, comparada às fontes LIVE.
- `build-guards.py`, `preflight.sql`, `postflight.sql`, fragmentos PRE/POST: hashes exatos por assinatura/OID/config/owner/ACL; fingerprints de colunas/ACL/RLS/policies/triggers+corpos/índices. Sem contagens fabricadas ou regex como prova de corpo.
- `candidate.sql.review`: BEGIN/timeout/PRE interno/dois corpos/POST interno/COMMIT. Abort automático em drift. Não colocado em migrations.
- `rollback-containment.sql.review`: condicionado ao POST, apenas corpos deny-only 42501, sem restaurar LIVE vulnerável, sem alteração ACL. Reinstalação exige pacote revisado e baseline de contenção atualizado; não há rollback de dados.
- `test-local.py`, `pg-local-driver.py`, `results.txt`, `proposed-pg-metadata.json`: testes e hashes locais.

Reproduzir: PostgreSQL17 + Python3 + psycopg2-binary; `python3 scripts/delivery-finance-a2-20261028/assemble.py`, depois `python3 .../test-local.py`, depois `python3 .../build-guards.py`. Driver recusa TCP e aceita só socket `/tmp/billing-*`/porta55538; PostgreSQL sem listener TCP. Testes criam/encerram banco temporário. SQL de fixture/GRANT existe **somente no harness descartável**, não na proposta ou produção.

**76/76 checks PostgreSQL17.9 locais passaram**: próprios, cruzados/replay, sessão/anon/inativo/external roles/link/primeiro acesso/convite, referências inválidas, categorias/métodos, NaN/Infinity/parcelas, atomicidade com erro injetado, disputa duas conexões/uma auditoria, revogação aguardando gate e ordem inversa, timeout55P03, replay inválido/duplicado/vazio, parcela zero e isolamento não suportado.

Auth via GUC de fixture e JWT sintético; schemas/bindings de trigger reduzidos; valor/guard stubs. Três corpos de trigger LIVE exatos carregados (generator, links financeiros, hard-delete), **não toda cadeia LIVE**; helper hard-delete local sempre false. Não certifica JWT/RLS, ledger, fiscal, preço B2B ou integração completa. PRE/POST com OIDs produtivos não são executados no fixture reduzido; hashes dos corpos obtidos do pg_get_functiondef local. Sem teste frontend novo: runtime intocado; inspeção independente dos consumidores, não fluxo browser certificado.

## 5. Frontend e integrações — pendências impeditivas

`ConfirmarEntregaFinanceiroDialog.tsx:121–179`: método vazio envia NULL; total de UI não é necessariamente canônico; depois do recebível chama fiscal em transação separada e invalida somente no sucesso inteiro. Fiscal pode falhar depois de faturamento confirmado, parecendo falha total. Não repetir automaticamente o fluxo; futura adequação precisa reler título persistido e retomar só etapa autorizada. Fiscal **não alterado** nesta fase.

`ConfirmarEntregaDialog.tsx:168–195`: uploads/documentos antes da confirmação podem permanecer em falha. `entrega-runtime-harness`: payload sem método e fixtures mutantes; NÃO executado. Retry local financeiro não encontrado, mas não se certificou toda política global nem sessão aberta.

Engine LIVE 6eb78ceebe90196ac5b95bfc127dd63b adquire advisory cockpit/entrega/estoque antes de chamar marcação; instalação isolada A2 pode inverter gate→row com esse chamador privilegiado. Wrapper cliente fechado **não prova** ausência de todos caminhos DEFINER/service. Composto delivery-stock-release é inativo, não utilizado como dependência instalada; permanece NO-GO.

Gate exclusivo serializa globalmente operações, custo a medir. Convites NOWAIT podem falhar55P03 durante faturamento; não prometer revogação venceu se operação segurou gate primeiro. Revogação org não tem protocolo comum demonstrado: releitura após cadastros diminui janela, mas não prova serialização de todos escritores; **condição impeditiva de homologação geral**. Cancelamento direto de entrega também deve integrar protocolo antes de alegar fechamento global. Nenhuma alteração especulativa nesses writers.

## 6. Revisão e prova real necessária

1. Auditor atesta ref externo canônico e reconfirma PRE integral/hash/OID/ACL/policies/dependências; não usar banco Cloud/ref alternativo.
2. Revisar redução de autoridade externa/legado, parcelas customizadas e compatibilidade da tela; decidir contenção imediata versus implantação corretiva completa **sem novos grants**.
3. Resolver dependência do engine/ordem de locks e protocolo de mudança organização/convite. Não liberar stock/envase/delivery neste pacote.
4. Somente após autorização específica, usar sessões JWT reais A/B já canônicas, nunca service_role como caller; próprios positivos/GET títulos e parcelas, B→A/A→B 403 e nenhuma escrita/ID, inactive/external/anon negativos; replay mesma intenção vs divergente, sessão velha/roles removidas.
5. Duas conexões bounded e pg_stat_activity: demonstrar espera real e dois ordenamentos de commit no gate; confirmar uma escrita/auditoria, replay neutro, timeout e nenhum efeito em erro; revogação somente pelo fluxo canônico. Não criar espera global longa em produção.
6. Evidência UI precisa mostrar método obrigatório/revisão/conflito sem retry e distinguir recebível confirmado/fiscal pendente. Fiscal, cobrança externa, contabilidade real e SU-518022 continuam pendentes.

**Parecer final:** exposição LIVE permanece sem correção aplicada. Proposta útil para revisão, não certificada para implantação ou integração operacional; as pendências acima não são mascaradas pelos76 testes simulados.
