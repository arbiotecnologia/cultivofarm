# Reconstrução nova — trabalho parcial, NÃO APROVADO

Autorização Renato 08/11/2026 03:13 UTC. Este diretório é novo, não recuperação de `order-e2e/`; nenhum 11/11 ou 34/34 histórico entra nos resultados.

## Executado nesta rodada

- `rebuild.py` copia dependências para espelho em `/tmp`, calcula procedência SHA256 e roda `compose.py` com PostgreSQL 17.11, somente socket Unix e sem listener TCP. Geradores escrevem apenas no espelho; capturas/candidatos anteriores permanecem intactos.
- Restauração integral da captura física: zero dependências não restauradas; stack revisável de comprovante/estoque/envase/grupo composta. Checkpoint **novo desta execução**, não artefato histórico recuperado.
- Confirmação/envio com PRE/POST medidos e instalador físico 6667a8d6 pinado (SHA256 `93aa96092d2e7210bfc8ae7e6741db41bd439c1ac737fc8301248ce1ff9dabbf`). Controle novo executou compra de três embalagens de 25 kg, reserva parcial de duas, agrupamento/baixa, envio, comprovante sintético e confirmação, sem fabricação/CQ/envase. **Controle físico com demanda agronômica local, não E2E B2B.**
- Base B3 reconstruída separadamente do zero: checks dos seis corpos reais e PRE/install/POST passaram nesta execução, sem contabilizar resultados antigos. Tentativa de fusão das relações/corpos econômicos na base física mantém helpers de autoridade existentes em vez dos stubs permissivos do harness B3.

## Bloqueio concreto atual, não ausência de arquivo

Última execução: **exit 1**, simulação comprador negada por `platform_private.assert_b2b_partner_scope`, `42501 forbidden_partner`, através do `c2_order_actor_scope` real. A fixture reduzida B3 não satisfaz a cadeia de vínculo exigida pela base física completa. Não substituir a guarda por stub, não conceder papéis internos nem fabricar origem para obter PASS. Próximo passo técnico: compor a fixture local de vínculo completo a partir dos contratos capturados e testar revogação/empresa/papel antes de continuar pedido e logística.

Pedido canônico comprador não foi criado na composição integral. Candidato logístico B2B, aceite vendedor, B4 integrado, cancelamento, negativos de toda a cadeia e biológicos **ainda não executados/concluídos**; não afirmar que logística B2B está resolvida. A função de fusão é infraestrutura experimental de schema/fixtures, não SQL implantável. Nenhuma alteração para abrir B2B foi gerada nesta rodada.

## Evidências e limites

`evidence/` conserva tentativas e falhas, stdout/stderr/exitcode, manifesto de origem, metadados novos B3 e checkpoint novo identificado. Falhas intermediárias: registro Python de módulo, representação ACL após dump, assinaturas incompatíveis dos stubs, campos obrigatórios de fixtures e constraints ausentes. Todas preservadas; helpers canônicos mantidos, sem DROP para contornar autoridade.

Dados upstream sintéticos montados sob `session_replication_role=replica` somente na preparação local, nunca durante os writers testados; GUC local é transporte Auth sintético, Storage.objects é fixture sem bytes/HTTP. Permissões de consulta de fixture e relações mínimas adicionadas são costuras locais, não prova de RLS/JWT/produção. Os dez gatilhos/ACL reais de recebíveis e baseline de cadastro reconciliada deverão ser exigidos na próxima composição B4; este controle físico ainda não os revalida integralmente.

Não houve consultas/escritas hospedadas, Auth, publicação, NF, cobrança ou envio externo nesta reconstrução. Piloto e cinco títulos intocados. B4/estoque/entregas continuam NÃO APROVADOS. A ausência antiga de artefatos deixou de ser bloqueio humano; a tarefa permanece tecnicamente incompleta no guard de vínculo acima.

Execução: `python3 scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/rebuild.py`. Por padrão restaura tudo do zero; `NEW_E2E_REUSE_FRESH=1` reutiliza exclusivamente checkpoint novo local explicitamente identificado para iterações.

## Correção UX 08/11 03:31 — reserva inicial não é envio anterior

Correção integrada ao frontend em preparação, sem alterar SQL, contratos, pins de captura ou o harness logístico. A tela agora distingue o `state` canônico, não apenas `mode=durable`: `reserved` não mostra alerta de envio anterior nem ação de encerramento; `uncertain` oferece verificação/encerramento explícitos; `committed` conserva o diálogo de ACK com UUID/key/geração; `closed` conserva o avanço somente por clique e usa linguagem de tentativa, sem afirmar envio. Loading/erro usam texto neutro, sem presumir histórico. Journal/IndexedDB, hooks de recuperação e deduplicação permanecem inalterados; reserva inicial ainda usa a mesma chave do servidor no envio.

Evidência nova em `evidence/ux-journal-0331/`: três arquivos Vitest, **59/59, exit 0** (34 journal, 9 diálogo/estados, 16 encerramento legado). Quatro casos novos exercitam reserva sem pedido e sem fechamento/avanço na montagem, envio posterior com a chave reservada, encerramento incerto somente por clique, closed com CAS explícito e troca de conta descartando ACK anterior. Os demais testes preservam committed/duplo clique/revogação/fences. Transporte Auth/RPC sintético e IndexedDB emulado: não é sessão real, JWT/RLS, Storage HTTP nem E2E logístico. Avisos não fatais de React act/React Router constam no log. Prévia registrou `build OK` em 03:33:02 UTC; nenhum typecheck independente foi executado manualmente.

Não foi aberto o catálogo em sessão real nesta rodada: sua montagem chama recuperação/reserva hospedada, fora da autorização de zero hosted writes. Nenhuma publicação, envio, NF, cobrança ou alteração do piloto/cinco títulos. Pendências logísticas acima continuam abertas e NÃO APROVADAS.