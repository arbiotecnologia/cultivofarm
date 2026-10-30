# Comprovação de entrega — migração autorizada (candidato, NÃO aplicado)

Decisão do proprietário (30/10/2026): **preservar** gerar formulário, coletar assinatura digital e anexar comprovante, migrando-os antes da implantação da barreira de entregas. Nada deste pacote foi aplicado hosted nem publicado.

## Correções da revisão independente 69d77e3

1. **Envelopes exatos no cliente** (`src/lib/entregas/deliveryProofFlow.ts`): pré-verificação só libera upload com `{allowed:true, entrega_id, action}` iguais aos pedidos; caso contrário `blocked` sem upload. Sucesso só com ACK `{success:true, action, entrega_id, comprovante_id(uuid), object_path}` (caminho igual ao enviado; `null` em gerar). Qualquer outro corpo sem erro é `uncertain` e mantém chave + caminho.
2. **Sem limpeza no cliente**: `ProofClient` não tem `remove`; o painel não chama `.remove(`. Código SQLSTATE nunca é tratado como prova de "não vinculado" (teste PG mostra PT409 `OBJECT_ALREADY_LINKED` com o objeto vinculado por chamada concorrente). Recusa definitiva retorna `retainedPath` e o objeto fica guardado sem vínculo. Escopo verificado após **toda** espera (preflight, upload, RPC final) → `stale` sem efeito. Exceção no upload = `uncertain` (mesmo caminho). 55P03/40001/40P01/PT503/57014 = incerto com pendência. Clique duplo/chamadas simultâneas da mesma entrega+ação → `busy`.
3. **Servidor** (`candidate.sql.review`): novo `delivery_proof_recheck_20261030` (ator ativo/tenant h15, papéis, vínculo de cliente vivo, escopo da linha relida) chamado após advisory+gate+lock de linha (antes do replay), após `FOR SHARE` em `storage.objects`, após `FOR UPDATE` do comprovante e imediatamente antes do UPDATE de `entregas`. O permit `proof` é **apagado no sucesso**; recibos mantidos.
4. **Aplicador com vínculo real** exercitado (preflight, anexo, assinatura), revogação real do vínculo (via caminho normal com gate) nega preflight, replay e novo anexo; outro funcionário da mesma empresa mantém acesso. Matriz legada de papéis preservada.
5. **93 falhas de segurança**: reproduzidas na base `7cc75d7` via `git archive` em `/tmp` (checkout principal intocado): base 6 PASS/93 FAIL, HEAD 6 PASS/93 FAIL, **nomes idênticos e primeira linha de erro idêntica** (92× `Cannot use 'import.meta' outside a module`, 1× asserção de texto em `d51-5-p1-systemic`). Sem diferença em `package.json`/lock/vite/vitest entre base e HEAD. Evidência: `security-suites-base-vs-head.json`.
6. **Liberação coordenada sem janela quebrada**: as três funções legadas viram **adaptadores endurecidos** (mesma apply privada; chave idempotente derivada do caminho; só `authenticated`). `release-combined.sql.review` = instalador atômico + instalador de comprovação em **uma única transação**. Ordem: (1) backend combinado, (2) frontend. Frontends em cache continuam funcionando pelos adaptadores; o frontend novo usa as RPCs novas. Não implantar os dois instaladores separadamente.
7. `AGENTS.md` raiz restaurado ao texto original de `7cc75d7` (cinco regras recompostas integralmente) + uma regra nova deste pacote.

## Contrato (resumo)

- `rpc_entrega_comprovacao_preflight_v1(entrega, ação)` — leitura autorizada, não grava.
- `rpc_entrega_formulario_gerar_v1`, `rpc_entrega_assinatura_coletar_v1`, `rpc_entrega_comprovante_anexar_v1` — EXECUTE só `authenticated`.
- Ator: perfil ativo + empresa via h15; papéis administrador, gestor, administrativo, producao, operador_onfarm, aplicador (este só com vínculo ao cliente); externos (parceiro B2B/técnico, cliente_produtor, consultor, superadmin, partner_users ativo) negados.
- Linha: entrega e cliente da mesma empresa; B2B e OnFarm fechados; comprovante confirmado não é sobrescrito.
- Objeto: existe, é do próprio ator, caminho `entregas/<id>/(assinaturas|comprovantes)/<uuid>.<ext>`, não vinculado a outro comprovante.
- Barreira: ramo `proof` one-shot (só colunas de comprovação); group/cancel idênticos.
- Rollback deny-only: fecha RPCs novas **e** adaptadores legados; mantém recibos, histórico e barreira.

## Resultados atuais (PostgreSQL descartável, restauração completa; runners individuais `run_bounded.py`, 480 s cada)

| Runner | Resultado | Tempo |
|---|---|---|
| `test_proof_pg` | **102 PASS / 0 FAIL** | 278,9 s |
| `test_atomic_with_proof` (97 regressões atômicas com comprovação instalada) | **97 PASS / 0 FAIL / 0 BLOCKED** | 280,1 s |
| `test_proof_install` | **10 PASS / 0 FAIL** | 289,0 s |
| `test_release_combined` | **6 PASS / 0 FAIL** | 222,5 s |

Frontend: `src/test/entregas` 20 arquivos / **297 PASS** (inclui 34 de `deliveryProofFlow.test.ts`); typecheck `tsgo` OK; build automático OK. Mocks dos testes de painel passaram a devolver envelopes exatos (sucesso sem corpo → ACK exato); `data:null` agora é corretamente incerto.

## Limites materiais

- Identidades/claims sintéticos: não provam JWT/RLS/Storage API hosted; supõe-se `owner_id = auth.uid()` no Storage — confirmar com sessão real após instalar.
- Revogação **com gate** durante esperas após o gate é linearizada (o ator segura `cf_user_guards_v1`); a negação após espera foi provada com revogação **sem gate** (`session_replication_role=replica`, simulando escritor privilegiado) — rotulada como injeção local.
- Objetos de tentativas recusadas ficam no bucket sem vínculo (sem limpeza privilegiada); limpeza futura exige desenho servidor que prove desvínculo atomicamente.
- Adaptador legado de gerar usa chave aleatória (idempotência pelo reaproveitamento do comprovante aberto); assinar/anexar legados derivam a chave do caminho.
- `rpc_dispensar_assinatura_entrega`, confirmação de recebimento, termos/PDF, B2B/OnFarm, financeiro, fiscal, cobrança e automações seguem fora do recorte e contidos.
