# Etiqueta avulsa — implementação local, 16/11/2026

## Melhoria de logomarca e auditoria técnica — 11:49–11:56 UTC

### Estado e implementação
- Histórico confirmado em Git somente leitura: criação em `067bb21d9`, ajustes em `5ea5a5515`/`df70f5691`; os três arquivos funcionais estavam sem divergência entre `df70f5691` e HEAD inicial `98a4b9c39`. Nenhuma revisão foi restaurada ou publicada.
- Três opções: usar logomarca da empresa, enviar específica e sem logomarca. **Empresa usa fallback textual explícito**: `tenant_display_name_v1` fornece somente nome; `usePortalBranding` é de cliente/parceiro e inclui fallback global, portanto não é fonte segura da empresa operadora. Não foi inventada URL ou aberta consulta extra.
- Arquivo local PNG/JPEG/WebP: assinatura/tipo correspondentes, máximo 2 MB, 4096 px por lado e 16 MP; dimensões conferidas antes e após decode, timeout 10 s. Corrompidos, SVG, tipo divergente, URL arbitrária e WebP animado recusados. Imagem reencodificada para PNG em tons de cinza, até 1200 px, removendo metadados/conteúdo ativo; transparência preservada. Orientação de resolução ≥600 px.
- Objeto validado e congelado em memória com capability WeakSet e escopo; clones/objetos forjados/tenant B recusados. Blob URL revogado em `finally`; imagem descartada ao trocar opção/fechar/remontar por contexto. Nenhuma base64 em banco, Storage ou logs.
- Mesma `LabelScene` para prévia, PDF e print; caixa 22×10 mm, compacta 12×5 mm, aspect ratio `meet`. Nome continua presente. Fluxo oficial não recebe capability provisória. PDF aguarda decode; impressão aguarda as imagens antes de autorização. Mudança de logo durante saída invalida a conclusão.

### Arquivos alterados nesta melhoria
- Novo `src/lib/etiquetaLogo.ts` (validação, decode limitado, conversão, capabilities).
- `src/lib/etiquetaAvulsa.ts` (logo opcional transitória/escopada).
- `src/lib/etiquetasLayout.tsx` (caixa e imagem somente da variante provisória).
- `src/components/etiquetas/GerarEtiquetaAvulsa.tsx` (opções/upload/fences/readiness e espera da impressão).
- `src/components/etiquetas/etiquetas.css` (visibilidade autorizada na impressão).
- Novo `src/test/etiquetas/logo.test.tsx`, esta documentação, `AGENTS.md` e `roadmap.md`.

### Evidências executadas e erros corrigidos
- **132/132 Vitest em 10 arquivos**, incluindo 15 novos testes de logo, regras avulsas, gates oficiais, produção cancelada, fontes e autorização por perfil. Reteste final 11:55:48 UTC; logs `/tmp/browser/label-logo/vitest-final.log`.
- Typecheck/build automático final: `build OK` em 11:54:50 UTC. Não foram executados builds manuais adicionais.
- Chromium com **componentes reais locais**, Auth/transporte interceptados exclusivamente no navegador e toda saída externa bloqueada: 390×844, 464×522, 1440×900; upload/decode real dos três MIME em cada viewport, corrupção negada, fallback/sem/custom, mudança de opção, reset ao reabrir, Manual/Produção e campo de fonte preservado. Zero erros de página/rolagem horizontal no diálogo. Resultado: `/tmp/browser/label-logo/results.json`; script `audit_logo.py` e capturas na mesma pasta.
- **9 PDFs de exportação + 9 PDFs de print CSS**, nos três formatos/viewport: uma página por arquivo, 100×150/100×100/80×50 mm exatos na exportação; print Chromium ±0,2 mm por arredondamento CSS. Inspeção pypdf/Pillow verificou imagens e pixels em tons de cinza, logo presente em todos e texto na impressão. Resultado `/tmp/browser/label-logo/pdf-inspection.json`.
- **Regressão preexistente descoberta:** `src/index.css` oculta `body *` ao imprimir; o estilo avulso anterior só restaurava `display`, produzindo impressão vazia. Corrigida com `visibility: visible` exclusivamente no subtree autorizado; negativas sem autorização continuam fechadas. A primeira inspeção demonstrou PDFs print sem texto/imagem; após correção, 9/9 prints com texto e logo.
- Erro de fixture JPEG com comprimento truncado corrigido no teste (não no parser). Harness PDF tinha erro de nome/tempo `afterprint`; ajustado e reexecutado. Logs/evidências finais não substituem essas tentativas por falso PASS.

