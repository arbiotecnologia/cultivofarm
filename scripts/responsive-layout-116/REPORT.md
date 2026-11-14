# Segunda rodada responsiva — retomada de da80884a

## Entrega local
Quatro arquivos de apresentação corrigidos: `BulkAlvosDialog`, `EvidenciasTabs`, `Configuracoes` e `RegistrarEntregaDialog`. Sem alterar rotas, funções de negócio, permissões, banco, binding ou publicar.

- Alvos em lote: grade rígida cortava “Sugerir com IA” em 320px; lista flexível com rolagem local, raiz `min-w-0` impede deslocamento horizontal do diálogo ao alcançar a última aba.
- Evidências: quatro colunas sobrepunham rótulos/contadores em 320px; rolagem local e botões com dimensões estáveis.
- Novo usuário: modal estreito continuava em três colunas no desktop; descrições ultrapassavam os próprios botões. Seletor em uma coluna em qualquer largura do modal, opções não encolhem. Três tipos exercitados.
- Entrega: sobreposição real de “Por OS…”/“Por lotes envasados” em 320px. Abas flexíveis com rolagem local e raiz limitada, sem alterar seleção, payload ou confirmação.

## Evidência corrigida
`focused/`: 40 cenários Bulk/Evidências/Novo Usuário, quatro viewports (320×568, 390×844, 464×522, 1440×900), primeira/última aba e três tipos. Zero pageerrors; validação geométrica específica de sobreposição/clipping passou (`focused-validation.log`). Capturas antes/depois foram inspecionadas visualmente. Entrega: 8 cenários, primeira/última aba nas mesmas quatro dimensões, zero pageerrors; rótulos não se sobrepõem. Último controle foi rolado nos diálogos; não houve submit.

A tentativa intermediária Bulk flex sem `min-w-0` deslocou conteúdo e foi corrigida antes de aceitar o reteste. Capturas intermediárias preservadas, não usadas como aprovação. A primeira validação da entrega incluiu radiogroups em vez de apenas abas e falhou; as medidas do tablist e captura corrigida confirmam abas separadas.

## Inventário inteiro: processamento não é homologação
`MATRIX.json` mantém os 116 IDs exatos e checkpoints por perfil/viewport. Quatro processos concorrentes montaram os componentes originais através de props/fixtures, preservando hooks e transporte local. O conjunto principal terminou os 116 checkpoints, com 1.914 cenários registrados e 547 montagens do controle específico; **50 IDs tiveram montagem isolada, 66 não montaram em nenhum cenário principal**. Esses números são da conclusão do conjunto principal; refinamentos posteriores mantêm suas tentativas iniciais e atualizam a matriz.

**Não foram aprovadas as 116 ocorrências.** Controles não montados aparecem como `NOT_MOUNTED_FIXTURE_GAP`; medidas e capturas não inspecionadas individualmente aparecem como `MOUNTED_GEOMETRY_RECORDED_NOT_VISUAL_APPROVAL`. A matriz diferencia `ISOLATED_ORIGINAL_COMPONENT`, navegação anterior reaproveitada e ensaios com rotas/guards reais. Os perfis isolados derivam da união de acessos de rota, não de alçada completa por ação; isso não prova elegibilidade operacional. Dados vazios, capacidade fechada, estado faltante e código não montado são lacunas, não defeitos automaticamente corrigíveis.

Navegação representativa: **15 perfis × 2 viewports = 30 cenários**, App/rotas/guards originais. Técnico exibiu catálogo; produtor sem vínculos mostrou bloqueio; catálogo interno permaneceu bloqueado pelo estado comercial sintético; parceiro sem contexto ficou impedido. Todos estão discriminados em `navigation/results.json`, sem alegar navegação integral positiva para perfis impedidos. Não houve sessão/JWT/RLS/Storage real.

Áreas ainda dependentes de fixtures específicas: visitas/wizard e seus pré-requisitos persistidos; produtor com cliente/fazenda/talhão; catálogo com capacidade/tenant; financeiro com títulos e recibos; ações de detalhe com leitores positivos. Cockpit legado, global-write OFF e controles sem entrada normal não foram ativados. Nenhuma montagem isolada reabre esses gates.

## Segurança e infraestrutura
Toda requisição externa abortada. Cliente/Auth substituídos somente no transporte do navegador; nenhuma alteração no cliente canônico. Invocações e escritas de fixtures são recusadas e registradas; `list-portal-users` é uma tentativa de leitura Edge também recusada pelo harness genérico, não uma escrita real. Nenhum dado de produção foi manipulado.

Falhas de infraestrutura preservadas: timeout de carregamento, script chamado `queue.py` sombreando biblioteca Python e fixture insuficiente. Corrigidos no harness; não tratados como bugs da aplicação. Checkpoints incrementais permitem retomar sem refazer cenários concluídos.

## Testes e build
- Cadastro/permissões: 97/97, 7 arquivos.
- Bateria completa: 238/238, 16 arquivos; repetida após correção de entrega, novamente 238/238.
- Anexos/monitoramento/preservação: 89/89, 4 arquivos.
- Evidências de entrega/envase: 95/95, 7 arquivos (sobreposição parcial com bateria completa; não somar como testes únicos).
- Build automático: `build-observed.log`, registros `build OK`. Typecheck independente não executado; não apresentado como prova separada.

## Acesso e reprodução
Apresentação histórica movida para `presentation/index.html`, fora de `public/`; não é mais uma página servida pelo aplicativo. Abra-a localmente junto aos artefatos. Os links apontam para a matriz e relatório desta pasta. Scripts e comandos em `harness/` e `COMMANDS.txt`; scripts são copiados para `/tmp/browser/responsive-116` para execução. Antes/depois só é reproduzível alternando a revisão pelo histórico da plataforma, não executando “before” no código corrigido.

