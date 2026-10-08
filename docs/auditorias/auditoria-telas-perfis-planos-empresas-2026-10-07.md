# Auditoria atual de telas, perfis, planos e empresas — 2026-10-07

## Notificações P1 — 2026-10-08 04:21 UTC

Relatório de **17 seções**, produtores/matriz/migrations/provas/rollback: [notificacoes-p1-2026-10-08.md](notificacoes-p1-2026-10-08.md). SQL A/B positivo/replay/lido-only +11 negativas; prova final +4, rollback integral; históricos67 e hashes estoque/movimentos preservados. Seis migrations oficiais 041123/041233/041316/041641/041815/042050; nenhum regrant estoque ou publicação frontend. **820/820 testes PASS**, lint focal/scanners/diff-check/build automático PASS; typecheck separado NOT RUN, findings438 preexistentes. **NO-GO operacional/integral:** portal positivo sem identidade vinculada válida, fanout/legados contidos, browser/API/concorrência/Realtime/Edge remoto/Storage UNVERIFIED. D52 preservada; ACL histórica abaixo não representa estado vivo (motor/batch liberados individualmente na fase anterior).

## Fechamento de compatibilidade — mesma fase P1 — 2026-10-08 03:39 UTC

- Baseline observado: `81c107d4140dc6599e3ab9af6c5243e6aa9f0087`, checkout inicialmente sem alterações locais. Preservadas entregas anteriores e D52; nenhuma nova fase.
- **Ledger vivo confirmado em leitura no canônico `swzpzcwiasxmjutrmvkm`:** `20261008032313`, `20261008032343`, `20261008032551` e **`20261008033250`** existem. A pendência NaN/±Infinity/zero/negativos/sentido já foi corrigida pela última migration; nenhuma reaplicação, nova migration ou alteração concorrente neste fechamento. Mensagens atrasadas devem apenas reconhecer as correções existentes.
- **Compatibilidade local:** em `src/pages/Entregas.tsx`, a expedição automática agora envia `os_tipo: itemOsTipo` junto de `os_id: itemOsId`. Em `src/lib/estoque/motorEstoque.ts`, importação `type Json`, chamada tipada `supabase.rpc`, conversão de payload via `unknown as Json` e resultado via `unknown as EstoqueOperacaoResultado`; removidos os dois `any`, sem mudar nome/assinatura/default/contrato da RPC. Nenhum guard, permissão ou regra comercial alterado.
- Novo `src/test/estoque/stock-caller-compatibility.test.ts`: quatro provas locais de contrato RPC, estorno NULL/payload default, propagação de erro sem repetição e presença do tipo da OS no caller. Mock e inspeção estrutural **não são API/browser real**.
- **Evidência independente Codex, informada pelo proprietário às 03:39 UTC:** prova SQL ampliada com sucesso das nove ações; reserva total/parcial e cancelamento total/parcial; saldo/status/replay; cinco negativas sobrepostas; nove classes de cleanup zero e hashes históricos iguais. Typecheck explícito local e lint motor/testes PASS no ambiente Codex. Isso amplia a evidência SQL relatada, não certifica API/browser, concorrência, todas as combinações de referência ou runtime de novos destinatários. O SQL ampliado/manifesto/output do Codex não foi fornecido neste fechamento: não substituir nem inventar o script próprio existente, nem atribuir essa execução ao agente.
- **Verificações próprias:** estoque/entregas **277/277 PASS em 21 arquivos**; lint motor + testes novos/numéricos **PASS, zero erros/avisos**; scanners de segredos/integração fiscal **PASS**; diff-check PASS. Typecheck separado próprio **NOT RUN**, execução manual vedada pelo harness; o PASS explícito acima é independente. Lint global e lint completo de Entregas não reexecutados; não alegar PASS global.
- **Leitura pós-fechamento própria:** `authenticated EXECUTE` continua **false** em motor/reserva. Estoque **1 / `0c1a052173a564454cd51e69fcb72947`**, movimentos **2 / `f8b6fcf6aa756d745eaf205f606f7795`**, iguais aos baselines históricos. Não houve SQL de escrita, fixture, Auth, Storage, alteração de usuário/assinatura/serviço, regrant ou publicação nesta entrega.
- **Rollback local documental:** remover somente `os_tipo` desta expedição e restaurar as três conversões anteriores do motor reverte a compatibilidade; não executado e não recomendado, pois restaura a omissão incompatível e os dois `any`. Não reverter contenções/ACL nem migrations existentes.
- Build automático próprio confirmado **OK 03:41:00 UTC**; revisão observada após as alterações `3bfca1897a05ac90de835681a4c050fa01360893`. SHA-256 do teste novo `2449434a77aad1d2c2b91f8568e0c4b2e34d6a3c8c9aec5b131013780363d6ec`; prova numérica própria preservada, SHA-256 `0380c149ea6049427cc166b247c18a1fc035d426c747ef18cae950efea1f8937`.
- **PASS focal de compatibilidade e testes; NO-GO operacional/integral mantido.** Regrant exige revisão e autorização posterior específica. API/browser autenticados, concorrência e demais limites anteriormente declarados continuam não verificados. Commit final gerido pela plataforma, não criado manualmente.

## Complementos consolidados da fila — P1 estoque — 2026-10-08 03:36 UTC

- Ledger canônico conferido: contexto/ledger já aplicados em `20261008032313`, `20261008032343`, `20261008032551`; **não reaplicados**. `20261008031156` preservada. Inspeção viva confirmou contexto privado, prefixo literal, destinatários ativos do tenant e ambas policies RESTRICTIVE de movimentos intactas. Nenhuma nova policy ou regrant persistente.
- Pendência numérica corrigida exclusivamente pela migration oficial **`20261008033250_99e7db4f-2aa4-455d-a027-e0703d367047.sql`**. Motor/reserva revalidam ator h15/RBAC/entitlement antes do gate, negam explicitamente `numeric::text IN ('NaN','Infinity','-Infinity')`, zero e negativos antes de lookup/replay. Estorno permite NULL, mas fornecido deve ser finito positivo. Sentido de ajuste somente entrada/saida quando fornecido; default anterior preservado. Patch idempotente e fail-closed em baseline inesperado. Nenhum dado real editado.
- `scripts/rbac-audit/stock-numeric-hardening-proof.sql`: prova própria oficial chegou a **P0001 STOCK_NUMERIC_PROOF_ROLLBACK**, não falha funcional. **59 negativas numéricas**: 45 especiais/não positivos nas nove ações + 8 NULL fora do estorno + 6 na reserva interna; **14 negativas** adicionais de tenant/feature/tipos payload/sentido/referência/replay item errado. FSF positivo e ARBio feature negada. GRANT temporário somente dentro da transação revertida; não é Auth/browser/API real.
- Positivos revalidados: ajuste default saída 10→9, perda 9→8, descarte 8→7, devolução reintegrável 7→8; ledger e replay sem duplicação; contexto pré-forjado ignorado e fechado. Split reserva 8→6 + item2, replay aponta item derivado correto. Cancelamento/expedição/estorno NULL/entrega executados. Quantidades inválidas não mudaram saldo inicial10. Prova numérica cobre gate de nove ações, **não certificação integral de suas regras**.
- Manifesto próprio: run_id `TEMPORARY_AUDIT_STOCK_NUMERIC_a46812f7-0e3c-490d-95b8-336e5bcaac82`; lotes `bde2cd3b-a130-4b8f-ad11-4cff1445f25b`,`30ccb2b3-1ee7-45dd-a17e-d35807566a80`; envases `ca8f7295-ead6-4085-9dc6-f70c54816bd5`,`b65db112-74e7-41f1-9b44-797430115e3b`; estoque `e104c4d8-1fa9-4911-a0c3-483a2cc39662`,`b6fe2f0b-7d0e-4f0e-8141-3681493e1081`,`2a0ad069-e9f5-4392-9d87-5de421fcdd11`; cliente `d46cb615-e80b-4fb5-92e1-4fe074520da6`; fazenda `29b05c86-a578-47b1-bf57-4633756359bc`; talhão `cb1e2f33-6b73-44b7-b9c0-fcfa49149dde`; OS `7d52cb1f-e1a3-412d-b424-5904f105cca7`. CQ e 14 movimentos identificados pelos lotes exatos; nenhum cleanup destrutivo executado.
- Pós-rollback consulta própria: lotes/envases/CQ/estoque/movimentos/cliente/fazenda/talhão/OS/contexto **todos zero**. `authenticated EXECUTE motor=false/reserva=false`. Históricos intactos: estoque **1 / `0c1a052173a564454cd51e69fcb72947`**; movimentos **2 / `f8b6fcf6aa756d745eaf205f606f7795`**. Evidências independentes Codex anteriores continuam atribuídas, não confundidas com esta prova.
- Testes estoque/entregas **273/273 PASS em20 arquivos**, seis novos estruturais/tradução. Lint teste focal, scanner segredos/integridade fiscal e diff-check PASS. Build automático **OK 03:35:40 UTC**; typecheck separado **NOT RUN**, execução manual vedada no harness. Sem declarar PASS por ausência de erros. 444 findings Supabase anteriores não introduzidos: 17 RLS sem policy, 2 DEFINER PUBLIC, 424 DEFINER authenticated e 1 proteção de senha; fora deste complemento.
- **PASS focal SQL numérico/contexto/replay/rollback. NO-GO operacional/integral**: ACL continua fechada; browser/API reais, concorrência, novos destinatários efetivos, matriz ampliada de referências/regras e identidade inativa própria continuam UNVERIFIED. Não publicar nem iniciar outra fase; mensagens atrasadas devem só reconhecer estes complementos concluídos.
- Rollback documental: preservar ACL/policies e forward-fix auditado, sem restaurar aceitação de NaN/Infinity/GUC arbitrário. Arquivos: migration oficial acima; prova SQL; `src/test/estoque/stock-numeric-hardening.test.ts`; tradução em `src/lib/estoque/motorEstoque.ts`; `AGENTS.md`, relatório e roadmap. D52/usuários/assinaturas/serviços/comunicação intactos. HEAD observado antes das edições locais `dbf8c6513fab7045d4039b5f1a2226b3bd0367b2`; commit final gerenciado pela plataforma, não criado manualmente.

## Complemento contexto/ledger — mesma fase P1 — 2026-10-08 03:28 UTC

- Achados independentes confirmados vivos: quatro ctx EXECUTE authenticated, open preserva contexto, reserva mescla GUC; trigger LIKE sem escape e administrativo sem tenant. Não afirmada exploração. Destino oficial confirmado production/external `swzpzcwiasxmjutrmvkm`; sem DDL concorrente, regrant ou publicação.
- Migrations oficiais: `20261008032313_a2c2834d-dd81-4e55-9632-56dfa3a5996d.sql` hardening; `20261008032343_9c122697-5bb2-4e8b-b375-f7b86696b06a.sql` policy privada deny; `20261008032551_89d41651-3fa6-4111-a96f-cc6f40a3790a.sql` normalização de nulos opcionais. Três contenções anteriores preservadas, sem duplicação.
- Motor limpa pré-contexto antes de validação/replay e impõe contexto canônico antes da escrita. Reserva recebe contexto apenas de armazenamento privado txid/ator/item, validando argumentos da assinatura; chamada direta sem contexto privado constrói contexto mínimo e ignora GUC. Contexto privado removido no sucesso/erro. GUC é transporte para triggers, **não autorização**. ACL dos quatro ctx não foi ampliada/alterada; motor/reserva e demais funções contidas não reabertos.
- Ledger usa prefixo literal, não LIKE: % e _ não são curingas. Avisos exigem administrativo com profile/organização ativos e organização do lote igual à do destinatário. Nenhuma comunicação externa habilitada. Scalar/array/JSON null, metadata não objeto, campos textuais com tipos errados e sentido arbitrário negados com ESTQ_PAYLOAD_INVALIDO; cast origem estorno depois do precheck. Tradução existente cobre o código, frontend intocado.
- Tentativa inicial migration STOCK_PAYLOAD_PATCH_INCOMPLETE revertida: tabela inexistente e hashes de funções anteriores iguais antes de retry oficial. Aviso RLS novo resolvido por policy explícita deny; 444 findings preexistentes fora do escopo. Prova 1 negada pelo guard: claims ARBio em seed FSF, revertida. Prova 2 detectou nulos ausentes no contrato da reserva, revertida; forward-fix somente normaliza nulos.

### Prova própria e limites

- `scripts/rbac-audit/stock-context-hardening-proof.sql`: usuários existentes FSF/ARBio, GRANT **apenas transacional**; SQL claims não são Auth/browser/API real. Final **P0001 STOCK_CONTEXT_PROOF_ROLLBACK**, 14 negativas (9 tipos payload + feature/cross-item/ownership forjado/referência proibida/item replay incorreto). FSF positivo e ARBio ESTQ_FEATURE_REQUIRED confirmam estoque_embalagens; não inventado entitlement.
- Pré-forja não contaminou ação/key/autor/metadata/referência nas quatro ações e split; contexto fechado. Seeds fictícios reproduzem wildcard antigo %/_ sem afetar chave principal. Ajuste/perda/descarte/devolução saldo 10→9→8→7→8, ledger e replay sem duplicação; split 8→6 + novo item2, replay correto. Cancelamento/expedição/estorno/entrega executaram, não certificação exaustiva individual.
- Run_id `TEMPORARY_AUDIT_STOCK_CONTEXT_7114bd83-bdb5-40d7-8832-aed51d0fdbcb`; lotes `465c0b6c-0495-465a-9a6c-4cb6c397dde0`,`d5d2056e-93a6-4126-85eb-f7b6af243e38`; envases `a3f5d5e0-eca8-41a2-a4a1-098dd55429f1`,`610c38c3-5c4f-4b05-986b-94c323f8ae65`; stocks `5a1677ec-ca3a-4645-9644-a2def30c5dea`,`40dbdde6-023c-479d-836f-a99deda4fdf0`,`5bec0742-44c7-40ec-8dbc-2779e2213f27`; cliente `a8491f0f-3cb1-4f36-8ecf-4e2d38328e33`; fazenda `c4e9dce5-82af-4c2c-938d-2fc9b411a8df`; talhão `d01ed090-ae94-4d0d-9312-6c499823df23`; OS `d29325dd-65cb-4860-8af5-ca9a95bda6e0`. CQ e 14 movimentos ligados aos lotes.
- Pós-rollback por IDs/parents exatos: lotes/envases/CQ/stocks/moves/cliente/fazenda/talhão/OS/contexto **todos0**. Motor/reserva authenticated EXECUTE=false. Hashes antes/depois **estoque1/0c1a052173a564454cd51e69fcb72947**, **movimentos2/f8b6fcf6aa756d745eaf205f606f7795**. Nenhum cleanup destrutivo; sequências podem avançar.
- **PASS focal SQL**; novos administrativos/notificação efetiva, reserva direta pré-forjada, concorrência, ator alternativo habilitado, identidade inativa, matriz integral nove ações/referências **UNVERIFIED runtime**. Avisos tenant têm inspeção estrutural, não prova com novos papéis. **Authenticated browser/API path: UNVERIFIED. NO-GO operacional/integral**; legado fora do motor não certificado/reaberto.
- Rollback documental não executado: manter ACL/containment e forward-fix, nunca restaurar GUC merge/LIKE/destinatários globais. D52 intacto, mesma fase; sem Auth/assinatura/dados reais/publicação.
- Validações locais: **267/267 testes estoque/entregas** em19 arquivos, incluindo cinco novos testes estruturais; lint do teste novo/scanner segredos/scanner integração fiscal/diff-check PASS. Build automático **OK 03:28:05 UTC**. Typecheck separado **NOT RUN**, execução manual vedada pelo harness; não inferir PASS. Lint global/motor não reexecutados, baseline anterior de dois any preservado. Revisão observada `4162bec2d4a0a02c460ae32b58f5ca184220b771`; commit final gerenciado pela plataforma, não criado manualmente.
- Arquivos deste complemento: três migrations oficiais acima; `scripts/rbac-audit/stock-context-hardening-proof.sql`; `src/test/estoque/stock-context-hardening.test.ts`; `AGENTS.md`; este relatório e `roadmap.md`. Sem alteração frontend funcional. Memória da fase atualizada.

