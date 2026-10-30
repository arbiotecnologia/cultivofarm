# Writers de entregas — inventário de compatibilidade, 30/10/2026

## Escopo e evidência

Somente leitura de repositório e capturas existentes; nenhum hosted, SQL candidato novo, teste ou rerun nesta rodada. `capture/current.json` contém 1.284 funções; busca de DML literal `INSERT INTO|UPDATE|DELETE FROM [public.]entregas` identifica **13 funções**. Todas são public/postgres SECURITY DEFINER; nenhuma contém EXECUTE dinâmico. ACL capturada: PUBLIC/anon sem EXECUTE; postgres/service_role com EXECUTE em todas; authenticated somente onde A=sim abaixo. Callable significa privilégio EXECUTE, não sucesso de autorização nem teste JWT. Fonte capturada canônica anterior, não recaptura LIVE nesta rodada.

Referências abreviadas: hook=`src/hooks/useEsteiraLaboratorio.ts`; panel=`src/components/entregas/EntregaComprovantePanel.tsx`; demais componentes em `src/components/entregas/` ou `src/components/estoque/`; página financeira=`src/pages/financeiro/EntregasNaoFaturadas.tsx`; Edge harness=`supabase/functions/entrega-runtime-harness/index.ts`. Tipos gerados e testes não são callers de produto.

## 13 writers SQL capturados

| Signature public | A | MD5 capturado / fonte | Callers e estado observado no código |
|---|---|---|---|
| `public.rpc_entrega_cancelar_v1(p_entrega_id uuid, p_motivo text)` | não | `f830c6c718e2b44a1ded06a19a04557a`; `capture/current.json:58050` | Sem caller em src/Edge nem outra função capturada. Service 2args revogado + corpo deny no candidato. |
| `public.fn_entrega_confirmar_engine_v1(p_entrega_id uuid, p_os_id uuid, p_origem text, p_recebedor jsonb, p_opcoes jsonb)` | não | `6eb78ceebe90196ac5b95bfc127dd63b`; `capture/current.json:60696` | SQL: rpc_cockpit_confirmar_entrega_v1 e rpc_entrega_confirmar_v1 → hook:712 / ConfirmarEntregaDialog:209; ambos contidos (:705 / :157). |
| `public.fn_mark_entrega_not_billable(_entrega_id uuid, _reason text)` | sim | `e4008b029ce8d58f70f3fc88571d03be`; `capture/current.json:61110` | EntregasNaoFaturadas:82, contido por :78; também engine de confirmação. |
| `public.rpc_anexar_comprovante_entrega(p_entrega_id uuid, p_payload jsonb)` | sim | `bafa068d7882e81b0437f4b355c42a02`; `capture/current.json:62667` | EntregaComprovantePanel:520; ATIVO, upload :503 antes de RPC; candidato nega UPDATE. |
| `public.rpc_coletar_assinatura_digital_entrega(p_entrega_id uuid, p_payload jsonb)` | sim | `570bacbf1aac73e0925c4de02dc10a4d`; `capture/current.json:63648` | EntregaComprovantePanel:399; ATIVO, upload :385 antes de RPC; candidato nega UPDATE. |
| `public.rpc_cockpit_criar_entrega_v1(p_os_id uuid, p_origem text, p_estoque_produto_id uuid, p_quantidade numeric, p_dados jsonb)` | não | `a4d47ccf5d116141ed46e9de9ea7eeaa`; `capture/current.json:63684` | useEsteiraLaboratorio:661, contido :651. No candidato só filho do overload privado de grupo; chamada isolada sem permit nega mutação. |
| `public.rpc_confirmar_recebimento_entrega(p_entrega_id uuid, p_payload jsonb)` | sim | `f05682aacbaee0a74bd1dc484ba293e0`; `capture/current.json:63864` | EntregaComprovantePanel:313, contido :299. |
| `public.rpc_dispensar_assinatura_entrega(p_entrega_id uuid, p_motivo text)` | sim | `9c5dd351019cdc5ae311ce5aef289a5f`; `capture/current.json:64098` | EntregaComprovantePanel:336, contido :323; chama rpc_gerar_formulario_entrega. |
| `public.rpc_entrega_reconciliar_v1(p_entrega_id uuid, p_idempotency_key text)` | sim | `ace21d8352e5e96ec38fdb095d7609a2`; `capture/current.json:64179` | Somente Edge harness:265,292,301,316–317,332–333,377; desativado no canônico :444. É writer, NÃO a consulta financeira useDeliveryFinanceReconciliation. |
| `public.rpc_entrega_reentrega_saldo_v1(p_entrega_id uuid, p_idempotency_key text)` | sim | `5c5217acf9f9062c232bf39589ce426a`; `capture/current.json:64188` | Somente Edge harness:389–390; desativado no canônico. Candidato nega INSERT. |
| `public.fn_generate_receivable_from_entrega(_entrega_id uuid, _payload jsonb)` | sim | `670ea34d37c4c4fd6612031ad763a3a7`; `capture/current.json:65889` | Somente Edge harness:360,380; desativado no canônico. Cobrança fora do recorte; candidato nega UPDATE entregas sem permit. |
| `public.rpc_gerar_formulario_entrega(p_entrega_id uuid)` | sim | `62ce0a8a6e13c1be6f072e3f59b968a9`; `capture/current.json:67878` | EntregaComprovantePanel:291 ATIVO; também anexar/coletar/dispensar chamam. Candidato nega UPDATE após INSERT comprovante, abortando transação SQL. |
| `public.rpc_recalcular_separacao_entrega(p_entrega_id uuid)` | sim | `cc6e6e0ac123e1c0a1c9b71a30cccfec`; `capture/current.json:68184` | SQL: rpc_reservar_embalagem_entrega / rpc_confirmar_separacao_embalagem / rpc_confirmar_entrega_embalagens; callers de embalagens contidos (tabela abaixo). |

