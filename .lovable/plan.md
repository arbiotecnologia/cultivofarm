# D51.2 — fallback manual de link de acesso

## Implementação por fases
1. **Contrato e segurança:** estender `platform-invite-org-admin` com `delivery_mode=email|manual_link` (padrão `email`), mantendo JWT e autorização de Superadmin. O modo manual ignorará somente gates de SMTP/flags, aceitará apenas acesso por link pendente ou falho, reutilizará o mesmo job e conta, e continuará usando o redirect canônico do servidor.
2. **Estado e auditoria:** ajustar o claim existente apenas no necessário para o modo manual não depender de cooldown/ambiguidade de e-mail, sem incrementar tentativas de e-mail nem alterar seu estado. Reutilizar a auditoria existente para sucesso/falha com metadados fixos e sem URL/token. Não criar tabela, job, usuário ou papel paralelo.
3. **Resposta protegida:** devolver `manual_link` exclusivamente no sucesso manual, com `Cache-Control: no-store, private`; nunca devolver o link no modo e-mail nem registrá-lo em logs, banco ou telemetria.
4. **Interface reutilizável:** criar um diálogo seguro em memória com confirmação, cópia via Clipboard e limpeza ao fechar/desmontar. Usá-lo nas ações de Administradores e no estado de empresa pronta/falha SMTP da Nova Empresa, preservando o reenvio atual e o aviso adicional para entrega ambígua.
5. **Hook e tipos:** adicionar `deliveryMode` ao hook existente e permitir `manual_link` apenas na resposta tipada, sem persistência ou logs.

## Validação e entrega
- Cobrir autorização, elegibilidade, reutilização, bypass somente dos gates SMTP, invariância do estado de e-mail, redirect, cache, ausência do link no modo e-mail/auditoria/logs e concorrência sem duplicação.
- Cobrir confirmação, cópia segura, limpeza de memória, ambiguidade, Nova Empresa, acessibilidade e larguras móvel/desktop.
- Rodar testes Edge e React focados, typecheck, build, suíte global e scanner; revisar o diff contra persistência/log de credencial.
- Implantar somente a função e dependências alteradas, publicar o frontend uma vez e executar smoke passivo sem gerar link nem enviar e-mail.
- Atualizar auditoria master, matriz, roadmap e a regra arquitetural correspondente.

## Limites operacionais
- Validar fail-closed o projeto canônico `swzpzcwiasxmjutrmvkm` antes de qualquer mudança de banco.
- Não gerar link real, não enviar e-mail, não alterar flags e não tocar no job E02 operacional durante implementação ou smoke.