## Motor canônico — hardening P1 — 2026-10-08 03:17 UTC

- Delta inicialmente conferido `0a1966fa→e92fa8505686cc49807b5976f79013050e9b8c8d`: sem mudança funcional adicional; histórico de coordenação preservado. D52 não reaberto.
- Migration oficial aplicada **20261008031156**, arquivo `supabase/migrations/20261008031156_a233a75e-1ff4-47ef-99da-db667578f4fa.sql`. A primeira submissão falhou por literal SQL mal delimitado, sem helper/alteração persistida; retry corrigido pela ferramenta oficial. As três migrations anteriores estão presentes e não foram reaplicadas. Sem alteração de políticas ou dados reais.
- Helpers privados `stock_motor_actor/item/refs`, DEFINER com search_path vazio e sem EXECUTE cliente: identidade ativa/organização por **h15**, RBAC por `fn_estoque_pode_operar`, feature real **estoque_embalagens** por `saas_has_feature`; depois item/lote/parametrização/envase e referências. Corpos públicos existentes preservam assinatura/OID/regras, com validação antes de lookup idempotente e revalidação depois do lock. Replay exige ator, tenant, fingerprint e **item original** na metadata, não o item novo da reserva parcial. Contexto do ledger é imposto e fechado inclusive em erro; sucesso exige trilha coerente.
- Corpos vivos inspecionados após aplicação: motor MD5 **baa25965692ce39e1412e71029cf5502**, reserva **421e5d3ab7e902ec5385873a6359f931**. A migration usa substituições sobre hashes otimistas dos corpos auditados, não wrapper público paralelo. Isso exige revisão dos corpos finais, não apenas confiança em `replace` bem-sucedido.
- Callers examinados: `motorEstoque.ts`; expedição/estorno em `Entregas.tsx` com referência entrega; reserva interna e batch em `useEsteiraLaboratorio.ts`; `ReservaDialog` e `Estoque.tsx`. Batch `rpc_estoque_reservar_v1` e escritas diretas não foram reabertos nem certificados.
- Oito literais frontend preservados. Servidor aceita semanticamente entrega vinculada ao item/tenant e ordem_servico coerente com OS manual/B2B; manual/sistema apenas sem ID. **ordem_servico_onfarm, partner_order, envase, lote negados explicitamente** como referência: sem habilitação por suposição. OS onfarm continua caminho distinto validado por vínculo de cliente; equivalência entre literal frontend e referência do ledger não foi inventada. Guard das migrations anteriores permanece e pode negar manual/sistema mesmo após precheck; esses caminhos não são PASS runtime.

### Prova própria SQL — não browser/Auth/API

- Script: `scripts/rbac-audit/stock-motor-hardening-proof.sql`. Usuários existentes FSF e AR Bio, claims sub/role/iat e `SET LOCAL ROLE authenticated`; GRANT do motor **apenas dentro da transação revertida**, nunca ACL permanente. Nenhum Auth criado/alterado, safeguard desabilitado ou dado real editado.
- Duas tentativas de setup falharam: OS sem produto/microrganismo e depois sem fazenda/talhão obrigatórios. Ambas revertidas. Setup final criou referências fictícias completas, sem afrouxar constraints/triggers.
- Execução final atingiu **P0001 STOCK_MOTOR_PROOF_ROLLBACK** depois das assertions: ajuste/perda/descarte/devolução com sucesso+ledger e replay sem duplicação; saldo **10→9→8→7→8**. Reserva parcial **8→6 + novo item 2/reservado 2**, replay aponta o novo item sem duplicar ledger. Cancelamento, expedição, estorno e entrega executados sem erro, entrega final retornou ok=true/saldo 2→1/reservado 1→0. Essas quatro últimas ações não possuem todas as assertions individuais de saldo/replay; não chamar nove ações integralmente certificadas.
- **Cinco negativas**: AR Bio sem feature estoque; item cruzado FSF→AR; payload organization_id forjado; referência lote não suportada; mesma chave de reserva usada com item desdobrado em vez do original. Plano sem feature foi verificado pelo erro ESTQ_FEATURE_REQUIRED; negativa cruzada com esse plano não é prova independente de tenant (por isso FSF executou a negativa cruzada).
- Manifesto: run_id **TEMPORARY_AUDIT_STOCK_MOTOR_2c421c46-d1be-4f25-a9b1-cedbd30af7f9**; lotes `d34a84ac-dabd-41ac-8e30-b11215b635f7`,`4b642222-ae07-4733-8d01-ce6df7b77a68`; envases `5ac7c826-f5a8-41fc-962e-902fc5df724d`,`81354adf-a1d1-4587-a295-eb269cc54822`; estoques `d13f3b8e-83fd-488d-8aba-c1eb339b4838`,`282b6c9f-d99b-4f85-9639-4d8c48952367`,`155be5d2-3631-4ad8-830c-d0229545821d`; cliente `0a320e94-f54a-43be-b809-195575bca2a2`; fazenda `a51f4ed3-3824-4077-af9f-0fede5cd9681`; talhão `3e4d0cc2-08ea-48dd-afa8-4089e6c9655f`; OS `2d178d21-a572-4898-bfe1-fb4bc6507c8d`; CQ derivado dos dois lotes.
- Movimentos exatos (12): `cd8ef227-69a8-41e5-bf87-b90821139bc1`,`d6779ba5-9db5-4615-b7ad-d302e00e4195`,`ad882852-c9fb-4002-aedf-c668b3726d34`,`610d46f6-2d45-4e19-bfbb-7e78a0837f4f`,`c50887d3-ecd3-4a33-9f15-9ac121dd3cdb`,`1d130e03-1079-44b3-b0a9-82c315e345cb`,`d8374aa8-e940-4ce1-920e-5bf77d2b1aa6`,`916a4092-2995-43ae-9ff0-ddc903b9cc0d`,`dda4bf37-5cc2-416e-86ea-282aee294a16`,`d7952b3e-c0bd-44bc-b399-e58497b16683`,`a4d9b870-4ea6-43a6-883c-df5d609a2108`,`b68cae0c-6be0-4a2c-8170-0fb141c86004`.
- Pós-rollback por IDs/parent exato: **lotes/envases/CQ/estoque/movimentos/cliente/fazenda/talhão/OS = 0/0/0/0/0/0/0/0/0**; ACL authenticated motor=false. Hashes históricos próprios antes/depois **estoque 1/0c1a052173a564454cd51e69fcb72947**, **movimentos 2/f8b6fcf6aa756d745eaf205f606f7795**. Sem cleanup destrutivo. Sequências podem avançar em rollback.

### Gates e rollback

- **262/262 testes PASS, 18 arquivos** estoque/entregas; lint dos dois arquivos de teste PASS; scanner de segredos e diff-check PASS. Tradução dos nove novos erros e classificação de acesso cobertas sem mudar tipos RPC. Lint do motor contém `any` legado; não declarar lint global PASS. Typecheck separado **NOT RUN**, execução manual vedada pelo harness; build automático consultado separadamente no fechamento.
- **PASS positivo focal SQL**, não certificação total das nove ações. Ainda faltam runtime de identidade inativa/role revogada, replay entre dois atores ambos habilitados, referências entrega/OS cruzadas específicas, origem estorno cruzada, números especiais, concorrência, reserva total e todas as variações de ações. Browser/API autenticados **UNVERIFIED**. Não usar SQL claims como sessão real.
- **NO-GO operacional até revisão**: nenhuma das 23 ACL reaberta; amostra viva das 15 DEFINER que referenciam estoque confirmou anon/authenticated=false, service=true. Sem nova publicação frontend, deploy Edge, Auth, assinatura, comunicação externa ou próxima fase.
- Rollback documental **não executado**: manter ACL fechada e três contenções, preferir forward-fix dos helpers/corpos se revisão apontar incompatibilidade; jamais restaurar motor inseguro/replay antigo ou remover policies para obter positivo. Dados e histórico são intocados pela migration.
- Fechamento: build automático **OK 03:17:51 UTC**; scanner integração PASS. Lint motor **2 erros any preexistentes** (linhas originais 93/98), lint testes sem erros. Revisão observada **fd7b55e2ed9389a92d65c935fab393c7c9b415e0** antes deste adendo; commit final gerido pelo ambiente, nenhum commit manual. SHA-256 migration **436994f53676e778e876fa289292174d7fdab4c26f8173e5c2fdf73235a14bf4**; prova **4cee7422256dd01c435c1c81c7c5dc1427441982d184048e6ae351a97e4cbdee**. Arquivos locais adicionais: `src/lib/estoque/motorEstoque.ts`, `src/test/estoque/motor-estoque-fase28c.test.ts`, `src/test/estoque/stock-motor-hardening.test.ts`, `AGENTS.md`, `roadmap.md` e este relatório. Ferramenta migration informou 444 findings preexistentes, sem certificação global nem correções fora do escopo.

## Estoque legado — P1 isolamento — 2026-10-08 (estado atual)

### Coordenação Codex — ledger sincronizado 02:54 UTC

- Pedido de 02:52 UTC substitui qualquer implementação concorrente: **somente inspeção/provas/sincronização**. Leitura viva identificou a migration Codex **`20261008024129_stock_p1_history_tenant_containment`**, distinta de `20261008024032`; nenhuma das três migrations desta fase foi reaplicada e nenhuma policy foi duplicada, removida ou relaxada.
- Policy viva `stock_p1_history_tenant_isolation`: **RESTRICTIVE ALL TO authenticated**, USING e WITH CHECK exigem simultaneamente `ep.id=estoque_movimentacoes.estoque_produto_id`, `ep.lote_id=estoque_movimentacoes.lote_id` e `public.stock_p1_lote_owned(ep.lote_id)`. A policy adicional `stock_p1_mov_tenant_isolation` continua presente. Sem defeito concreto identificado neste contrato; sem mudança concorrente no banco.
- SQL extraído diretamente de `supabase_migrations.schema_migrations`, um statement, 906 caracteres e newline final; MD5 bruto **`6ae35b4a79aeef399bea5e9b2e660d91`**. Cópia no repositório: **`restoration/stock-p1-history/20261008024129_stock_p1_history_tenant_containment.sql`**, SHA-256 **`ba6742902640ceefb61f08fc3881dfc8bba672c0d874a8a0c70051b5e515cd09`**; MD5 normalizado sem newline final **`aececd58a4bac5b3ae60c0d4dda50af4`**, igual ao ledger com a mesma normalização. Não executar esta cópia: CREATE POLICY já aplicado não é idempotente.
- **Limite da sincronização:** arquivo preservado em restoration, não importado em `supabase/migrations/`, pois esta pasta só pode ser escrita pela ferramenta oficial de migration e acioná-la reaplicaria SQL já existente. Importação local sem execução depende de mecanismo oficial de sincronização do ledger; não contornar essa proteção nem alegar pasta sincronizada.
- Provas próprias A/B já concluídas às 02:49 UTC **com as duas policies vivas** (a leitura pré-prova confirmou ambas): histórico direto/views own **1/1**, cross/órfão **0/0**, quatro negativas de referência, rollback e resíduos exatos **0/0/0/0/0**. Não foi necessário repetir fixtures nesta coordenação sem alteração posterior de contrato. O reteste independente adicional anunciado pelo Codex **ainda não foi recebido**; o anterior de 11 negativas permanece identificado separadamente. Sem PASS browser/API.
- Nova leitura própria às 02:54 UTC confirma hashes reais inalterados: estoque **1/`0c1a052173a564454cd51e69fcb72947`**, movimentos **2/`f8b6fcf6aa756d745eaf205f606f7795`**; views continuam security_invoker. ACL **23 funções bloqueadas para anon/authenticated** conforme leitura própria 02:49 UTC, não modificadas nesta retomada. Dados, referências e órfãos preservados; sem atribuição tenant.
- Teste estrutural novo verifica o SQL Codex, USING/WITH CHECK coerentes e ausência de comandos de alteração de dados/ACL. **243/243 testes PASS em 17 arquivos**, lint focal/scanners/diff-check PASS; build automático **OK 02:53:47 UTC**. Typecheck separado NOT RUN por restrição do harness. Checkout inicial desta coordenação `9366b6869afe7ea51ff6b3ae733baf6ebefbbc22`; commit final é gerido pelo ambiente, sem commit manual.
- **PASS focal RLS/views/referências/preservação; NO-GO operacional/integral** pelas ACLs e ausência de browser por perfil/plano/RPC funcional/Edge/Storage integral. Rollback documental mantém isolamento e negações, nunca reabre automaticamente. Sem escrita remota nesta coordenação, Auth, publicação, deploy ou fase seguinte; D52 preservado.

