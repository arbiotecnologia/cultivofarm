# Continuidade durável — candidato corrigido, INATIVO

## Complemento independente 19:24 — monotonicidade e despacho

O arquivo `typecheck-source/scripts/durable-journal-check.audit.mjs` citado pelo proprietário
não existe neste checkout; os mesmos cenários foram reproduzidos diretamente no módulo exato.
`node scripts/owner-orders-20261023/durable-attempt-20261026/test-journal.audit.mjs`:
antes **2 PASS / 11 FAIL** (Node22.23.4 + fake-indexeddb, não Node24); depois **16 PASS / 0 FAIL**.
Saídas: `results-journal-before.txt` e `results-journal-after.txt`.

- Mesma geração: uncertain pode tornar-se terminal; committed/closed nunca regridem
  nem trocam entre si. Conflito aborta a transação e conserva o registro anterior.
- Nova geração exige chave diferente e predecessor local terminal; resposta antiga
  não apaga geração nova. Falta de confirmação local permanece bloqueada até recovery
  autenticada explícita; não existe liberação por TTL ou storage vazio.
- UUID estrito, contrato completo e metadados committed obrigatórios num parser único.
  `beforeDispatch` exige resposta canônica fresca, escopo atual antes/depois da espera,
  chave/geração correspondentes e estado reserved/uncertain. Committed, closed, unknown,
  in_progress ou formato incompleto nunca autorizam despacho.
- `dispatchJournal` reutiliza essa única verificação, sem fabricar estado uncertain.
  O parser valida formato, não autentica por si: o chamador continua obrigado a usar
  transporte canônico autenticado e fences. Protótipo permanece fora do runtime/feature OFF.
- Browser atualizado: **17 PASS** com IndexedDB real, incluindo resposta terminal antiga
  entre páginas e canonical closed sobre journal uncertain. Transporte controlado,
  não JWT/RLS real. As **44 provas PostgreSQL de transição/locks** permanecem intactas.

Revisão de partida: `065f8633e6ec84ae2ca1de61bb154612f95055e8`.
Nenhuma aplicação SQL hosted, publicação, alteração de pedidos ou sessões produtivas.
Contabilidade A DRAFT e envios externos OFF preservados. As 36 falhas antigas seguem abertas.

## Correções efetivamente executadas

- Captura **READ ONLY** no ref canônico `swzpzcwiasxmjutrmvkm`: sete funções com corpo,
  definição/owner/ACL/config/security, estrutura completa da tabela de idempotência
  (RLS, policies, índices, triggers), trigger updated_at e cinco chaves auditadas.
  Registro: `live-capture-1912.json`; identidade da última tentativa confirmada PB001033.
- PRE com pins frescos e todos os pares chave/pedido. Não usa `active_rpc_count=0`.
- Candidato numa transação: `lock_timeout=5s`, `statement_timeout=60s`,
  `ACCESS EXCLUSIVE` na tabela de idempotência e `SHARE` nos pedidos **antes** de PRE/DDL/import.
  Sem kill/drain presumido/reload. Contenção usa a mesma fronteira; se bloquear, aborta inteiro.
- Importação imutável da **última** tentativa por ator/empresa histórica/parceiro.
  Empresa vem do snapshot de origem, não do perfil atual. Os cinco pedidos permanecem
  intactos; somente a última chave vira geração 1, vinculada ao pedido existente.
  Não presume ACK: recovery retorna `committed`, número e UUID; novo pedido exige avanço
  explicitamente confirmado com chave/geração/UUID exatos. Demais chaves antigas não são reservas.
- Barreira de escrita **nunca toma lock de escopo**. Chave não registrada nega antes
  de qualquer advisory adicional; chave registrada usa só `b2b_idem`, reentrante para corpo antigo.
  Novo create/recover/close ordenam escopo→idem; não existe aresta antiga idem→escopo no trigger.
- Guard de create foi movido para depois das validações canônicas, imediatamente antes
  do lock idem. Testes com corpo antigo preservam os primeiros erros de entrada inválida.
  Create e close revalidam empresa após espera; recovery revalida papel/tenant antes de revelar.
- Não há mais hard gate impossível: foi substituído por **asserts de dados/metadados
  dentro da fronteira atômica**, importação e POST. Não remover pins se LIVE mudar: recapturar/revisar.
- Rollback é contenção deny-only, não restauração do writer memory-only. Mantém journals,
  tombstones, pedidos e replay já confirmado, revoga as duas entradas de recovery e nega
  escrita de corpo antigo já autorizado. Falha/timeout da contenção não autoriza downgrade.

## Contrato e ACK

`recover_partner_order_attempt_v1(uuid,text,bigint,boolean,uuid)` é wrapper INVOKER
sobre core privado DEFINER, com autorização canônica e `search_path` fixo.
Storage não autoriza e não gera chaves; primeira reserva também é servidor-owned.
Se não houver journal, mas houver histórico do ator/parceiro em outra empresa, falha
`C2DJ_LEGACY_RECONCILIATION_REQUIRED`, não inventa primeira chave após troca de tenant.

