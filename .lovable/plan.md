Remover a propriedade `badge: "Técnico"` dos itens Lotes, Controle de Qualidade e Envase em `src/config/navigation.ts` (linhas 125–127). Nenhuma outra alteração é necessária — o `AppSidebar` já ignora quando `badge` está ausente.

Validação: `bun run typecheck` e `bun run test`.