# Liberação restrita de entregas em grupo e cancelamento observado — candidato (NÃO aplicado)

## Base considerada
- Relato externo do proprietário (não executado pelo assistente): `release-combined.sql.review` SHA256 `a566faa4f6f460d8b9195abf93d97717013af815537f00eb28b34cc98d314971` aplicado em `swzpzcwiasxmjutrmvkm` (migration `delivery_atomic_and_proof_authorization_20261030`, PRE/POST OK); frontend `8cd18556` publicado; 0 entregas AR Bio; 5 recebíveis, hash `9c1f86a6ccec0f8c233d17994294af12`; automação e fiscal OFF.
- Ordem vigente: backend combinado primeiro, frontend depois. Este pacote segue a mesma ordem: **SQL deste pacote → revisão → frontend**. Hoje o frontend já embarca o adaptador, mas permanece fechado porque a capability não existe no servidor.

## O que o delta faz (e só isso)
`install.sql.review` (uma transação, PRE → delta → POST → COMMIT):
1. Cria `public.rpc_entrega_operacoes_capability_v1()` (DEFINER, `search_path=''`), que apenas informa se o ator passaria agora na checagem canônica `delivery_actor_20261030` para `group` e `cancel`. Não concede autoridade.
2. `GRANT EXECUTE` a `authenticated` (e somente a ele) em:
   - `rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)` — grupo atômico (reserva + entrega + expedição, receipt por tenant/ator/chave, CAS da OS e dos lotes);
   - `rpc_entrega_cancelar_v1(uuid,text,timestamptz)` — cancelamento observado (estorno + liberação de reserva + status numa transação).
3. Não altera nenhum corpo, overload legado (`/5` criação, `/2` cancelamento), helper privado, DML de tabela, RPCs de comprovação, motor/batch de estoque, flags fiscais ou `auto_generate_receivable`.

PRE: capability ausente; RPCs de comprovação presentes com EXECUTE; barreira `zz_delivery_mutation_closed` ativa; DML cliente em `entregas` fechado; MD5 do corpo, ACL e owner exatos dos 5 objetos pinados a partir de `delivery-atomic-hardening-20261030/capture/post-expected.json` (estado pós-instalação). POST: corpos inalterados, ACL exata (authenticated sim; anon/service_role não), legados e helper fechados, barreira ativa, capability DEFINER com `search_path=""`.

`rollback.sql.review` (deny-only): revoga os dois grants, troca a capability para sempre fechada, mantém entregas, receipts, barreira e histórico. Reexecutável.

## Escopo efetivamente provado (candidato de liberação restrita)
Somente: **OS agronômica manual (sem pedido B2B), lotes `disponivel` do mesmo tenant, campos `data_saida/motorista/veiculo/tipo_entrega/endereco_origem`**, e cancelamento de entregas `separado/em_rota` sem recebível. Continuam fechados: OnFarm, B2B, lotes já reservados, atualização de status (`em_rota`), confirmar entregue, embalagens, financeiro/fiscal, recebimento/dispensa. Papéis: grupo = administrador/gestor/produção; cancelamento = administrador/gestor/administrativo; externos, superadmin e vínculos de parceiro negados.

Limite funcional honesto: o formulário atual coleta telefone, destinatário e endereço detalhado; o contrato atômico não persiste esses campos, então o app **recusa antes do envio** (nomeando os campos) em vez de descartá-los. Liberar esses campos exige ampliar o contrato servidor (fora deste delta).

## Frontend (já no código, fechado)
- `src/lib/entregas/deliveryOperationsFlow.ts`: probe da capability imediatamente antes do envio (ausente/erro/envelope não exato = fechado); payload restrito; ACK exato de grupo e cancelamento; erro com SQLSTATE = recusa definitiva (transação única não confirmou); falha de transporte ou ACK não exato = incerto, mantendo exatamente os mesmos argumentos/chave (`grupoId`) para replay idempotente; fence de escopo antes do probe e do envio.
- `src/pages/Entregas.tsx`: criação e cancelamento usam somente o adaptador; removidos os passos multichamada (reserva → entrega → expedição; update direto → estorno). Status `em_rota` continua bloqueado. A tela mantém o bloqueio de reenvio após resultado incerto (conservador).
- Testes: `src/test/entregas/deliveryOperationsFlow.test.ts`.

