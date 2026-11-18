# Evidências e limites

## Ajuste focal 04:51 — massa/volume no cadastro de químicos

- Aplicação & Custo só monta e recalcula dose mL/ha, preço 100mL/L e custo/ha quando unidade atual é `ml|l`. Kg/g ou unidade não confirmada não têm conversão; dose numérica sólida não foi inventada. Modo de aplicação textual segue editável; dose documental g/ha/kg/ha é indicada na ficha → Uso agronômico → Culturas. Apresentações/preço por embalagem continuam no diálogo canônico existente `CatalogoVolumesDialog` → `SolidPresentations`, com seus gates e contratos intactos, sem nova entrada/writer paralelo.
- Hidratação não deriva preço ausente antes de confirmar unidade. Salvamento em massa omite os quatro campos volumétricos (não envia null nem apaga legado); valores anteriores são mostrados apenas como referência histórica no editor. Troca líquido→massa preserva rascunho sujo e bloqueia dispatch até voltar à unidade compatível; composição suja também é preservada/bloqueada. Recibos/tentativas incertas retêm a unidade escolhida e o payload original; metadata/composição permanecem sequenciais.
- Químicos/fertilizantes não montam editor de composição biológica ou sugestões derivadas de microrganismos; composição anterior continua consultiva e não é apagada. Trocar família não contorna guarda das declarações existentes, testada com zero escrita. Nenhuma dose, densidade, concentração, formulação, toxicologia, fabricante, MAPA ou aprovação fiscal foi inferida/cadastrada.
- **70 arquivos / 1.169 Vitest PASS**, catálogo+protocolos completos; kg/g omitem campos e preservam legado, L/mL conservam cálculo concreto (250mL/ha, R$10/100mL→R$100/L e R$25/ha) apenas como fixture aritmética, troca de unidade conserva rascunho, composição suja não despacha como massa, químico salva sem composição. Não são doses/preços reais de Mancozebe. Evidências em `solid-editor-review/`.
- Chromium **1280×1800 / 390×844**: editor real de químico kg mostra limite e referência anterior, não monta dose/preço volumétricos e salva identificação sem enviar/apagar legado. Capturas inspecionadas; sem pageerror, Auth/transporte simulados; avisos React refs e Select controlado persistem. Não prova HML/JWT ou cadastro real. Build automático OK, registrado no result.json; não rodado compilador/build manual conforme plataforma.
- Root fará cadastro/teste de Mancozebe somente com dados confirmados. ANVISA M02/grupo/CAS/funções foram informados pelo root, não consultados nem gravados pelo agente. Mancozebe não foi tratado como nome comercial/formulação/unidade/concentração específica. Sem instalação, banco hosted, produção, publicação, HMLv4 ou subagentes; homologação/cadastro confirmado continuam com root. A listagem/PDF legados e outros consumidores não foram certificados como dose sólida por este ajuste do editor.

## Correção focal 04:48 — precisão temporal do histórico

- Reproduzidas **4 falhas / 28 PASS** antes da correção: revisão anterior e futura dentro do mesmo milissegundo, ordenação após offset e offset inválido aceito como NaN. Comparador agora normaliza apenas segundos inteiros UTC e compara a fração decimal completa preenchida à direita, preservando microssegundos e equivalência de offsets/zeros finais. Nenhum timestamp CAS é reescrito; futuro continua recusado mesmo com evidências ativas vazias. Igualdade real mantém o contrato de histórico distinto da atribuição ativa.
- **77 Vitest PASS / 3 arquivos focais**, incluindo 33 testes documentais, seis de hidratação/renomeação e SDK real com fetch simulado. Anterior dentro do mesmo milissegundo, igual, futuro, offsets equivalentes positivo/negativo, frações com zeros finais e mudança de segundo cobertos. **118 PostgreSQL descartável PASS** e **6 assembly PASS**, todos exit 0; saídas versionadas em `temporal-review/`.
- O segundo achado (renomear sem mudar revisão do perfil) **já foi corrigido em dc7f51ce9**: gerador e SQL candidato usam revisão anterior **ou evidência histórica distinta da ativa**, sob revisão existente e sem mudar assinaturas/tabelas. Bateria PostgreSQL reconfirmou fontes → renomeação com mesma revisão → histórico com nome/candidato original → outro campo salvo. Testes montados confirmam exibição e edição liberada; não houve nova alteração SQL nem extensão de escopo nesta rodada.
- Validação automática da prévia verificada após alteração; resultados exatos em `temporal-review/result.json`. Sem novo browser hospedado, instalação, produção, publicação, serviço IA ou transferência de capturas. Revisão independente/POST integral atômico e homologação HML de persistência permanecem com root; os contratos de código desta solicitação estão fechados.

