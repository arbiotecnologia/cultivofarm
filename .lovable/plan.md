# P0 PWA — atualização manual com adiamento persistente

## Objetivo
Substituir toda atualização normal automática por um fluxo não bloqueante controlado pelo usuário, preservando o kill-switch `?sw=off` e impedindo loops de recarga.

## Implementação
1. **Service worker manual**
   - Alterar a configuração para modo prompt, sem `skipWaiting` automático.
   - Detectar worker `waiting` sem ativá-lo e emitir `pwa:update-available` com identificador técnico.
   - Expor `applyPendingUpdate()` e `dismissPendingUpdate()`; somente a primeira poderá enviar `SKIP_WAITING`.
   - Recarregar uma vez apenas em `controllerchange` associado a uma intenção explícita, com trava anti-loop.
   - Remover o estado/eventos do overlay e qualquer fallback de recarga automática por atualização normal.

2. **Aviso e badge persistente**
   - Substituir o overlay por um aviso discreto com “Atualizar agora” e “Adiar”.
   - Após adiar, mostrar botão flutuante persistente e acessível, ajustado para desktop, mobile e safe-area.
   - Guardar apenas identificador/timestamp do update; a mesma versão adiada não reapresentará o aviso.
   - Remover estado/badge se o worker desaparecer ou ficar redundante.
   - Exibir progresso e erro dentro do aviso, sem bloquear o restante da aplicação.

3. **Recuperação de pacote incompatível**
   - Trocar recarga automática por estado explícito de atualização necessária.
   - Oferecer “Atualizar agora” e “Tentar novamente”; qualquer reload dependerá de clique e respeitará a trava.
   - Manter limpeza restrita aos caches runtime seguros e documentar `?sw=off` como recuperação emergencial.

4. **Validação e publicação**
   - Cobrir detecção, adiamento, persistência, versão nova, ativação explícita, `controllerchange`, falhas, acessibilidade, kill-switch e bloqueios de preview/dev.
   - Executar testes focados, typecheck, suíte global, build e scanner.
   - Publicar somente o frontend uma vez e fazer smoke anônimo no domínio oficial; se não propagar, registrar e parar.

## Limites
Nenhuma alteração em banco, Supabase, SMTP, E01/E02, organização REFIL, job AR BIO ou D52.
