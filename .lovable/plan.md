Plano de melhoria do agrupamento de ações na tabela de microrganismos.

## Problema
A coluna de ações da tabela de microrganismos (`/protocolos`) exibe vários botões lado a lado (status, volumes, ficha, PDF, info, excluir), causando poluição visual e dificultando o uso, especialmente em viewports estreitas.

## Solução proposta
Reorganizar as ações em três níveis de hierarquia na célula de ações de cada linha:

1. **Ações primárias — sempre visíveis** (botões outline compactos com ícone + texto):
   - Volumes
   - Ficha técnica
2. **Status/contexto — sempre visível**:
   - Badge de perfil técnico (como indicador, não como botão)
3. **Ações secundárias — agrupadas em `DropdownMenu`** (ícones com labels):
   - Exportar PDF
   - Observações (quando houver)
   - Excluir (com destaque visual de perigo)

Ações que dependem de item específico (ex: info só aparece quando há observações, excluir sempre presente) ficam no menu. O dropdown será acionado por um botão ghost "Mais ações" com ícone de 3 pontos verticais, permitindo acesso rápido sem poluir a linha.

## Mudanças esperadas
- `src/components/protocolos/MicrorganismosTab.tsx`
  - Importar `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` e ícone `MoreVertical`.
  - Substituir o bloco de botões inline na célula de ações por: badge + botões primários + dropdown de ações secundárias.
  - Manter `stopPropagation` no container para que clique nas ações não abra o editar da linha.
  - Preservar todos os handlers e acessibilidade (tooltips, aria-labels).
- Não alterar schema, hooks, lógica de negócio ou outras rotas.

## Validação
- Executar `bunx vitest run src/test/fiscal` para garantir que nenhum teste fiscal regrediu.
- Executar `typecheck` e `build`.
- Verificar visualmente no preview que as ações ficam agrupadas e responsivas.

## Resultado esperado
Tabela mais limpa, com ações principais em 2 cliques e ações secundárias em 1 clique a mais via dropdown, reduzindo a largura ocupada pela coluna de ações.