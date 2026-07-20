# Governança de Segurança e RLS (BI Fase 11) - AR Bio

## 1. Visão Geral
Isolamento de dados e auditoria de acesso para o módulo de Business Intelligence Operacional.

## 2. Views Blindadas
As views `vw_fluxo_visita_tecnica` e `vw_esteira_laboratorio` utilizam `security_invoker = true`, respeitando as políticas de RLS das tabelas base.

## 3. Isolamento por Perfil (RLS)
- **Administrador / Gestor**: Visão total.
- **Consultor Técnico / Técnico Agrônomo**: Visualiza apenas dados vinculados aos seus clientes ou visitas sob sua responsabilidade técnica.
- **Cliente / Produtor / Financeiro**: Bloqueio total de acesso ao BI Operacional geral.
- **Produção / Operador On-Farm**: Acesso às seções de Laboratório, Estoque e Entregas.

## 4. Exportação Segura
- O componente `BIExportButton` valida a permissão do usuário para a seção específica antes de permitir o download do CSV.
- Headers são sanitizados para evitar injeção de fórmulas CSV.
- **Blindagem Anti-Injection**: Valores iniciando com `=`, `+`, `-`, `@`, `\t` ou `\r` recebem um prefixo de apóstrofo (`'`) para evitar execução de comandos em planilhas.
- Dados de volume são exportados com rótulos precisos ("Volume Solicitado").

## 5. Auditoria de Sessão
- Preferências de filtros (`bi_user_preferences`) são protegidas por RLS (usuário só acessa seus próprios favoritos).
- A aba **Recomendações & OS** possui gate de segurança atrelado à seção de Conversão.
- O BI registra a data da última atualização para garantir transparência sobre a recência dos dados.

## 6. Status Final (Fase 11.10)
**Status**: APTO.
A blindagem técnica garante que consultores não acessem dados sensíveis de outros territórios e que perfis não autorizados sejam redirecionados. As métricas de volume foram revisadas para evitar interpretações enganosas de dados solicitados como dados físicos reais. A exportação CSV agora é resiliente contra ataques de injeção de fórmulas.