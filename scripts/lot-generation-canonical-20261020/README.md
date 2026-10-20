# Gerar Lote — recuperação canônica mínima (revisão somente)

Baseline publicada: `793bc012ddb026a5075d11b698efe7a2c5adb9e8`.
Ref obrigatório: `swzpzcwiasxmjutrmvkm`. Nenhuma escrita hospedada, deploy, publicação ou alteração de sessão realizada.
O runtime permanece byte-idêntico à baseline nos quatro arquivos candidatos; código proposto fica em `frontend-candidate/**/*.review`.

## Fonte capturada
Consulta somente leitura em 20/10/2026, ~01:18 UTC. Corpo existente MD5 `d37a0e478e01277ba61f70397b1d44f9`; ACL `{postgres=X/postgres,service_role=X/postgres}`.
Baseline de tabela atualizada após `lotes_administrative_acl_containment`, aplicada pelo proprietário e confirmada por leitura: `{postgres=arwdDxtm/postgres,anon=arwd/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}`. PRE/POST/rollback exigem essa ACL exata; nenhum artefato restaura TRUNCATE/REFERENCES/TRIGGER/MAINTAIN aos clientes.
A função antiga não valida tenant/ator vivo/replay e NÃO pode ser liberada diretamente.
OS fictícia B informada pelo proprietário: programada, demanda 100 mL (0,1 L), programação aguardando, responsável nulo e zero lotes. Nenhum ID de fixture é usado como autorização na candidata.

## Correção proposta
- Mesma RPC/assinatura, DEFINER com `search_path=''`, sem helper público novo ou grants de tabelas auxiliares.
- Ator canônico h15 + readiness/perfil/empresa ativos + SaaS (`ordens_producao`, `lotes_qualidade`) + papel Administrador/Gestor/Produção; valida antes, depois dos locks e depois do INSERT.
- Só OS manual programada com um filho canônico aguardando, responsável nulo, OS=cliente=programação no tenant atual e exatamente um item fabricável. Bloqueia onfarm/B2B/links/entrega/aplicação e casos ambíguos ou avançados.
- Locks ordenados da OS, ator/empresa/cadastros/programação e lotes, advisory da programação; `lock_timeout=3s`, somente READ COMMITTED. Convites/onfarm/catálogo SaaS seguem as cercas já revisadas de programação.
- Volume produzido finito positivo em mL; demanda programada deve coincidir com a OS. O formulário converte L→mL (0,1 L = 100 mL); diferenças de volume produzido são explícitas, não inventadas.
- Servidor deriva código, tenant, item e data. Payload fechado a volume/tanque/responsável textual/observações. Auditoria atômica.
- Replay só devolve o mesmo lote quando tenant/ator/IDs/item/dados/evento/estado coincidem, sem CQ/envase/estoque. Divergência não grava nem repara dados.
- INSERT registra lote `em_producao` sem avançar OS/programação, sem CQ/envase/estoque/entrega/termo ou resultado fictício.
- Candidata concede apenas EXECUTE da RPC a authenticated, após PRE integral; service_role/PUBLIC/anon não recebem esse caminho. Não se confunde executor postgres local com autorização de usuário.
- Guard privado `aa_manual_lot_write_fence_v1`: INSERT manual exige ticket privado por transação+UUID emitido e removido somente pela candidata; UPDATE manual é negado, inclusive troca para programação não manual ou NULL. Nenhum bypass por GUC/JWT/service_role; sem EXECUTE público do helper, sem novas tabelas ou revogação global de DML. Leituras/policies existentes permanecem.

## UI e liberação parcial
Reutiliza GerarLoteDialog/useEsteiraLaboratorio/OSDetalhesDialog e leitor `rpc_cockpit_listar_esteira_v1`; sem reader ou portal paralelo, tabelas diretas não são abertas. Apenas a consulta canônica alimenta o alvo.
`MANUAL_LOT_GENERATION_REVIEWED=false` nos bytes entregues. CockpitConsulta e demais gates permanecem fechados.
Cercas existentes de identidade/tenant/papel/época/readiness descartam draft e respostas antigas; AbortSignal e corrida de prazo liberam trava após 12s mesmo com transporte pendurado. Cancelamento no navegador não prova rollback servidor: consultar a OS antes de nova tentativa, nunca retry automático de escrita.