### Revalidação do complemento queued — 02:49 UTC, mesma fase

- Solicitação `umsg_01m4cnkw5wfb6rmksgprh3jeqw` tratada nesta retomada. Checkout observado `f7f65cffc87421d71133f776ba0406dcd06d4f37`; nenhuma migration criada ou reaplicada. Leitura viva confirmou ledger **20261008022948 + 20261008024032** no destino canônico. O complemento já estava aplicado: não há justificativa para duplicá-lo.
- Catálogo vivo: `stock_p1_mov_tenant_isolation` **RESTRICTIVE ALL USING + WITH CHECK** pelo par estoque/lote, mais `stock_p1_history_tenant_isolation` também RESTRICTIVE e coerente com o parent. Ambas preservadas. `vw_bi_movimentacoes` e `vw_bi_estoque_produto` mantêm `security_invoker=on`. Não se atribui tenant ao órfão por expedido_por.
- **Prova própria nesta retomada**, SQL com claims/iat dos dois atores existentes e `SET LOCAL ROLE authenticated`: AR Bio e FSF own direto/view **1/1**, cross direto/view **0/0**, órfão direto/view **0/0**, view estoque órfão **0**. Quatro INSERTs privilegiados divergentes novamente negados (lote, estoque cruzado, origem cruzada, referência estoque cruzada). Exceção final esperada **P0001 MOV_P1_POST_ROLLBACK** atingida depois das assertions, revertendo integralmente a transação. Isso não é browser/login/API autenticada.
- Manifesto novo `TEMPORARY_AUDIT_STOCK_MOV_P1_b0702b59-44c8-481e-b609-9bec3af94f6f`: lotes `4a5fd848-3d89-43c1-a714-39bc682a4939`, `fc8dfc09-5b3b-40fa-98b8-16c92b45ecb1`; envases `9af3d5d8-dc3c-4cd0-9335-7b470c43b0e7`, `5a5ed6f0-175b-4cac-a784-2441f9a4e6f7`; estoques `dec508bf-9967-4701-b260-64b6f87b235e`, `eaaf2c7f-70c8-47bd-a3a6-abda8153c294`; movimentos `bfe8e1aa-d51b-4287-b91e-61c69b5d2172`, `8e3f2dfe-c232-4660-a611-051d57361e22`; CQ vinculado somente aos lotes do manifesto. Consulta posterior por estes IDs: lote/envase/CQ/estoque/movimento **0/0/0/0/0**. Sem exclusão para cleanup.
- Hashes próprios antes/depois, serialização comparável: estoque **1 / `0c1a052173a564454cd51e69fcb72947`**; movimentos **2 / `f8b6fcf6aa756d745eaf205f606f7795`**. **Total privilegiado 2 não é exposição 2/2**: as duas linhas reais estão preservadas, mas invisíveis aos dois atores sob RLS. O FAIL residual histórico foi confirmado no estado anterior; a prova atual direta/view não o reproduz.
- Evidência independente recebida do Codex, separada da prova própria: repetição de `stock-p1-transactional-proof` own 1/1, cross 0/0, órfão 0/0, **11 negações**, cleanup 0 e mesmos hashes. Não somar às quatro negativas próprias do complemento nem chamar isso de E2E.
- ACL viva revalidada: **23 DEFINER**, anon executáveis **0**, authenticated executáveis **0**, service executáveis **23**. Nenhuma liberação. Estoque/entrega/cockpit/comprovante/rastreio/etiquetas permanecem indisponíveis nos pontos contidos; isso mantém **NO-GO operacional/integral**, mesmo com **PASS focal RLS/views/referências/preservação**. Browser por perfil/plano, RPCs funcionais, Edge/Storage/dinâmico continuam UNVERIFIED.
- Alterações locais limitadas: reprodução agora gera run_id UUID único automaticamente, e um teste estrutural exige run_id/manifesto. SHA-256 atual do script `scripts/rbac-audit/stock-p1-movements-proof.sql`: `cbe502779539e2dc2fd951e9509cace4721fa7eb1f2ae92cd6fa7b28fbb6c3e7` (substitui somente o hash antigo do script; migrations imutadas). **242/242 testes PASS em 17 arquivos** estoque/entregas; lint focal, scanners fiscal-secrets/fiscal-integration e diff-check PASS. Build automático **OK 02:49:27 UTC**; typecheck separado **NOT RUN**, execução manual vedada pelo harness. Nenhum PASS de typecheck inferido.
- Rollback documental anterior mantido: não remover isolamento nem reconceder ACL automaticamente; preferir forward-fix específico autorizado com prova. Sem publicação frontend, deploy, Auth, assinatura, comunicação externa, alteração de linhas reais ou fase seguinte. Commit final gerido pelo ambiente; hash acima identifica checkout observado, não commit manual desta edição.

### Complemento residual histórico/views — fechamento 02:44 UTC

- Reteste independente recebido: dois movimentos visíveis aos dois admins. Pré-prova própria sem iat retornou AR Bio=2/FSF=0 direto/view, pois readiness FSF falhava fechado; não substitui relato com claims completos nem prova isolamento. Identidades confirmadas: AR Bio `a7d45277-6dec-413d-bf6b-86620c1ef39f`, FSF `cbdc4ef3-005a-4674-8ea3-4410c7d7d212`.
- **Migration oficial adicional `20261008024032` aplicada no canônico**, arquivo `supabase/migrations/20261008024032_daf0ffb8-65f0-4dc1-a52c-f216705b9198.sql`, SHA-256 `52fd794b44d568582ec8d368a9f5086d32af0364d2b8d0afab48e9d9f2be03a5`. Anterior não reaplicada. Policy `stock_p1_mov_tenant_isolation` RESTRICTIVE FOR ALL USING/WITH CHECK; helper privado DEFINER `stock_p1_movement_owned` verifica par estoque/lote e reutiliza `stock_p1_lote_owned`; wrapper público INVOKER, EXECUTE negado PUBLIC/anon.
- `a00_stock_p1_movement_guard`/helper privado `stock_p1_movement_guard` valida ator ativo, parent/lote, cliente/OS, origem do movimento, entrega/estoque/OS referenciados. Novo movimento sem lote herda apenas lote comprovado do parent; nenhum backfill nem inferência de organização. Referência desconhecida contida com `ESTQ_MOV_REFERENCE_UNSUPPORTED` pode causar indisponibilidade adicional. Append-only UPDATE/DELETE preservado. Views continuam security_invoker e herdam RLS, sem reescrita.
- Seis DEFINER que referenciam movimentos auditados: rpc_entrega_cancelar_v1, fn_ledger_append_only, log_estoque_movimentacao, fn_entrega_confirmar_engine_v1, rpc_estoque_operar_v1, rpc_estoque_reservar_v1. Contenção cliente anterior mantida, sem regrant; ACL service não certifica leitura service/bypass RLS. Dinâmico/Edge/Storage seguem UNVERIFIED.
- **Prova própria SQL claims+iat/SET LOCAL ROLE authenticated, não browser/API:** A/B histórico próprio direto=1/1, view=1/1; cruzado direto/view=0/0; órfão direto/view=0/0; view estoque órfão=0/0. Quatro INSERTs privilegiados com ator B negados 42501: lote divergente, estoque A, origem movimento A, referência estoque A. Cliente/OS/entrega cobertos estruturalmente, não todas negativas runtime.
- Tentativas anteriores revertidas: setup sem envase 23514; sem iat 42501 readiness; lote B criado ainda com claims A tenant_scope_violation. Nenhum guard relaxado. Setup final conjunto CQ/envase e claims+iat passou e atingiu **P0001 MOV_P1_POST_ROLLBACK** após todas assertions; erro final deliberado reverteu tudo.
- Manifesto `TEMPORARY_AUDIT_STOCK_MOV_P1_20261008T0247`: lotes `d2171626-88fc-409f-9e67-3a881d5be7a7`,`f8e08d80-a727-41b8-8adc-93fc398972d9`; envases `d9b95713-9740-446b-8842-2bf7f35391bc`,`9859f200-b63f-4f0e-94f1-fc58de55a586`; estoques `0cffdf93-58ed-4298-8a8f-fb15ab2fbad8`,`e84f015e-2d06-40f3-8176-7406f82262c2`; movimentos `9b475b45-920c-41c9-8502-86598338f11a`,`efcfb8ec-2c49-4bd3-abce-3ca8cb664000`; CQ derivado destes lotes. Consulta independente pós-rollback lote/envase/CQ/estoque/movimentos=**0/0/0/0/0**.
- Hash comparável `md5(string_agg(to_jsonb(t)::text,'' ORDER BY id))` confirmado antes/depois: estoque **1 / `0c1a052173a564454cd51e69fcb72947`**, movimentos **2 / `f8b6fcf6aa756d745eaf205f606f7795`**. Hash histórico com outra serialização não comparável. Órfãos preservados/invisíveis; sem cleanup destrutivo. Sequências podem avançar em rollback.
- Reprodução `scripts/rbac-audit/stock-p1-movements-proof.sql`, SHA-256 `5ef541ee24c496503bb96c0657f53caf899d05436674b4037a40c6fdf9c853d1`: equivalente revisado com CQ/envase/iat, não transcrição literal; exige novo run_id/autorização antes de reexecutar.
- **PASS focal RLS/views e quatro negativas trigger; NO-GO operacional/integral.** 23 DEFINER cliente continuam contidos: estoque/entrega/cockpit/comprovante/rastreio/etiquetas indisponíveis nesses pontos; negação universal não é PASS funcional. Browser perfil/plano, RPCs funcionais, Edge/Storage/dinâmico UNVERIFIED. Sem publicação, Auth, assinatura, comunicação externa ou fase seguinte.
- **Rollback adicional documental não executado:** nunca remover policy/guard ou reconceder RPCs automaticamente. Manter negações em incompatibilidade; forward-fix específico autorizado deve provar own/cross/órfão/referências e preservar hashes antes da liberação. Não atribuir organização ao legado por inferência.
- Validações próprias adicionais: **168/168 PASS em 13 arquivos**, estoque/RBAC/quatro suítes multiportal, incluindo três novas assertions estruturais (sete testes no arquivo de contenção); lint focal/scanners fiscal-secrets/fiscal-integration/diff-check PASS; build automático **OK 02:44:13 UTC**. Typecheck separado **NOT RUN**, execução manual vedada pelo harness; não inferir PASS. Migration tool informou **444 findings preexistentes**, sem novos atribuídos: 17 RLS INFO, 2 DEFINER público, 424 DEFINER authenticated, 1 senha vazada OFF; não corrigidos fora do escopo. Revisão observada durante verificações `fd7a433c2d0318c374180650bacebedf91916e21`, commits geridos pelo ambiente, nenhum commit manual.

### Diagnóstico/aplicação

- Destino confirmado antes das operações: `swzpzcwiasxmjutrmvkm`. Pré-prova própria SQL com claims reais AR Bio/FSF e SET LOCAL ROLE authenticated: ambos liam o órfão `000cd77c-506c-4cdf-b2bd-7233aff8efeb` (1/1); transação revertida por exceção deliberada. Confirma vazamento RLS, não browser/API autenticada. Bloqueio de plano na UI não autoriza banco.
- Estoque sem organization_id/policy tenant RESTRICTIVE; lote/programação/cliente sem organização determinística. Não atribuir ownership por expedido_por. Leitores DEFINER/operadores/reserva/replay por ID sem escopo foram auditados, incluindo 15 referências diretas e fechamento textual de callers; SQL dinâmico não tem cobertura integral garantida.
- Migration oficial aplicada **ledger `20261008022948`**, arquivo `supabase/migrations/20261008022948_3e92d4d7-cfe5-477b-b100-70f5eeff24d6.sql`; SHA-256 `b2c0c1ccf289e390083e9d438266239abcca9233471f72f189a0c5a64dc79416`. Primeira tentativa falhou por alias PL/pgSQL `f` não atribuído; consulta confirmou ausência de policy/trigger. Alias corrigido para `candidate` antes da aplicação bem-sucedida. Não duplicar/reaplicar ledger.
- `platform_private.stock_p1_lote_owned` usa auth.uid e `h15_actor_organization`, wrapper público INVOKER. Policy `stock_p1_tenant_isolation` RESTRICTIVE FOR ALL exige organização explícita do lote igual à organização ativa do ator em **USING+WITH CHECK**. Sem backfill/inferência, preserva órfãos invisíveis.
- Trigger `a00_stock_p1_tenant_guard`/`platform_private.stock_p1_guard` valida ator, lote OLD/NEW e programação/envase (mesmo lote/org), cliente, partner/order por helpers B2B e OS manual/B2B/onfarm. Falha fechada também para executor privilegiado sem ator. Guards/contexto/movimentação e corpos de negócio existentes preservados.

### ACL/impacto preciso

Contenção específica por **revogação de entradas cliente**, não reescrita dos motores: impede entrar no corpo antes de leitura/replay, mas não certifica replay funcional. Catálogo pós-aplicação: **23 DEFINER**, todos anon=false, authenticated=false, service_role=true:

```text
d51_5_p0d_ab_selftest()
fn_comprovante_entrega_montar_v1(uuid)
fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)
fn_estoque_produto_guard()
fn_validate_entrega_estoque()
fn_validate_envase_volume()
log_estoque_movimentacao()
reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)
rpc_cockpit_cancelar_reserva_v1(uuid,uuid,text,text)
rpc_cockpit_confirmar_entrega_v1(uuid,uuid,text,jsonb)
rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)
rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text)
rpc_criar_embalagens_pos_envase(jsonb)
rpc_entrega_cancelar_v1(uuid,text)
rpc_entrega_confirmar_v1(uuid,jsonb,jsonb)
rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)
rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)
rpc_gerar_etiqueta_produto(jsonb)
rpc_gerar_etiquetas_embalagens_lote(jsonb)
rpc_get_comprovante_entrega_data(uuid,boolean)
rpc_rastreio_produto_interno(uuid)
rpc_substituir_etiqueta_produto(uuid,text)
validate_estoque_entrada()
```

