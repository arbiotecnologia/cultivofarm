# Fechamento local — segunda revisão responsiva

## Resultado reconciliado
116 IDs preservados: **34** com geometria/conteúdo/controle comprovados no conjunto declarado de perfis de ação; **71** com cobertura parcial comprovada; **9 N/A** herdados com provas contextualizadas; **2 OPEN_GAP**. “Completa” não significa todas as variantes, autorização real ou homologação em produção.

- 13 pendências prioritárias: 66 cenários, 62 PASS, 2 N/A de seletor desktop oculto no mobile por código (#116), 2 lacunas de entrada mobile #100. #17/#52 foram acionados no componente original por estado/props; #68/#69 pelo diálogo Novo Usuário. As limitações de percurso constam nos registros.
- 50 montagens anteriores: 483 comparações, 431 com asserções; 52 tentativas com lacuna, sem converter falhas em aprovação.
- Drivers contextualizados: 434 comparações, 402 PASS; 32 tentativas pendentes em #80/#83/#97.
- 38 conjuntos explícitos de perfis foram identificados; os demais ainda usam candidatos de rota e **não** são certificados como cobertura completa da ação. Perfis, fontes e comparações faltantes estão em MATRIX.json e closure/profile-rules.json.

## Correção visual
BIDrillDownModal: título longo agora empilha a contagem, permite quebra, mantém ícone estável e reserva espaço para fechar. Boxes dos spans e botão de fechamento medidos antes/depois em 320×568, 390×844, 464×522 e 1440×900; fechamento clicado. Captura visual inspecionada: closure/bi-after-320.png; medições: closure/bi-before.json e closure/bi-after.json.

## Natureza das evidências
Navegador com componentes React originais e fixtures locais. Montagem isolada e trigger contextualizado não equivalem a navegação integral autenticada. Asserções cobrem alvo identificado, conteúdo e último controle/linha conforme driver; não basta contagem de mounts ou overflow global. Sem prova de JWT/RLS/Storage real. Nenhuma escrita de produção, publicação ou mudança de permissões. Auditoria exclusivamente em scripts, fora de public.

## Lacunas
- #17: aplicador@390, aplicador@1440, cliente_produtor@390, cliente_produtor@1440, financeiro@390, financeiro@1440, operador_onfarm@390, operador_onfarm@1440, producao@390, producao@1440. Ver closure_scenarios no MATRIX.json.
- #52: administrativo@390, administrativo@1440. Ver closure_scenarios no MATRIX.json.
- #73: administrativo@390, administrativo@1440, cliente_produtor@390, cliente_produtor@1440, consultor_tecnico@390, consultor_tecnico@1440, tecnico_agronomo@390, tecnico_agronomo@1440. Ver closure_scenarios no MATRIX.json.
- #75: aplicador@390, aplicador@1440, cliente_produtor@390, cliente_produtor@1440, financeiro@390, financeiro@1440, operador_onfarm@390, operador_onfarm@1440, producao@390, producao@1440. Ver closure_scenarios no MATRIX.json.
- #80: administrativo@390, administrativo@1440, cliente_produtor@390, cliente_produtor@1440, consultor_tecnico@390, consultor_tecnico@1440, financeiro@390, financeiro@1440, tecnico_agronomo@390, tecnico_agronomo@1440. Ver closure_scenarios no MATRIX.json.
- #83: administrativo@390, administrativo@1440, consultor_tecnico@390, consultor_tecnico@1440, financeiro@390, financeiro@1440, operador_onfarm@390, operador_onfarm@1440, producao@390, producao@1440, tecnico_agronomo@390, tecnico_agronomo@1440. Ver closure_scenarios no MATRIX.json.
- #84: controle/estado exato sem reteste positivo; administrador@390, administrador@1440, administrativo@390, administrativo@1440, consultor_tecnico@390, consultor_tecnico@1440, gestor@390, gestor@1440, operador_onfarm@390, operador_onfarm@1440, producao@390, producao@1440, tecnico_agronomo@390, tecnico_agronomo@1440. Ver closure_scenarios no MATRIX.json.
- #85: controle/estado exato sem reteste positivo; administrador@390, administrador@1440, administrativo@390, administrativo@1440, consultor_tecnico@390, consultor_tecnico@1440, gestor@390, gestor@1440, operador_onfarm@390, operador_onfarm@1440, producao@390, producao@1440, tecnico_agronomo@390, tecnico_agronomo@1440. Ver closure_scenarios no MATRIX.json.
- #88: aplicador@390, aplicador@1440. Ver closure_scenarios no MATRIX.json.
- #97: administrativo@390, administrativo@1440, cliente_produtor@390, cliente_produtor@1440, consultor_tecnico@390, consultor_tecnico@1440, financeiro@390, financeiro@1440, tecnico_agronomo@390, tecnico_agronomo@1440. Ver closure_scenarios no MATRIX.json.
- #100: administrador@390, gestor_comercial@390. Ver closure_scenarios no MATRIX.json.
- #101: superadmin@390, superadmin@1440. Ver closure_scenarios no MATRIX.json.

## Validação e reprodução
Regressões: **238/238** em 16 arquivos; BI/navegação: **19/19** em 2 arquivos. Comandos, stdout e códigos em closure/regression-final.log/.exit e closure/tests-bi-navigation.log/.exit. Build automático: último sinal 15:00:18Z “build OK”. Typecheck independente não executado; não apresentado como aprovado.

Drivers: closure/gaps.py, closure/assert_previous.py, closure/compare_contextual.py, closure/bi.py. Executar lotes 0,1,2 separadamente com Python/Playwright; requer preparação local do harness e arquivos transitórios originais em /tmp/browser/responsive-116. closure/prepare-exact.cjs gera marcadores estritos sem alterar JSX do produto. Checkpoints anteriores preservados. Não executar contra produção.

Revisão observada: 1710a8825b60263c3e7f02e37080e479e73759c5. Nenhum commit manual foi feito; histórico é gerenciado pela plataforma.
