# Auditoria completa de perfis, portais e segurança no backend

Objetivo: verificar, para cada perfil de usuário, o que ele consegue ver e fazer em cada portal — na tela e no banco — e corrigir apenas divergências pequenas de interface.

## Escopo dos perfis

Administrador, Gestor, Gestor Comercial, Financeiro, Administrativo, Produção, Operador On-Farm, Consultor Técnico, Técnico Agrônomo, Aplicador, Cliente Produtor, Parceiro B2B (gestor) e Parceiro B2B Técnico.

Portais: Painel interno (`/`), Portal Técnico/mobile (`/app`), Portal do Produtor (`/portal`), Portal do Parceiro B2B (`/portal-parceiro`).

## Etapas

1. **Mapa declarativo (leitura de código)**
   Consolidar, por perfil: rota inicial, menus visíveis, rotas liberadas/bloqueadas e nível leitura/escrita, conforme `permissions.ts`, os guardas de rota e os menus dos portais. Apontar conflitos entre menu exibido, guarda e permissão declarada.

2. **Usuários de teste (um por perfil)**
   Criar 13 contas de teste dedicadas, identificáveis por prefixo comum de e-mail, com senha única definida no momento da execução e vínculos mínimos (cliente para o Produtor, parceiro para os perfis B2B). Requer sua autorização explícita para gravar no banco CultivoFarm, pois cria registros de autenticação, perfis, papéis e vínculos. Ao fim da auditoria, informo a lista exata para você decidir entre manter ou remover.

3. **Navegação real na prévia**
   Entrar com cada perfil e percorrer: destino após login, menu lateral, acesso direto às rotas de outros portais (deve cair em sem-permissão), estados de carregando/erro/vazio nas telas principais e comportamento em tela pequena. Registrar evidência por perfil.

4. **Segurança no backend (somente leitura)**
   - Conferir RLS ativa, políticas e permissões de acesso em todas as tabelas expostas.
   - Revisar as funções de decisão de acesso (contextos de portal, verificação de papel) quanto a caminho de busca fixo, validação de usuário e permissões de execução.
   - Revisar as funções do servidor que tratam usuários e papéis quanto à checagem de autorização.
   - Rodar o verificador de segurança e o analisador do banco; comparar achados com o resultado da navegação.

5. **Sondas de leitura e escrita por perfil**
   Reutilizar a rotina de auditoria já existente no projeto, apontada para o banco autorizado, para confirmar que cada perfil só lê e grava o que a interface promete. As sondas de escrita usam referências inexistentes e não persistem dados.

6. **Relatório e correções pequenas**
   Documento em `docs/auditorias/` com matriz perfil × portal × rota, resultado de tela, resultado de banco, divergências e risco. Corrigir no mesmo ciclo apenas itens de interface: menu mostrando rota sem acesso, destino de login errado, falta de estado de erro/vazio, texto de mensagem. Qualquer ajuste de política, função ou permissão real do banco fica listado como pendência com a correção sugerida — não aplico sem sua aprovação específica.

## Detalhes técnicos

- Banco único: `swzpzcwiasxmjutrmvkm`. Nenhuma publicação, nenhum GitHub, nenhum Lovable Cloud, nenhuma migration nesta rodada.
- Criação dos usuários de teste via função de provisionamento já publicada (`create-user` / `admin_provision_user_profile_v1`), sem redeploy de funções.
- Navegação via Playwright em `localhost:8080`, capturas em `/tmp`.
- Sondas RBAC: `scripts/rbac-audit/` (`matrix.ts`, `run-rbac-audit.ts`, `policies-report.sql`), com a matriz atualizada para os perfis e rotas atuais.
- Segurança backend: varredura de segurança + linter do banco + consultas somente-leitura em `pg_policies`, grants e definição das funções `SECURITY DEFINER`.
- Validação final: testes afetados, checagem de tipos e compilação.

## Limites desta rodada

- Não altero permissões reais, políticas nem funções do banco.
- Não declaro auditoria concluída com base apenas em testes unitários; a conclusão exige navegação real e sondas executadas.
- Se a criação dos usuários de teste não for autorizada, a auditoria segue apenas por código e por leitura do banco, e os itens dependentes de sessão real ficam marcados como não verificados.
