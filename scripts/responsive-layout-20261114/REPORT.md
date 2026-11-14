# Revisão responsiva — Configurações / Novo Usuário — 14/11/2026

## Resultado e contenção
Correção local, sem publicação, deploy, SQL, alteração de binding, dados ou permissões. Nenhuma chamada hospedada: navegador intercepta Auth/cliente com fixtures exclusivamente sintéticas e bloqueia toda rede externa. URL de teste local `/__layout-review` é interceptada pelo navegador e **não foi acrescentada ao aplicativo**.

Revisão observada antes do fechamento documental: `7ec21d5e6f96112a3e0a80a88db6c44ab8ce3a09` (gerenciada pela plataforma; nenhum commit manual). `source-sha256.txt` identifica os bytes entregues.

## Causa e correções
- `/configuracoes?tab=usuarios`: Button inline-flex + altura fixa + nowrap em três colunas estreitas colocava título/descrição em linha fora das opções. Reprodução anterior 464×522: três opções com overflow, spans fora dos próprios botões.
- Seletor agora no corpo rolável, título/descrição empilhados, quebra de linha, altura automática, uma coluna abaixo de 480px. Cabeçalho/ação permanecem fixos. Perfis internos também passam a uma coluna em estreito; vínculos externos quebram nomes extensos e ações.
- Diálogos compartilhados limitam largura/altura à área visível; título quebra linha e fechamento tem alvo 44px. Fixação de dimensão do fechamento impede sobrepor o título no zoom de texto.
- Confirmações longas: conteúdo rolável e ações aderentes ao fundo, textos sem vazamento. Abas mantêm rolagem horizontal local e tabelas têm região rolável acessível por teclado.
- MobileCard: títulos/subtítulos/valores extensos quebram, ações fazem nova linha. Antes a composição compartilhada tinha largura 846px em telas de 320/464px; depois largura da página igual ao viewport.
- PageHeader e barra de ações de Usuários: links/botões quebram com zoom; filtros ocupam largura disponível em estreito. Edição de usuário: perfis/ação extensa deixam de exigir altura fixa.

## Evidência visual (navegador sintético, não JWT real)
`check_layout.py`, `before.json`, `after.json`, stdout e capturas: **30 estados de cadastro**, três tipos × dez cenários (320×568, 360×640, 390×844, 464×522, 768×1024, 1280×1800, 1920×1080, 640×900 equivalente à área útil de desktop com zoom 200%, mais texto ampliado 200% em 464×522 e 320×568). Nome/email preenchidos; nomes longos de empresa/parceiro/cliente sem espaços. Cada estado verifica título acima da descrição, nenhum overflow de opção/página, diálogo dentro da tela, fechamento/ação visíveis. Seletor e formulário são rolados independentemente; fechamento efetivamente clicado. Validação inválida acionada antes de qualquer envio; nenhum cadastro é gravado.

Três composições compartilhadas em 320/464/1280px e três confirmações longas: medidas e capturas. Abas/tabela capturadas individualmente. **Zero pageerrors; saída 0**. Zoom do navegador nativo/teclado Ctrl+Plus não foi exercitado: reflow equivalente e ampliação CSS do texto estão discriminados, não são alegados como zoom nativo.

## Testes automatizados
- Cadastro/edição/validação/permissões/navegação: **97/97, 7/7 arquivos**, exit 0.
- Bateria ampliada completa sem filtro/skip: **238/238, 16/16 arquivos**, exit 0.
- Tentativa intermediária: 235 PASS/3 FAIL exclusivamente pelo seletor inglês `Close` após tradução acessível para `Fechar`; log inicial preservado. Atualizados somente três seletores no teste existente, sem remover ou enfraquecer asserções de pendência/reconciliação/descarte. Reexecução íntegra PASS.
- Build automático: registro `build OK` copiado de `/tmp/observability/build-errors.log`; nenhum build/typecheck manual, conforme ambiente. Typecheck independente não executado neste turno; não apresentado como prova separada.

## Inspeção estática do sistema (não certificação visual)
`inventory.cjs` deriva **183 declarações de rota** do App atual, varre **2035 arquivos** e segue imports locais recursivos; compara a fonte com o inventário histórico de 07/10. `inventory.json`/`INVENTORY.md` listam rotas/telas/linhas/consumidores; `static-candidates.json` registra **116 candidatos** restantes com prioridade P1/P2. O grafo é limite superior (imports podem não montar). Foram inspecionados formulários, diálogos, barras, abas, tabelas e painéis através dos compartilhados; **demais telas não foram abertas nem visualmente certificadas**.

P1: confirmar diálogos com tamanhos locais fixos e grades rígidas de abas nos contextos reais; P2: seletores fixos e barras nowrap. Tabela larga com rolagem local não é automaticamente defeito. Prioridades/arquivo/linha estão no inventário; encontrar classe suspeita não autoriza mudar função.

## Arquivos e rollback
Runtime: `src/pages/Configuracoes.tsx`, `src/components/configuracoes/ExternalRegistrationFields.tsx`, `src/components/ResponsiveHelpers.tsx`, `src/components/ui/dialog.tsx`, `alert-dialog.tsx`, `tabs.tsx`, `table.tsx`. Teste: `src/test/catalogo/unifiedProducts.realClient.test.tsx` (apenas seletores). Regra/documentação: `AGENTS.md`, `roadmap.md`, este diretório.
Rollback: reverter somente alterações de apresentação e seletores desta revisão pela ferramenta de histórico da plataforma; não tocar guards/RPCs/RLS, banco ou revisões anteriores.

## Lacunas
Sessões reais e todos os consumidores de cada rota não exercitados; navegação autenticada integral e teclados móveis reais não certificados. Nenhum envio de cadastro real foi testado. Componentes locais que sobrescrevem dimensões/overflow do compartilhado exigem reprodução própria, conforme prioridades. Pendências históricas de outros módulos permanecem abertas e não foram reclassificadas.