## Escritas diretas e wrappers transitivos no produto

| Path:linha | Escrita/caller | Estado no repositório / efeito do instalador |
|---|---|---|
| `src/pages/Entregas.tsx:702` | UPDATE status em_rota | Contido antes de work: runDeliveryOperation :91–93; mutation :690. ACL e trigger candidato fecham API direta. |
| `src/pages/Entregas.tsx:732–737` | UPDATE cancelada/motivo; estorno separado subsequente | Contido :718 → :93; não usa cancelador 2args. Candidato não migra esse fluxo: continua fechado. |
| `src/hooks/useEsteiraLaboratorio.ts:661,712` | Criar / confirmar RPC | Gates :651,:705. Wrapper SQL engine acima; sem substituição automática pelo contrato novo. |
| `src/components/entregas/ConfirmarEntregaDialog.tsx:209` | rpc_entrega_confirmar_v1 → engine | Contido :157. |
| `src/components/estoque/ReservarEmbalagemEntregaDialog.tsx:49` | rpc_reservar_embalagem_entrega → recalcular → UPDATE entregas | Contido :48. |
| `src/components/estoque/EmbalagensEntregaPanel.tsx:133,144` | action com nome dinâmico: confirmar separação / entrega embalagens → recalcular | Gate central :53–56; conjunto identificável, contido. |
| `supabase/functions/entrega-runtime-harness/index.ts:123,359,193` | INSERT, UPDATE entregue, purge RPC (DELETE) com svc | Branch canônico retorna 410 :444–449 antes de setup. Não é caller legítimo de produção. Histórico purge em `supabase/migrations/20260803215909_aee1c07d-04eb-4361-888f-c3bb24792c3d.sql:46–47,58` é service-only, mas função AUSENTE da captura; não presumir instalada. |

Nenhum outro INSERT/UPDATE/DELETE/upsert direto de `entregas` encontrado em src/Edge. Leituras não são writers: `Entregas.tsx:193,636,721`, `PortalEntregas:23`, `PortalDashboard:24–25`, `PortalAcompanhamento:66`, `MobileEntregas:34`, `MobileDashboardProdutor:74,88`, `Relatorios:102`, `FormularioEntregaPrint:35`, `EstoqueBI:58`, `ReservarEmbalagemEntregaDialog:34`, `EntregaComprovantePanel:177`, hook esteira:746 e `src/hooks/useDeliveryFinanceReconciliation.ts:32`. SELECT/RLS permanecem; a reconciliação financeira atual é consulta de títulos, não `rpc_entrega_reconciliar_v1`.

## Cron, service cancel2args e dinâmica

Captura read-only anterior registrada na conversa: jobs **1,2,4,5,6,7,8**, todos active=true; flags `cancel_legacy=false`, `delivery_reference=false`, `http_candidate=false` em todos. MD5 dos comandos: 1=`921eb24eddf6aa6b6800acf316f1a6ab`; 2=`16d4bf969db7fca1c9e47838ce634d34`; 4=`523a4da2913f763b34d7dc45b0b81816`; 5=`5f2448a6f9d117e2141908e572ac2fd9`; 6=`2dadf03f6769816078793834d46efdf7`; 7=`3751cda36f8249139c6b209da7332541`; 8=`5bedf8e5ef693f49e4b8efd06a73d099`. Saída resumida, não comandos completos: prova ausência textual direta, não closure dos jobs.