Recovery normal sempre reutiliza geração; ausência do pedido continua `uncertain`.
Só avanço explicitamente solicitado usa close atômico. `closed` cria nova geração;
`committed` só avança com `p_ack_order` igual ao UUID confirmado. ACK ausente/UUID de outro
pedido não avança; replay do avanço antigo falha `40001/C2DJ_CAS_CONFLICT`.
ACK não prova que um humano leu a tela: cliente malicioso autorizado pode confirmar o UUID
que recebeu. É uma intenção explícita autorizada, nunca uma atribuição de autorização à chave.
Não usar o UUID como secret/token nem prometer uma garantia de interação humana server-side.

## Provas reais locais e comandos

1. `python3 scripts/owner-orders-20261023/durable-attempt-20261026/assemble.py`
   Geração offline, sete funções, corpos/pins/POST/containment em `expected.json`.
2. `python3 scripts/owner-orders-20261023/durable-attempt-20261026/test-local.py`
   **44 PASS** do pacote; `results-postgres.txt` contém setup e resultados integrais.
   PostgreSQL descartável, Auth sintética, schema reduzido e cadeia canônica capturada.
   Substituições **apenas em memória na cópia de teste**, anunciadas na saída:
   estrutura POI reduzida, updated_at reduzido, dois pedidos fictícios e zero closures
   em lugar dos IDs/contagens produtivos. Sete corpos/definition hashes não substituídos.
   - Antes: duas chaves independentes criam dois pedidos; inversão real gera **40P01**.
   - Depois: mesma janela forçada, corpo antigo segura idem/recover segura escopo,
     ambos terminam sem deadlock. Corpo LIVE antigo iniciado antes do replace e pausado
     antes do lock chega após instalação: trigger nega **42501/C2DJ_REGISTERED_ATTEMPT_REQUIRED**.
   - POST fault reverte importação/DDL/corpos; timeout da fronteira **55P03** em ~5s,
     sessão holder permanece viva e é liberada por COMMIT, nunca kill.
   - Import committed sem ACK, ACK forjado, replay CAS, crash antes/despois commit,
     duas conexões prepare/create, técnico/B, revogação e tenant durante espera,
     timeout inconclusivo, imutabilidade e contenção de chamada antiga em voo.
3. `python3 scripts/owner-orders-20261023/durable-attempt-20261026/test-browser.py`
   **15 PASS**, `results-browser.txt`: Chromium/IndexedDB reais, transporte controlado.
   Duas páginas mesma origem, reabrir aba, generation CAS, storage indisponível/corrupto,
   outro contexto, feature OFF sem RPC, schema committed incompleto e resultado tardio
   após revogação sem apagar carrinho editado.
4. `bun run test -- src/test/pedidos/attemptClosureContract.test.ts src/test/pedidos/concurrentAttemptHook.test.tsx src/test/pedidos/novoPedidoAttemptClosure.test.tsx`
   **31 PASS** do fluxo canônico atual, `results-vitest.txt`.

As pausas/hooks PostgreSQL e a cópia `test_old_create` só existem no banco descartável.
Não houve dados fictícios em produção. Testes SQL sintéticos e transporte de browser
controlado **não são JWT/RLS hosted**, nem homologação A/B produtiva.

## Interface e limites de entrega

`recovery-controller.mjs` e `journal-prototype.mjs` ficam fora do runtime.
Feature `ORDER_JOURNAL_ENABLED=false`; adapter exige contrato autenticado válido como
capacidade, persistência local antes de despacho e fences pré/pós-await. Erro/unknown nunca
libera. Resultado committed é devolvido para exibição, não limpa carrinho/navega automaticamente.
UI React completa de NovoPedido com recovery de sessão **não foi integrada**: próxima promoção
depende de backend revisado/instalado e homologação ponta a ponta. Os 31 testes de componente
atuais provam fechamento publicado, não integração React deste journal.

IndexedDB é apenas cache mínimo de chave/versão/estado e índice hash do escopo; sem JWT,
preços, observação ou payload. Mesma origem/perfil/contexto somente: preview e domínio
publicado não compartilham storage. Backend candidato reencontra a reserva perdida,
mas recuperação cross-origin ainda não foi homologada. Falha local preserva bloqueio.
Abas antigas não são alteradas/recarregadas: chaves desconhecidas serão negadas no servidor.

## Checklist do auditor antes de implantar

- Revisar `candidate.sql.review`, PRE/POST, `expected.json`, `SHA256SUMS` e `review.diff`.
- Executar PRE exato somente leitura no ref canônico; candidato exige os mesmos pins
  outra vez **sob locks**. PRE passar antes não garante candidate passar sob tráfego.
- Se novas chaves/pedidos/closures/ACLs aparecerem, NÃO remover assert: recapturar e
  reconciliar a última tentativa de cada escopo. As cinco linhas são o recorte auditado desta versão.
- Aplicação independente, POST real e testes JWT A/B com storage/abas precedem feature ON.
- Não fazer downgrade após timeout/falha de containment. Somente containment PASS + writer
  fechado permite voltar frontend; nunca excluir histórico ou reaplicar create permissivo.

Não há captura adicional indispensável para os alvos modificados desta versão: metadados
necessários foram obtidos em READ ONLY. Aprovação independente e UI integrada continuam
pendentes; **inativo não significa bloqueado por plano**, e candidato não equivale a autorização
de implantação. Não certificar outros triggers comerciais/fiscais fora da cadeia capturada.