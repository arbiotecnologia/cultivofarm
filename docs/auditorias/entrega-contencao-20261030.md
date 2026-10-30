# Contenção de entrega antes da primeira mutação — 30/10/2026

## Decisão e escopo

Base solicitada: `1d8646cb6c695b20fead51c2e2382ff946cfb2be`.
**PASS para os contratos de contenção testados; não é homologação do fluxo operacional completo.**
Correções e implantação após testes já foram autorizadas pelo proprietário. Nesta chamada, por sua determinação, não houve publicação, DDL hosted, chamada a writer hosted, alteração de dados reais, cobrança, NF ou mensagem. Não há nova barreira administrativa: os bloqueios abaixo são técnicos. Automações permanecem bloqueadas e fiscal pendente.

A correção publicável falha antes da primeira mutação, não tenta tornar várias transações atômicas por lock de navegador. Não altera ACL/RLS/roles, não chama fallback, não cria RPC/capability stub ou chave de liberação via ambiente/localStorage. A carteira preserva integralmente o código de deduplicação/mensagens de `4acf7dfe`.

## Introspecção contemporânea, somente leitura

Antes do acesso, `supabase/config.toml` foi lido e confirmou `project_id = "swzpzcwiasxmjutrmvkm"`, o binding externo informado nesta conversa. Somente `supabase.read_query` com SELECT sobre pg_proc/pg_namespace/pg_class/pg_policy/pg_trigger; nenhum corpo escritor foi invocado. Capturas brutas, metadados, ACL e hashes estão em `entrega-contencao-20261030/catalog-*.txt`. Horários de captura: 01:20:37–01:26:37 UTC. São evidência de catálogo privilegiado, **não prova de sessão JWT/RLS**.

| Objeto real | MD5 de pg_get_functiondef | Constatação |
|---|---|---|
| `rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)` | `a4d47ccf5d116141ed46e9de9ea7eeaa` | Cria um item, não reserva/cria/expede grupo numa transação; authenticated sem EXECUTE |
| `rpc_entrega_cancelar_v1(uuid,text)` | `f830c6c718e2b44a1ded06a19a04557a` | Corpo de cancelamento individual existe; authenticated sem EXECUTE; autorização anterior a advisory/linha; filhos sem ACK positivo obrigatório; não equivale a contrato liberado/comprovado |
| `rpc_entrega_confirmar_v1(uuid,jsonb,jsonb)` | `cd39f9fe93514420976263d13856c17c` | Delega ao engine; authenticated sem EXECUTE |
| `fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)` | `6eb78ceebe90196ac5b95bfc127dd63b` | UPDATE estoque/ledger legados, contexto GUC; avanço enviar_entrega pode retornar success:false sem aborto obrigatório; consulta/validação integrada não comprovadas |
| `reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)` | `9d62ba2fa4fad1b6e5d5ac67045d2e98` | UUID split legítimo, proteção individual; authenticated sem EXECUTE; não fornece receipt de grupo |
| `rpc_cockpit_cancelar_reserva_v1(uuid,uuid,text,text)` | `b30eb1df9094e4dace1d071b11b6af41` | Contrato legado com contexto GUC; authenticated sem EXECUTE |
| `rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)` | `c71a9e848eff0a522cbaa3a7ec2949a5` | Motor individual com contexto privado/guards e idempotência; não acopla grupo de entregas |
| `rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)` | `ce2e7cd4080ff2f8fc15cce9294046d9` | Reserva em lote independente preservada; não confundir com grupo entrega |

Catálogo capturado não apresenta endpoint de grupo de entrega com request fingerprint/receipt/CAS e resposta durable que reúna reserva+split+criação+expedição. O cancelamento individual existente não é tratado como ausente: é **existente, fechado e não comprovado**, com os problemas acima. Não conceder EXECUTE para forçar prova.

Também foram confirmados os caminhos irmãos:
- `rpc_reservar_embalagem_entrega`: altera embalagem, ledger, separação e auditoria; valida estados antes de UPDATE sem CAS observado/receipt.
- `rpc_confirmar_separacao_embalagem` e `rpc_confirmar_entrega_embalagens`: writes físicos independentes da entrega; não são consulta.
- `rpc_ler_embalagem_por_qr`: INSERT de `leitura_qr` no ledger; a conferência na entrega foi contida, não rotulada read-only.
- `rpc_confirmar_recebimento_entrega`: escreve comprovante/entrega/auditoria; não prova estoque, nem dispõe de receipt/CAS observado no corpo capturado.
- `fn_mark_entrega_not_billable`: financeiro escritor; permaneceu com ACL instalada, mas consumidor agora bloqueia antes da RPC.

RLS tenant de entregas, guard de cancelamento, triggers de confirmação/estoque/planning/B2B/financeiro e ledger append-only foram capturados e preservados. Contexto GUC de legado não autoriza contexto privado de estoque.

## Diff funcional mínimo

