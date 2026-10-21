# XML autenticado — candidata revisável, NÃO implantada

Baseline do trabalho: HEAD `c7d5c962ce197ed4dd94c4ba9205b11274d0b36b`.
A candidata arquivada `127ef0605cec67e762c9769f86ee8c53e806d597`
foi conferida pelo SHA256 `60e44676a97ba4f2fd4b85b50886d7f8b693890bd58af5d3baa457473577e6d6` antes do delta.

## Baseline REAL v94 — verificação externa recebida às 18:06 UTC
O proprietário recuperou pelo painel Supabase autenticado **Download as ZIP**;
`list_edge_functions` confirmou ACTIVE v94, verify_jwt=true, import_map=false,
entrypoint `supabase/functions/fiscal-xml-engine/index.ts`, no projeto canônico.
`baseline-real-status.json` registra proveniência, hashes e evidência histórica.
- Index SHA256: `9188f960f2f9fd5078d9fbe1ed380cbb05ec7ed1fab76d404b08d278eee984d1`;
  conferido localmente igual a `edge/baseline.index.ts`.
- ZIP SHA256 externo: `41888a4624418c8c85373aa4847ff5a1352ba6be912f5c89ec0cc4f820539cc3`.
- Identificador ezbr informado: `1a52ba6336755a1bbfc36125fbdc84d6336b3a3f5bad98ee2cbe098521bf6a0c`;
  **não é o hash ZIP**; algoritmo não certificado neste ambiente.
Os 14 arquivos, incluindo dependências, foram comparados externamente ao c7;
nenhum delta após normalização LF/trailing newline. Arquivos faltantes foram
lidos no ref c7 pelo conector, segundo o auditor; pacote completo guardado externamente.
Não foi fabricado download/verificação dos 14 arquivos neste sandbox.
Fonte/config LIVE deixam de ser indisponíveis por essa evidência externa;
**reconfirmar ausência de drift de versão/config/dependências no predeploy**.
Consentimento já concedido; implantação continua bloqueada tecnicamente por
fixture e validação do bundle hosted, além da revisão pendente.
Nenhum deploy, generate, SQL, objeto Storage ou sessão foi alterado.

## Correção efetiva e reprodução
A versão 127ef060 limitava apenas a branch após claims e RPC fiscal iniciais.
Dois novos testes travando claims/primeira RPC reproduziram **16 PASS / 2 FAIL**.
A candidata agora limita claims, primeira RPC, provas, leitura, hash e prova final
pelo mesmo deadline monotônico de 15 s contado da entrada do handler; etapa lenta
não ganha outro prazo. SDK recebe abortSignal nas RPCs/queries suportadas;
Promise.race encerra resposta mesmo se transporte ignora abort. Sem retry automático.
Pedido pré-abortado não lê Storage. Corpo comum às três ações agora usa leitura
incremental de 16 KiB / 5 s desde entrada, sem req.json pendurado. Essa proteção
de ingresso é a única alteração comum ao generate; tail fiscal byte-exato.
XML usa SDK asStream, contador incremental até 10 MiB, cancelamento imediato no
excesso/abort/prazo, sem aguardar cancel pendurado. Metadados do run conferidos
antes de I/O; Content-Length ausente/enganoso não determina aceitação.

Download exige perfil fiscal atual, visibilidade RLS da execução e ownership
`h15_service_actor_run_access`, antes e depois da leitura. O helper encadeia
execução→invoice→estabelecimento→tenant ativo do ator (SQL local histórico,
não certificação de corpo LIVE nesta rodada). Bucket exato; mesmo path/hash/tamanho
na prova final; SHA256 e tamanho conferidos; limite 10 MiB; bytes octet-stream,
private/no-store, nosniff, attachment. Não retorna capacidade URL nem fallback.
A leitura service-only ocorre apenas após as provas; não foi criada policy.
`generate`, certificados, XMLDSig e SEFAZ continuam byte-exatos ao baseline local.
Assinatura XML necessária NÃO é assinatura de URL.

## Frontend isolado, sem ativação
Dois arquivos runtime XML permanecem byte-exatos ao HEAD c7.
`frontend-candidate/` contém o delta revisável, não imports ativos do app.
Loader usa cliente canônico, prazo real de 15 s mesmo com transporte pendurado,
cancelamento sem retry, tamanho e tipo MIME XML/octet-stream; recusa JSON legado.
Abridor canônico cerca tenant/papéis/identidade/época/ready e descarta Blobs.
Clique prepara; segundo clique baixa. Nenhuma alteração no monitor/Auth/cadência.