## Correção adicional 04:35 — identidade e renomeação

- Identity cliente/SQL estrita e coerente: fabricante/registro obrigatoriamente strings (inclusive vazias), nome/ID/entity validados; 1000 caracteres nos três textos principais, 2000 nos opcionais conhecidos, researchScope enum; ausentes, null, números, extras e limites excedidos recusados. Validação cliente preservada e ampliada, não afrouxada. Fixture passou a conter fabricante/registro corretamente.
- Nome anterior nunca é reescrito: fontes ficam históricas após renomeação; reader expõe histórico também na mesma revisão quando o produto foi renomeado sem modificar perfil. Cliente filtra ID+nome+texto e omite evidências exclusivamente históricas ao salvar outro campo, evitando recusa indevida e snapshot vazio que perderia proveniência. SQL ainda recusa identidade antiga sob lock; histórico privado permanece imutável.
- **118 checks PostgreSQL descartável PASS**: identidade ausente/null/número/limites/shape, recibos e perfil/histórico não criados na recusa; strings limítrofes aceitas/reabertas; salvar fontes → renomear → editar outro campo sem nova história e fonte antiga apenas histórica. Corridas fresh/gate/replay/CAS anteriores mantidas. Corpo fresh capturado, identidade/schema/dependências reconstruídos declarados; não certifica JWT/RLS hosted. Resultado em `identity-review/pg-result.json` (pins locais nunca autorizam instalação).
- **70 arquivos / 1.148 Vitest PASS**, protocolos+catálogo completos; schema, tela aberta/reabertura após renomeação e SDK real com fetch simulado testados. **6 assembly PASS**. Build automático **OK 04:44:10Z**, inclui tipos; compilador/build manual não executados por regra da plataforma.
- Chromium **1280×1800 e 390×844**: gerar/aplicar/salvar fontes, renomear, reabrir histórico com identidade original, editar/salvar outro campo e confirmar leitura do estado persistido simulado; sem overflow/pageerror. Capturas inspecionadas; Auth/transporte sintéticos. Avisos de refs React compartilhados persistem; não alegar console limpo nem browser HML.
- Root relatou assembly positivo local **2e130fa6**; não executado aqui, não prova este delta atualizado. Root precisa recompor novo POST integral e instalar atomicamente após revisão local; nenhum PRE pin foi alterado. Capturas continuam exclusivamente com root; serviço IA HMLv4 intocado. Sem instalação, produção, publicação ou subagentes.

## Executado localmente

- Vitest final: `bun run test -- src/test/catalogo src/test/fiscal/productDossierManagement.test.tsx src/test/fiscal/dossierDocumentViewer.test.tsx src/test/protocolos/productTechnicalProfileReadOnly.test.tsx`: **61 arquivos, 1074 testes PASS**, incluindo recuperação sequencial de produto/composição, schema do bundle, bloqueio/cancelamento de rascunho do dossiê e regressões microrganismos/IA.
- `python3 test_pg.py`: **25 checks PASS**, incluindo candidato persistido e candidato ausente negado; gate fechado, leitura/leitor, isolamento A/B, writer negado, replay, URL segura, CAS, feature revogada e falha tardia transacional sem perfil/recibo. Actor/motor históricos carregados; identidade, schema/config e receipt reconstruídos são **sintéticos**, não prova hosted.
- Deno check dois bundles explícitos HML/produção PASS. Não houve inference real nova.
- Chromium 1280×1800 e 390×844: gerar/aplicar/salvar/reabrir fontes PASS com Auth/transporte interceptados sintéticos e componentes reais; um diálogo, sem overflow nem pageerror. Capturas revisadas visualmente. Avisos React de refs em componentes compartilhados continuam presentes; não são considerados ausência de console errors.
- Harness automático registra `build OK`, incluindo validação de tipos. Não foi executado build/typecheck manual conforme regra da plataforma.