| Arquivo | Contenção efetiva |
|---|---|
| `src/lib/entregas/operationalContainment.ts` | Negação incondicional; mensagens operacionais concretas; sem parâmetro de autorização ou flag de desbloqueio |
| `src/pages/Entregas.tsx` | Gate antes de executar callback de criar/enviar/cancelar, inclusive antes da reserva/auditoria e UPDATE; mensagem visível e consulta existente preservada |
| `src/hooks/useEsteiraLaboratorio.ts` | Reserva individual, criação, confirmação e cancelamento de reserva fechados antes de dispatch para todos os consumidores, inclusive Estoque; reserva em lote independente intocada |
| `src/lib/estoque/motorEstoque.ts` | Expedição/entrega/estorno e qualquer operação com referência entrega fechados antes da RPC; ajuste independente preservado |
| `src/components/entregas/ConfirmarEntregaDialog.tsx` | Confirmação contida antes do primeiro upload, insert de documento ou RPC; rascunho permanece |
| `src/components/entregas/EntregaComprovantePanel.tsx` | Confirmar recebimento e dispensar assinatura contidos; consulta/documentos/evidências independentes não substituídos |
| `src/components/estoque/EmbalagensEntregaPanel.tsx` | Separação e confirmação física fechadas; SELECT existente mantido |
| `src/components/estoque/ReservarEmbalagemEntregaDialog.tsx` | Reserva com destino selecionado fechada antes de writer |
| `src/components/estoque/ConferenciaEmbalagemQR.tsx` | QR no contexto entrega fechado antes de movimentação; QR independente sem entrega não ampliado/modificado |
| `src/pages/financeiro/EntregasNaoFaturadas.tsx` | Marcar sem cobrança fechado; consulta no wrapper canônico scoped, limpar seleção por escopo, erro/inativo/carregando separados de ausência; botão financeiro abre reconciliação existente |

Sem alteração em `public`, dependências, Vite, migrations, Edge functions, regras comerciais, cadastro ou cadeia de crédito pendente. Hook/dialog de reconciliação financeira existentes não foram modificados. As funções legadas permanecem no código atrás da contenção para diff mínimo, mas **não podem ser reabertas removendo o gate sem revisão de contrato**.

## Regressões executadas

Comando exato, arquivos e timeout180s: `entrega-contencao-20261030/execution-final.json`.
Vitest do projeto com `runtimeGate.vitest.config.ts`, fetch/XHR reais proibidos, maxWorkers2 e timeout10s por teste/hook. Componentes/hooks/página reais e QueryClient real, Auth/SDK/Storage totalmente simulados. Nenhuma aprovação ou ação fiscal/cobrança real exigida.

| Grupo | Arquivos | PASS | FAIL |
|---|---:|---:|---:|
| Entrega/estoque | 21 | 306 | 0 |
| Financeiro | 2 | 21 | 0 |
| Carteira/comercial | 5 | 44 | 0 |
| Demais runtime do gate anterior | 14 | 222 | 0 |
| **Total único nesta execução** | **42** | **593** | **0** |

Execução final 01:28:06 UTC, 73,82s Vitest, zero skip. `full-gate-final.json`, `groups-final.json` e logs são evidência. Zero RPC/UPDATE/motor/auditoria nos caminhos contidos; negativos papel/tenant/inativo, grupo1/2itens, dupla ação/remount, upload pendente, cancelamento separado/em_rota, override/deferEffects e motor disfarçado como ajuste com referência entrega. Positivos preservam consulta, filtro e reserva batch/ajuste independentes, sem alegar aprovação hosted.

Primeira rodada ampla: 314PASS/19FAIL; 5 expectativas antigas pressupunham writers agora fechados, 14 falhas de transporte PDF porque o gate sobrescrevia fetchMock registrado só ao importar. Atualizadas apenas expectativas dos contratos fechados e reaplicado fetch totalmente simulado em beforeEach, sem mudar Edge. Logs preservados. Segunda: 343PASS/1FAIL reproduziu defeito de apresentação em consulta inativa (zero falso); corrigido por `ready`/unavailable e limpeza scoped. Terceira: 344PASS; gate final expandido593PASS. Não somar reexecuções.

Build automático final observado **build OK 01:29:21 UTC**. Typecheck manual separado não executado: a política do harness proíbe builds/typechecks manuais do projeto; CLI `tsgo` local indisponível. Não inventar resultado de typecheck. Testes de integração aqui significam código real com transporte simulado, não JWT/RLS/Storage hosted nem ensaio SQL completo.

## Proposta atômica separada e limites concretos

`entrega-atomicidade-pendencias-20261030.md` registra a implementação revisável necessária e seus blockers. **Nenhum candidato SQL novo nem PG nesta rodada**: não há fix servidor independente demonstrado para grupo inteiro a partir dos corpos examinados sem compor as dependências/guards/tickets e resolver contrato durable/CAS. Wrapping das RPCs legadas fechado não resolveria autorização, GUC privado, ACK negativo, retorno e financeiro; não gerar stub ou sanitizar corpos para falso PASS.

O risco multichamada é eliminado **nesses consumidores na versão de contenção** por zero primeiro dispatch, não por garantia de rollback. Limites externos: frontend não revoga ACL hosted nem protege clientes antigos/API terceiros; corpo de cancelamento e writers financeiros legados continuam instalados com suas ACL reais. Não alegar fechamento server-side universal. Fluxo entrega completo continua indisponível até contrato seguro; consulta/reconciliação pode ser revisada/publicada como contenção, sem esperar emitir cobrança/NF para provar bloqueio. Publicação não foi executada e este resultado não homologa os outros arquivos históricos desde o SHA LIVE desconhecido.