`rpc_entrega_cancelar_v1(uuid,text)` MD5 `f830c6c718e2b44a1ded06a19a04557a`: service EXECUTE=true, authenticated=false; nenhum prosrc de outra função capturada menciona seu nome, nenhum caller src/Edge. Logo **nenhuma dependência concreta de serviço encontrada para esse cancelador**; não inventar quebra comprovada. Instalador revoga service e substitui corpo por deny; integração externa desconhecida que o use deixaria de cancelar. Scripts offline históricos são fixtures de revisão, não produto.

Busca das funções capturadas com entregas+EXECUTE não encontrou SQL dinâmico explícito nesse conjunto; isso não exclui identificador construído sem literal. Edge helper `rpc(c,fn,args)` :47–49 tem nomes identificáveis nas chamadas do harness. Nenhum endpoint externo/worker fora deste checkout, configuração externa de automação ou versão Edge efetivamente implantada é observável por leitura destes arquivos. Não se exige prova universal: limite exato é ausência dessas fontes/telemetria.

## Operações hoje não contidas que seriam interrompidas

1. **Gerar formulário**, **coletar assinatura** e **anexar comprovante** no panel (:291/:399/:520) não usam gate de contenção. São fluxos de comprovação legítimos do produto, callable authenticated na captura (sucesso real não reexecutado). O trigger `zz_delivery_mutation_closed` exige permit privado; nenhuma dessas RPCs o emite. Instalá-lo fará essas ações falharem. Upload em assinatura/anexo ocorre antes da transação RPC: possível objeto órfão, sem rollback do Storage por SQL.
2. Recalcular separação, confirmar recebimento/dispensar, marcar sem cobrança, reconciliar e reentregar via API também ficam negados quando alcançam DML de entregas sem permit, mesmo que EXECUTE antigo permaneça. Os callers de tela correspondentes já estão contidos, exceto os três acima. Isso é contenção deliberada de caminhos não certificados, não equivalência migrada.
3. Triggers capturados `fn_h6c_entrega_ar_b2b_link` (receivable_id → accounts_receivable/financial_links/partner_orders) e `trg_entrega_sync_partner_order_fn` (status → partner_orders/planning/timeline) são preservados, mas writes de entregas que os alcançavam não podem ser adotados como compatíveis. Recorte novo nega B2B/OnFarm/receivable/entregue; não liberar cadeia contábil.
4. **Termos/PDF são caminho distinto, não fechamento completo documental**: `src/components/entregas/TermoEntregaPanel.tsx:234,255,276` gera/assina termo e invoca Edge generate; escreve entrega_termos, não entregas. `supabase/functions/entrega-termo-pdf/index.ts:371–380` faz upload e `rpc_entrega_registrar_pdf_termo_v1` service-only; :407 publica evento. Essa Edge lê entregas :224. O instalador não fecha esse caminho fora do contexto privado de entrega; download :330 permanece leitura autenticada. Não alegar zero geração documental global nem que revogar cancel2args afeta PDF.

## Decisão/acesso necessários — concretos

- Para compatibilidade das **três ações de comprovação ativas**, escolher conscientemente: aceitar sua indisponibilidade temporária com contenção cliente antes de upload, OU preparar migração equivalente revisada. O pacote atual não faz nenhuma das duas; liberar entrega completa com essas ações funcionando não está provado. Isso é escolha funcional concreta, não nova permissão genérica para corrigir.
- Não há decisão humana necessária para uma suposta dependência service cancel2args inexistente nas fontes pesquisadas. Se o operador conhece automação externa que o chama, precisa fornecer **nome/source ou registro sanitizado de chamadas** (sem token) para migrá-la; sem tal integração, registrar apenas “não observável”, não bloquear por prova universal impossível.
- Identificar versão Edge implantada e closure dos comandos cron exigiria leitura dessas fontes/metadados além da captura resumida atual; não executada nem exigida como certificação universal nesta rodada.
- Inventário concluído para fontes disponíveis. **Nenhuma alteração funcional/SQL/teste realizada**; 97+9 PASS são evidência da rodada anterior, não novos testes deste inventário. Candidato fechado, sem grant cliente/UI/produção/cobrança/publicação.