## Entregue

Nome clicável/editor amplo e conteúdo técnico integrado, composição consultiva, seções de uso/B2B/fontes e dossiê canônico; IA recebe fabricante/registro/cepa do dossiê, comparação e campos selecionados, fontes HTTPS por campo, replay/CAS observados e bloqueio durante salvamento. Global/leitores não recebem escrita. Preço/composição/fiscal/aprovação fora da IA. Não foi alterado nenhum dado fiscal ou dos 27 microrganismos.

## Descoberta independente root — 18/11/2026 03:47 UTC

Informações abaixo **relatadas pelo root a partir de captura via conector**, não recapturadas nem executadas pelo agente nesta atualização:

| Contrato/controle | HML | Produção |
| --- | --- | --- |
| tenant_product_save | `b08824625713362221cf10cc683239b8` | `2ada245dea57bbf19d2525cf57ecc4da` |
| tenant_catalog_formulacoes_replace | `6b5462bffdc1768caee441a821a69986` | igual |
| tenant_catalog_root_save | `7db253bcc2150276ea2bb2f7bd90e471` | igual |
| capability IA | `7ad7237f337ff319038c6de579c67931` | igual |

Produção usa `platform_private.recorte_a_actor_fresh('mutate')`, reautoriza após advisory locks e row locks e antes de replay/retorno. HML usa `catalog_tenant_actor` e não possui `recorte_a_actor_fresh`. **Não são fundamentos equivalentes**; testes de HML anterior não certificam a autoridade do writer de produção. O root prepara alinhamento mínimo HML e captura/revisão das dependências. Nenhum alinhamento, alteração de pin ou mudança de writer é executado por este pacote nesta atualização.

Baseline AR Bio informado em produção: **8 produtos**, hash `2b8048490a17a5b915c85d2d194577b5`. Controle para comparação independente futura, não hash verificado pelo agente nem autorização para ler/alterar linhas reais.

`produtos` e perfis não possuem fabricante/registro segundo a captura. A identidade documental continua vindo do dossiê canônico; não criar campos fictícios nem replicar sua autoridade. Metadados e composição permanecem sequenciais; fontes precisam corresponder à sugestão/candidato/campo/valor exatos aceitos. Igualdade dos três contratos auxiliares não elimina o gate do writer de metadados, nem os gaps de captura completa já listados.

## Atualização root — 03:48 UTC: alinhamento já aplicado somente HML

O root informou aplicação de `product_audit_hml_alignment_20261118` e POST/captura transitiva revisados. **Não recriar o alinhamento.** Hashes pós informados:

- `tenant_product_save`: `2ada245dea57bbf19d2525cf57ecc4da` (igual produção).
- `recorte_a_actor_fresh`: `0cb006c428fc13b0bf0fd7e2759f7a99`, owner-only.
- `solid_pack_unit_apply`: `99ab68e0c7076838c2b08c5ecdd67d72`.
- `tenant_product_validate`: `c1d561b4e8a2a458235551a8113049ed`; diferença anterior somente comentários segundo root.

Root relatou **29 HTTP Auth reais HML PASS**: criação/unidade/replay/chave alterada/CAS/isolamento/anon/campo proibido/preço negativo/reabertura, IA sem economia/fiscal/aprovação/formulação, JWT antigo após revogação de role/feature e metadata preservada após composição recusada com recuperação/replay. IA real Serifel/BASF retornou HTTP200 descrição com fontes oficiais verificadas; produto fictício sem documentos retornou HTTP200 sem candidatos/sugestões.

