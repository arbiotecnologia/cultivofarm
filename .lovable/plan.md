# Fase S3 — Exceções por empresa e bloqueio por plano

## Objetivo
Permitir liberar ou retirar funcionalidades de uma empresa específica (com prazo e motivo) e passar a respeitar o plano contratado nos menus, nas telas e no servidor. Para a CultivoFarm (Completo, fundadora) nada muda.

## Etapa 1 — Exceções por empresa (servidor)
- Nova tabela de exceções por empresa: funcionalidade, liberar/retirar, limite opcional, início, fim, motivo, autor.
- Histórico só de inclusão, sem apagar nem editar.
- Somente o superadmin consegue criar ou encerrar exceções, por uma função segura com motivo obrigatório.
- A verificação de acesso passa a considerar: exceção vigente > plano > bloqueio.
- Corrige também a checagem de empresa ativa, que faltava na verificação atual.

## Etapa 2 — Painel do superadmin
- Na página Plataforma: aba "Exceções" para ver, criar e encerrar exceções por empresa.
- Ação de trocar plano/status da assinatura, sempre com motivo e registrada no histórico.

## Etapa 3 — Respeitar o plano no aplicativo
- Carregar uma vez, após o login, o que a empresa pode usar.
- Menus escondem itens não contratados; ao abrir uma tela não contratada, aparece aviso "Não incluído no seu plano".
- Perfis continuam valendo: o plano limita o que a empresa contratou, o perfil limita o que cada pessoa faz.
- Em caso de falha ao carregar o plano, nada é liberado além do que já era (sem abrir acesso).

## Etapa 4 — Bloqueio no servidor (gradual)
- Começar pelos módulos mais sensíveis (Fiscal e Comunicação), adicionando a checagem do plano nas funções de servidor desses módulos.
- Demais módulos em rodadas seguintes, um por vez, com testes de regressão.

## Validação
- Testes: exceção liberando/retirando, prazo vencido, empresa inativa, sem assinatura, usuário comum tentando criar exceção, CultivoFarm com acesso idêntico ao atual.
- Verificação de tipos, geração do aplicativo, suíte completa e alertas de segurança do banco.
- Relatório em `docs/auditorias/fase-s3-overrides-gates-2026-10-01.md` com PASS/FAIL.

## Detalhes técnicos
- Tabela `organization_feature_overrides` (FK RESTRICT, RLS, sem escrita direta de cliente, leitura só superadmin) e RPCs `platform_set_feature_override` / `platform_end_feature_override` / `platform_change_subscription` com guarda `is_platform_superadmin(auth.uid())`, EXECUTE revogado de PUBLIC/anon.
- `get_my_entitlements()` reescrita via nova migration incluindo `organizations.ativo` e overrides vigentes.
- Frontend: `EntitlementsProvider` + `useFeature(key)`; mapa rota/menu → feature key; gate somente adicional aos guards de perfil existentes.
- Etapa 3 altera menus e rotas: requer sua autorização explícita (aprovar este plano conta como autorização).
