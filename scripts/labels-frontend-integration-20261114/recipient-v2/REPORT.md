# Integração recipiente-v2 — projeto principal

## Resultado
Integração local, sem publicar, deploy, SQL, gravação hospedada ou alteração de binding. Origem: projeto cf4a99d8-4f13-43a9-98bb-c02d12786e8f, snapshot efetivamente disponibilizado no commit **5461097f689a2d5a8ec30e711c7c4fe0a0e8de11**. A revisão 8c1defcb indicada pelo proprietário não foi obtida separadamente; a última revisão inclui a composição homologada utilizada. Revisão principal observada após os ajustes: **d9c68597a80946d886458d4059f0c55969c0066e**; documentação/evidências posteriores podem gerar novo commit automático. Manifesto source-sha256.txt identifica os bytes entregues.

## Integração
- A cena homologada é compartilhada por prévia, PDF e impressão: 20 L/100×150 vertical, 5 L/100×100 e 1 L/80×50 horizontal. Faixa inferior integral de toxicidade, volume destacado, empresa/produto, lote/validade, código/seq/total e QR à direita com quatro módulos de margem.
- Volume vem do snapshot do recipiente, nunca do total do lote; template/versionamento e dimensões são conferidos. Validade/toxicidade ausentes, legado não regularizado, CQ/status inválidos e conteúdo excessivo bloqueiam antes da auditoria. Nenhum texto é cortado para fazer caber.
- Lote misto gera PDF com páginas individuais nos três formatos. Impressão térmica nativa exige seleção de um formato por vez; A4 preserva as dimensões das etiquetas. QR fixa app.cultivofarm.com.br, sem origem homologatória. Logo é exclusivamente real do snapshot, com URL pública canônica de produção ou imagem embutida válida.
- Cadastro de validade somente em Lotes; toxicidade somente em Produtos, nos controles mobile e desktop existentes. Gestor/admin passam pelo monitor já existente e a RPC mantém a autoridade efetiva servidor/tenant. Sem campos técnicos no print.
- Mantidas correção com motivo/idempotência/substituta e leitura fresca, seleção deduplicada, sessão e auditoria antes da saída; CSS permanece fechado e Ctrl+P/Meta+P não abrem permit sem ACK, afterprint/disposal removem permit. Leituras e prévia legadas permanecem; saída de recipientes legados exige regularização.

## Evidências
- **203 testes em 15 arquivos PASS**, comando em tests.log: etiquetas, envase, lotes e contrato real-client de produtos com transporte simulado. Inclui formulários, rejeições independentes, datas inválidas, falta de referência, UUID de perfil, revogação, duplo clique, ACK tardio, lote misto, CQ/histórico, overflow, correção/substituta e teclado/afterprint.
- Bateria ampliada: **233 PASS / 1 FAIL** em 16 arquivos (expanded-regression.log). A única falha é a expectativa de navegação Financeiro sem Serviços em unifiedProducts.realClient.test.tsx:146. Código e expectativa já coexistiam na revisão anterior 6eb26a75499c4473cb47578673e52171a2a337b0; reteste isolado mantém falha. Não alterar permissões/rotas para satisfazer teste fora do escopo. Demais 34 testes desse arquivo passaram na bateria ampliada.
- Compilação/typecheck automáticos: última entrada observada **build OK 2026-11-14T12:34:08Z**. Nenhum build/typecheck manual nem mudança de dependências do projeto.
- Playwright/Chromium, Auth e RPC mockados, rede externa bloqueada: formulários→ACK sintético→mensagem; seleção mista→RPC auditada→download PDF. Desktop 1280×1800/mobile 390×844 sem overflow global ou pageerror. Harness não é nova rota persistida do app.
- PDF **3 páginas**: **100×150 / 100×100 / 80×50 mm exatos**, QR **3/3** decodificados para URL de produção com token opaco (pdf-verification.json). PDF direto sem permit não contém texto nem imagens das etiquetas. Capturas conferidas visualmente e PDF possui a mesma cena.

## Arquivos e reversão
Arquivos alterados/adicionados estão listados em source-sha256.txt; testes e evidências ao lado deste relatório. Cliente Supabase, binding, App/rotas, banco, funções remotas e permissões não foram modificados. Reversão: retirar apenas a cena v2, helper/formulário e entradas deste delta e restaurar consumidores da revisão anterior; manter sempre contenção de impressão/CQ/legado, nunca reabrir writers ou desfazer histórico de banco. Não há rollback SQL.

## Limites
Não houve sessão real/JWT/RLS/Storage, instalação/validação de banco produtivo, impressão física, leitor de QR físico, consulta de logo real ou escrita produtiva. O proprietário instala o banco. Não certificado E2E real nem publicação. A divergência de teste de navegação permanece documentada, fora desta integração.
