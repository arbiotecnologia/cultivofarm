# Envio SMTP controlado após PASS

## Objetivo
Permitir um único teste diagnóstico ao endereço fixo de homologação sem ligar as flags operacionais, mantendo convites, outbox e demais fluxos bloqueados.

## Implementação
1. Separar a prontidão SMTP em conexão, envio controlado e envio operacional.
2. Validar no servidor um PASS de conexão com até 30 minutos e anterior à última alteração da configuração.
3. Exigir Superadmin, Test Mode, allowlist exclusiva, confirmação explícita e limite de 3 tentativas por 5 minutos.
4. Fixar destinatário, assunto e conteúdo no servidor; rejeitar destinatário divergente e nunca aceitar conteúdo livre do navegador.
5. Registrar somente resultado sanitizado: aceito, falha definitiva ou ambígua; bloquear repetição cega após resultado ambíguo.
6. Atualizar o mesmo card SMTP com confirmação explícita, estado de prontidão e mensagens que distinguem aceite SMTP de entrega.
7. Cobrir flags OFF/OFF, expiração, alteração de configuração, autorização, destinatário, ambiguidade, clique duplo e preservação das flags.
8. Atualizar auditoria, matriz, roadmap e a regra arquitetural do projeto.

## Validação e entrega
- Executar testes Edge e da interface, typecheck, suíte global, build e scanner.
- Implantar somente a função de diagnóstico e dependências necessárias; publicar apenas o frontend.
- Fazer smoke passivo, sem clicar no envio.
- Parar com a instrução para o Superadmin clicar uma única vez em **Enviar e-mail de teste**.

## Limites
Nenhum e-mail será enviado durante a implementação ou smoke. Não haverá retry do convite, ativação das flags operacionais, alteração de SMTP ou implementação do SMTP2GO.
