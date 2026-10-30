# Envase manual isolado — pacote revisável final

Base desta continuação: `d8b50cd6a684b1ba0c758d6b7ffdd9b2c25ed2f6`. Sem acesso hosted, sessão/segredo produtivo, implantação, publicação ou GRANT em produção. Aplicações anteriores são relatos do auditor. A entrega cancelada de referência não foi acessada ou reutilizada.

## Escopo e resultado
**119 PASS / 0 FAIL no PostgreSQL 17 descartável (SQL inalterado nesta revisão), 484 PASS / 29 arquivos Vitest e 3 PASS de ordenação.** Build automático observado OK; **typecheck separado não verificável nos logs disponíveis**, logo não certificamos esse item nem GO de implantação. O release mínimo está pronto para revisão independente, não aplicado. Não identificada falha funcional conhecida nos cenários executados; não é certificação JWT/RLS/Storage real.

Somente envase manual canônico novo. B2B/OnFarm, confirmação física, embalagens pós-envase, etiquetas/vínculos, dispensa, financeiro/fiscal/cobranças e automações continuam fora da liberação. Group/cancel e estoque independente existentes foram exercitados e preservados.

## Correções e contrato
- Guarda do singleton imediatamente após lock; chave obrigatória e fingerprint integral com operador/motivo/ator/tenant. Recibos legados sem fingerprint retornam PT409 `ENVASE_LEGACY_RECEIPT_REVIEW_REQUIRED`, sem regravar ou duplicar história; não inferimos os dois recibos reais relatados.
- Contexto/demanda depois dos locks OS→programação→lote; reautorização e status/CQ frescos antes de cada mutação e replay. Somente READ COMMITTED; REPEATABLE READ e SERIALIZABLE negados com 0A000.
- Permit por linha/txid/ator/root: organização explícita no INSERT, admissão BEFORE e igualdade da imagem final AFTER, consumo único. Excluídos apenas created_at/updated_at. GUC do logger não autoriza INSERT.
- Split do motor preservado pelo contexto privado existente, sem reinstalar motor/batch/group ou seus grants. Reservas de fabricação exigem raiz correspondente; estoque independente sem programação permanece no contrato canônico existente.
- Gates aditivos nas tabelas de autoridade/root/estoque usam singleton FOR UPDATE NOWAIT. NÃO concedem autoridade. Mantidos gates existentes de perfil/papel/convite.
- **Corrida real inicialmente revelou 40P01**. Corrigida: DML com prelock agora recebe **55P03**, desfaz a transação e libera o envase sem deadlock. Disponibilidade sob concorrência significa recusa segura, não sucesso garantido. Nenhum retry automático. Locks de relação/DDL ainda podem produzir conflitos legítimos; owners que desativam triggers/replica não são contidos por triggers.
- Registro no Cockpit depende de capability exata vinculada ao escopo; hook repete preflight imediatamente antes de dispatch. Mounted tests cobrem ausência/negação/erro, sessão/tenant/roles/epoch/unmount e envio único. Botão de complemento da página permanece fechado: complemento após OS pronta não está aberto pelo writer; não foi implicitamente liberado.
- Revisão23:18: quatro leituras adotadas juntas somente no target/actor/org/epoch/open atual, geração protege A→B→A, dados anteriores ocultados imediatamente. Erro ou leitura incompleta bloqueia submit. ACK tardio não fecha outro diálogo nem anuncia sucesso; partial com saldo zero não afirma OS pronta, completed com avanço explícito não promete complemento bloqueado. 14 testes montados novos; recuperação incerta e capability continuam no hook canônico, sem novo writer.