## Compatibilidade e sequência fail-closed
1. Baseline LIVE v94 recuperado externamente; reconfirmar versão/config/hash e
   dependências no predeploy, congelar preflight e revisar fonte deny de emergência.
2. Após revisão técnica e preflight, instalar Edge binária e provar contrato sem URL;
   frontend antigo pode falhar/abrir aba vazia: não há compatibilidade funcional.
   Proibição de retornar `{url}` para compatibilizar. Gate de geração fechado NÃO
   prova inexistência de downloads; aceitar interrupção controlada explicitamente.
3. Somente depois, publicar os dois arquivos frontend revisados em conjunto.
   Frontend novo sozinho + Edge velha rejeita JSON e não deve ser publicado.
4. Homologar atores reais A/B com fixture canônica autorizada antes do aceite.
Nenhuma etapa operacional foi executada; fixture/bundle hosted e reconfirmação LIVE no predeploy mantêm NO-GO técnico, não falta de consentimento.

## Rollback seguro
`edge/rollback-deny.index.ts.review`: fonte completa local, action download 410,
no-store, sem Storage/signer. Não restaura fonte antiga que assina URLs. Seu tail
não-download foi comparado ao baseline local, cujo index é idêntico ao LIVE v94
externamente comprovado. Reconfirmar ausência de drift antes de qualquer deploy.
O ZIP LIVE é evidência/backup histórico, NÃO rollback operacional autorizado:
restaurar v94 reabriria URLs assinadas; emergência mantém download 410. `rollback.py` desativa somente
loader novo; foi exercitado em cópia temporária, nunca no runtime atual.

## Evidências
- Edge candidata: **23/23 PASS**, com A/B sintéticos, tenant invisível, ownership,
  revogação antes/depois de leitura, pré-abort, RPC inicial/final travada,
  claims lentas consumindo orçamento, sinal SDK, tamanho/hash, nenhum signer.
- Frontend candidato na cópia temporária: **14/14 PASS**, opener real, transporte
  simulado; preparo→download, revogação durante/preparado, scope, tipo JSON,
  timeout com transporte que ignora abort→retry manual e resposta antiga descartada.
- Bateria fiscal + authzV6 + d51-5 fiscal: **1901 PASS / 4 skipped**, 127 arquivos.
- `before.txt`, `after.txt`, `frontend-after.txt`, `regressions.txt` guardam saídas.
- Build automático do runtime c7: succeeded, run
  `br_20c2a793-9ed8-48cc-af72-f070db945f4c`; log local build OK.
  Isso NÃO compila candidata arquivada como runtime nem certifica types dela.
  Essa evidência histórica não certificava a montagem candidata; a rodada 17:49
  abaixo registra build/types efetivamente executados na cópia externa isolada.

Testes locais não equivalem a JWT/RLS LIVE nem homologação real. Renovação natural
admin A/B e download pós-renovação c7 foram reportados pelo proprietário; preservados.
Fixture e inventário legado: ver `homologacao-e-urls-legadas.md`. SU-518022 apenas ack.

## Rodada 17:49 — limite incremental e ingresso
- Revisão recebida 2eb45eee: quatro regressões novas falharam (corpo pendurado,
  metadados excessivos antes I/O, dois casos chunk excedente); candidata corrigida
  passou 44/44 Edge e 14/14 UI na montagem externa (58/58).
- Montagem portátil e comandos: `VALIDACAO-PORTATIL.md`, `prepare-validation.py`.
- Montagem externa: Vite produção exit 0 / 41,50 s; node types exit 0;
  app types inicialmente exigiu duas dependências ausentes no pacote, incluídas,
  segunda execução exit 0. Não são alterações de runtime.
- Deno 2.6.10 / TS5.9.2: bundle exit 0, 100 módulos, 4,77 MiB;
  SHA256 286615503f8686dd00cb8538f9bea128edad5eaec1f173304f2bb41593a3afcf.