Esses resultados são **baseline backend independente**, não prova da nova ficha, do novo delta de fontes persistidas ou do browser integrado. A divergência 03:47 acima permanece registro histórico; o bloqueio de alinhamento foi superado pelo root, sem qualquer execução hosted pelo agente.

Nesta continuação foram acrescentados schema/target/revisão tipados na leitura, retenção explícita `candidate_key` apenas nas evidências de produto (envelope de microrganismos preservado), bloqueio de saída/versão com dossiê sujo ou documento aberto e cancelamento explícito do rascunho. Evidência continua ligada ao texto exato: edição manual não mantém a fonte como comprovação do novo texto; histórico privado não é apagado.

## Fechamento local dos gaps do REPORT 8de0b8fb4

- Culturas/alvos/fontes próprios têm edição integrada, rascunhos Aplicar/Cancelar, opções reais e preservação de ID/nome canônico. Alterações confirmadas entram pelo motor de perfil existente; não há DML/browser writer paralelo. Recomendações não têm updated_at no schema: CAS usa linha JSONB inteira capturada; metadados/composição sequenciais intocados.
- Perfil exige todos os campos de conteúdo, timestamps/status tipados; null confirmado é ausência, undefined/shape inválido/erro não viram ficha vazia. Filhos têm target/schema validados e opções limitadas; links legados inseguros não são navegáveis.
- Parent save/seção/close bloqueados com vínculo/dossiê pendente, inclusive fechamento da janela ProdutosTab. Vínculos já aplicados permanecem em memória entre seções; revisão não perde campos, CAS não é rebase automático.
- Recusa SQL definitiva mantém rascunho e exige fresh read antes de liberar nova chave. Conflito de vínculo tem reconciliação explícita por linha. Rede/ACK inválido/timeout são incertos: mesma chave/argumentos e exportação, não nova intenção. Campo manual/IA não altera snapshot durante envio.
- IA acompanha identidade/dossiê com reset fabricante/registro; fetch pendente/erro não pesquisa com valores antigos. Produto continua product_strain; fontes exatas por candidate_key/campo/texto mantidas. Microrganismos e seus instaladores não alterados.
- Montador novo `assemble.py` exige captura integral UTF-8/LF por ambiente, root7db253 e freshactor0cb006, owner/ACL/triggers/estrutura e dependências preservados. Input simplificado do montador antigo agora recusado. PRE/POST integrais, gate OFF, reinstall somente POST exato e rollback não destrutivo preparados. Pins locais sintéticos continuam sem autorização de instalação.

## Evidência desta continuação

- Vitest: **62 arquivos / 1084 PASS** (catálogo completo, microrganismos/IA compartilhada, recuperação sequencial, schema, vínculos, dossiê/document viewer). Avisos de refs/controlado nos componentes compartilhados persistem.
- PostgreSQL descartável: **40 checks PASS**, cultura canônica, replay único, cross-tenant negado, CAS linha inteira, falha tardia sem filhos/recibo, helper privado negado, gate/rollback/release e fontes por texto exato. Motor/actor históricos e identidade/schema/recibo reconstruídos são sintéticos; freshactor da bateria é stub explícito. Não prova o freshactor real nem JWT/RLS hospedados.
- Python montagem: **4 negativos PASS** (proveniência sintética, ref ausente, UTF8/hash divergente, CRLF recusado). Montagem positiva integral ainda não executada por ausência de captura root PRE/POST; não alegar instalável sem essa etapa.
- Chromium desktop1280×1800/mobile390×844: IA gerar/aplicar/salvar/reabrir fontes, vínculo pendente bloqueia salvar/seção e cancelamento libera, um diálogo, sem overflow/pageerrors. Transporte/Auth interceptados sintéticos; não browser HML. Capturas inspecionadas.
- Deno check bundles explícitos HML/produção PASS; nenhuma implantação/inference nova. Harness automático build OK inclui tipos; não rodado build/typecheck manual conforme plataforma.

## Pendências externas exatas — não certificado para publicação