### Não executado / pendências
- Sem sessão Supabase real gerenciável: não houve comprovação de JWT/RLS A/B no backend, leitura hosted de políticas ou teste autenticado real. Nenhuma operação de banco foi realizada; o ref canônico não foi contornado. Isolamento de capability A/B foi testado automaticamente, mas **não é prova RLS**.
- Não existe leitor aprovado de logo da empresa identificado para esta entrada: opção empresa permanece textual. Integração futura exige contrato scoped previamente revisado; não há necessidade de Storage para o upload atual.
- Chromium headless não oferece diálogo nativo de impressora; botão/handler/espera/impressão CSS e PDF foram exercitados com `window.print` instrumentado no teste. Diálogo do sistema e impressora física permanecem pendentes.
- Repetição/remontagem e mudanças de opção testadas; revogação hosted durante conversão, fontes reais de empresas diferentes e E2E autenticado pelo fluxo de login não foram executados. Não há alegação de auditoria 100% ou homologação produtiva.
- Nenhuma migração, escrita operacional, configuração de empresa, Storage, deploy ou publicação.

### Rollback da melhoria
Remover a seção/opções/upload e parâmetros de logo em `GerarEtiquetaAvulsa`; remover import/campo de logo em `etiquetaAvulsa`; remover somente a caixa/fonte provisória em `etiquetasLayout`; retirar `etiquetaLogo.ts` e seu teste. **Preservar a correção de visibilidade print**, os gates oficiais e o funcionamento Manual/Produção. Sem rollback de banco/dados.

## Entrada e auditoria
- A ação está no Cockpit Operacional existente (`/cockpit-laboratorio`), integrante do Fluxo de Produção; não há nova rota ou módulo.
- A página efetivamente montada é `CockpitConsulta`, não o antigo `CockpitWorkspace`. O workspace e operações de fabricação continuam contidos.
- A emissão oficial por `EtiquetaProdutoActions` exige lote/envase e aprovação técnica. Esse contrato não pode atender uma etiqueta sem produção, portanto foi preservado integralmente.
- A etiqueta avulsa usa um discriminador provisório explícito e reutiliza `LabelScene`, `labelLayout` e `createRecipientLabelsPdf`, sem token, UUID operacional ou QR fictício. Ambos os modos utilizam a mesma cena provisória; as etiquetas oficiais mantêm `recipiente-v2` e seus gates.

## Arquivos
- `src/components/etiquetas/GerarEtiquetaAvulsa.tsx`: ação, formulário único Manual/Produção, exemplos/ajuda, seleção paginada, prévia, impressão e PDF.
- `src/components/cockpit/CockpitConsulta.tsx`: ponto de entrada no cabeçalho existente.
- `src/lib/etiquetaAvulsa.ts`: schema Zod, datas civis/máscara, sequência e snapshot exclusivamente em memória.
- `src/lib/etiquetasLayout.tsx`: variante provisória no renderizador/exportador compartilhados; nenhuma alteração da aprovação oficial.
- `src/components/etiquetas/etiquetas.css`: prévia adaptável e isolamento da saída física, autorizado somente pelo botão validado.
- `src/test/etiquetas/avulsa.test.tsx`: regras de quantidade, volume, datas, autorização e origem.

