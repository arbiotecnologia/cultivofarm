# BI Operacional AR Bio

## Visão Geral
O módulo de BI Operacional fornece uma visão analítica completa de todo o fluxo técnico e operacional da AR Bio, desde a solicitação de visita técnica até a entrega final e confirmação de aplicação on-farm.

## Componentes Validados
- **Visão Geral**: Dashboard consolidado com KPIs principais e gargalos críticos.
- **Visitas Técnicas**: Visão detalhada de solicitações, check-ins e diagnósticos.
- **Conversão**: Funil de recomendação para OS On-Farm.
- **Laboratório**: Controle da esteira laboratorial, qualidade e tempos.
- **Entregas & Estoque**: Gestão logística, volumes em estoque e confirmação de entrega.
- **Filtros Avançados**: Sincronização de período, cliente, fazenda, talhão, consultor, produto, microrganismo, status (solicitação, visita, esteira, entrega) e flags técnicas (entrega confirmada, pode finalizar).
- **Filtros Favoritos**: Salvamento de presets personalizados por usuário via `bi_user_preferences`.

## Gestão de Estoque e Volume (Fórmulas Oficiais - Fase 11.9.2)
Priorizou-se a blindagem da interpretação dos dados para evitar métricas enganosas:
- **Volume Solicitado**: Soma do `volume_solicitado_l` de todas as OS carregadas (OS On-Farm e Manuais).
- **Solicitado Aprovado**: Soma do `volume_solicitado_l` de solicitações com CQ Aprovado.
- **Solicitado Entregue**: Soma do `volume_solicitado_l` de solicitações com entrega confirmada ou status entregue. Representa o volume *previsto* que chegou ao campo.
- **Total em Estoque Real (Auditado)**: Calculado a partir da tabela `estoque_produto` usando `volume_total` (convertido de ml para L: `/ 1000`).
- **Produzido Real / Entregue Real**: Exibidos como "Sem dados suficientes" até que existam módulos de auditoria física e confirmação on-farm via sensor ou pesagem.
- **Reservado Real / Saldo Disponível**: Exibidos como "Sem dados suficientes" para evitar cálculos baseados em unidades (frascos) sendo interpretados como volume (litros).

## Filtros Técnicos Corrigidos
- **Consultores**: Filtro via `user_roles` (consultor_tecnico/tecnico_agronomo).
- **Cultura**: Ocultado por ausência de campo nas views analíticas.
- **Estoque**: Filtrável por Produto e Microrganismo.

## Fórmulas de Eficiência
- **Taxa de Conversão**: (Recomendações convertidas em OS) / (Total de Recomendações Emitidas).
- **Lead Time**: Tempos médios calculados a partir de intervalos reais. Exibe "Sem dados suficientes" se o parse falhar.

## Segurança e Permissões
- Perfis `cliente_produtor` e `financeiro` bloqueados.
- RLS em `bi_user_preferences`.
- Aba **Recomendações & OS** protegida por `BIPermissionGate` (Seção Conversão).
- Exportação validada por seção e permissão.
- Exportação CSV com proteção contra injeção de fórmulas (prefixo `'`).

## Relatório Final de Aptidão (Fase 11.10)
- **Status Geral**: **APTO**.
- **Build**: Verificado (0 erros).
- **Métricas de Volume**: Blindadas contra interpretação errada (Distinção clara entre Solicitado e Real).
- **Gargalos**: Únicos, estáveis e baseados em bloqueios reais.
- **Exportação**: Blindada contra CSV Injection.
- **Conclusão**: O módulo está pronto para uso gerencial com transparência total e segurança de dados reforçada.

> **Integração com Alertas:** Os gargalos identificados no BI podem ser transformados em alertas operacionais na Central de Alertas (`/alertas-operacionais`).

## Integração com Central de Alertas (Fase 12.2)
O motor `public.rpc_gerar_alertas_operacionais()` consome as mesmas views consolidadas do BI (`vw_fluxo_visita_tecnica`, `vw_esteira_laboratorio`) e materializa os gargalos como alertas operacionais com deduplicação por `chave_dedupe`. O BI continua sendo a fonte analítica; a Central de Alertas é a camada acionável. Permissão para disparar a geração restrita a administrador, gestor e administrativo.
