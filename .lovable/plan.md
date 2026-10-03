# Correção dos indicadores de segredos

## Implementação
- Separar presença de referências de segredo das flags booleanas em `communication-provider-settings`.
- Usar o novo helper somente nos quatro indicadores sanitizados de SMTP, WhatsApp e webhook.
- Manter a leitura do Vault, os segredos, as flags e a interface visual inalterados.

## Validação
- Cobrir referência UUID presente, valor nulo, flags booleanas, ausência de vazamento, paridade SMTP e regressão WhatsApp/webhook.
- Executar testes focados, typecheck, build e scanner.
- Implantar somente `communication-provider-settings` e fazer GET sanitizado autenticado, sem probe SMTP ou envio.

## Registro
- Atualizar auditoria, matriz e roadmap com a correção visual e manter SMTPi KingHost como próximo passo.
- SMTP2GO permanece somente planejado.