- **Indisponibilidade conhecida:** clientes não podem chamar estes RPCs de estoque/entrega/cockpit/comprovante/rastreio/etiquetas até hardening individual aprovado. Triggers continuam disparando independentemente de EXECUTE cliente. ACL service preservada não torna leitores service seguros: bypass-RLS permanece. Nenhum service token foi usado como identidade cliente.
- `src/hooks/useEsteiraLaboratorio.ts` mantém insert direto legado; INSERT/UPDATE/DELETE authenticated já sem privilégios, não foram abertos. `supabase/functions/entrega-runtime-harness/index.ts` cria/deleta estoque por service sem ator; novo guard bloqueia setup/cleanup desse canal. Harness não executado nem alterado/deployado; não liberar bypass. Nenhum fluxo paralelo criado.
- Fechamento textual prosrc pode omitir referências dinâmicas. Não declarar cobertura total de API/Edge/Storage ou todos leitores service. Papéis/planos/guards não ampliados.

### Prova e manifesto

- Setups anteriores revertidos: item do lote inválido; envase sem CQ aprovado; INSERT authenticated negado por ACL preexistente. Não concedido INSERT para fazer prova passar. Setup final usou item ativo, lotes/CQ aprovado/envase; estoque pelo executor com claims de ator existente, nunca mutação de linha real.
- `run_id=TEMPORARY_AUDIT_STOCK_P1_20261008T0237`, admins AR Bio/FSF: leitura RLS own=1/1, cross=0/0, órfão=0/0. Update próprio privilegiado com ator A=1; **11 negações**: insert cruzado, reparent lote, envase cruzado, três RPCs, update/delete cliente cruzados nos dois sentidos e update privilegiado B→A. Escritas cliente negadas por **ACL**, não prova isolada WITH CHECK. Programação/cliente/partner/OS verificadas estruturalmente, não todas exercitadas runtime.
- Exceção esperada `P0001 STOCK_P1_PROOF_ROLLBACK` ocorreu após todas assertions: erro da ferramenta é reversão deliberada, não falha das assertions. Manifesto:

```text
lotes: 1a6acf4f-a9d4-4f7c-90ee-5f477e495c08, c5098ec0-7118-45cc-aa20-47bc38e8df27
envases: 20fd674e-8584-4080-91d9-4d1ce3326bfb, 73b62137-2c78-49a9-b419-4ea273838200
estoque: 904db36a-3a09-4a26-b6e2-74861910329d, 802a12dc-ae7e-4f0c-bb82-eaf4724219b4
CQ/movimentações: derivados somente destes lote/estoque IDs
```

- Leitura independente pós-rollback: lote/envase/CQ/estoque/movimentação fixtures **0/0/0/0/0**. Estoque real **total=1**, MD5 agregado rows **`be36d9a5734010a68dbc8639f2bae1d4`** antes/depois idêntico. Órfão preservado/invisível aos dois atores. Sequências podem avançar apesar de rollback; não se afirma identidade global do banco. Não houve cleanup destrutivo.
- Reprodução revisada `scripts/rbac-audit/stock-p1-transactional-proof.sql`, SHA-256 `9b2139ae42198b4f544370a8a37ccf8f7f185bc49f59161e824a2541d90da822`: mesmos cenários, não transcrição byte-a-byte da chamada executada. Reexecutar somente com novo run_id/destino verificado/autorização; nunca remover exceção final.

### Resultados/limites/rollback seguro

- Regressão inicial própria estoque/RBAC/multiportal **124/124 PASS em 11 arquivos**; final **124/124 PASS em 11 arquivos às 02:35:23 UTC**, incluindo os **4 novos testes** `src/test/estoque/stock-p1-containment.test.ts` (seleção final não incluiu o arquivo security da seleção inicial; contagens não são aditivas). Lint do novo teste, scanners fiscal-secrets/fiscal-integration e diff-check **PASS**. Build automático **OK 02:35:18 UTC**. Estrutural não substitui SQL nem browser. Revisão observada após estas verificações: `4fe3f46513d0c31389cf84d8f87c873edd3a0452`.
- Linter remoto: **444 achados / 4 classes** (17 RLS sem policy INFO, 2 DEFINER público WARN, 424 DEFINER authenticated WARN, 1 proteção senha vazada WARN); não certificados como exploração nem corrigidos fora do escopo. Build automático **OK 02:33:50 UTC**; typecheck separado **NOT RUN** (manual vedado pelo harness).
- **PASS focal SQL leitura/trigger/ACL/preservação; NO-GO operacional/integral**: RPCs contidos aguardam hardening individual anterior a leitura/replay e prova autenticada por perfil/plano; referências dinâmicas/Edge/Storage UNVERIFIED. Sem frontend funcional alterado/publicado, Auth/assinaturas/preços/dados reais modificados, comunicação externa ou próxima fase. D52 preservado. Revisão observada antes do fechamento `dce10dc8dbd578b9a7d80eb6f1e8a4ff042dbbe6`, gerida pelo ambiente; nenhum commit manual.
- **Rollback documental não executado:** nunca remover policy/guard nem restaurar EXECUTE cliente automaticamente, pois reabriria vazamento. Manter negações em incompatibilidade. Migration substitutiva futura deve autorizar ator/recurso antes da leitura/replay, validar referências, provar own/cross/órfão e só então liberar assinatura específica. Restaurar corpos somente de fonte/hash auditados sob autorização; nenhum backfill/inferência. Nenhuma SQL de reabertura executada.

## Rótulo do portal — P2 apresentação — 2026-10-08 02:11 UTC (histórico)

- **Evidência UI recebida:** administrador real AR Bio com somente papel administrador abre `/app` e vê Consultor Técnico/consultor em cabeçalho/menu/saudação. Relato do proprietário, não nova sessão autenticada deste executor; apresentação incorreta não prova alteração de papel ou falha de autorização.
- **Correção mínima:** retirada somente da linha `if (activeCtx === "technical") return ROLE_LABELS.consultor_tecnico` em `src/lib/portalDisplayLabel.ts`. Sem papel técnico real, usa o fallback já existente do papel primário ou `—`. Precedência técnica real, multipapel, B2B e produtor preservados. Sem guards/RLS/papéis/acesso mobile/banco ou publicação. Correção MeuPlano da revisão `943710ceff2da573a6390fbd86f9b53427cb168e` preservada.
- **Resultados próprios:** **29/29 PASS em 4 arquivos** às 02:12:43 UTC: portalDisplayLabel 9, cabecalhoContexto 7, MeuPlano lógica 8/renderização 5. Quatro novos casos cobrem administrador e saudação, ausência de papel, multipapel técnico e B2B/produtor. Lint nos dois arquivos alterados, scanners segredos/integração e diff-check **PASS**. Build automático **OK 02:12:39 UTC**. Testes locais/estruturais, sem prova browser autenticada pós-correção.
- **Rollback local:** reintroduzir exclusivamente a linha retirada se necessário, após revisão e testes; isso restauraria o defeito de apresentação conhecido. Nenhuma reversão executada, sem tocar a correção MeuPlano ou regras de acesso.
- **Arquivos:** `src/lib/portalDisplayLabel.ts`, `src/lib/portalDisplayLabel.test.ts`, `roadmap.md` e este relatório; nenhuma nova arquitetura. Revisão final no encerramento. P2 validado localmente, não publicado; **NO-GO integral mantido**, sem iniciar outra grande fase.

## Meu Plano — P2 de exibição — 2026-10-08 (histórico)

- **Achado:** proprietário reproduziu no publicado, em sessão real do administrador AR Biotecnologia, ausência de assinatura simultânea a Gestão / Período de teste / Vinculada. Evidência recebida, não novo browser autenticado deste executor. Não comprova regressão de status.
- **Causa/correção local:** `EstadoConsulta` incondicional em `MeuPlanoTab.tsx` retornava mensagem de ausência apesar de `assinatura.data`. Renderização limitada a `carregando || erro || !assinatura.data`; consultas, status e detalhes válidos preservados. Nenhuma mudança banco/Auth/permissões/plano/preço ou publicação.
- **Verificações próprias:** suíte SaaS **512/512 PASS, 47 arquivos**, às 02:05:03 UTC (23,10s), incluindo **5 testes novos de renderização**: assinatura válida, ausência real, loading e erro/retry com/sem dados. Testes locais mockados, não evidência E2E nem mudança server-side. Lint nos dois arquivos alterados, scanners segredos/integração e diff-check **PASS**. Build automático **OK 02:04:58 UTC**. Typecheck `tsconfig.app.json` separado **NOT RUN**, execução manual vedada pelo harness; não alegar PASS.
- **Arquivos:** `src/pages/configuracoes/MeuPlanoTab.tsx`, `src/test/saas/meuPlanoTab.render.test.tsx`, `roadmap.md` e este relatório. Sem decisão arquitetural nova, sem outra fase. Revisão final informada no encerramento.
- **Decisão:** correção P2 validada localmente; não publicada nem verificada novamente na sessão real. **NO-GO integral da auditoria permanece**; histórico D51.6/D52 preservado.

## Correção focal de sessão — 23:00 UTC (histórico)

**NO-GO integral permanece.** Somente código, testes e documentação locais; nenhuma operação SQL, Auth, migration, Storage, fixture, exclusão, publicação ou deploy remoto neste executor; sem subagentes. Alterações anteriores preservadas.

### Incidente e contenção parcial — evidência independente Codex

O proprietário reportou `admin@arbio.com` removido; Codex confirmou Auth e profile ainda existentes, perfil ativo, administrador do tenant **CultivoFarm**, sem convite plataforma e zero sessões. Com autorização de desativação e posterior remoção, Codex aplicou exclusivamente `profile.ativo=false` e remoção do papel administrador; verificou `access_ready=false`, `has_role administrador=false`, zero papéis e zero sessões. **Auth NÃO foi excluído.** Referências financeiras/entregas e um objeto Storage impedem remoção segura; dashboard Supabase aberto na conta Refil sem acesso ao projeto. Não contornar vínculos/imutabilidade. É o único administrador operacional CultivoFarm; não atingiu Superadmin ou AR Bio. Estas informações foram recebidas, não reconsultadas por este executor.

Migration histórica `20260625145234_2039da42-e7cd-4e34-aebe-1ff6dbbf88c7.sql` contém senha literal reportada: não reproduzida, lida ou reaplicada nesta rodada. Scanner focal não certifica saneamento de todo o histórico.

### Correção e limites

`useAuth.tsx`: troca A→null também conta como mudança de identidade; TOKEN_REFRESHED/USER_UPDATED limpam contexto, cache e papéis mesmo no mesmo UID. SIGNED_IN/INITIAL_SESSION repetidos continuam deduplicados. Releitura usa o `scheduleLoad` existente, fora da pilha do callback síncrono; geração/StrictMode preservados, sem novo fluxo/permissão.

Preview **Superadmin autenticado**, conforme escopo reportado Codex, não equivale a autenticação no publicado, que permanece em `/auth`; nenhuma prova browser própria nesta rodada. Revalidação em renovação/atualização **não garante revogação imediata de JWT ou proteção de todas APIs**; autoridade final permanece server-side. Contenção parcial não é exclusão completa nem certificação integral por perfil/plano/RPC/Edge/Storage.

### Verificações próprias — resultado final

Reprodução local com quatro casos novos: **17 PASS / 4 FAIL** antes da correção (logout/cache, renovação, atualização, papel revogado). Evidência Codex de 17 PASS/2 FAIL→19 PASS é independente. Primeira regressão própria após correção: **938 PASS / 2 FAIL**, ambas expectativas textuais antigas em D51.4/D51.5; ajustadas para exigir a nova condição ampliada, sem reduzir proteção.

- Reexecução própria **940/940 PASS em 84 arquivos**, às 23:04:05 UTC, duração 32,01s; Auth callback **21/21 PASS**, incluídos no total. Cobertura Auth/topologia, StrictMode/corridas, multiportal/mobile, PortalGuard, RBAC, SaaS e security; provas locais mockadas, não login/RLS real.
- Lint incluindo authProviderCallback: **FAIL**, 17 erros `no-explicit-any` preexistentes no mock e 3 warnings baseline em useAuth. Nenhum any novo ou regra desativada. Lint fonte useAuth + duas regressões estruturais: **0 erros / 3 warnings**, saída 0; não confundir os escopos.
- Scanners segredos/integração e diff-check **PASS**; build automático **OK 23:03:58 UTC**. Build/typecheck manuais não executados por restrição do harness; nenhuma nova certificação de typecheck.
- Arquivos desta correção: `src/hooks/useAuth.tsx`, `src/test/config/authProviderCallback.test.tsx`, `src/test/security/d51-4-tenant-users.test.ts`, `src/test/security/d51-5-p0c-portal-users.test.ts`, `AGENTS.md`, `roadmap.md` e este relatório. Regra Auth registrada; demais regras mantidas com redação compacta para limite do arquivo.
- Revisão observada antes do fechamento documental: `7cb8ae7cfbfe0f1d0fa10171dc43cfd61f6315e8`; SHA final informado ao encerrar, sem criar commit manual.
- Pendências: browser real de cada perfil/plano e cobertura RPC/Edge/Storage; exclusão Auth dessa conta continua não realizada, bloqueada pelas dependências relatadas, sem contorno autorizado nesta rodada. **NO-GO integral**.

## Atualização A03/A05 — 22:33 UTC (histórico)

**A05 PASS focal SQL/RLS; A03 contenção ACL PASS; NO-GO integral.** Baseline local confirmado `903fb41e321d12cebea991864a6c3ecb09864015`. A correção foi aplicada pelo **executor independente Codex**, no Supabase canônico `swzpzcwiasxmjutrmvkm`, migration `audit_a03_a05_tenant_containment`, ledger `20261007222943`. Este executor não executou SQL nem reaplicou migration; não criou dados, Auth, tenants/assinaturas, cobrança, fiscal ou e-mails, não publicou/implantou, não usou subagentes nem iniciou outro módulo.

### Evidência independente recebida — não é login/browser