## Segurança e limites
- Somente Administrador, Gestor e Produção, sessão/perfil ativos e empresa resolvida; guard de rota e controles existentes permanecem intactos.
- Empresa por `tenant_display_name_v1`, conferida pelo hook canônico contra o tenant da sessão. Não usa marca global como empresa nem perfil fiscal desnecessário.
- Produções por `rpc_cockpit_listar_esteira_v1`, via `useCockpitQuery`, com cancelamento/fences; sem consulta direta de tabelas, sem fallback de leitor bloqueado. A autoridade tenant continua no servidor existente.
- Somente produções com estágio conhecido em andamento/concluído; referências do envelope validadas. Produto/lote/cliente/fazenda/microrganismo retornados ficam somente leitura. Fonte alterada/removida bloqueia a saída até nova seleção.
- O leitor permitido não devolve datas efetivas de fabricação/envase, composição integral aprovada, validade, volume individual ou pedido. Esses campos são complementados explicitamente; data programada e volume solicitado total nunca substituem esses dados.
- Manual não exige ID de produção/lote/pedido/estoque; lote é referência textual obrigatória, não registro. Nenhum POST de escrita, RPC de mutação, upload, estoque, financeiro ou fiscalização foi introduzido.
- Validade opcional nesta **etiqueta provisória**, mostrada como não informada se ausente; não é presumida. As etiquetas oficiais continuam exigindo validade/toxicidade aprovadas.
- Composição/conservação/alertas exigem confirmação humana de informação já aprovada; isso não representa aprovação regulatória ou validação server-side de documentos.
- Snapshot é transitório em memória, sem persistência ou histórico/reimpressão. Uma eventual trilha auditável precisa de migração separada em homologação, RLS/RBAC/tenant e idempotência próprios, antes de qualquer instalação em produção.
- Limite local 1–500 etiquetas; numeração inicial + quantidade não excede total; lock síncrono contra cliques concorrentes, fences de sessão antes/depois da conversão. Nova impressão deliberada não é proibida nem alegada como auditada.
- Modelos 100×150, 100×100 e 80×50 mm selecionáveis nesta variante; texto que excede o modelo bloqueia a emissão, sem truncamento. PDF conserva dimensões por página. QR omitido porque esta emissão não possui URI canônica real.

## Verificação
- 117/117 testes em nove arquivos: avulsa, recipiente-v2, recipientes/RPC, revisão canônica, cadastro técnico, rastreio, cancelamento contido, geração por lote e consulta-only.
- Typecheck/build automáticos finais: `build OK` em 16/11 11:46:28 UTC. Erros intermediários de inferência Zod corrigidos e teste avulsa reexecutado: 15/15 PASS às 11:46:35 UTC.
- Chromium, formulário e cena originais, com **Auth e transporte exclusivamente sintéticos interceptados no navegador** e egress externo bloqueado: 390×844, 464×522, 1440×900; modos Manual/Produção, fonte imutável, validade vazia, botão/fechamento, PDF e print autorizados. Nenhum erro de página; apenas leitores nome/lista.
- Três PDFs com três recipientes cada: 100×150 mm exatos. Print CSS Chromium: três páginas por viewport, aproximadamente 99,82×149,94 mm (arredondamento CSS do Chromium).
- Evidências temporárias: `/tmp/browser/loose-label/result.json`, script/capturas/PDFs; stdout Vitest `/tmp/loose-label-tests.log`.
- Não houve operação SQL, migração, escrita em dados reais, deploy ou publicação. Autenticação real/JWT/RLS/Storage e impressora física não foram homologados; Supabase externo sem sessão gerenciável.

## Riscos e rollback
- PDF/print são provisórios e locais; não oferecem histórico, revogação física ou certificação legal. Confirmar em impressora real com escala 100%, margens/cabeçalhos desativados.
- Busca depende da disponibilidade/isolamento do RPC instalado; esta implementação não certifica suas políticas por teste sintético.
- Rollback frontend: remover o import/ação de `GerarEtiquetaAvulsa` em `CockpitConsulta`, retirar o ramo provisório/import de `etiquetasLayout` e os estilos `loose-label-*`, então retirar os novos arquivos/testes. Não há rollback de dados/banco necessário. Preservar o fluxo oficial e seus gates.
## Refinamento de espaçamento — 16/11/2026

