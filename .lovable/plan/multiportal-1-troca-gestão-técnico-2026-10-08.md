# MULTIPORTAL-1 — troca Gestão/Técnico

## Checkpoint preservado
STORAGE-2 está encerrada documentalmente: migration144506,267/267 testes e hashes preservados. Salvamento/retificação/novos uploads permanecem bloqueados; este recorte não os reabre.

## Diagnóstico confirmado
- Gestor é tratado como administrador na RPC e recebe B2B/Técnico, mas a tela só reconhece administrador e tem dois cards fixos. Gestão não pode ser selecionada.
- Login interno prioriza a home administrativa; login mobile vai ao seletor. Troca de administrador ignora confirmação/cache; outras trocas podem voltar automaticamente à preferência anterior.
- Contexto visual admin já existe; destino Gestão é `/dashboard/geral`, Técnico é `/app`. Sidebar/guards preservam papéis administrativos; contexto nunca autoriza sozinho.
- Preferência/log só aceitam B2B/Técnico; adicionar admin exige atualização conjunta desses contratos.
- O banco vivo agora contém **um perfil ativo gestor+consultor_tecnico**, com empresa e sem senha provisória. O inventário independente sem esses papéis ficou desatualizado; nenhuma identidade será criada.

## Correção proposta
1. Disponibilizar Gestão/Técnico ao multipapel; gestor único escolhe Gestão, técnico único Técnico. Administrador sem papel técnico mantém entrada administrativa legada. Cards derivados dos contextos selecionáveis, não fixos.
2. Separar **contextos selecionáveis** de **acesso legado**: manter flags/guards de acesso administrativo B2B sem removê-los; card B2B como parceria própria exige papel e vínculo canônico válido. O acesso interno legado continua pela navegação existente. Não transformar seletor em concessão de acesso.
3. Troca manual abre seletor com intenção explícita de ignorar preferência naquela visita; login normal mantém preferência válida. Confirmar alterações não salvas antes de limpar cache/contexto ou navegar; cancelamento não produz efeitos.
4. Cercar consulta/apresentação e escolha tardia por identidade, perfil ativo/pronto, empresa, papéis e geração; limpar contextos antigos em logout/revogação/mismatch. Sincronização de abas apenas invalida/revalida, nunca concede acesso ou força descarte de formulário.
5. Alinhar entrada, menu/perfil mobile e rótulo visual admin, sem novas rotas, portal duplicado ou mudanças no ACCESS_MAP/RLS operacional.

## Detalhes técnicos
- RPC canônica valida readiness/h15 antes de leitura de preferência ou produção de contextos; vínculos B2B passam pelo contrato canônico existente, sem user_metadata/sessionStorage como autorização.
- Migration oficial pequena para resolver contextos, set_my_context_preference e register_my_login_redirect_secure, constraints de admin e ACL explícitas, search_path fixo. Sem regrants gerais ou mudança de dados históricos.
- useAvailableContexts usa QueryClient real com chave UID/tenant/papéis/readiness e fence de resposta antiga. Preservar chaves globais e cancelamento focal da troca; contexto admin é visual.

## Provas e entrega
- Testes: gestor+técnico, técnico único, gestor único, preferência/login versus troca manual, cancelamento sem efeitos, resposta antiga, logout/inativo/mismatch/tenant/papel revogado, URL direta/refresh e regressões multiportal/STORAGE-2.
- SQL nas identidades reais disponíveis: resolver próprio, estado inválido/UID ausente e contratos de preferência/log em rollback obrigatório. Sem criar Auth/papéis/vínculos; ausências ficam UNVERIFIED.
- Testes focais, lint/scanners e build automático; typecheck explícito permanece NOT RUN se vedado pelo ambiente. Browser autenticado/JWT/abas/concorrência real só PASS com execução real.
- Relatório/roadmap com antes/depois, migration/ACL, limites e rollback por forward-fix; sem publicação/envios ou outra fase.

**Limite de produto adotado:** preservar B2B interno legado separadamente do card de parceria própria, evitando perda de acesso ou parceria inventada.