- Prova SQL/RLS com duas identidades administradoras existentes de tenants distintos: A05 antes da correção **before_cross=1**, leitura cruzada comprovada sobre registro temporário. P0 A05 comprovado e corrigido focalmente; não extrapolar a outras tabelas/papéis.
- Candidato e pós-aplicação: `own=1, cross=0, cross_update=0, cross_delete=0, own_update=1, forged_insert_denied=true, reparent_denied=true, rpc_denied=true, b_own=1, b_cross=0`. Pós-aplicação `before_cross=0`.
- Exceção deliberada SQLSTATE `P0001`, marcador `A03_A05_ROLLBACK_RESULT`, reverteu fixtures e política candidata integralmente. Reconsulta independente: `clientes=2, registros_consultor=0, fixtures=0`. Nenhum tenant, assinatura ou usuário Auth criado.
- Introspecção independente confirmou `audit_a05_tenant_isolation` **RESTRICTIVE ALL**, com USING/WITH CHECK por cliente → organização do ator `h15_actor_organization()`; políticas existentes de papel/vínculo continuam intersectadas, sem feature/papel novo. Legado NULL/sem dono permanece fail-closed.
- A03: ACL `authenticated/anon=false` após revogar EXECUTE de PUBLIC, anon, authenticated em `set_partner_user_papel(uuid,text)`. Contenção da RPC legada DEFINER sem autorização do alvo; **não há exploração A03 afirmada**. Função, dados, service ACL e gestão canônica preservados. Busca própria em `src` confirmou somente declaração não consumida `useUpdatePartnerUserPapel` em `usePartnerUsers.ts` além dos tipos gerados; sem consumidores do hook. Clientes atuais e usuário partner sem organização: não atribuir tenant por inferência.

### Sincronização e reprodução local

- SQL exato recebido preservado em `restoration/audit-a03-a05/20261007222943_audit_a03_a05_tenant_containment.sql`, **não executado**. O arquivo solicitado `supabase/migrations/20261007222943_audit_a03_a05_tenant_containment.sql` ainda não foi criado: regra do ambiente proíbe criar/copiar migrations com ferramentas de arquivos; a ferramenta aplicadora não oferece sincronização somente local conhecida e não foi acionada para evitar reaplicação. Importação local pelo executor permanece pendente, não alteração remota.
- Script de reprodução exato recebido: `scripts/rbac-audit/a05-transactional-proof.sql`, **não executado**. Contém claims SQL locais, SET LOCAL ROLE, fixtures temporárias/candidato condicional e exceção final; é reprodução SQL/RLS, nunca sessão Auth/browser. Validar destino canônico antes de qualquer futura execução autorizada; não rodar como parte das verificações locais.
- Dois ajustes locais: `useAuth.tsx` catch `any` → `unknown`, sem mudança de comportamento; `sourceFiles` normaliza `join(root, entry.name).replace(/\\/g, "/")` antes de recursão/comparações. Teste de portabilidade usa código real transpilado com semântica `win32.join`; nenhuma alteração de guard.
- Rollback: **não** reconceder a RPC nem remover isolamento automaticamente. Preferir contenção fail-closed + forward-fix; registrar reversão somente com substituto testado. Não reabrir D52.

### Evidência do executor Windows e advisors — proveniência independente

Codex: `tsc --noEmit -p tsconfig.app.json` PASS; Vite build PASS **30,72s**, chunk App ~**5,7MB**; SaaS/RBAC/security **833 PASS / 1 FAIL** (`h9f-pacote-e-gate`, bash ausente no Windows), falha não mascarada. Lint antes do ajuste: 1 any + 3 warnings em useAuth. Advisors atuais reportados: **460** achados — 17 INFO sem policy, 2 WARN anon DEFINER, 440 WARN authenticated DEFINER, 1 WARN leaked passwords. Não equivalem a 460 explorações nem foram reconsultados por este executor.

### Browser e decisão

**Codex controla Chrome do proprietário.** Domínio oficial está em `/auth`, login solicitado; iframe preview mostra Administrador e indicadores Indisponível, o que **não comprova identidade server-side**. Não confundir acesso ao navegador com login comprovado nem afirmar ausência de acesso Codex. Browser por perfil/plano e cobertura completa RPC/Edge/Storage continuam **UNVERIFIED**; NO-GO integral, separado dos PASS focais SQL/RLS e ACL. Histórico abaixo retrata rodadas anteriores e não reabre A03/A05 como descobertas ainda sem contenção atual.

### Verificações próprias desta rodada

- Suíte própria SaaS/RBAC/security/navegação: **928/928 PASS, 85 arquivos**, incluindo dois testes novos de portabilidade, às 22:36:20 UTC. Primeira tentativa: 926 PASS/2 FAIL no teste novo (mocks de script externo não transformados); corrigido para executar código real transpilado com win32.join e reexecutado integralmente. Falhas iniciais não mascaradas.
- Lint focal `useAuth.tsx`, inventário e teste: **0 erros / 3 warnings** baseline em useAuth, saída 0. Scanners segredos/integração e `git diff --check`: **PASS**. Build automático observado **OK 22:36:13 UTC**. Typecheck próprio **NOT RUN** (manual vedado pelo ambiente); PASS Windows independente, não próprio. Advisors não reexecutados.
- SHA observado após ajustes/documentação inicial: `5ad90fd97cf61f2ab163abfd48d0f488361a5fd4`, não presumido final das edições posteriores; Git gerenciado pelo ambiente.
- SHA-256 cópia SQL: `1aa1a9295c6471110eb12e347006fd992c21a50e3c4004b37354e0dc2060b404`; reprodução: `b20aa55b903101fef1e6c3f19add2de8242537001769b75c15d03d5dedf337e1`.
- Arquivos: `src/hooks/useAuth.tsx`, `scripts/navigation-audit/inventory.ts`, `src/test/navigation/inventory-portability.test.ts`, `scripts/rbac-audit/a05-transactional-proof.sql`, cópia SQL em `restoration/audit-a03-a05/`, relatório, `roadmap.md` e regra em `AGENTS.md`. Pasta migrations não alterada; importação local pendente pela restrição acima.

## 1. Decisão e limites

### Rodada autorizada de fixtures — 21:44 UTC (histórico)

**BLOCKED antes da primeira escrita; NO-GO funcional.** Autorização expressa registrada, run reservado `AUDIT-RBAC-20261007-20261007T214515Z` e manifesto sanitizado `fixtures-rbac-20261007T214515Z.manifest.json`. A autorização permite fixtures e correções mínimas comprovadas; o bloqueio **não é falta de autorização**. A rodada anterior abaixo permanece histórica.

- Destino comprovado via `lovable supabase info`: produção externa `swzpzcwiasxmjutrmvkm`, URL canônica, `managed_by_lovable=false`. Ambiente URL coincide; sem `PGHOST`, chave Auth Admin ou sessão gerenciada disponível. Nenhuma reconfiguração/rebind foi efetuada.
- Mecanismo oficial tentado: `lovable auth-session --json --self` retornou `failed_precondition`: Supabase externo não permite emissão de sessão pelo Lovable. Catálogo oficial não oferece secure handoff/Auth Admin; nenhum `editor_url` disponível. Não foram pedidas credenciais em texto ou simulados JWTs, login, mocks browser ou RLS autenticada.
- **Cleanup persistente incompatível:** introspecção atual confirmou `organization_subscriptions_no_delete_trg`, `trg_org_subscriptions_no_delete` e três triggers no histórico. `saas_no_delete`, `saas_history_no_mutation` e `saas_subscription_no_delete` rejeitam exclusão/alteração sem exceção de fixture; FKs do histórico para organização/assinatura são RESTRICT. Nenhuma RPC de purge/cleanup de organizações foi encontrada na consulta focal. Criar quatro assinaturas persistentes agora não garante removibilidade. Não desabilitar triggers/RLS nem mudar a imutabilidade D52 para contornar isso. Arquivamento/cancelamento não é exclusão física.
- **Entrega externa não certificada OFF:** fontes têm modo `senha_temporaria` e envio de convite por link; `manual_link` é expressamente rejeitado antes de provisionar (`manual_link_disabled`). Não usar branches posteriores inalcançáveis como entrega segura disponível. Configurações remotas Auth/SMTP/flags de comunicação não foram lidas com sucesso; criação/convite/signup não executados.

#### Dependências canônicas inventariadas

| Etapa | Fluxo real | Dependência/gate atual |
|---|---|---|
| Organização | `useCriarEmpresa` → `platform_create_organization` INVOKER → `platform_private.create_organization_core` | Superadmin real; campos cadastrais; ticket server-side; UI mantém revisão CNPJ. Core valida DV/plano ativo, cria organização/auditoria, **não cria assinatura** |
| Assinatura versionada | `platform_transition_subscription` com organização/ação/motivo/correlação/versão publicada | Actor Superadmin, snapshot publicado, histórico imutável; nenhuma transição executada |
| Administrador | `platform-invite-org-admin` | Bearer real, Superadmin server-side, Auth Admin interno; senha temporária versus envio ao titular. Não existe handoff automático aprovado disponível nesta sessão |
| Dez internos | `create-user` | Admin autenticado da fixture; tenant derivado do ator e allowlist; não permite perfis externos por este cadastro |
| Produtor | `admin_provision_user_profile_v1`, `user_clientes`, `profiles.cliente_id`, cliente/fazenda/talhão | Auth real e vínculos no tenant correto; fixture não criada |
| Parceiro/técnico B2B | Provisionamento/vínculos `partner_users`, `partner_user_clients`, organização↔parceiro | Validar proprietário/escopo antes de escrever; A03 continua prioritário |
| Superadmin | Identidade real já homologada | Não criado segundo Superadmin; primeira identidade que precisa de autenticação segura para provisionar |

Propostas delegadas de SQL direto em Auth, GUC sintético, mock browser ou associação de assinatura SaaS a assinatura fiscal foram descartadas: não são fluxo válido nem prova real.

#### Baseline e limpeza

Manifesto contém contagens e hashes integrais sanitizados: organizações 5, perfis 8, papéis 8, assinaturas 5, histórico 20, vínculos partner_users 1, registros_consultor 0. Os cinco agregados iniciais foram relidos após preflight e permaneceram **idênticos**. Isso não substitui snapshot global nem prova RLS. Criados **0** usuários Auth, **0** organizações, **0** assinaturas, **0** vínculos/objetos Storage. `created=[]`, `temporary_audit_remaining=[]`; cleanup desta rodada é no-op, sem DELETE amplo ou transação destrutiva. Nenhuma credencial provisória gerada.

#### Decisão por perfil/plano

| Grupo | Plano | Estado desta rodada | Próxima evidência |
|---|---|---|---|
| Admin + segundo interno Base | Base vigente 3 features | BLOCKED | Fixture versionada removível/retention acordada + Auth real |
| Admin + segundo interno Essencial | Essencial vigente 8 | BLOCKED | Idem; TRIAL real |
| Admin + segundo interno Gestão | Gestão vigente 10 | BLOCKED | Idem; TRIAL real |
| Dez internos Completo (administrador, gestor, gestor_comercial, financeiro, administrativo, producao, operador_onfarm, tecnico_agronomo, consultor_tecnico, aplicador) | Completo vigente 17 | BLOCKED para cada papel | Contexto/vínculos, browser allowed/denied/forbidden, mutações e isolamento |
| cliente_produtor, parceiro_b2b, parceiro_b2b_tecnico | Completo vigente 17 | BLOCKED para cada papel | Auth e vínculos próprios reais; desktop/mobile/Storage |
| Superadmin existente | Plataforma; não usar bypass tenant | BLOCKED browser | Sessão segura real do proprietário Superadmin |

Matriz técnica complementar: `matriz-fixtures-rbac-20261007T214515Z.csv`, 179 linhas reaproveitadas do inventário AST. Componentes/guards/roles/features são **estruturais**; contratos backend/RLS não rastreados por linha são UNVERIFIED/BLOCKED, nunca PASS inferido. Rotas públicas sem identidade: NOT_APPLICABLE somente para autenticação, não certificação integral. A03/A05 permanecem riscos prioritários; sem alvo descartável e Auth real, não houve exploração nem correção cega. `registros_consultor` vivo tem zero linhas, portanto não há leitura adversarial positiva possível sem fixture.

#### Validações desta rodada

- Suíte pertinente: **829/829**, 75 arquivos (`saas`, `rbac`, `security`; diretório routes sem testes adicionais).
- Novo teste do manifesto: **5/5**; conjunto focal com create-user/D51.6/D52: **43/43**, 5 arquivos, incluindo 20 testes mockados do handler. Não somar focais sobrepostos à pertinente como total único; novo arquivo foi criado após a execução pertinente.
- Lint focal novo manifesto + handler/Storage/RBAC: PASS. Scanners fiscal secrets/integration: PASS. Nenhum código funcional alterado, dependência adicionada ou DDL aplicado; advisors pós-DDL NOT_APPLICABLE. Typecheck frontend separado NOT RUN (vedado manualmente pelo ambiente), sem inferir PASS a partir de testes. Diff-check PASS; build automático OK às 21:51:19 UTC.

**Ponto de parada:** autenticar com segurança o **Platform Superadmin existente** para provisionamento; depois admin da fixture AUDIT Base, ou administrador existente AR BIOTECNOLOGIA para read-only enquanto fixtures estão bloqueadas. Para fixtures persistentes ainda é necessário um caminho homologado de remoção compatível com histórico, ou decisão explícita de retenção do histórico/tenants auditados; não prometer limpeza inexistente. Também comprovar serviços externos OFF sem alterar configurações reais. Sem publicação, Edge/migration, dados reais ou reabertura D52.

### Rodada anterior — registro histórico

**PASS estrutural/read-only focal; NO-GO para certificação funcional integral.** Browser autenticado: **UNVERIFIED/BLOCKED** (`external_unmanaged`). Não havia credenciais/sessões reais disponíveis neste executor. Nenhum login simulado, fixture, RPC mutável, migration, deploy, publicação ou alteração de dados naquela rodada. D52 não foi reaberto. Somente este relatório e `roadmap.md` foram alterados naquela rodada.

Baseline local observado: `edf34ae7b7ced624ddbd4a90ba4f113cf436d4de`. Destino canônico validado no cliente e config: `swzpzcwiasxmjutrmvkm`. Leituras remotas por SELECT; não houve prova transacional nova. O estado publicado não foi presumido idêntico ao HEAD local; o smoke abaixo testa o domínio publicado separadamente.

## 2. Estado vivo e matriz por plano

Leituras de assinaturas/snapshots e versões PUBLISHED v1 confirmaram:

| Empresa (baseline do proprietário) | Plano | Estado vivo | Snapshot | Browser real |
|---|---|---|---:|---|
| Refil | Base v1 | ACTIVE | 3 | BLOCKED |
| Homologação | Essencial v1 | TRIAL | 8 | BLOCKED |
| AR BIOTECNOLOGIA | Gestão v1 | TRIAL | 10 | BLOCKED |
| CultivoFarm | Completo v1 | ACTIVE | 17 | BLOCKED |
| FSF | Completo v1 | TRIAL | 17 | BLOCKED |

