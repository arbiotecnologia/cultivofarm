## Objetivo
Padronizar todos os campos de telefone/WhatsApp do sistema para usar `MaskedInput mask="telefone"` (já corrigido para 10/11 dígitos), garantindo consistência de entrada e persistência apenas de dígitos.

## Diagnóstico atual

Campos que **já usam** `MaskedInput mask="telefone"` (padrão correto):
- `src/pages/Fazendas.tsx` — responsável local
- `src/pages/Configuracoes.tsx` — perfil, novo usuário, edição de usuário
- `src/pages/app/MobileSolicitar.tsx` — contato do solicitante
- `src/pages/portal/PortalSolicitacao.tsx` — contato do solicitante
- `src/components/clientes/ClienteFormTabs.tsx` — telefone principal + adicionais do produtor
- `src/components/clientes/ClienteContatosTab.tsx` — contatos do cliente
- `src/pages/configuracoes/FiscalEmpresa.tsx` — telefone fiscal (usa `Input` cru, mas com `formatTelefone`/`unmask` — funcional, ainda que fora do padrão)

Campos **fora do padrão** (Input cru, sem máscara reativa):
1. `src/components/comercial/ParceiroB2BFormDialog.tsx` L595 — `telefone_comercial`
2. `src/components/comercial/ParceiroB2BFormDialog.tsx` L599 — `whatsapp_comercial`
3. `src/components/entregas/RegistrarEntregaDialog.tsx` L817 — `destinatario_telefone`
4. `src/components/entregas/RegistrarEntregaDialog.tsx` L821 — `destinatario_whatsapp`
5. `src/components/entregas/EntregaComprovantePanel.tsx` L376 — `recebedor.telefone`

## Alterações propostas

Para cada um dos 5 pontos acima:
- Trocar `<Input>` por `<MaskedInput mask="telefone" placeholder="(00) 00000-0000" />`.
- Onde a persistência guarda o valor bruto (RegistrarEntregaDialog, EntregaComprovantePanel, ParceiroB2B), aplicar `unmask()` no salvamento se ainda não houver — mantendo o mesmo formato de armazenamento (somente dígitos) já usado no restante do sistema.
- Manter os placeholders `(00) 00000-0000` já existentes.

Opcional (fora de escopo desta pequena correção, listar só para transparência):
- `FiscalEmpresa.tsx` continua funcional; poderia ser migrado depois para `MaskedInput` para uniformidade total, sem alteração de comportamento visível ao usuário.

## Validação
- `bun run typecheck`
- Inspeção visual rápida via Playwright nos diálogos afetados (ParceiroB2B e RegistrarEntrega) para confirmar máscara dinâmica 10→11 dígitos.

## Fora de escopo
- Nenhuma alteração de schema, RLS, migrations ou lógica de negócio.
- Nenhuma alteração no componente `MaskedInput` (já corrigido anteriormente).
