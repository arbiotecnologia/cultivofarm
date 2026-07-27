## Problema

A aba **Comunicação** em `/configuracoes` está oculta porque depende da flag `VITE_COMUNICACAO_MODULE_ENABLED=true`, que não está definida no `.env`. Sem ela, `isComunicacaoModuleEnabled()` retorna `false` e tanto o `TabsTrigger` quanto o `TabsContent` são omitidos em `src/pages/Configuracoes.tsx` (linhas 471 e 478).

O código da aba já existe e está pronto (`src/pages/configuracoes/ComunicacaoConfigTab.tsx`) — só precisa ser habilitado no ambiente.

## Plano

1. **Adicionar a flag no `.env`** (staging `ikaauvsflpmamgxmkhoq`):
   ```
   VITE_COMUNICACAO_MODULE_ENABLED=true
   ```
   Isso ativa a aba **Comunicação** em `/configuracoes` para usuários com papel `administrador`.

2. **Reiniciar o dev server** para o Vite reprocessar as variáveis `VITE_*` (elas são inlined em build time / dev startup).

3. **Validar** via Playwright com o login `admin@arbio.com`:
   - Navegar até `/configuracoes?tab=comunicacao`.
   - Confirmar que a aba aparece e o formulário de provedores (Email/WhatsApp) renderiza.
   - Screenshot para evidência.

## Fora do escopo

- **Não** habilitar `VITE_COMUNICACAO_BROADCAST_TAB_ENABLED` (broadcast/comunicados) — o pedido é apenas configurar Email/WhatsApp.
- **Não** ativar as flags de entrega no backend (`COMMUNICATION_DELIVERY_ENABLED`, `EMAIL_DELIVERY_ENABLED`, `WHATSAPP_DELIVERY_ENABLED`, `WHATSAPP_WEBHOOK_ENABLED`). Elas permanecem OFF, conforme regras de projeto. A aba apenas persiste as credenciais no Vault; o envio real continua bloqueado até autorização explícita.
- **Não** tocar em produção (`navfzbwgwzruipouyfnk`).
- **Não** inserir segredos reais — o usuário fará isso pela própria UI depois que a aba aparecer.

## Detalhes técnicos

- Arquivo alterado: `.env` (1 linha adicionada).
- Gate de permissão real (admin-only) já é aplicado por RLS/RPC no backend e pelo condicional `isAdmin && isComunicacaoModuleEnabled()` no `Configuracoes.tsx` — não é necessária mudança de código.
- O dev server precisa ser reiniciado porque o Vite lê `.env` apenas na inicialização.