## Resultados brutos (esta rodada)
- PG descartável, restauração completa (6 listas vazias) + `release-combined` exato `a566faa4` + POST de comprovação + este delta: **42 PASS / 0 FAIL**, 203,8 s, exit 0 — `test_capability_pg-current.log.txt`, `test-capability-results.json`, `test_capability_pg-timing.json`. Inclui: drift ACL recusado, falha forçada no POST com rollback, COMMIT/POST, rerun recusado, matriz de papéis da capability, anon negado, inativo negado, FSF com IDs AR Bio negado (grupo, receipt de mesma chave, cancelamento), legados fechados, campo ignorado rejeitado, ACK exatos, replay, UPDATE direto negado, zero efeitos financeiros/fiscais/outbox, ACL de comprovação inalterada, rollback deny-only preservando histórico e reexecutável. Atores sempre `authenticated` com claim sintética; nunca `service_role`.
- Vitest `src/test/entregas` (21 arquivos): **320 PASS / 0 FAIL**, incluindo 23 novos do adaptador.
- Falhas pré-existentes conhecidas em suítes de segurança alheias (`create-user-edge-handler`, `external-user-ab-proposal`, `d51-5-p1-systemic`) são baseline e não foram reexecutadas aqui.

Nada disto prova JWT/RLS/Storage hosted.

## Roteiro da prova positiva real (sessão AR Bio) — não executado
Pré-condição: este delta revisado e aplicado pelo proprietário; frontend correspondente publicado.

1. **Leitura prévia (somente leitura, ref comprovado `swzpzcwiasxmjutrmvkm`)**: contagem/hash de `accounts_receivable` (esperado 5 / `9c1f86a6…`), `entregas` AR Bio (0), `fiscal_invoices`, `comunicacao_outbox`; ator: perfil ativo, papéis, ausência de `partner_users` ativo; assinatura AR Bio com `estoque_embalagens`.
2. **Fixture isolada, marcada**: uma OS agronômica manual AR Bio `numero_os`/observação `E2E-FIXTURE-ENTREGA-20261030`, cliente interno de teste existente da própria AR Bio (sem `partner_order_id`), status `pronto_entrega`, e um lote `disponivel` de quantidade mínima (1 unidade) — **criados apenas pelos fluxos canônicos** (OS → produção → CQ → envase).
3. **Positivo via API/UI com sessão real** (sem capturar senha/token): `rpc_entrega_operacoes_capability_v1` → `{group:true,cancel:true}`; grupo de 1 item; conferir ACK exato, 1 entrega `separado`, 1 movimentação `expedicao`, `receivable_id` nulo.
4. **Comprovação (Storage)**: preflight → upload no caminho vinculado → `rpc_entrega_comprovante_anexar_v1`; ACK exato; download autenticado.
5. **Negativos reais**: sessão FSF `rh@…` com os mesmos IDs → negado; anon → negado; `PATCH /entregas` direto → negado.
6. **Reversão**: `rpc_entrega_cancelar_v1/3` → estoque volta a `disponivel`; entrega fica `cancelada` (histórico permanente, não apagável).
7. **Leitura posterior**: mesmos hashes financeiros/fiscais/outbox inalterados.

Impacto residual não reversível: linhas `cancelada` em `entregas`, receipts privados, movimentações de estoque (reserva/expedição/estorno) e o objeto de comprovante no Storage (clientes nunca apagam). Por isso tudo leva o marcador da fixture.

### Pré-requisitos reais que podem impedir a prova
- **Capability/grants não instalados**: sem este delta, qualquer positivo é impossível (o app permanece fechado por design).
- **Lote `disponivel` canônico**: os pacotes de geração manual de lote/CQ/envase continuam somente revisão (não aplicados). Se a AR Bio não tiver hoje uma OS agronômica `pronto_entrega` e um lote `disponivel` produzidos pelo fluxo canônico, a fixture não pode ser criada sem contornar barreiras — nesse caso a prova fica bloqueada até essa liberação, ou exige uso explícito de estoque real (impacto em estoque real, decisão do proprietário).
- **Ator**: `arbiotecnologia@gmail.com` precisa ser administrador/gestor/produção ativo **sem** papel ou vínculo de parceiro B2B/superadmin; caso contrário a capability responde fechada (comportamento esperado) e é preciso outro usuário interno da AR Bio.
- **Feature `estoque_embalagens`** ativa na assinatura AR Bio.
- Campos de destinatário/telefone/endereço precisam estar vazios no formulário (limite do contrato).

## Arquivos
`assemble_capability.py`, `preflight.sql.review`, `delta.sql.review`, `postflight.sql.review`, `install.sql.review`, `rollback.sql.review`, `test_capability_pg.py`, `run_bounded.py`, resultados acima, `SHA256SUMS`.