Reativação parcial exige: revisão independente de SQL/dependências/concurrency → PRE integral no ref correto → aplicação manual → POST integral e smoke autenticado → autorização explícita do auditor para mudar somente este gate e publicar os bytes comparados. Manter fabricação posterior/CQ/envase/estoque/termos/contratos OFF. Não liberar diretamente o corpo antigo.

## Pacote e rollback
- `catalog.json`: fonte congelada de funções/ACLs, tabelas/constraints, triggers/índices/policies, schemas transitivos e views.
- `preflight-readonly.sql`, `postflight-readonly.sql`: guardas estritas de ref/hash/owner/ACL/schema/RLS; não escrever dados.
- `candidate.sql.review`: PRE → guard privado/trigger → corpo mínimo → ACL da RPC → POST em uma transação. Fora de migrations/autodeploy.
- `rollback.sql.review`: POST exato → definição autocontida baseline → ACL postgres/service_role exata → verificação da baseline com guard retido. Fecha authenticated, preserva lotes/eventos/histórico, ACL contida e trigger de escrita; não depende de TEMP ou conexão anterior. O corpo antigo restaurado não consegue gerar lote manual nem via service_role sem o ticket; rollback é operacionalmente fechado, não uma reabertura do legado inseguro.
- `rollback-postflight-readonly.sql`: valida corpo/ACL baseline e guard retido, portanto difere intencionalmente do PRE inicial.
- `rollback/src/**.review`: bytes exatos de 793bc012; novos testes são listados separadamente no manifesto.
- `SHA256SUMS` e `frontend-candidate/SHA256SUMS.review`: listagens sem auto-hash ou caches.

## Evidências e limites
97 verificações PostgreSQL local descartável com corpos STABLE/triggers/views reais capturados: A/B, papéis, inativo/revogado, item/tenant/IDs, replay idêntico/divergente, concorrência, revogação durante locks, falha de auditoria, escrita direta sob policies staff, ACL/rollback e timeout de refresh/locks. Os testes autenticados usam SET ROLE com Auth/JWT sintéticos; NÃO são homologação hospedada/browser/RLS integral. As expressões das sete policies de lotes são instaladas; helpers onfarm não exercitados são false no laboratório: NÃO certificam o caminho onfarm.
147 testes Vitest (11 arquivos), incluindo componente+hook de escopo real com Auth/transporte sintéticos; candidata OFF; app/node tsgo EXIT 0. Testes de ativação são condicionais ao gate; não foi habilitado runtime. Build automático do runtime OK; não foi executado build separado da candidata, apenas tipos/testes.
Cada predicado PRE/POST foi compilado/evaluado no clone parcial; guardas integrais recusaram o clone sem alterar definição/ACL. Não declarar PRE/POST hosted PASS: falta execução independente em produção.

## Riscos ainda abertos
1. O bypass INSERT/UPDATE manual é contido na candidata, não em produção ainda. DELETE, programação alterada posteriormente, caminhos não manuais e DML nas tabelas CQ/envase/estoque não são certificados. O guard bloqueia também UPDATE manual pelos escritores legados: efeito deliberado para manter etapas posteriores fechadas, não alegação de compatibilidade operacional de CQ/envase. Ver `WRITE-CONCURRENCY-REVIEW.md` para inventário/limites e NO-GO até aceite independente desse impacto.
2. Trigger INSERT refresca materialized view global: contenção e custo entre tenants permanecem. Teste de lock bloqueado prova rollback, não throughput em produção. SHARE de tabelas globais também limita concorrência.
3. Prazo UI é 12s; `statement_timeout=15s` nos artefatos protege sua aplicação SQL, NÃO estabelece um deadline de execução hospedada da RPC. O limite real do chamador/PostgREST deve ser confirmado pelo auditor; não ampliar monitor/lease/RLS por latência.
4. Zero entregas/termos: PDF continua sem homologação real; não avançar etapas nem criar assinaturas artificiais para contornar o bloqueio.
5. Homologação browser A/B, operador, anexos, lifecycle e estabilidade de gateway não realizadas nesta rodada. Monitor/anexos/binding/contratos intactos.
6. FOR UPDATE da OS impede a inserção concorrente dos quatro filhos com FK imediata enquanto a RPC detém o lock; não proíbe que o escritor commit depois da RPC. Isso foi observado em duas sessões, nas duas ordens. Após inclusão posterior de filho, replay falha fechado. Não se trata de garantia permanente de ausência de filhos nem de validação dos demais escritores.
