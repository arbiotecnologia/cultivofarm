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
Prévia: `/revisao-responsiva-116/index.html` (arquivo estático, não nova rota React). Compara antes/depois e oferece matriz. Página verificada mobile/desktop, oito imagens renderizadas. Scripts e comandos em `harness/` e `COMMANDS.txt`; scripts são copiados para `/tmp/browser/responsive-116` para execução. Antes/depois só é reproduzível alternando a revisão pelo histórico da plataforma, não executando “before” no código corrigido.

Revisão base: `da80884ad25c78c0f9623df95f526888957fdb19`. Revisões posteriores são gerenciadas pela plataforma e registradas em `MATRIX.json`; nenhum commit manual. Rollback somente dos quatro ajustes de apresentação pelo histórico; nunca de guards/RPCs/dados.

## Checkpoint final consolidado
{"ids": 116, "checkpoint_complete": 116, "isolated_scenarios": 1914, "mounted_isolated": 577, "navigation_profiles": 15, "navigation_scenarios": 30, "visual_approval": "ONLY corrected focused scenarios; all others are measurements or gaps"}
Retestes refinados adicionais preservam arquivos `.initial.json`; não corrigem automaticamente ausência de controle. Metadados e imagens contêm apenas dados sintéticos. O refinamento de BI mostra título repartido com nome longo, sem sobreposição confirmada visualmente; não foi alterado como defeito de negócio.