## Instalação, release e rollback
1. `preflight.sql.review` / `install.sql.review` / `postflight.sql.review`: endurecimento mantendo writer fechado.
2. `legacy-closure-{preflight,install,postflight}.sql.review`: somente REVOKE cliente de receipt/desvincular/vincular embalagem; depende do POST exato do passo 1, preserva corpos/service grants.
3. `release-preflight.sql.review` / `release.sql.review` / `release-postflight.sql.review`: PRE exige install + closure exatos; **único GRANT de writer é EXECUTE authenticated na assinatura canônica de envase**. Capability de consulta instalada no passo 1 não concede autoridade.
4. `rollback.sql.review`: aceita catálogos exatos instalado/fechado/liberado, revoga writer e fecha capability; mantém guards, receipts, history, proof/group/cancel. Closure rollback nunca regranta.

Os estados completos pinam corpos/ACL/owners/config, relações/RLS/policies/colunas/constraints/triggers; incluem estrutura privada dos permits e singleton. Ordem por colunas explícitas COLLATE C. O PRE antigo cc690cf aprovado read-only **não vale para estes pins ampliados**: auditor precisa repetir PRE atual no ref canônico `swzpzcwiasxmjutrmvkm`. Sem validação do ref, não operar. Nada usa Lovable Cloud.

## Evidências executadas
- Restauração integral das capturas/migrations reais e oito instaladores relatados: zero objetos pendentes. Ordem/hashes das fontes em `sources.json`.
- Adulterações de organização/lote/id/quantidade/operador/etiqueta/volume, ator/txid/ação/root: 42501 estrito, snapshots preservados. Mutação pós-permit também aborta; sem aceitar FK/enum/unique como prova.
- Revogação perfil/papel/tenant/SaaS durante locks, CQ/status terminal, demanda concorrente, partial/override e motivo divergente, replay, falha item N/ledger/timeout e integridade de recibos. Seams replica são somente bootstrap/mudanças simuladas upstream, **não prova de cooperação**.
- Cooperação sem replica: statement gates (inclusive zero linhas) e **RPCs reais de aprovação/programação/lote/CQ em contenção**, recusados 55P03 com snapshot igual. Positivos e replay dos mesmos corpos/restauração preservados.
- Cadeia completa aprovação→programação→lote/evento→CQ aprovado→envase/estoque/pronto_entrega realizada por RPCs com triggers ligados e authenticated sintético. Referência CQ local fictícia, nenhuma especificação produtiva inventada. CQ reprovado também registrado/repetido e envase negado pelo erro canônico.
- Reserva split por motor/batch, alvo ledger distinto do pai, conservação de quantidade/volume e replay sem mutations. Grupo e cancelamento observado/replay preservados em entrega criada localmente; gerar formulário/assinar/anexar mantidos.
- Quatorze tabelas financeiras/fiscais/outbox com sentinelas existentes: conteúdo integral antes/depois igual, não apenas contagens. Replay pós-validade usa seam de relógio explicitamente registrada; não é passagem real do tempo nem hosted proof.
- 484 testes de entrega/envase nesta revisão; não alegamos suíte global verde. Falhas históricas fora do recorte não foram mascaradas. Avisos React Router/Dialog não são FAIL; nesting inválido do diálogo de envase foi corrigido.

## Logs e limites
`pg-run.log.txt`, `test-results.json` (inclui stderr/raw de negativos/corridas), `vitest.log.txt`, `order.log.txt`, `build.log.txt`, `typecheck.log.txt`, `frontend.diff.txt`, `sources.json`, `SHA256SUMS`.

Comandos locais: `python3 scripts/stock-envase-recovery-20261027/isolated/test_pg.py`; `python3 scripts/stock-envase-recovery-20261027/isolated/test_order.py`; `bun run test -- src/test/entregas src/test/envase`. Builds/typechecks manuais são proibidos pelo ambiente; build foi validado pelo harness automático. Typecheck não possui evidência separada: pendência de validação, não uma alegação de PASS.

**Pendências externas:** revisão dos artefatos exatos, PRE/POST LIVE e sessão JWT/RLS/Storage/browser pelo auditor, evidência separada de typecheck. Nenhuma implantação autorizada nesta execução. Nenhuma decisão comercial humana nova foi necessária para corrigir os defeitos locais.
