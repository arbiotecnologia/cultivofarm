# P0 PWA — atualização exclusivamente manual

## Objetivo
Eliminar o app-shell Workbox e qualquer caminho de atualização ou recarga automática, mantendo instalação por manifesto e push em worker estável separado.

## Implementação
1. Remover `vite-plugin-pwa` da configuração e dependências; manter manifesto e ícones estáticos.
2. Publicar um `/sw.js` de migração por um ciclo para desregistrar o worker legado e apagar apenas caches identificáveis do app-shell, sem navegar ou recarregar clientes.
3. Tornar `/push-sw.js` independente de Workbox e registrá-lo diretamente, sem precache de HTML/assets ou controle de atualização da aplicação.
4. Substituir o detector baseado em `waiting`, `updatefound` e `controllerchange` por comparação `no-store` do token do bundle carregado versus o HTML publicado, no intervalo de 60 minutos e em `visibilitychange`/`online`.
5. Preservar o aviso não bloqueante, Adiar e o botão persistente; somente “Atualizar agora” fará uma navegação única, explícita e protegida contra loop.
6. Manter falhas de chunk sem recarga automática, com ações manuais, e fazer `?sw=off` limpar workers/caches pertinentes sem reload.
7. Remover textos, eventos e caminhos executáveis legados; atualizar a decisão técnica e pausar a campanha nos documentos.

## Validação e publicação
- Cobrir detecção, adiamento, clique único, eventos passivos, migração legada, caches, `?sw=off`, stale chunk, formulário, acessibilidade e push.
- Executar testes PWA focados, typecheck, build, suíte global e scanner; inspecionar artefatos gerados.
- Publicar somente o frontend se tudo passar e fazer smoke limpo e com worker legado simulado no domínio oficial.
- Se não houver propagação, registrar e parar sem repetir publicação.

## Limites
- Nenhuma alteração em Supabase, SMTP, E01/E02, convite, REFIL ou AR BIO.
- A campanha AUDIT-CF permanece pausada até este P0 ficar PASS; depois retoma no ponto E02 SMTP.