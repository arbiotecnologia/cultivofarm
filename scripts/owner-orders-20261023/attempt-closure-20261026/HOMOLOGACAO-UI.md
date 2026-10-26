# Homologação da verificação/encerramento na interface (NÃO publicada)

Backend: pacote 5cdaf5d aplicado pelo auditor (migration `b2b_order_attempt_closure_guarded_20261026`).
Frontend: `useCloseOrderAttempt` + botão "Verificar e encerrar envio anterior" em NovoPedido. Não publicado.

## Comportamento
- O botão só aparece para tentativa INCERTA, sem envio em voo e sem pedido confirmado. Nunca é acionado sozinho.
- `closed` válido no MESMO escopo atual (ator+empresa+época+tela montada) → tentativa removida; o carrinho
  atual é mantido e pode ser enviado com chave nova. Encerrar não cancela nenhum pedido existente.
- `committed` só com `order_id` UUID e `numero` → mostra o número e "Ver meus pedidos" (caminho canônico).
- `in_progress`, erro, exceção, formato incompleto/desconhecido ou contexto alterado → bloqueio mantido.
- Logout, troca de papéis e tempo NÃO descartam a tentativa (chave: usuário+empresa+parceiro).
- LIMITE: memória da aba. Recarregar/fechar a aba, outra aba ou outra origem (preview × domínio) não herdam
  a tentativa. Pendente até contrato durável fim a fim; nenhuma recuperação entre origens é alegada.

## Roteiro real A (positivo) — sem copiar tokens
1. Sessão real do gestor B2B A, em `/portal-parceiro/catalogo`, carrinho com produto e plano.
2. DevTools → Network → "Block request URL" com `*/rpc/create_partner_order_secure`; clicar Enviar.
   Esperado: aviso "Não foi possível confirmar o envio anterior". (O bloqueio impede a chegada; não há pedido.)
3. Remover o bloqueio. Alterar a quantidade e tentar enviar → continua bloqueado, sem chamada de create.
4. Clicar "Verificar e encerrar envio anterior" → esperado "encerrado sem pedido"; enviar → pedido novo.
5. Variante committed: no passo 2 usar throttling "Offline" APÓS o envio sair (ou fechar a resposta), verificar →
   esperado número do pedido existente e nenhum pedido duplicado.
6. Auditor confere READ ONLY: 1 linha em `platform_private.partner_order_idempotency_closures` para a chave do
   passo 4 (`closed_by` = A), 0 pedidos com essa chave.

## Roteiro real B (negativo) — sem conceder permissões
- Sessão real B não alcança a tentativa de A (slot por usuário/empresa): ao abrir o catálogo de B, nenhum aviso
  de A aparece e nenhuma chamada de close com chave de A é possível pela interface.
- Sondagem direta da RPC por B contra o parceiro A exige transporte com o token de B; NÃO usar "copiar como
  fetch"/console com token. A negativa B×A fica provada pelo harness SQL (sintético) e deve ser confirmada pelo
  auditor com sua ferramenta de sessão server-side, esperando `42501 forbidden_partner` e nenhuma escrita.

## Provas desta etapa
- Componente/hook reais com transporte controlado: `src/test/pedidos/novoPedidoAttemptClosure.test.tsx`.
- SQL descartável com Auth sintética NÃO é JWT/RLS real. Gate contábil da empresa A segue DRAFT.
