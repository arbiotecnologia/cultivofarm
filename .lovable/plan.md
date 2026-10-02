# P0.1 — identificador explícito de publicação

## Objetivo
Detectar qualquer nova publicação pelo HTML, mesmo quando apenas um módulo interno muda, sem Service Worker e sem atualização automática.

## Implementação
1. Injetar no HTML de produção a meta `cultivo-build-id`, usando SHA de publicação/commit disponível ou um timestamp único do processo de build.
2. Priorizar essa meta na leitura da versão carregada e publicada; manter o hash do módulo principal como compatibilidade para páginas antigas.
3. Preservar o fluxo manual atual: detectar mostra aviso/badge; **Adiar** nunca navega; somente **Atualizar agora** navega uma vez.
4. Cobrir igualdade/diferença de build ID, mudança apenas de módulo interno, HTML legado, migração de sessão antiga, eventos de retorno/online, limpeza legada, push e presença do diagnóstico SMTP.
5. Atualizar auditoria, matriz e roadmap com causa, evidências e resultado.

## Validação e publicação
- Executar testes PWA e Comunicação focados, typecheck, build, suíte global e scanner.
- Publicar o frontend uma única vez se tudo estiver verde.
- Confirmar no domínio oficial a meta, o botão SMTP e a ausência de overlay/recarga automática, sem clicar em controles SMTP.

## Limites
Não alterar Supabase, SMTP, E01, E02, REFIL ou AR BIO; não executar probe nem enviar e-mail.
