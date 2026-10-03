# P0.2 — controle manual de atualização pós-login

## Implementação
- Estender o detector com um resultado seguro e detalhado, preservando a API atual e impedindo qualquer navegação durante verificações.
- Criar um único controle global dentro da autenticação: botão discreto para usuários conectados, mensagens por resultado e ocultação quando o aviso de atualização estiver ativo.
- Fazer uma verificação silenciosa por sessão após o login e usar um único agendamento global de 10 minutos, mantendo retorno à aba e reconexão apenas como detecção.
- Preservar o aviso atual, o adiamento persistente, a recuperação de versão antiga e a navegação única somente após clique em **Atualizar agora**.

## Testes e validação
- Cobrir autenticação, estados atual/offline/erro/update, clique duplo, login silencioso, aviso pendente, adiamento, navegação explícita única, cadência, posição móvel e acessibilidade.
- Rodar testes PWA focados, typecheck, build, suíte global e scanner.
- Fazer smoke passivo no domínio oficial após publicar, sem clicar em **Atualizar agora** e sem inventar validação autenticada quando não houver sessão disponível.

## Entrega
- Atualizar auditoria master, matriz e roadmap somente com fatos comprovados.
- Publicar apenas o frontend; não tocar Supabase, SMTP, campanhas ou dados.
