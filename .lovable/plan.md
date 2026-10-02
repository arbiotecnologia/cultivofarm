# Plano D51.2-E — Prontidão SMTP e diagnóstico seguro

## Escopo

Ajustar somente a tela existente de Comunicação e o teste SMTP existente, sem configurar SMTP, enviar mensagens, criar dados, publicar ou iniciar E2E/D52.

## Implementação

1. **Prontidão na tela**
   - Exibir o card “Prontidão SMTP para homologação” usando exclusivamente `smtp_readiness` já retornado pelo servidor.
   - Mostrar os dez itens solicitados, o resultado “Não pronto”/“Pronto para teste controlado” e o aviso de envio bloqueado enquanto as flags estiverem desligadas.
   - Não expor segredo, referência Vault, token ou credencial.

2. **Teste SMTP bloqueado e controlado**
   - Pré-preencher e fixar o destinatário deste gate em `teste@refilinformatica.com.br`.
   - Desabilitar o botão sempre que `ready_for_controlled_test` for falso, além dos estados já existentes de sessão/validação.
   - Manter o salvamento das credenciais independente das flags; nenhuma flag será ativada automaticamente.

3. **Sanitização ponta a ponta**
   - Remover da interface logs e mensagens com corpo bruto, `detail`, host, porta ou exceção.
   - Restringir a UI a códigos de erro allowlisted e mensagens genéricas.
   - Endurecer `test-communication-email` para exigir administrador, test mode, allowlist e preflight completo antes de importar/abrir o adaptador SMTP.
   - Retornar somente códigos e metadados sanitizados, sem host, porta, remetente, destinatário, detalhe bruto ou segredo.

4. **Validação e governança**
   - Adicionar testes para checklist, bloqueio do botão, destinatário controlado, ausência de diagnóstico bruto e rejeição server-side antes do socket.
   - Rodar typecheck, testes focados, suíte global e verificar o build automático.
   - Atualizar o relatório D51.2 e o roadmap, mantendo envio/E2E/D52 bloqueados.
