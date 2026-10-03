# Plano — teste SMTPi seguro da KingHost

## Implementação
- Adicionar uma rota candidata estritamente allowlisted no diagnóstico de conexão: somente `kinghost_smtpi`, apenas para hosts domésticos KingHost reconhecidos e porta 465.
- Clonar a configuração efetiva somente em memória, trocar apenas o host pelo par SMTPi correspondente e executar o probe existente sem envelope ou envio.
- Retornar apenas resultado sanitizado e a rota lógica; registrar auditoria específica sem host, usuário, senha ou mensagem bruta.
- Expor no status sanitizado apenas a elegibilidade da rota KingHost, sem revelar o host atual.

## Interface
- No card SMTP existente, mostrar o teste SMTPi somente quando a configuração for elegível e a tentativa atual tiver falhado por recusa TCP.
- Após PASS na sessão atual, habilitar confirmação explícita para aplicar a rota SMTPi.
- Aplicar pelo endpoint existente enviando somente o novo host; preservar senha, porta, usuário, remetente e flags.
- Limpar o resultado candidato após salvar e exigir novo clique no teste normal.

## Banco e segurança
- Criar migration mínima para aceitar `smtp_connection_candidate_test` na RPC de auditoria, mantendo `service_role` exclusivo, validação de Superadmin e RLS atuais.
- Não alterar configuração durante o teste, não aceitar host arbitrário e não executar qualquer probe ou envio nesta implementação.

## Validação e entrega
- Cobrir mapeamento KingHost/Uni5, não aplicabilidade, não persistência, ausência de envio e vazamentos, preservação de credenciais/flags, autorização, clique duplo, aplicação seletiva e acessibilidade móvel.
- Rodar checks/testes Deno, testes focados, typecheck, build, suíte global e scanner.
- Implantar somente as funções alteradas, publicar o frontend e fazer smoke passivo sem clicar em teste/aplicar.
- Atualizar auditoria, matriz e roadmap apenas com resultados observados; manter SMTP2GO planejado e M1 não iniciado.
