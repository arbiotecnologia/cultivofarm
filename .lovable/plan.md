# Plano D51.2-A — Correção segura do caminho SMTP

## Escopo e decisão

A infraestrutura existente será reutilizada: fila/auditoria de Comunicação, configuração SMTP server-side e adaptador SMTP testável. Não será criado provider paralelo, remetente fictício ou domínio não verificado.

O Supabase canônico não possui configuração SMTP ativa nem domínio Lovable Email configurado. Portanto, a correção será entregue **fail-closed e testável com mock**, mas o D51.2 continuará bloqueado para envio real até o SMTP existente ser configurado e homologado. Nenhum e-mail, usuário ou tenant será criado nesta fase.

## Implementação

1. **Persistência e concorrência**
   - Acrescentar ao convite existente o estado auditável do envio (`pending`, `sending`, `accepted`, `failed`), timestamps, tentativa, cooldown, lease/token de envio, chave idempotente e código sanitizado.
   - Criar RPCs server-only para reservar, aceitar e falhar o envio, com lease/fencing, cooldown e grants mínimos.
   - Manter destinatário, organização e identidade derivados exclusivamente do job persistido.

2. **Fluxo existente de convite**
   - Integrar `platform-invite-org-admin` ao adaptador SMTP existente, carregando remetente e credenciais somente no servidor.
   - Persistir a intenção antes do SMTP e marcar `sending` antes do efeito externo.
   - Não devolver link, token ou senha no modo link; manter senha temporária apenas no modo já existente.
   - Preservar `raw_app_meta_data.provisioning_request_id`, retomada da mesma conta, lease/fencing e recuperação de falhas ambíguas.
   - Não apagar a conta quando o envio puder ter sido aceito; manter o job retomável.
   - Documentar semântica **at-least-once**: SMTP não oferece idempotência forte, logo uma queda após aceite e antes da confirmação local pode causar reenvio limitado.

3. **Interface existente**
   - Remover exibição/cópia do `action_link` no modo link e mostrar somente confirmação sanitizada do envio.
   - Não criar rota, módulo ou cliente Supabase paralelo.

4. **Testes sem envio real**
   - Cobrir provider mockado: sucesso, falha, queda antes do envio, queda após aceite, retomada sem novo usuário, corrida/reenvio, cooldown, fencing e open redirect.
   - Verificar ausência de link/token/senha em resposta e logs, além de grants e ausência de `service_role` no cliente.
   - Rodar typecheck, build, testes focados, testes Deno e suíte global completa.

5. **Governança**
   - Atualizar o relatório D51.2 e o roadmap com diagnóstico, alterações, limites de idempotência, evidências e pré-condições exatas para retomar o E2E.
   - Registrar a decisão estrutural no `AGENTS.md`.
   - Manter D52 bloqueado, sem publicação.

## Pré-condição restante para envio real

Configurar e validar no servidor o SMTP existente: host, porta, usuário, senha e remetente pertencente a domínio autorizado; manter modo de teste e allowlist restrita a `teste@refilinformatica.com.br`. A execução real ainda exigirá sessão superadmin controlada e comando explícito posterior.
