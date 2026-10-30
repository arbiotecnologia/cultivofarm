# Comprovação de entrega — migração autorizada (candidato, NÃO aplicado)

Decisão do proprietário (30/10/2026): preservar **gerar formulário**, **coletar assinatura digital** e **anexar comprovante**, migrando-os antes da implantação da barreira de entregas.

## Achados nos corpos LIVE (captura somente leitura, ref canônico)

Ref `swzpzcwiasxmjutrmvkm` comprovado por env/cliente e por MD5 idênticos à captura (`capture/live-proof-storage-readonly.txt`): `rpc_anexar…` `bafa068d…`, `rpc_gerar…` `62ce0a8a…`, `rpc_coletar…` `570bacbf…`, `storage1_delivery_allowed` `d7c7d1a9…`.

Legado: SECURITY DEFINER com `is_delivery_staff` apenas — **sem filtro de empresa** (staff de qualquer tenant gravava em qualquer entrega), **caminho de arquivo livre** (podia apontar arquivo de outra entrega/empresa; triggers só exigiam existência no bucket), sem lock, idempotência ou reautorização. Storage já restringe upload por empresa/status (`storage1_delivery_allowed`); `entrega_comprovantes` já não tem DML cliente (ACL `rxtm`).

## Contrato novo (`candidate.sql.review`)

- `rpc_entrega_comprovacao_preflight_v1(entrega, ação)` — leitura autorizada antes do upload; não grava.
- `rpc_entrega_formulario_gerar_v1(entrega, chave)`, `rpc_entrega_assinatura_coletar_v1(entrega, chave, payload)`, `rpc_entrega_comprovante_anexar_v1(entrega, chave, payload)` — EXECUTE só `authenticated`.
- Ator: sessão, perfil ativo e empresa via h15; papéis da regra existente (administrador, gestor, administrativo, producao, operador_onfarm, aplicador — este só com vínculo ao cliente, como no Storage); externos (parceiro B2B/técnico, cliente_produtor, consultor, superadmin, partner_users ativo) negados.
- Linha: entrega e cliente da mesma empresa; B2B e OnFarm fechados; gerar em separado/em_rota/entregue, assinar/anexar em separado/em_rota (mesmo gate do upload); comprovante confirmado não é sobrescrito.
- Ordem: ator → validação → advisory → reautorização → gate global `cf_user_guards_v1` + org → `FOR UPDATE` da entrega → reautorização + escopo → replay (só depois) → objeto em `storage.objects` existente, do próprio ator, travado `FOR SHARE`, não vinculado a outro comprovante → permit `proof` one-shot → uma única UPDATE em `entregas` verificada pela barreira (só colunas de comprovação; status, financeiro e vínculos inalterados).
- Payload com conjunto exato de campos, tamanhos limitados, caminho `entregas/<id>/(assinaturas|comprovantes)/<uuid>.<ext>` coerente com MIME, hash SHA-256 hex.
- Chave por empresa/ator/ação; mesma chave e mesma impressão → replay; divergente → `PT409`.
- Legado: corpos deny-only e EXECUTE revogado de clientes e service_role. Barreira ganha ramo `proof`; ramos group/cancel idênticos.

## Frontend (`src/lib/entregas/deliveryProofFlow.ts` e painel)

Pré-verificação → upload (`upsert:false`) → RPC com chave. Ambíguo (rede, 5xx, sem código, PT503/40001/57014): mantém caminho e chave para retry sem reenviar e **nunca apaga**. Recusa definitiva (42501/22023/PT409/23514/55P03) após upload desta tentativa: remove só esse objeto; caminho reaproveitado nunca é apagado. Troca de entrega após upload: não chama RPC nem apaga.

## Ordem de implantação recomendada

1. Publicar o frontend (as três ações ficam "não autorizadas agora", **sem upload**, enquanto o preflight não existir).
2. `delivery-atomic-hardening-20261030/install.sql.review`.
3. `install.sql.review` deste pacote na mesma janela (PRE exige o corpo exato da barreira atômica).

Ordem inversa faria o frontend antigo enviar arquivo e falhar na RPC legada fechada → objeto órfão. Após o passo 3 o postflight atômico deixa de bater no corpo da barreira (substituída de propósito); vale o POST deste pacote.

## Resultados atuais (PostgreSQL descartável, restauração completa, seis listas vazias)

- `test_proof_pg`: **73 PASS / 0 FAIL**, exit 0, 154,1 s (orçamento 480 s) — `test-proof-results.json`, `test_proof_pg-current.log.txt`.
- `test_proof_install`: **10 PASS / 0 FAIL**, exit 0, 168,7 s — drift de corpo, ACL e barreira recusados; POST forçado reverte tudo; COMMIT + POST exato; rerun recusado; rollback deny-only; reinstalação recusada.
- Frontend: `deliveryProofFlow.test.ts` (12) e suítes de entregas: 20 arquivos / 275 testes PASS; build OK.

## Limites materiais

- Identidades/claims sintéticos: não provam JWT/RLS/Storage API hosted. Supõe-se que o Storage grava `owner_id = auth.uid()`; confirmar com sessão real após instalar.
- Aplicador positivo com vínculo não exercitado (fixture sem `user_clientes`); só a negação sem vínculo.
- Limpeza depende da política DELETE atual do bucket; se negada, o objeto não vinculado permanece (sem limpeza privilegiada).
- Anexo passa a exigir recebedor sempre (a UI já exigia); `data_assinatura`/`arquivo_url` do payload legado não são aceitos.
- `rpc_dispensar_assinatura_entrega` chama o gerar legado e falhará — já contida no cliente; continua fora do recorte, assim como confirmação de recebimento, termos/PDF, B2B/OnFarm, financeiro, fiscal, cobrança e automações.
- 93 falhas Vitest em `create-user-edge-handler`, `external-user-ab-proposal` e `d51-5-p1-systemic`: arquivos não alterados desde `7cc75d7`; não relacionadas e não corrigidas aqui.