- Arquivo alterado: `src/lib/etiquetasLayout.tsx` (somente ramo provisório de `labelLayout`; etiquetas oficiais intactas).
- Layout em seções com réguas: cabeçalho (logo + empresa centralizados verticalmente) · produto em destaque + volume (no 80×50 volume à direita) · grade rótulo/valor em duas colunas · rodapé ancorado (recipiente NN/total, origem, aviso legal).
- Escala própria por formato (100×150, 100×100, 80×50); espaço livre distribuído entre linhas com teto, sem esticar. Excesso continua bloqueado com o erro existente "Conteúdo excede …", nunca corte.
- Mesmo `labelLayout`/`LabelScene` para prévia, PDF e impressão.
- Testes: `src/test/etiquetas/avulsaSpacing.test.tsx` (novo, 13 casos: curto/longo × manual/produção × 3 formatos, sem sobreposição, limites, conteúdo completo, produto com maior fonte, sem logo); `avulsa.test.tsx` e `logo.test.tsx` ajustados ao novo layout. Etiquetas+cockpit: 202/204; as 2 falhas são baterias PostgreSQL descartáveis (`initdb` indisponível no sandbox), não relacionadas.
- Chromium 390 e 1440 px: 20 PDFs térmicos gerados com 100×150/100×100/80×50 mm e 1 página; 80×50 com textos longos bloqueado corretamente. Evidências em `/tmp/browser/spacing/`.
- Pendências: impressora térmica física e diálogo nativo não homologados; sem sessão real/JWT/RLS.
- Rollback: reverter o ramo provisório de `labelLayout` e os três arquivos de teste.

## Validação pré-publicação — 16/11/2026 (base eeb9ab619)

- Regressão encontrada e corrigida: com logo personalizada, a 80×50 com dados curtos era bloqueada ("Conteúdo excede") porque a caixa do logo (6 mm) aumentava o cabeçalho. Caixa compacta reduzida para 10×4,2 mm, proporção preservada; teste adicionado em `logo.test.tsx` (manual e produção).
- Typecheck `tsgo -b --noEmit`: exit 0, 0 erros. `vite build`: sucesso.
- Testes `src/test/etiquetas`: 10 arquivos, 127/127 PASS.
- `src/test/cockpit-laboratorio`: 2 FALHAS de infraestrutura (não PASS): `liveSourcePostgres.test.ts` "executes actual candidate bodies without granting reader access" e `tenantFencePostgres.test.ts` "filters tenants before counting and denies unsupported roles and revoked links" — `subprocess.CalledProcessError: Command '['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups', 'initdb', ...]' returned non-zero exit status 1.`
- PDFs Chromium (390/1440 px), manual × produção, sem e com logo PNG personalizada: 100×150 (283,465×425,197 pt), 100×100 (283,465² pt), 80×50 (226,772×141,732 pt), 1 página; rasterização `pdftoppm` confirma logo completa em cinza, conteúdo completo e sem sobreposição. 80×50 com textos longos bloqueada corretamente. Evidências: `/tmp/browser/spacing/`.

## Toxicidade do produto — 16/11/2026 (base 673d21585)