Nesta rodada a consulta agrupada comprova plano/estado/quantidade; a associação nominal é o baseline anterior do proprietário, não nova divulgação de IDs. Zero TRIAL expirado na consulta e zero overrides cadastrados. Não reinterpretar como `legacy_unversioned`: esse era diagnóstico histórico anterior à regularização.

| Feature | Base | Essencial | Gestão | Completo ACTIVE/TRIAL |
|---|:---:|:---:|:---:|:---:|
| fichas_tecnicas | Sim | Sim | Sim | Sim |
| recomendacoes_alertas | Sim | Sim | Sim | Sim |
| visitas_tecnicas | Sim | Sim | Sim | Sim |
| contas_pagar | — | Sim | Sim | Sim |
| contas_receber | — | Sim | Sim | Sim |
| fluxo_caixa | — | Sim | Sim | Sim |
| paineis_executivos | — | Sim | Sim | Sim |
| relatorios_operacionais | — | Sim | Sim | Sim |
| emissao_nfe_nfse | — | — | Sim | Sim |
| envios_automaticos | — | — | Sim | Sim |
| catalogo_precos | — | — | — | Sim |
| envase | — | — | — | Sim |
| estoque_embalagens | — | — | — | Sim |
| lotes_qualidade | — | — | — | Sim |
| ordens_producao | — | — | — | Sim |
| pedidos_b2b | — | — | — | Sim |
| simulacoes | — | — | — | Sim |

Cada Sim é elegibilidade comercial estrutural, **não** permissão do usuário ou prova de operação fiscal/entrega externa. A decisão efetiva intersecta sessão/contexto/tenant/vínculos, papel e plano; menu não autoriza. Rotas sem mapa não são automaticamente recursos de todos os planos: mantêm os guards específicos.

## 3. Papéis reais versus arquiteturais

`AppRole` possui 14 papéis; `ACTIVE_ROLES` 13 operacionais, excluindo Superadmin de plataforma. Contagens atuais de atribuições, sem identidade pessoal: administrador 4, aplicador 1, cliente_produtor 1, parceiro_b2b 1, superadmin 1. São atribuições, não prova de sessão ativa nem de perfil íntegro.

| Papel | Existente nesta leitura | Superfície candidata |
|---|---|---|
| administrador | Sim | Operação por ACCESS_MAP; suporte produtor/mobile; não vira Superadmin |
| aplicador | Sim | Técnico/mobile e operação por vínculos |
| cliente_produtor | Sim | Portal produtor/mobile por papel e cliente autorizado |
| parceiro_b2b | Sim | Portal B2B por vínculo/contexto e plano |
| superadmin | Sim | Plataforma por PlataformaGuard e autorização server-side |
| gestor | Não | Operação/gestão por ACCESS_MAP |
| gestor_comercial | Não | Comercial/B2B por ACCESS_MAP e escopo |
| financeiro | Não | Financeiro/fiscal por ACCESS_MAP e tenant |
| administrativo | Não | Operação/leitura por ACCESS_MAP |
| producao | Não | Produção por ACCESS_MAP e tenant |
| operador_onfarm | Não | Operação vinculada e mobile conforme guard |
| consultor_tecnico | Não | Técnico/campo por vínculos/contexto |
| tecnico_agronomo | Não | Técnico/campo por vínculos/contexto |
| parceiro_b2b_tecnico | Não | B2B técnico com projeções sem preço e vínculos |

Ausência é do agregado `user_roles` atual, não autorização para criar usuários. Matriz 4×10 anterior de create-user é estrutural; os outros papéis e o Superadmin não são implicitamente incluídos na allowlist tenant.

## 4. Inventário e guards

Fonte real: `src/App.tsx`; `src/routes/index.tsx` é placeholder inerte. AST/inventário existente, revalidado pelos testes: **179 declarações path/index, 178 caminhos distintos, 190 elementos Route, 106 itens de menu (83 navigation + 23 portais), 191 arquivos pages**. O mapa atual tem **38 prefixos/17 features**, não os 29/15 da contagem parcial delegada. Classificações: 97 com navegação declarativa, 25 aliases/index, 57 contextuais/internas. 129 declarações não têm feature de plano mapeada. Uma declaração não é necessariamente uma tela independente.

| Árvore | Cadeia de acesso | Limite da prova |
|---|---|---|
| Operacional desktop | ProtectedRoutes → RoleGuard → resolveEffectiveRouteRole → isPathEntitled | Fonte/testes; URL/dados autenticados pendentes |
| Plataforma | PlataformaGuard → validação Superadmin; RPCs plataforma | Não concede operação pelo simples papel de plataforma |
| Técnico mobile | AppPortalGuard → TechnicalFeatureGuard → EntitlementOutlet | RPC de contextos e vínculos permanece autoridade |
| Produtor mobile | AppPortalGuard → ProducerFeatureGuard | Recursos sem mapa preservam regras existentes |
| Portal B2B | Guard de contexto/vínculo → EntitlementOutlet | showFor/menu não substitui autorização |
| Portal produtor | PortalGuard (sessão + roles produtor/admin) → PortalLayout | Não há prefixo /portal no mapa atual |
| Públicas/sistema | Auth/recovery, validação/rastreio com token, 403/404 | Não expor rotas contextuais automaticamente |

Aliases/itens base checados contra App: nenhum menu órfão ou alias quebrado comprovado. Redirects preservam query/hash pelo contrato existente; os destinos reais precisam de sessão para homologação. `ForaDoPlano` diferencia loading/error/no_subscription/no_context/blocked_status/trial_expired/legacy e ausência de feature; 403 e 404 têm fluxos próprios. Busca/atalhos e responsividade autenticados continuam UNVERIFIED, não certificados por cobertura de fonte.

## 5. Cache, backend/RLS, Storage e mutações sensíveis

- Troca de identidade/logout em `useAuth`: limpa cache/contexto antes de novo fetch; generation/ref evita aplicação de resultado de identidade anterior. Troca B2B/técnico cancela/remove queries focais e limpa seleção; contexto disponível vem da RPC, não do storage.
- `usePortalCliente`: seleção persistida só aceita cliente na lista retornada pelo servidor. Filtro cliente_id não é fronteira de segurança.
- Introspecção viva confirmou policies RESTRICTIVE de tenant em fazendas/entregas e nas fontes amostradas ordens/lotes/financeiro/fiscal. **registros_consultor é exceção: não possui policy RESTRICTIVE de tenant**; possui policies hardened permissivas com branches por vínculo e branches administrador/gestor sem escopo explícito (A05). Não generalizar o isolamento para essa tabela. A amostra não certifica todas as tabelas/RPCs do sistema nem substitui requisição autenticada.
- Remoto: cores `platform_private.has_role`/`h15_actor_organization` DEFINER com search_path fixo; wrappers públicos INVOKER. `get_my_entitlement_context`, transição de assinatura e listagem tenant observados INVOKER. ACL/corpos de todos os helpers não foram exaustivamente provados.
- Storage vivo: 11 buckets, 10 privados e `logos` público. Policies de clientes/financeiro usam helpers de posse, consultor exige prefixo organização, branding platform exige Superadmin, fiscal é privado. A existência dessas policies não prova download/upload cruzado negado em sessão real. Traversal tem testes unitários, não tentativa autenticada nova.
- `create-user`/list-portal-users e contratos administrativos foram cobertos pelos testes locais (incluindo JWT/tenant/compensação/lock); mocks/contratos não equivalem a chamada Edge autenticada. O deploy v62 anteriormente confirmado é evidência histórica independente, não reimplantação nesta rodada.

### Achados e decisões

| ID | Diagnóstico | Evidência/decisão |
|---|---|---|
| A01 | PortalGuard não aplica isPathEntitled; /portal não tem feature mapeada | Lacuna latente, **não bypass atual comprovado**. Não ampliar mapa/permissões por inferência; sem correção funcional nesta rodada |
| A02 | Configuração fiscal sem a mesma flag de itens irmãos | Pode ser base intencional; não é P1 inequívoco. Nenhuma mudança fiscal |
| A03 | RPC legada set_partner_user_papel aceita link_id e valida papel do ator, sem tenant do alvo no corpo remoto | authenticated tem EXECUTE, anon não. DEFINER escreve partner_users/user_roles; triggers lidos cuidam de gate/revisão/admin global, não comprovam escopo do alvo. **Pendência prioritária de segurança**, sem prova autenticada de exploração nem correção às cegas. Hook existe, mas não é usado pela tabela atual. Ausência de botão não elimina chamada por API |
| A04 | Cobertura integral de Edges/RPCs e adversarial RLS/Storage | Amostra estrutural/read-only apenas; não declarar P0/P1 resolvidos nem isolamento integral novo |
| A05 | registros_consultor sem policy RESTRICTIVE; branches administrador/gestor permitem por papel | Definições remotas SELECT/INSERT/UPDATE/DELETE confirmadas. has_role privada valida perfil ativo/access_ready, mas não compara tenant do recurso; triggers amostrados incluem gate de feature/status, sem guarda tenant explícita identificada. **Risco prioritário de isolamento**, não prova autenticada de vazamento. Requer investigação focal/prova segura antes de correção |

A03 não deve ser descartado como “papéis globais”: admins operacionais são tenant-scoped. Antes de forward-fix é necessário determinar alvo/partner/organization canônicos e testar negativa em sessão real/ambiente autorizado preservando dados. Esta rodada não invocou a RPC. `profiles.updated_at` existe atualmente (1 coluna confirmada), portanto o trigger remoto touch_related_profiles não foi classificado como incompatibilidade com base em relato histórico.

## 6. Evidências executadas e gates

| Verificação | Resultado desta rodada |
|---|---|
| SaaS/RBAC/security/portais/aliases | PASS: 81 arquivos, 904 testes |
| Config/admin/handler create-user | PASS: 20 arquivos, 245 testes; há sobreposição com a suíte anterior, não somar como total único |
| Lint testes/inventário | PASS |
| Lint fontes auditadas | FAIL baseline: useAuth 1 erro no-explicit-any + 3 warnings; fontes não alteradas |
| Scanners fiscal secrets/integration | PASS, sem segredo real/indicador de emissão |
| Typecheck frontend isolado | NOT RUN: execução manual proibida neste ambiente; não inferir PASS pelo Vitest |
| Build | PASS automático após documentação: build OK 21:41:28Z e 21:41:45Z; sem build manual |
| Advisors Supabase nesta rodada | NOT RUN; números antigos não são novas evidências |
| Banco/RLS | PASS introspecção focal; provas 40/40 anteriores são baseline histórico do executor independente, não nova rodada |
| Browser público | PASS para três redirects /auth e um /app/login; sem autenticação |
| Browser autenticado/forja/isolation/mutações | BLOCKED/UNVERIFIED |

Smoke read-only no domínio `https://app.cultivofarm.com.br`, Chromium 1280×1800: /plataforma, /financeiro/receber e /portal-parceiro/catalogo → /auth; /app/visita/novo → /app/login; Entrar visível, zero pageerror. Captura final inspecionada em /tmp/browser/screens-audit/public_gate.png. A tentativa inicial /app/visita (sem id/novo) não é rota canônica declarada: manteve URL sem login visível; não é prova de acesso autorizado nem falha de guard. Nenhum formulário foi enviado, header/token/credencial registrado ou sessão fabricada. Mobile autenticado não executado.

## 7. Sessões necessárias e fechamento

Primeira sessão necessária: **administrador existente da AR BIOTECNOLOGIA, Gestão v1/TRIAL/10 features**, no domínio oficial. Validar identidade pelo contexto server-side; cenário allowed (visitas/financeiro), denied (produção/catalogo_precos), role-forbidden (plataforma), menus/busca/atalhos/aliases/URL e estados ForaDoPlano; sem mutação comercial. O executor external_unmanaged não pode injetar sessão nem oferecer handoff oficial conhecido; não pedir senha/token em texto.

Depois: admin + usuário existente por Base/Essencial/Gestão/Completo (oito identidades quando existentes), Completo TRIAL separado e Superadmin/non-superadmin; papéis ausentes permanecem arquiteturais/BLOCKED. Confirmar isolamento read-only entre sessões e persistência de cache; teste de mutação sensível só com autorização e alvo descartável/rollback garantido, não contra dados reais.

**NO-GO integral:** browser E2E/autorização real e escopos A03/A05 não certificados. Nenhum novo módulo iniciado; nenhuma alteração comercial/fiscal/cobrança/SMTP/Auth/assinatura. Não há resíduos de fixtures desta rodada porque nenhuma foi criada; não foi feita varredura global de resíduos históricos.

## 8. Matriz integral de rotas (evidência estrutural)

Perfis abaixo são candidatos de ACCESS_MAP, não autorização efetiva. Pais/roles múltiplos/contexto/vínculos/tenant/plano/servidor podem restringir. Sem mapa é “—”; não é concessão automática. Paths/contextos não contêm dados de usuário.