- Deno check ainda exit 1: cinco erros também reproduzidos no baseline Git:
  digest BufferSource (index.ts), StorageError→Record (ensureStoredArtifact),
  importKey/decrypt BufferSource (aesGcmDecrypt), nullable modulePromise
  (xsdValidate.ts:66). Nenhum assert relaxado/check desabilitado; correção
  desses trechos comuns à geração precisa de delta revisado, não foi feita.
- Bundle local próximo ao limite hosted não garante bundle Supabase <=5 MiB;
  fonte/config/dependências LIVE foram comprovadas externamente às 18:06;
  reconfirmação no predeploy continua obrigatória. Fixture continua bloqueada.
- Runtime c7, Auth, monitor, SQL, chaves, Storage e sessões intocados; sem deploy.

## Evidência independente complementar — 18:06 UTC
Auditor reportou 16/16 PASS no teste adicional da RPC inicial em 2eb45eee,
e corpo pendurado FAIL antes da correção, como esperado. Resultados externos
não substituem 44/44 Edge +14/14 UI locais da candidata stream/body e não são E2E.
URLs antigas/cache e SU-518022 permanecem sem solução comprovada (somente ack).

## Rodada 18:10 — cinco erros Deno corrigidos, sem implantação
Base solicitada `12339d925b09241733e6a083e059f60ff8ddfb69`; evidência externa
LIVE v94 registrada em `a4324f3e211aae6806812cc8a9c9d9aaffc78ba1` preservada.
- `edge/index.ts.review` e `edge/rollback-deny.index.ts.review`: digest/key/IV/cipher
  usam cópia exata da view em ArrayBuffer não compartilhado, sem ampliar offsets;
  `isAlreadyExistingObject` recebe StorageError estruturalmente compatível, sem cast.
- `edge/xsdValidate.ts.review`: interface mínima explícita do módulo WASM,
  Promise local não nullable e cache único preservado, inclusive rejeição; nenhum
  any/ts-ignore novo (removidos os any e supressão existentes desse adaptador).
- `prepare-validation.py` monta também a dependência XSD revisada; arquivo XSD
  ativo, runtime XML, Auth/monitor e demais fontes fiscais permanecem intocados.
- Testes novos `src/test/fiscal/fiscalXmlCandidate.typesBehavior.test.ts`:
  hash conhecido de view com offset, AES-GCM roundtrip/adulteração, classificação
  de colisão/falha Storage nos dois artefatos, cache de rejeição WASM sem reinício.
- Deno check candidata + rollback **exit 0**, sem os cinco erros; bundles ambos
  **exit 0**, 100 módulos (candidata 4,77 MB / rollback 4,76 MB reportados pelo CLI).
- **65/65 PASS**: 44 Edge, 14 UI e 7 preservação de comportamento;
  tipos app/node via tsgo **exit 0**, Vite isolado **exit 0 / 28,52 s**.
- Logs `types-review-*.txt`, lock `types-review-deno.lock`, hashes/tamanhos e
  artefatos em `validation-status.json`; diff mínimo `types-review.patch`.
Geração conserva algoritmos/bytes/erros e cache: delta comum é tipagem/cópia
WebCrypto, além da proteção de ingresso previamente revisada. Não afirmar agora
que o tail inteiro é byte-exato ao LIVE: essas linhas comuns mudaram explicitamente.
Não houve sessão/reload, banco, Storage, deploy ou publicação. Check local resolvido;
fixture/E2E e bundler hosted continuam pendentes; LIVE v94 não volta a UNAVAILABLE,
apenas exige confirmação de ausência de drift no predeploy. URLs antigas não resolvidas.

## Rodada 18:15 — revisão aprovada, preflight externo sem drift
Revisão ref `090c033ad83c47b40eefb8e841bf8937cc27b642`, 55/55 externos PASS;
v94 ACTIVE/JWT true/import_map false/ezbr idêntico reconfirmados pelo proprietário.
Ver `COORDENACAO-IMPLANTACAO.md`: mecanismo disponível só implanta, não valida
bundle hosted sem implantação nem certifica preservação de config; fixture
unsigned-only não existe no contrato atual e generate não foi acionado.
NO-GO técnico: nada promovido, implantado ou publicado; runtime intacto,
gate false e rollback deny preparado. v94 permanece LIVE segundo prova externa:
nova emissão signedURL XML ainda não interrompida; URLs antigas não resolvidas.