- Auditoria: existe fonte aprovada (`produtos.toxicidade`, gravada por `rpc_cadastrar_toxicidade_etiqueta_produto` e usada no snapshot da etiqueta oficial). A consulta de produção do Cockpit (única leitura autorizada pela regra do Cockpit) NÃO retorna toxicidade; nenhuma leitura nova foi aberta. Logo, no modo Produção o campo não é preenchido automaticamente nem bloqueado: o usuário transcreve o texto da ficha técnica, igual ao modo Manual.
- Campo "Toxicidade do produto" (opcional, ≤200 caracteres, sem `<`, `>` ou caracteres de controle). Vazio aparece como "não informada — consultar ficha técnica"; nunca se infere atóxico/isento/não classificado. Texto informado exige a declaração de conferência técnica; a etiqueta continua provisória. Obrigatoriedade regulatória por produto não é inferida (pendência: depende da leitura autorizada da classificação).
- Layout: bloco técnico (Composição, Toxicidade, Conservação, Observações) separado por régua; 80×50 com dados gerais em duas colunas; 100×100 levemente compactada (fontes −0,3 a −1 pt, logo 8 mm). Excesso continua bloqueado ("Conteúdo excede"). Etiqueta oficial intacta.
- Arquivos: `src/lib/etiquetaAvulsa.ts`, `src/lib/etiquetasLayout.tsx`, `src/components/etiquetas/GerarEtiquetaAvulsa.tsx`, `src/test/etiquetas/avulsaToxicidade.test.tsx` (novo, 10 testes), `logo.test.tsx`.
- Testes `src/test/etiquetas`: 11 arquivos, 143/143. Bloqueio de ambiente (não PASS): `liveSourcePostgres.test.ts` e `tenantFencePostgres.test.ts` — `initdb` não executa no sandbox.
- PDFs Chromium 390/1440 px: 40 gerados (com/sem logo, manual/produção, curto/longo); 80×50 com textos longos bloqueada corretamente. Tamanhos: 226,772×141,732 / 283,465² / 283,465×425,197 pt. Rasterização confere toxicidade, régua técnica e ausência de sobreposição.
- Rollback: remover `toxicity` do schema/formulário/linha do layout e reverter `cols`/escala `m` em `labelLayout`.

## Textos adicionais configuráveis (16/11/2026)

- Seção "Textos adicionais da etiqueta" com dois controles independentes: "Exibir identificação de origem" (até 80 caracteres) e "Exibir aviso de rotulagem" (até 160). Ambos vêm ligados e preenchidos com os textos anteriores; campo de edição só aparece quando ligado; botão "Restaurar padrão".
- Estado (`showOrigin`, `originText`, `showLegal`, `legalText`) está no schema `looseLabelSchema` e no snapshot provisório; o renderizador compartilhado (`labelLayout` → prévia/print/PDF) omite o bloco desligado sem reservar altura nem traço divisório.
- Origem padrão segue o modo: Manual "AVULSA · NÃO VINCULADA À PRODUÇÃO"; Produção "AVULSA · PRODUÇÃO <OS>". Produção não aceita texto "não vinculada".
- Validações: texto vazio com opção ligada bloqueia; caracteres de marcação recusados; textos que afirmem rótulo/etiqueta oficial, conformidade, registro/aprovação MAPA, homologação, dispensa/isenção ou substituição da rotulagem são recusados. Status `provisoria`, `operational_provisional`, ausência de QR/rastreio e aviso do cabeçalho do formulário permanecem. Não foi encontrada regra técnica no código que obrigue o aviso impresso; ao ocultá-lo, o formulário informa uso apenas interno.
- Overflow: texto longo nunca é truncado; se não couber, mantém o bloqueio "Conteúdo excede…".

### Evidências
- `src/test/etiquetas/avulsaTextosAdicionais.test.tsx`: 30 testes (3 formatos × 2 modos × 4 combinações, altura liberada, texto editado, longo, validações, produção, alegações proibidas/status).
- Etiquetas + cockpit: 248/250; 2 falhas só por ambiente (`liveSourcePostgres.test.ts`, `tenantFencePostgres.test.ts`: `subprocess.CalledProcessError: Command '['setpriv', ..., 'initdb', ...]' returned non-zero exit status 1.`) — não marcadas como PASS.
- Typecheck 0 erros; build OK.
- Chromium (módulos reais via Vite, sem sessão, egress externo bloqueado): 24 PDFs (3 formatos × 2 modos × 4 combinações), todos 100×150/100×100/80×50 mm; rasterização 80×50 ligado/desligado conferida visualmente (blocos ausentes, sem lacuna). Logomarca não incluída nesta rodada de PDF (coberta pelos testes de layout existentes); diálogo nativo de impressão e impressora física não testados; sem JWT/RLS real.

### Rollback
Reverter `src/lib/etiquetaAvulsa.ts` (campos/validações extras), bloco de rodapé em `src/lib/etiquetasLayout.tsx`, a seção no `GerarEtiquetaAvulsa.tsx` e remover o teste novo. Sem banco, Storage, rotas ou migrações.
