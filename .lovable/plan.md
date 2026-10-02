# Diagnóstico SMTP em duas etapas — AUDIT-CF-20261002-01

## Objetivo
Adicionar à aba Comunicação um diagnóstico seguro em duas etapas: primeiro validar conexão, TLS, protocolo e autenticação sem enviar mensagem; depois manter o envio real controlado, fixo ao destinatário autorizado e bloqueado enquanto a prontidão estiver incompleta.

## Implementação
1. Criar um helper SMTP compartilhado e testável para o probe sem `MAIL FROM`, `RCPT TO` ou `DATA`, com limites de leitura, timeout por etapa e absoluto, fechamento garantido e resultados estritamente allowlisted.
2. Estender `test-communication-email` com `mode: connection | send` (default `send`): autenticação Superadmin comum, rate limits separados, probe permitido com entrega OFF/OFF e envio preservando todos os gates atuais.
3. Para porta 465, usar TLS implícito; para outras portas permitidas, exigir STARTTLS antes de autenticar. Bloquear 25/587 e nunca transmitir credenciais em texto claro.
4. Reutilizar a auditoria existente de Comunicação. Uma migration idempotente ampliará a tabela existente com metadados sanitizados do diagnóstico e criará uma RPC service-role-only para registrar ator, ação, resultado, código, estágio e latência, sem segredos, host, destinatário ou resposta SMTP bruta.
5. Atualizar a aba Comunicação com os passos Conexão e Envio controlado, resultado e latência seguros, motivos de bloqueio, proteção contra clique duplo e confirmação explícita antes do envio real. Conexão PASS não abrirá flags nem enviará e-mail.
6. Preservar o destinatário fixo e distinguir “aceito pelo servidor SMTP” de entrega na caixa postal. Resultado ambíguo continuará explícito e sem retry automático.

## Validação
- Testes unitários do protocolo: TLS 465, AUTH PLAIN/LOGIN, STARTTLS, timeouts, respostas inválidas, AUTH 535, limites de leitura, fechamento do socket e bloqueio 25/587 antes do socket.
- Testes da função: 401/403, conexão com OFF/OFF, envio bloqueado sem readiness, sanitização, rate limit separado e ausência de job/outbox/tentativa no modo conexão.
- Testes de interface: estados, confirmação, clique duplo, bloqueios, mobile e acessibilidade.
- Executar Deno check, testes focados, typecheck, build, suíte global e scanner.

## Implantação e parada segura
- Validar explicitamente o projeto canônico `swzpzcwiasxmjutrmvkm` antes de qualquer migration/deploy.
- Aplicar somente a migration auditável necessária, implantar `test-communication-email` com os helpers compartilhados e publicar o frontend; `communication-provider-settings` só será implantada se seu contrato mudar.
- Fazer smoke sem abrir flags, sem probe real e sem envio. Depois parar e orientar o Superadmin a executar apenas **Testar conexão do provedor**.
- Não reenviar convite, não alterar E01/E02, REFIL ou AR BIO e não avançar a Fase 2.
