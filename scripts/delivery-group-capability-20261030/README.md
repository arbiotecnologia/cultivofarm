# Capability de entrega em grupo e cancelamento observado — candidato (NÃO aplicado, NÃO autorizado)

## Estado
- Base: `release-combined.sql.review` SHA256 `a566faa4…` aplicado em `swzpzcwiasxmjutrmvkm` e frontend `8cd18556` publicado. Isso é relato do proprietário; o assistente não aplicou nem publicou nada.
- Este delta concede EXECUTE a **todo** `authenticated` elegível da plataforma. Essa abertura global, antes de uma prova real, **não está autorizada**. Não instalar para viabilizar teste.
- Ordem obrigatória se um dia for liberado:
  1. pacote v2 de estoque/envase (`stock-envase-recovery-20261027`), revisado e instalado;
  2. regenerar os pins deste pacote (o corpo do writer de grupo muda no v2, e o PRE atual recusaria a instalação);
  3. revisão;
  4. frontend.

## O que o delta faz
`install.sql.review` roda em uma transação (PRE → delta → POST):
- cria `rpc_entrega_operacoes_capability_v1()`. Ela só informa se o ator passaria agora em `delivery_actor_20261030`; não é autoridade;
- concede EXECUTE a `authenticated` em `rpc_cockpit_criar_entrega_v1(…6)` e `rpc_entrega_cancelar_v1(uuid,text,timestamptz)`;
- não altera nenhum corpo, overload legado, helper, DML de tabela, comprovação, motor/batch, flags fiscais ou `auto_generate_receivable`.

`rollback.sql.review` só fecha (deny-only): revoga os grants e a capability passa a responder fechado; o histórico fica preservado.

## Cliente (no código, fechado até a capability existir)
`src/lib/entregas/deliveryOperationsFlow.ts` e `src/pages/Entregas.tsx`:
- consultam a capability imediatamente antes de cada envio; se ela estiver ausente, der erro ou responder fora do envelope exato, a operação fica fechada;
- as revisões da OS/lotes vêm da seleção e a do cancelamento vem da abertura; no envio há apenas comparação, nunca rebase;
- o ACK exige `organization_id` igual ao tenant capturado; há fence depois do último `await`, e resposta de sessão antiga vira `stale`;
- **só `PT409`, `42501` e `22023` contam como recusa definitiva.** Qualquer outro código ou falha de transporte é incerto: a mensagem diz "pode ter sido gravada" e nunca afirma que nada foi gravado;
- o snapshot imutável do envio é guardado por ator+tenant antes do dispatch. Depois de recarregar, a única saída é "Repetir envio pendente" (args idênticos). Só confirmação exata ou recusa definitiva limpam o snapshot;
- o cliente nega OS que não seja `padrao`/agronômica manual sem pedido B2B. Destinatário e endereço detalhado preenchidos são recusados explicitamente;
- lote aceito: `disponivel`, ou reserva **inteira** desta mesma OS (v2). O servidor reprova a posse novamente.

## Resultados
- PG deste delta: 42 PASS (SQL inalterado; não reexecutado). Atores sintéticos `authenticated`, nunca `service_role`.
- Vitest `src/test/entregas`: 23 arquivos / 368 PASS, incluindo a montagem real da página e do diálogo.
- Nada disto prova JWT/RLS/Storage hosted.

## Prova positiva real
Ainda indisponível. Pré-requisitos concretos em `PREREQUISITES.md`; o roteiro de fixture e reversão permanece lá.

## Arquivos
`assemble_capability.py`, `preflight.sql.review`, `delta.sql.review`, `postflight.sql.review`, `install.sql.review`, `rollback.sql.review`, `test_capability_pg.py`, `run_bounded.py`, `PREREQUISITES.md`, `SHA256SUMS`.

## Revisão b9c6ee66 — pendências entre abas e recusa de replay (cliente; sem SQL)
- **Pendência local por tentativa:** cada uma tem slot próprio, `cf:delivery-uncertain:v2:<ator>:<tenant>:<fn>:<chave>`.
  - `savePending` recusa sobrescrever uma tentativa distinta.
  - `clearPending` só remove depois de comparar com a tentativa exata liquidada.
  - Antes de reservar, a página relê o armazenamento; se houver outra tentativa (outra aba), recusa sem envio.
  - Escuta `storage` para refletir o bloqueio criado por outras abas.
- **Limite:** localStorage não é lock. Duas abas podem, por corrida, despachar chaves distintas; as duas tentativas ficam preservadas e bloqueiam novos envios. A deduplicação real é o receipt do servidor por chave.
- **Recusa no replay** (`42501`/`PT409`/`22023`): não prova que o envio original incerto não foi gravado. Por exemplo, o primeiro commit se perdeu e depois o ator foi revogado ou a CAS mudou.
  - O registro é mantido e marcado `replayRejected`; nunca é limpo e nenhuma chave nova é liberada.
  - A tela exige consulta/reconciliação autorizada, que não existe neste pacote e segue pendente.
  - Nenhum rollback é inferido.
  - A recusa definitiva só limpa no **primeiro** envio da própria tentativa.
- **Testes:** Vitest `src/test/entregas` com 23 arquivos / 372 PASS.
  - Página montada: 42501 e PT409 no replay; dois consumidores intercalados (o ACK de X limpa só X e Y fica intacto; o consumidor B recusa chave nova sem writer).
  - Unitário: X/Y sem sobrescrita, limpeza condicional, marcação.
  - Os dois consumidores rodam no mesmo documento, **não** em abas reais do navegador.
- **Infra de teste:** o mock de `localStorage` em `src/test/setup.ts` agora implementa `length`/`key`. As suítes de portal/navegação que o usam passaram (9 arquivos / 91 PASS).
