## Plano de testes funcionais

Vou testar o sistema recriado módulo a módulo, começando pelas bases de autenticação e navegação, depois seguindo para o portal do produtor e os demais módulos. Para cada etapa vou rodar o build/typecheck, acessar as rotas no preview, validar dados no Supabase e documentar o que estiver quebrado.

### 1. Preparação
- Rodar `typecheck` e `build` para garantir que o projeto está compilando sem erros.
- Verificar se as variáveis do Supabase estão presentes e se o cliente consegue listar tabelas públicas (perfis/roles/config).
- Confirmar se existe ao menos um usuário de teste com perfil e papel atribuído; se não houver, criar um usuário administrador + produtor de teste via Supabase e rodar as migrations/RLS necessárias.

### 2. Autenticação e papéis
- Acessar `/auth` e validar: login com email/senha, erro de credenciais, link de cadastro removido (se ainda estiver, remover), recuperação de senha se existir.
- Após login, verificar se `useAuth` carrega o perfil, `roles` e `primaryRole` corretamente.
- Testar redirecionamentos: usuário sem role → `/acesso-pendente`; usuário com múltiplos papéis de portal → `/selecionar-portal`; usuário admin → home correta.
- Verificar no console logs do Supabase se `user_roles` e `profiles` estão sendo lidos com a RLS correta.

### 3. Portal do produtor / App mobile
- Testar `/app` com papel `cliente_produtor`.
- Validar: dashboard, listagem de fazendas, registro de ocorrência, ordens de serviço, entregas, visitas/talhões, notificações, perfil.
- Verificar se o layout mobile está responsivo e se as guards de rota (`TechnicalFeatureGuard` / `ProducerFeatureGuard`) bloqueiam corretamente.
- Confirmar que dados de fazendas e talhões estão vindo do Supabase e não de mock/IndexedDB.

### 4. Módulos operacionais
- Testar rotas internas: Clientes, Fazendas, Talhões, Ordens de Serviço, Lotes, Controle de Qualidade, Envase, Estoque, Entregas, Aplicações, Visitas Técnicas, Agenda.
- Verificar CRUD básico em uma entidade de cada módulo (ex: criar/editar cliente, ordem de serviço, talhão).
- Validar busca, filtros e exportações (PDF, Excel) se existirem.

### 5. Comercial B2B e financeiro
- Portal do parceiro: login, pedidos, simulador, histórico, favoritos, financeiro.
- Comercial interno: pedidos B2B, campanhas, simulador, indicadores, alertas.
- Financeiro: contas a receber/pagar, fluxo de caixa, DRE, relatórios, recibos, notas fiscais.
- Verificar se dashboards carregam gráficos e se relatórios exportam corretamente.

### 6. BI, laboratório e executivo
- Dashboards agronômico/operacional/executivo.
- Cockpit de laboratório, alertas operacionais, monitoramento.
- Validar se as consultas estão usando Supabase e se não há erros 400/RLS.

### 7. Entregáveis do teste
- Resumo por módulo: status, erros críticos, observações.
- Lista de correções priorizadas, se houver.
- Sugestão do próximo passo após os testes (correções, publicação ou nova funcionalidade).

Se concordar, começo pela preparação e autenticação.