1. Root mantém captura exata integral PRE/POST e revisão transitiva somente local e executa seu builder final/reinstall/rollback no espelho com dependências reais. Não transferir capturas ao agente. Código/consulta/envelope parametrizados entregues.
2. Root instalar delta HML e executar Auth A/B/anon/leitor/revogação/lock/replay, vínculos editar/salvar/reabrir, dossiê/upload pendente, fontes IA persistidas e navegador real integral. Os 29 checks backend e IA Serifel relatados acima são baseline, não essa homologação.
3. Nenhuma escrita produção/hosting/subagente. Dados dos 27 microrganismos e oito produtos reais intocados; disponibilidade atual de secrets não consultada.

## Correções independentes — 18/11/2026 04:16 UTC

- Autoridade fresh revisada/capturada `0cb006...` usada em todo caminho PRODUCT/profile, mesmo payload sem children/evidence: início, cada espera explícita (gate, receipt, ref_owner, perfil e pai), depois do DML e antes de replay/retorno e após inserção de recibo. Outros roots mantêm seus checks originais. Vínculos revalidam também imediatamente após cada espera de referência.
- Reader verifica gate OFF no servidor, retém FOR SHARE até fim da transação e revalida fresh/read_catalog após espera/antes do retorno. Rollback nega novas leituras sem depender da ACL. Tabelas privadas têm RLS habilitada, ACL/sequence owner-only, sem policies client e índice product/sequence descendente.
- Servidor rejeita campos duplicados, ID/nome de outro produto, candidato ausente e valor divergente do texto exato, sem perfis/filhos/recibos adicionais em recusa. Fabricante/registro continuam contexto documental, não novas colunas nem aprovação.
- **57 checks PostgreSQL PASS**, incluindo sete corridas reais com bloqueios observados em pg_stat_activity: revogação de role/feature, troca de tenant em lock de filho, espera de receipt/replay e gate fechando durante leitura. Corpo fresh capturado integral (não stub). Dependências de identidade/h15/role/feature e relações/config/receipt permanecem reconstruções locais declaradas; isto não é JWT/RLS hosted. Controle isolado demonstra VOLATILE negar revogação dentro de caller STABLE enquanto corpo idêntico marcado STABLE permite a mesma corrida. Não alegar que todo caller VOLATILE necessariamente reproduz essa perda.
- **1.084 Vitest PASS / 62 arquivos**, **4 negativos da montagem PASS**; build automático mais recente OK. Sem mudanças frontend nesta revisão, sem novo browser hosted. Saída local em pg-result.json; hashes nela são sintéticos e nunca pins de instalação.
- Captura agora exige pro volatile explícito; montagem checa fresh/reader VOLATILE, RLS/ACL/owner e índice no POST. Root pode entregar captura integral no envelope README com esquema estável; montagem positiva/instalação HML e homologação browser seguem externas, sem impedir estas correções locais. Nenhuma escrita hosted, produção, publicação ou subagente.

## Regressão independente 04:24 — edição manual sem evidência

