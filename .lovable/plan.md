# D51.2 — Reenvio persistente de convite

## Implementação
- Exibir ação direta na linha para convites por link em estado pendente ou falho, preservando o fluxo especial para envio ambíguo.
- Abrir confirmação própria para o reenvio normal e reutilizar o mesmo hook e payload do registro, sem preencher o formulário superior.
- Bloquear duplo clique por linha, manter mensagens sanitizadas e atualizar a lista após a conclusão.

## Validação
- Adicionar testes de elegibilidade, confirmação, payload, proteção concorrente e atualização da lista.
- Rodar testes focados, typecheck, build, suíte e scanner.
- Publicar o frontend uma vez e executar smoke passivo sem acionar reenvio.

## Limites
- Nenhuma alteração de banco, Edge Function, RPC, rota, flags ou dados operacionais.
- Nenhum convite será gerado ou enviado durante implementação e validação.
- Atualizar somente auditoria, matriz e roadmap com fatos comprovados.