Revisão base: `da80884ad25c78c0f9623df95f526888957fdb19`. Revisões posteriores são gerenciadas pela plataforma e registradas em `MATRIX.json`; nenhum commit manual. Rollback somente dos quatro ajustes de apresentação pelo histórico; nunca de guards/RPCs/dados.

## Checkpoint final consolidado
{"ids": 116, "checkpoint_complete": 116, "isolated_scenarios": 1914, "mounted_isolated": 577, "navigation_profiles": 15, "navigation_scenarios": 30, "visual_approval": "ONLY corrected focused scenarios; all others are measurements or gaps"}
Retestes refinados adicionais preservam arquivos `.initial.json`; não corrigem automaticamente ausência de controle. Metadados e imagens contêm apenas dados sintéticos. O refinamento de BI mostra título repartido com nome longo, sem sobreposição confirmada visualmente; não foi alterado como defeito de negócio.


## Continuação específica — fechamento desta execução
**Não é homologação integral dos 116.** Matriz compacta reconciliada em `MATRIX.json`; matriz anterior imutável em `specific/MATRIX-before-specific.json`.

| Classificação por ID (sem dupla contagem) | Quantidade |
|---|---:|
| Com asserções contextualizadas novas, sem certificar todos os perfis | 44 |
| Somente montagem/medidas anteriores, sem aprovação visual integral | 50 |
| Controles fechados/retirados no contexto atual comprovado | 9 |
| Lacunas abertas | 13 |
| **Total** | **116** |

252 cenários específicos: **250 passaram as asserções e 2 ficaram incompletos**, ambos ID110 (390/1440). Os cenários de ausência/N/A também entram nas 250 asserções; não são montagens positivas. Há 94 IDs com alguma evidência de montagem, não 94 aprovados. **Zero IDs certificados integralmente em todos os perfis elegíveis**: os perfis derivados da união de rotas não provam alçada de cada ação, e as variantes restantes continuam NOT_RUN.

Drivers originais com leitura contextualizada: produto/carrinho, cadastro de cliente, plataforma, visitas/plano/wizard, estoque/reserva, filtros/tabelas, fazenda/talhão de produtor vinculado, ficha parceira, título/recibo, aplicação, base de faturamento e dossiê. Asserções verificam conteúdo esperado, alvo por ID, rótulos, primeira/última aba e último controle útil acessível; para detalhe sem formulário, última linha e fechamento. Não basta overflow da página. Algumas verificações são agrupadas por componente e não comprovam todas as variantes internas. Tabela ID72 é substituída por cartões no celular, comprovados; tabela montada no desktop.

**Duas correções novas, apresentação apenas:** ID111, título da fazenda sem truncamento; ID115, título da ficha parceira com quebra, conteúdo flexível e ações preservadas. Retestes nos dois tamanhos por perfis listados; imagens mobile finais inspecionadas visualmente. Comparações em `specific/*before-fix.png`, `specific/specific-111-*.png` e `specific/specific-115-*.png`; resultados antigos preservados em `specific/initial-attempts/`. O iframe PDF é sintético: estas capturas não provam legibilidade dos bytes de um documento real nem transporte autenticado. Os quatro fluxos corrigidos anteriormente reutilizam `focused/` e capturas de entrega, sem nova alegação de cobertura.

**N/A contextualizados:** IDs 10,61–67 pertencem ao workspace operacional do Cockpit não montado pela entrada atual de consulta; ID40 editor global de microrganismo permanece fechado (`TENANT_CAN_EDIT_GLOBAL_CATALOG=false`). Não foram reativados. Ver `specific/driver-10.json`, `specific/driver-39.json` e fontes originais. Não estender essa classificação para outras rotas hipotéticas.

**Lacunas exatas:** 17 (confirmação interna de entrega), 52 (evidência/estado da visita), 68–69 (estados de configuração não exercitados), 73 (imagem ampliada da visita), 75 (comprovante de entrega), 88 (rodapé da visita completa), 100 (detalhe de pedido comercial), 101 (filtro fiscal), 110 (Histórico produtor: filtro de fazenda não montado), 112 (seletor produtor com múltiplos vínculos), 113 (laudo da OS no portal produtor), 116 (seletor de parceiro em contexto interno). Não são N/A: falta prova específica do estado/trigger. Nenhuma lacuna de fixture é motivo para abrir gates.

**Navegação integral local:** reutilizados 15 perfis × 2 viewports anteriores, explicitamente com casos impedidos; acrescentados 10 ensaios com App/rotas/guards originais (produtor vinculado, catálogo parceiro contextualizado, Cockpit consulta, recibos e Financeiro impedido em Estoque). `specific/routes.json` verifica conteúdo/destino observado; não exercita todos os controles por rota nem certifica guard de backend. Montagens isoladas permanecem distintas. Nenhuma conta real foi usada.

**Regressões finais:** 238/238 em 16 arquivos (`specific/regression-complete.log`, exit 0) e 39/39 em quatro arquivos focais (`specific/tests-final.log`, exit 0); não somar suítes históricas parcialmente sobrepostas. Build automático `build OK`, captura em `specific/build-final.log`; typecheck independente NOT_RUN. Revisão observada registrada na matriz; nenhum commit manual, deploy ou publicação.

**Reprodução:** `specific/run.py` em três lotes com checkpoint; `specific/routes.py` para rotas e `specific/consolidate.py` para resumo. Preservam scripts e resultados malsucedidos. Dependem da preparação dos marcadores locais pelo harness, não de alteração nas fontes do aplicativo. Evidências estão exclusivamente em scripts, não embutidas no deploy futuro.