- Reader reconciliado projeta revisão atual e somente fontes cujo valor JSON/string coincide exatamente com texto atual e identidade do produto; última evidência é lida no mesmo snapshot SQL do perfil. Não atribui fontes divergentes, não escreve durante leitura nem troca candidato/origem. Snapshot explicitamente vazio é respeitado. Histórico anterior permanece íntegro e separado em `history`, exibido em Fontes e histórico como revisão anterior; sugestão aceita não é perdida.
- **66 checks PostgreSQL PASS**, incluindo fontes → edição manual legítima sem documentary_evidence → reabrir, com texto igual/divergente/whitespace/restaurado; histórico/candidato preservados, revisão atual correta e nenhuma ressurreição após snapshot vazio. Mantidos revogação concorrente, gate OFF, replay e atomicidade locais. Identidade/schema/dependências reconstruídos continuam sintéticos; não prova hosted.
- **1.086 Vitest PASS / 62 arquivos**, focais posteriores **10 PASS** e montagem **6 PASS**. Tipos/build automático OK após corrigir a tipagem do histórico validado.
- Chromium **1280×1800 / 390×844**: fluxo gerar/aceitar/salvar fontes, fechar, simular edição manual legítima, reabrir com texto igual e alterado. Ficha editável em quatro casos, fonte compatível mantida, divergente só no histórico, um diálogo, sem overflow/pageerror. Screenshots inspecionadas; Auth/transporte interceptados são sintéticos, avisos React de refs compartilhados persistem. Não é browser HML.
- Root relatou **8 roundtrip defs PG17.11 PASS**, **61 focais rev1 / 49 focais rev2 PASS**; evidências independentes externas relatadas, não reexecutadas pelo agente. Root alinhou somente leitura canônica real do contexto/scope/estrutura do dossiê em HML, Auth A200/B403/anon401. Isto **não certifica edição de dossiê hospedada**; nenhum wrapper fake foi criado.
- Capturas permanecem exclusivamente locais com root, sem upload/busca/transferência por outro caminho. Assembly local parametrizado valida corpo exato do reader reconciliado e root; builder final/POST/instalador e homologação integral permanecem com root. Zero produção/publicação/instalação/subagentes.

## Fechamento das regressões protocolos/CAT — 04:31 UTC

- Reproduzidas **3 falhas / 14 PASS** de fichas-cat09-cat10 antes da correção: duas verificações da implementação textual antiga e um fixture de perfil incompleto que o contrato atual corretamente rejeita. Asserts sobre strings/regex vazia foram substituídos por contrato real de fetch/defaults, schema incompleto negado e testes montados da ficha: erro bloqueia escrita, Retry relê perfil+evidências, evidência com erro não hidrata, mismatch concorrente recupera após releitura, rascunho sujo não é rebaseado e troca de produto não herda estado.
- O `a.includes` inferido never pertencia ao teste textual antigo (linha167 do arquivo de teste), removido junto à regex; não há esse caminho no diálogo atual. **Protocolos + catálogo completos: 70 arquivos / 1.128 testes PASS**. Harness automático de tipos/build: **build OK 04:32:53Z**; não executado compilador manual em paralelo ao harness. Os seis TS2367 do snapshot HML, relatados pelo root como comparação de binding literal HML/guards produção, não foram tratados como regressão canônica nem usados para relaxar guard.
- **69 checks PostgreSQL descartável PASS**, incluindo duas leituras realmente bloqueadas no gate durante edição manual concorrente: texto novo retorna fontes ativas vazias + histórico anterior intacto e revisão nova coerente; texto idêntico mantém candidato/fontes exatos. Bateria continua com corpo fresh capturado e dependências/identidade/schema locais declarados, não prova hosted. **6 testes assembly PASS**.
- Correção de diagnóstico anterior: reader f5 já devolvia revisão ATUAL com evidência vazia quando não havia histórico daquela revisão; o problema demonstrado é **perda de fontes compatíveis após edição legítima**, não prova de travamento permanente por esse reader. Mismatch entre consultas concorrentes continua conflito real recuperável, com teste montado e Retry de ambos readers.
- Root relatou **69 focais locais f51b15 PASS**, normalização de **8 defs reais PG17.11** e montagem positiva PRE real + POST esperado/delta normalizado/metadados PRE inalterados. Fatos independentes externos, não captura/assembly executados aqui. Futura instalação precisa assert POST integral dentro da mesma transação; candidate/assembly existentes mantêm esse gate. Capturas não foram solicitadas, recebidas nem transferidas.
- Root relatou **IA HMLv4 já implantada**, única diferença restrição dos nove campos de produto, JWT preservado; **12 Auth HTTP checks PASS** com pesquisa real resumo_curto/fonte e UI real geração/aplicação só no rascunho/cancelamento PASS. **Novo SQL ainda não persistido em HML**, portanto não certifica persistência das novas fontes nem edição hosted do dossiê. Serviço HML/Edges/bindings não foram tocados.
- Sem instalação/publicação/produção/subagentes. Homologação persistente completa e assert POST atômico permanecem com root; todos os gaps de código/testes desta rodada estão fechados.
