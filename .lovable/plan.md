# Refinamentos pontuais do Cockpit

## Escopo
- Ajustar acessibilidade, textos e comportamento responsivo dos filtros e abas do Cockpit, sem remover filtros, indicadores ou estados atuais.
- Manter o histórico somente com eventos reais, incluindo o status oficial na chave de atualização e normalizando todas as ocorrências de sublinhado no rótulo da ação.
- Tornar explícito o pré-requisito de lote no passo de CQ e empilhar ações no celular sem truncamento.
- Proteger a finalização contra envio duplicado, manter a confirmação aberta em falha, fechar somente em sucesso e apresentar retorno amigável para exceções e pendências.
- Adicionar testes focados para finalização, filtros, histórico e os ajustes do passo a passo.

## Limites
- Nenhuma alteração de banco, migrations, integrações, credenciais, permissões ou regras do servidor.
- Nenhuma publicação ou sincronização com GitHub.
- Preservar o cliente canônico já existente e não acessar ambientes externos.

## Validação
- Executar os testes focados afetados.
- Executar TypeScript com `tsconfig.app.json`.
- Conferir o resultado automático da compilação e relatar somente evidências locais, sem alegar validação de produção.
