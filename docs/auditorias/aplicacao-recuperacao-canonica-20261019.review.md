# Recuperação canônica de aplicações — 19/10

## Entregue, sem operações de produção
Candidata concreta em `scripts/application-recovery/candidate.sql.review`; reimplementa apenas RPC existente com prepare/finalize e Storage1 existente com manifest privado exato. Preserva assinatura, helper leitura implantado POST04067ba43cea3eed845a1fd3735061e0 e pacotes anteriores SQL/PDF. Não concede EXECUTE ao legacy_closed.

Formulários desktop/mobile usam mesma rotina autenticada do SDK canônico com fences de recurso/ator/tenant/papéis/epoch, timeout/abort em RPC, espera limitada no upload e descarte de conclusão tardia. Não usam cleanup automático porque timeout pode ocorrer depois do commit. Retry reusa UUID/manifest; unidade real explicitamente escolhida, sem recomendação inventada. Nenhuma OS comercial é finalizada nem comunicação real emitida.

## Evidências locais
- PostgreSQL descartável:62/62, incluindo cross-tenant, spoof, limites/MIME/path, Storage antes de preparo negado, objeto ausente/tamanho errado atômicos, papéis positivos/negativos, revogação/replay/restore, herança e retificações concorrentes.
- Guardas hosted completas recusam o schema reduzido sem efeitos. Candidate/rollback completos também executados com **guardas explicitamente substituídas somente na cópia temporária local**, instalação nos hashes exatos, rollback fechado fiel e falhas POST atômicas. Não equivale a executar integralmente a guarda hosted em produção.
- Vitest119/119 (7 arquivos), inclui44 casos PDF existentes. Avisos preexistentes de Dialog descrição/React Router não são ocultados.
- Build automático posterior OK. App typecheck **NÃO CERTIFICADO**: raiz files[] não serve e checker manual proibido; exportação recuperável/config/lock via pacote independente. Nenhum PASS de tipos atribuído ao build.

## SQL e escopo
Preflight fingerprint schema/policies/triggers `ab90301d6806c9777da6ecceb7b953f8`,16 funções com ACL/owner/search_path. Hashes POST locais: RPC990fb351076582f099a49663e2146ddd; Storage14265fe941e813c01bbcb11aa950c4fc6. O helper implantado é imutável nesta entrega. Guardas de aplicação/rollback recusam drift. Rollback preserva tabela privada/objetos/aplicações; não reabre legacy_closed.

## Não concluído / bloqueadores precisos
**Não apto a publicação/aplicação automática.** Necessita revisão independente de Storage1 mutações legadas, metadata SDK real, schema/trigger/RLS completo e writers concorrentes de autoridade, mais homologação A/B positiva após implantação pelo auditor. Nenhum novo fixture produção nem pagamento/email; `fixtures-ab.review.md` é roteiro, não seed hosted completo. Não houve browser positivo de cadastro pois a RPC hospedada continua fechada e escrita foi proibida nesta entrega.

A/B sessões permanecem intocadas; evidência anterior de leitura vazia/SQL claims não é login positivo/anexo/revogação. Advisors continuam com findings anteriores. v6/global OFF e seus44 corpos já fornecidos pelo auditor não são solicitados novamente; locks/tempo/ABA global não certificados. Contratos B2B não avançados.

Riscos: bytes parcialmente enviados/preparações expiradas órfãos preservados; Storage metadata não inspeciona conteúdo/magic bytes; locks de linhas existentes não certificam criação concorrente de autoridade nem todos writers. Não alegar risco nulo, JWT direto ou homologação global.

## Recibo final
Vitest119/119, PostgreSQL62/62, staging recuperação4/4 e staging PDF preservado7/7. Build automático final13:17:04Z OK; não checker app certificado.

Candidata SQL SHA256 `37812f0fe151d00b49d5a6fca394c85bfed6b8183e62a779a3c6994d24cfbca7`; rollback `d5290eee0bfb883837a470ce1a17676a7470a20109712f8fba8abd5b4e8ab4fb`; manifesto `4a4db9ead261683d1f67c188374dcd0874a6b2a7eebb9eb1e81a63d4351a2334`. Checkout recuperável1599 entradas conferidas, SHA256 `29b7a0a3952ec900cf661262065f1ee498405f9c145e0626f5cf4c901df08af6` entregue em Files; inclui configs/lock/src sem secrets/Git/dependências/output.

Pacote application-access-integrity hashes integralmente conferidos; PDF todas entradas existentes conferidas, staging7/7. Seu SHA256SUMS histórico referencia três logs **ausentes preexistentes**: build-harness-receipt.log, staging-tests.log, targeted-tests.log. Não reconstruídos/inventados nem alterado o pacote protegido; ausência impede afirmar verificação integral daqueles três recibos.