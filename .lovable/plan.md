# P0.3.1 — Botão manual de atualização somente com ícone

## Implementação
- Remover o texto visual persistente do botão e manter apenas `RefreshCw`, alternando para `Loader2` durante a verificação.
- Preservar o rótulo acessível, o tooltip, o tamanho compacto e toda a lógica P0.3 existente.
- Ajustar somente os testes e registros de auditoria/roadmap ligados a esse refinamento visual.

## Validação e publicação
- Executar testes PWA focados, typecheck, build e scanner.
- Publicar o frontend uma única vez.
- Fazer smoke passivo oficial, sem clicar no controle e sem qualquer recarga automática.

## Restrições
- Não alterar detecção, prompt, scheduler, storage, SMTP, Supabase, E02, REFIL ou AR BIO.