| Rota | Feature | Menu/origem | Perfis candidatos | Guards ancestrais/componentes | Tipo |
|---|---|---|---|---|---|
| /auth | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | AuthRoute | 8 |
| /reset-password | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ResetPassword | 8 |
| /selecionar-portal | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | AuthenticatedShell, SelecionarPortal | 8 |
| /acesso-pendente | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | AuthenticatedShell, AcessoPendente | 8 |
| /sem-permissao | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | AuthenticatedShell, SemPermissao | 8 |
| /plataforma | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | PlataformaGuard, PlataformaHome | 8 |
| /configuracoes/catalogo-ia | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, aplicador, cliente_produtor | PlataformaGuard, ConfigCatalogoIA | 8 |
| /validar-entrega/:token | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ValidarEntrega | 8 |
| /rastrear-produto/:token | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | RastrearProduto | 8 |
| /app/login | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador, cliente_produtor | MobileLogin | 8 |
| /app | — | navigation:m-c-inicio:mobile-consultor,mobile-produtor | administrador, consultor_tecnico, tecnico_agronomo, aplicador, cliente_produtor | AppPortalGuard, MobileLayout, MobileDashboard | 1 |
| /app/perfil | — | navigation:m-perfil:mobile-consultor,mobile-produtor | administrador, consultor_tecnico, tecnico_agronomo, aplicador, cliente_produtor | AppPortalGuard, MobileLayout, MobilePerfil | 1 |
| /app/notificacoes | — | navigation:m-p-notificacoes:mobile-produtor | administrador, consultor_tecnico, tecnico_agronomo, aplicador, cliente_produtor | AppPortalGuard, MobileLayout, MobileNotificacoes | 1 |
| /app/fazendas | — | navigation:m-c-fazendas:mobile-consultor | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileFazendas | 1 |
| /app/registrar | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileRegistrarOcorrencia | 8 |
| /app/atendimentos | — | navigation:m-c-atendimentos:mobile-consultor | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileAtendimentos | 1 |
| /app/registros | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, Navigate | 7 |
| /app/solicitacoes | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, Navigate | 7 |
| /app/ordens | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileOrdens | 8 |
| /app/checkin/:solicitacaoId | visitas_tecnicas | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileCheckin | 8 |
| /app/checkin | visitas_tecnicas | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileCheckin | 8 |
| /app/visita/novo | visitas_tecnicas | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileVisita | 8 |
| /app/visita/:id | visitas_tecnicas | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileVisita | 8 |
| /app/talhao/:id | — | contextual/sistema | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileTalhaoHistorico | 8 |
| /app/catalogo | — | navigation:m-c-catalogo:mobile-consultor | administrador, consultor_tecnico, tecnico_agronomo, aplicador | AppPortalGuard, MobileLayout, TechnicalFeatureGuard, EntitlementOutlet, MobileCatalogoTecnico | 1 |
| /app/recomendacoes | — | navigation:m-p-recomendacoes:mobile-produtor | administrador, cliente_produtor | AppPortalGuard, MobileLayout, ProducerFeatureGuard, MobileRecomendacoesProdutor | 1 |
| /app/entregas | — | navigation:m-p-entregas:mobile-produtor | administrador, cliente_produtor | AppPortalGuard, MobileLayout, ProducerFeatureGuard, MobileEntregas | 1 |
| /app/aplicacoes | — | contextual/sistema | administrador, cliente_produtor | AppPortalGuard, MobileLayout, ProducerFeatureGuard, MobileAplicacoes | 8 |
| /app/aplicacoes/lista | — | contextual/sistema | administrador, cliente_produtor | AppPortalGuard, MobileLayout, ProducerFeatureGuard, MobileListaAplicacoes | 8 |
| /app/solicitar | — | contextual/sistema | administrador, cliente_produtor | AppPortalGuard, MobileLayout, ProducerFeatureGuard, MobileSolicitar | 8 |
| /portal | — | navigation:portal-produtor:desktop, portalMenus:pp-dashboard:producer | administrador, cliente_produtor | PortalGuard, PortalDashboard | 1 |
| /portal/fazendas | — | portalMenus:pp-fazendas:producer | administrador, cliente_produtor | PortalGuard, PortalFazendas | 1 |
| /portal/fazendas/:id | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, PortalFazendaDetalhe | 8 |
| /portal/talhoes | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, Navigate | 7 |
| /portal/talhoes/:id | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, PortalTalhaoDetalhe | 8 |
| /portal/agenda | — | portalMenus:pp-agenda:producer | administrador, cliente_produtor | PortalGuard, PortalAgenda | 1 |
| /portal/registros | — | portalMenus:pp-registros:producer | administrador, cliente_produtor | PortalGuard, PortalRegistros | 1 |
| /portal/registros/:id | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, PortalRegistroDetalhe | 8 |
| /portal/recomendacoes | — | portalMenus:pp-recomendacoes:producer | administrador, cliente_produtor | PortalGuard, PortalRecomendacoes | 1 |
| /portal/fila-aprovacao | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, PortalFilaAprovacao | 7 |
| /portal/acompanhamento | — | portalMenus:pp-acompanhamento:producer | administrador, cliente_produtor | PortalGuard, PortalAcompanhamento | 1 |
| /portal/ordens-servico | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, Navigate | 7 |
| /portal/producao | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, Navigate | 7 |
| /portal/entregas | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, Navigate | 7 |
| /portal/aplicacoes | — | portalMenus:pp-aplicacoes:producer | administrador, cliente_produtor | PortalGuard, PortalAplicacoes | 1 |
| /portal/solicitar | — | portalMenus:pp-solicitar:producer | administrador, cliente_produtor | PortalGuard, PortalSolicitacao | 1 |
| /portal/perfil | — | portalMenus:pp-perfil:producer | administrador, cliente_produtor | PortalGuard, PortalPerfil | 1 |
| /portal/financeiro | — | portalMenus:pp-titulos:producer | administrador, cliente_produtor | PortalGuard, PortalFinanceiro | 1 |
| /portal/meus-pedidos | — | contextual/sistema | administrador, cliente_produtor | PortalGuard, Navigate | 7 |
| /portal-parceiro | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout | 8 |
| /portal-parceiro | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, Navigate | 7 |
| /portal-parceiro/perfil | — | portalMenus:pb-perfil:gestor | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, PortalParceiroPerfil | 1 |
| /portal-parceiro/dashboard | — | portalMenus:pb-dashboard:gestor, portalMenus:pbt-dashboard:tecnico | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroDashboardRouter | 1 |
| /portal-parceiro/pedidos | pedidos_b2b | portalMenus:pb-pedidos:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroMeusPedidos | 1 |
| /portal-parceiro/solicitacoes | pedidos_b2b | contextual/sistema | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroSolicitacoes | 8 |
| /portal-parceiro/novo | pedidos_b2b | contextual/sistema | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroNovoPedido | 8 |
| /portal-parceiro/catalogo | catalogo_precos | portalMenus:pb-catalogo:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroNovoPedido | 1 |
| /portal-parceiro/simulador | simulacoes | portalMenus:pbt-simulador:tecnico | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroNovoPedido | 1 |
| /portal-parceiro/historico | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroHistorico | 8 |
| /portal-parceiro/meu-historico | — | portalMenus:pb-meu-historico:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroMeuHistorico | 1 |
| /portal-parceiro/favoritos | — | portalMenus:pb-favoritos:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroFavoritos | 1 |
| /portal-parceiro/financeiro | — | portalMenus:pb-financeiro:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroFinanceiro | 1 |
| /portal-parceiro/historico-financeiro | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, Navigate | 7 |
| /portal-parceiro/meu-historico-financeiro | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, Navigate | 7 |
| /portal-parceiro/fichas | fichas_tecnicas | portalMenus:pb-fichas:gestor, portalMenus:pbt-fichas:tecnico | administrador, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroFichasTecnicas | 1 |
| /portal-parceiro/simulacoes | simulacoes | portalMenus:pbt-simulacoes:tecnico | administrador, gestor_comercial, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroHistoricoSimulacoes | 1 |
| /portal-parceiro/simulacoes-equipe | simulacoes | portalMenus:pb-simulacoes-equipe:gestor | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroSimulacoesEquipe | 1 |
| /portal-parceiro/meus-produtores | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroMeusProdutoresTecnico | 8 |
| /portal-parceiro/meus-produtores/:clienteId | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b_tecnico | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroDetalheProdutorTecnico | 8 |
| /portal-parceiro/tecnicos-produtores | — | contextual/sistema | administrador, gestor_comercial, parceiro_b2b | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroTecnicosProdutores | 8 |
| /portal-parceiro/usuarios-clientes | — | contextual/sistema | administrador, gestor_comercial | B2BRouteGuard, PortalParceiroLayout, EntitlementOutlet, ParceiroUsuariosClientesB2B | 8 |
| /visita-tecnica | visitas_tecnicas | navigation:visita-tecnica:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo | VisitaRouteGuard, ProtectedRoutes, RoleGuard, VisitaTecnicaLista | 1 |
| /visita-tecnica/nova | visitas_tecnicas | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo | VisitaRouteGuard, ProtectedRoutes, RoleGuard, VisitaTecnica | 8 |
| /visita-tecnica/:id | visitas_tecnicas | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo | VisitaRouteGuard, ProtectedRoutes, RoleGuard, VisitaTecnica | 8 |
| / | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, Index | 8 |
| /clientes | — | navigation:clientes:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, Clientes | 1 |
| /clientes/:id | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, ClienteDetalhe | 8 |
| /parceiros/:id | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, RoleGuard, ParceiroDetalhe | 8 |
| /fazendas | — | navigation:fazendas:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, Fazendas | 1 |
| /fazendas/:id | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, FazendaDetalhe | 8 |
| /talhoes | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, Talhoes | 8 |
| /talhoes/:id | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, TalhaoHistorico | 8 |
| /auditoria | — | navigation:auditorias:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, Auditoria | 1 |
| /auditoria-sync | — | contextual/sistema | administrador, gestor | ProtectedRoutes, Navigate | 7 |
| /base-tecnica | catalogo_precos | navigation:protocolos:desktop, navigation:protocolos-produtos:desktop, navigation:protocolos-microrganismos:desktop, navigation:protocolos-catalogo-tecnico:desktop, navigation:protocolos-culturas:desktop, navigation:protocolos-problemas:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, gestor_comercial | ProtectedRoutes, RoleGuard, Protocolos | 1 |
| /protocolos | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, PreservedNavigate | 7 |
| /ordens-servico | ordens_producao | navigation:ordens-servico:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, RoleGuard, OrdensServico | 1 |
| /lotes | lotes_qualidade | navigation:lotes:desktop | administrador, gestor, administrativo, producao, financeiro | ProtectedRoutes, RoleGuard, Lotes | 1 |
| /controle-qualidade | lotes_qualidade | navigation:cq:desktop | administrador, gestor, administrativo, producao | ProtectedRoutes, RoleGuard, ControleQualidade | 1 |
| /envase | envase | navigation:envase:desktop | administrador, gestor, administrativo, producao | ProtectedRoutes, RoleGuard, EnvasePage | 1 |
| /estoque | estoque_embalagens | navigation:estoque:desktop | administrador, gestor, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, Estoque | 1 |
| /estoque/embalagens | estoque_embalagens | contextual/sistema | administrador, gestor, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, EstoqueEmbalagens | 8 |
| /entregas | — | navigation:entregas:desktop | administrador, gestor, administrativo, operador_onfarm, producao, aplicador, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, Entregas | 1 |
| /entregas/:id/formulario | — | contextual/sistema | administrador, gestor, administrativo, operador_onfarm, producao, aplicador, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, FormularioEntregaPrint | 8 |
| /etiquetas/:id/imprimir | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, RoleGuard, EtiquetaProdutoPrintPage | 8 |
| /aplicacoes | — | navigation:aplicacoes:desktop | administrador, gestor, administrativo, aplicador, cliente_produtor, financeiro | ProtectedRoutes, RoleGuard, Aplicacoes | 1 |
| /relatorios | relatorios_operacionais | navigation:relatorios:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, Relatorios | 1 |
| /consultor-tecnico | — | navigation:equipe-tecnica:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, cliente_produtor | ProtectedRoutes, RoleGuard, ConsultorTecnico | 1 |
| /fluxo-tecnico | — | navigation:fluxo-tecnico:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, FluxoTecnico | 1 |
| /bi-agronomico | paineis_executivos | navigation:bi-agronomico:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, BIAgronomico | 1 |
| /bi-operacional | paineis_executivos | navigation:bi-operacional:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, BIOperacional | 1 |
| /alertas-operacionais | — | navigation:alertas:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, AlertasOperacionais | 1 |
| /previsao-agronomica | recomendacoes_alertas | navigation:previsao-climatica:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm | ProtectedRoutes, RoleGuard, PrevisaoAgronomica | 1 |
| /solicitacoes | — | navigation:solicitacoes:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo | ProtectedRoutes, RoleGuard, Solicitacoes | 1 |
| /monitoramento-alertas | recomendacoes_alertas | navigation:monitoramento:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo | ProtectedRoutes, RoleGuard, MonitoramentoAlertas | 1 |
| /agenda-tecnica | visitas_tecnicas | navigation:agenda-tecnica:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo | ProtectedRoutes, RoleGuard, AgendaTecnica | 1 |
| /dashboard | — | contextual/sistema | administrador, gestor | ProtectedRoutes, PreservedNavigate | 7 |
| /dashboard/geral | — | navigation:dashboard:desktop, navigation:dashboard-geral:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, DashboardUnificado | 1 |
| /dashboard/executivo | paineis_executivos | navigation:dashboard-executivo:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, DashboardUnificado | 1 |
| /dashboard/operacional | — | navigation:dashboard-operacional:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, DashboardUnificado | 1 |
| /painel-operacional | — | contextual/sistema | administrador, gestor | ProtectedRoutes, PreservedNavigate | 7 |
| /cockpit-laboratorio | ordens_producao | navigation:cockpit-lab:desktop | administrador, gestor, administrativo, operador_onfarm, producao | ProtectedRoutes, RoleGuard, CockpitLaboratorio | 1 |
| /financeiro | — | navigation:fin-dashboard:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinanceiroDashboard | 1 |
| /financeiro/receber | contas_receber | navigation:fin-receber:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, ContasReceber | 1 |
| /financeiro/pagar | contas_pagar | navigation:fin-pagar:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, ContasPagar | 1 |
| /financeiro/categorias | — | navigation:fin-categorias:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinCategorias | 1 |
| /financeiro/centros-custo | — | navigation:fin-cc:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinCentrosCusto | 1 |
| /financeiro/contas-bancarias | — | navigation:fin-contas-bancarias:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinContasBancarias | 1 |
| /financeiro/formas-pagamento | — | navigation:fin-formas-pgto:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinFormasPagamento | 1 |
| /financeiro/recorrencias | — | navigation:fin-recorrencias:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinRecorrencias | 1 |
| /financeiro/fluxo-caixa | fluxo_caixa | navigation:fin-fluxo:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinFluxoCaixa | 1 |
| /financeiro/dre | — | navigation:fin-dre:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinDRE | 1 |
| /financeiro/notas-fiscais | emissao_nfe_nfse | navigation:fin-nfe:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinNotasFiscais | 1 |
| /financeiro/entregas-nao-faturadas | — | navigation:fin-ent-nfat:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinEntregasNaoFaturadas | 1 |
| /financeiro/auditoria | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, Navigate | 7 |
| /financeiro/configuracoes | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, Navigate | 7 |
| /financeiro/relatorios | — | navigation:fin-relatorios:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinRelatorios | 1 |
| /financeiro/relatorios/mensal | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelMensal | 8 |
| /financeiro/relatorios/contas-receber | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelReceber | 8 |
| /financeiro/relatorios/contas-pagar | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelPagar | 8 |
| /financeiro/relatorios/inadimplencia | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelInadimplencia | 8 |
| /financeiro/relatorios/nfe-pendente | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelNFePendente | 8 |
| /financeiro/relatorios/entregas-faturamento | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelEntregasFat | 8 |
| /financeiro/relatorios/por-cliente | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelPorCliente | 8 |
| /financeiro/relatorios/prestacao-contas | — | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RelPrestacaoContas | 8 |
| /financeiro/recibos | — | navigation:fin-recibos:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FinRecibos | 1 |
| /executivo | paineis_executivos | contextual/sistema | administrador, gestor | ProtectedRoutes, PreservedNavigate | 7 |
| /portal-executivo | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, PreservedNavigate | 7 |
| /comercial/parceiros | — | contextual/sistema | administrador, gestor_comercial | ProtectedRoutes, Navigate | 7 |
| /comercial/pedidos-b2b | pedidos_b2b | navigation:com-pedidos-b2b:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, PedidosB2B | 1 |
| /comercial/solicitacoes-b2b | pedidos_b2b | navigation:com-solicitacoes-b2b:desktop | administrador, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, ComercialSolicitacoesB2B | 1 |
| /comercial/dashboard-b2b | — | contextual/sistema | administrador, gestor_comercial | ProtectedRoutes, Navigate | 7 |
| /comercial/campanhas | — | navigation:com-campanhas:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, CampanhasComerciais | 1 |
| /comercial/simulador | simulacoes | navigation:com-simulador:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, SimuladorComercial | 1 |
| /comercial/catalogo | — | contextual/sistema | administrador, gestor, gestor_comercial | ProtectedRoutes, PreservedNavigate | 7 |
| /comercial/indicadores | — | navigation:com-indicadores:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, IndicadoresComerciais | 1 |
| /comercial/alertas | — | navigation:com-alertas:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, AlertasComerciais | 1 |
| /comercial/dashboard-consolidado | — | navigation:com-consolidado:desktop | administrador, gestor_comercial | ProtectedRoutes, RoleGuard, DashboardConsolidadoB2B | 1 |
| /comercial/condicoes-pagamento | catalogo_precos | navigation:com-condicoes-pagamento:desktop | administrador, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, CommercialPaymentPlansPage | 1 |
| /comercial/auditoria-motor-b2b | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, RoleGuard, AuditoriaMotorB2B | 8 |
| /operacao/planejamento | ordens_producao | navigation:planejamento-producao:desktop | administrador, gestor, producao, gestor_comercial | ProtectedRoutes, RoleGuard, PlanejamentoProducao | 1 |
| /operacao/planejamento/:id | ordens_producao | contextual/sistema | administrador, gestor, producao, gestor_comercial | ProtectedRoutes, RoleGuard, PlanejamentoProducaoDetalhe | 8 |
| /operacao/dashboard-producao | ordens_producao | navigation:dashboard-producao:desktop | administrador, gestor, producao, gestor_comercial | ProtectedRoutes, RoleGuard, DashboardProducao | 1 |
| /financeiro/b2b | — | navigation:b2b-visao:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, FinanceiroB2B | 1 |
| /financeiro/b2b/dashboard | — | navigation:b2b-dashboard:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, DashboardFinanceiroB2B | 1 |
| /financeiro/b2b/governanca | — | navigation:b2b-governanca:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, GovernancaFinanceiraB2B | 1 |
| /financeiro/b2b/aging | — | navigation:b2b-aging:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, AgingFinanceiroB2B | 1 |
| /financeiro/b2b/previsao | — | navigation:b2b-previsao:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, PrevisaoReceitaB2B | 1 |
| /financeiro/b2b/rentabilidade | — | navigation:b2b-rentabilidade:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, RentabilidadeParceirosB2B | 1 |
| /financeiro/b2b/alertas | — | navigation:b2b-alertas:desktop | administrador, gestor, administrativo, financeiro, gestor_comercial | ProtectedRoutes, RoleGuard, AlertasFinanceirosB2B | 1 |
| /financeiro/b2b/central-governanca | — | navigation:b2b-central-gov:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, CentralGovernancaB2B | 1 |
| /financeiro/b2b/regras | — | navigation:b2b-regras-gov:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, RegrasGovernancaB2B | 1 |
| /executivo/socios-b2b | paineis_executivos | navigation:b2b-socios:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, DashboardSociosB2B | 1 |
| /configuracoes | — | navigation:configuracoes:desktop | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, aplicador, cliente_produtor | ProtectedRoutes, RoleGuard, Configuracoes | 1 |
| /configuracoes/objetivos-visita | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, aplicador, cliente_produtor | ProtectedRoutes, RoleGuard, ObjetivosVisita | 8 |
| /configuracoes/parametros-cq | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, aplicador, cliente_produtor | ProtectedRoutes, RoleGuard, ParametrosCQPage | 8 |
| /configuracoes/fiscal/empresa | — | navigation:config-fiscal:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalEmpresa | 1 |
| /configuracoes/fiscal/produtos | — | navigation:fiscal-perfis-produtos:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalProdutos | 1 |
| /configuracoes/fiscal/servicos | — | navigation:fiscal-perfis-servicos:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalServicos | 1 |
| /configuracoes/fiscal/clientes | — | navigation:fiscal-perfis-clientes:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalClientes | 1 |
| /fiscal/perfis/produtos | emissao_nfe_nfse | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, PreservedNavigate | 7 |
| /fiscal/perfis/servicos | emissao_nfe_nfse | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, PreservedNavigate | 7 |
| /fiscal/perfis/clientes | emissao_nfe_nfse | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, PreservedNavigate | 7 |
| /fiscal/documentos | emissao_nfe_nfse | navigation:fiscal-rascunhos:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalDocumentos | 1 |
| /fiscal/reconciliacao | emissao_nfe_nfse | contextual/sistema | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalReconciliacao | 8 |
| /fiscal/prontidao | emissao_nfe_nfse | navigation:fiscal-prontidao:desktop | administrador, gestor, financeiro | ProtectedRoutes, RoleGuard, FiscalProntidao | 1 |
| /comunicacao | envios_automaticos | navigation:comunicacao-admin:desktop | administrador, gestor | ProtectedRoutes, RoleGuard, ComunicacaoRouteGuard, ComunicacaoAdminPage | 1 |
| /notificacoes | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | ProtectedRoutes, CentralNotificacoes | 8 |
| * | — | contextual/sistema | administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, financeiro | NotFound | 8 |


## Fechamento focal — batch e grants individuais — 2026-10-08 04:08 UTC

### Escopo e baseline
- Destino único conferido: `swzpzcwiasxmjutrmvkm`. Publicação anterior é informação do proprietário; nenhuma publicação foi executada neste recorte. D52 e contenções anteriores preservadas.
- Corpo inicial batch MD5 `3e87236d748785704a59e65ed4ede470`; motor permanece `c71a9e848eff0a522cbaa3a7ec2949a5`. Batch final `ce2e7cd4080ff2f8fc15cce9294046d9`.
- Falha comprovada inicial: batch consultava replay antes do escopo completo. Callers reais usam padrao/manual/onfarm/b2b. Referências onfarm derivam do cliente da OS, nunca do expedidor ou órfãos. Alias on_farm normalizado para onfarm; padrao para manual. B2B/onfarm completos ainda não tiveram prova positiva dinâmica neste recorte.

### Migrations oficiais aplicadas (não reaplicar)
| Ledger | Resultado |
|---|---|
| 20261008035712 | Batch usa ator ativo/h15, RBAC e estoque_embalagens antes de lookup/replay; valida finitude/OS/cliente/parceiro/item/payload, recibo privado ator+tenant+conteúdo, ordenação dos itens e locks; ACL ainda fechada. |
| 20261008035740 | Policy service-only na tabela privada stock_batch_requests, sem acesso cliente. |
| 20261008035936 | Forward-fix do contexto: remove referência duplicada de OS no histórico da linha-fonte da reserva parcial, preservando verificação real OS/cliente/lote/tenant. |
| 20261008040053 | Baseline otimista corpos/hashes/zero resíduos; GRANT individual authenticated somente motor e batch, anon negado. Fecha também ctx open/force/close/read. |
| 20261008040156 | Nega colisão da chave derivada com ledger do motor direto; primeiro batch não aceita replay oculto de operação anterior. Mantém somente os dois grants. |

A primeira prova falhou em ESTQ_MOV_REFERENCE_FORBIDDEN na reserva parcial; foi integralmente revertida, motivando o forward-fix 035936. Nenhum trigger foi desabilitado. Cada mudança foi pelo fluxo oficial, sem duplicação das migrations até 033250.

### Evidências próprias SQL/role (NÃO JWT/API/browser)
- Prova batch com FSF authenticated: reserva parcial (saldo fonte 8, reservado 2 e alvo novo), reserva total, replay sem duplicar ledger, atomicidade da falha multi-item e contexto pré-forjado ignorado. Dezesseis negativas: chave/conteúdo conflitante, item cross-tenant, org forjada, OS inválida, NaN/±Infinity/zero/negativo, formatos inválidos, estado inválido, ARBio sem feature e identidade inativa. Exceção final STOCK_BATCH_PROOF_ROLLBACK atingida: assertions passaram e tudo foi revertido.
- Reteste pós-grants e pós-040156: motor direto criou reserva 1 com chave derivada; batch rejeitou reutilização (unique_violation). Cinco números inválidos rejeitados; batch legítimo reservou 2, saldo fonte 7, replay sem nova movimentação, contexto privado zerado. Exceção STOCK_BATCH_FINAL_ROLLBACK atingida, denied=6. GRANT de ctx_force foi apenas temporário dentro da transação revertida para injetar contexto forjado; ACL viva permanece false.
- Manifesto final: run TEMPORARY_AUDIT_STOCK_BATCH_FINAL_70e12fde-bdf1-48a9-8d3c-ec30628507be; lote 9ed273d7-a780-464f-bc90-e8c94532585c; envase 896a961f-a5cf-4593-b355-14c5f26c7154; cliente a963f118-ca54-488b-a84b-daa2f191717a; fazenda d404aa34-691d-4fa0-90ec-a57158c03518; talhão 321ad119-68bc-441f-abbe-da8b460d458b; OS 0bedc3db-9864-496f-84d5-6633fd7e351f. Estoques: 8fe9af3f-0ae5-42d7-8d90-40110fdc6edb / bd75d87e-bfe2-4715-8406-ccfb63fcb055 / 74672296-2b5b-4291-8c68-531cf70be0d2. Movimentos: 55bc64f6-b2f7-48d2-91d4-b0708f33b870 / f22fa06c-c08c-4fa9-88f6-74c2fd5f1ba2 / 49c5f956-39d9-4cd5-9045-c640a9116e07 / 28bcce5e-9e1f-4aa0-904a-396aee4c2e93 / c5a25f7b-7053-4280-b162-1f29a765c21b.
- Consulta posterior: lote/CQ/envase/estoque/movimentos/cliente/fazenda/talhão/OS/batch/contexto = onze classes zero. Hash histórico estoque 1/0c1a052173a564454cd51e69fcb72947; movimentos 2/f8b6fcf6aa756d745eaf205f606f7795, idênticos. Usuários/assinaturas reais não foram alterados.
- Prova independente Codex recebida: nove ações, reservas/cancelamentos totais e parciais, 50 negativas numéricas +14 escopo/payload/replay, rollback/zero resíduos/hashes intactos. É evidência atribuída, não execução própria ou navegador.

### ACL e fundamento de cada liberação
- Motor: authenticated=true/anon=false; sustentado por provas próprias anteriores positivas saldo/replay/split, reteste próprio final e prova independente nove ações. Corpo numérico/contexto permanece preservado.
- Batch: authenticated=true/anon=false; sustentado por prova própria parcial/total/replay/atomicidade/16 negativas antes da liberação e reteste final após correção de colisão.
- Reserva interna e ctx open/force/close/read authenticated=false/anon=false; demais caminhos legados não foram regranted. Sem regrant em massa.
- Advisory lock serializa chave batch e locks de estoque têm ordem determinística; isso é inspeção SQL, NÃO prova de corrida/deadlock sob concorrência. Colisão cruzada de chave é rejeitada, não reutiliza recibo.

### Código, verificações e limites
- Hook batch: rejeita quantidade JS não finita e resultado sem ok=true antes de anunciar sucesso. Tipagem gerada do cliente canônico cultivofarm.types.ts não contém batch, embora types.ts contenha; não foi criado cliente paralelo nem editado arquivo gerado. Cast preexistente permanece e é dívida de lint/tipagem, não corrigida ampliando escopo.
- Testes próprios estoque/entregas/caller: **286/286 PASS**, 23 arquivos. Novo teste estrutural: 5/5; não equivale a RPC real. Lint teste novo PASS; hook mantém **57 erros any preexistentes**, sem PASS global. Scanners segredos/fiscal e diff-check PASS. Build automático OK 04:03:27 UTC após código; typecheck explícito próprio NOT RUN (tsgo indisponível e validação manual vedada pelo harness).
- Advisor global: 442 achados de baseline, incluindo 17 RLS sem policy, 2 PUBLIC DEFINER, 422 authenticated DEFINER e 1 proteção de senha vazada desativada. Dois endpoints canônicos liberados geram advertências esperadas de DEFINER callable; não afirmar scanner de banco global PASS. Nenhum outro módulo foi iniciado.
- **PASS focal SQL/role e liberação individual autorizada; NO-GO operacional/integral.** JWT/API/browser, concorrência real, B2B/onfarm completos, runtime destinatários, demais RPC/Edge/Storage e matriz ampla continuam UNVERIFIED. A ACL não amplia plano/RBAC nem reativa entradas legadas.

### Arquivos e rollback seguro
- Cinco migrations oficiais em supabase/migrations/ (prefixos acima); scripts/rbac-audit/stock-batch-hardening-proof.sql; scripts/rbac-audit/stock-endpoints-safe-rollback.sql; src/hooks/useEsteiraLaboratorio.ts; src/test/estoque/stock-batch-hardening.test.ts; AGENTS.md; roadmap.md; este relatório e matriz CSV.
- Rollback documental: revogar authenticated somente motor e batch usando stock-endpoints-safe-rollback.sql pelo fluxo oficial. Não reabrir helpers, remover policies/recibos ou restaurar corpos inseguros. Não executado; não altera dados/histórico.
