# H15 — isolamento fiscal por empresa

## Evidência atual do canônico
- Destino confirmado: `swzpzcwiasxmjutrmvkm`; marcador `STAGING`, `production_emission_allowed=false`.
- Uma organização ativa e um emitente ativo em `HOMOLOGATION`, com produção desabilitada; zero notas, certificados e séries.
- `company_fiscal_settings` não possui organização; índice `ux_company_fiscal_settings_active_singleton` é global.
- `fiscal_invoices` não possui vínculo com emitente. Certificados e séries já possuem FK para o emitente.
- A política externa `fi_producer_read` usa recebível/entrega e será preservada literalmente.
- RPCs `SECURITY DEFINER` ainda selecionam emitente globalmente: somente trocar RLS não protege esses caminhos.

## Alteração delimitada
1. Concluir inventário de RPCs, triggers, snapshots e dependências; registrar baseline de políticas, ACLs e contagens sem dados pessoais.
2. Preparar uma migration H15 nova e transacional. Antes de qualquer escrita, validar marcador, produção bloqueada e estado inequívoco sob locks que impeçam corrida: exatamente uma organização ativa, um emitente e nenhuma nota.
3. Adicionar `organization_id` ao emitente, FK restritiva, backfill exclusivamente desse único vínculo e obrigatoriedade; substituir singleton global por índice único parcial de emitente ativo por organização.
4. Adicionar `company_settings_id` obrigatório às notas, FK `RESTRICT` e índice. Abortar caso qualquer nota apareça antes da alteração, sem backfill de notas.
5. Introduzir helpers mínimos com identidade de `auth.uid()`, perfil ativo e organização. Fixar `search_path`; retirar EXECUTE de PUBLIC/anon; usar definer apenas para evitar recursão e não expor identidade arbitrária.
6. Acrescentar escopo organizacional às políticas internas existentes, sem ampliar papéis ou operações. Cobrir empresa, notas, itens, referências, eventos, XML, transmissões, documentos protocolados, certificados e séries. Preservar políticas de proibição de escrita e leitura externa do produtor.
7. Validar também vínculos secundários entre documentos para impedir referências cruzadas. Triggers devem proteger as escritas feitas por RPCs que ignoram RLS: organização do criador/autenticado, emitente imutável e snapshot/CNPJ coerentes.
8. Manter compatibilidade com criação legada somente quando o emitente puder ser determinado inequivocamente na organização autenticada. Bloquear seleção ambígua; não habilitar segundo emitente enquanto as RPCs globais não forem adequadas explicitamente. Proteger também a troca de organização do emitente.
9. Preservar operações técnicas de service_role sem conceder bypass novo a funções públicas. Não editar Edge Functions, secrets, config.toml, rotas ou flags fiscais.

## Validação e aplicação
- Testes SQL transacionais: organização correta/incorreta/ausente, criador adulterado, vínculo imutável, snapshot divergente, referências cruzadas, concorrência e preservação da leitura do produtor.
- Testes de ACL/RLS e contratos estáticos; regressões existentes pertinentes, sem ocultar falhas.
- Aplicar exclusivamente pelo canal de migration confirmado no canônico, apenas depois dos guards e revisão. Se algum gate não passar, não aplicar e registrar o bloqueio.
- Conferir após aplicação: colunas, FKs, índices, políticas, ACLs, contagens, marcador e advisors de segurança/performance. Separar achados anteriores dos novos.
- Usar sinais automáticos de build/typecheck disponíveis; não afirmar validação sem evidência.

## Entrega e rollback
- Migration versionada, testes, rollback controlado conforme padrão do repositório e relatório H15 com evidências antes/depois.
- Rollback sem apagar dados nem restaurar silenciosamente permissões globais inseguras; condicionar reversões estruturais à ausência de dependências/dados incompatíveis.
- Tipos gerados somente se necessários e pela integração canônica; não editar manualmente o arquivo gerenciado.
- Distinguir ações do agente de eventual publicação automática da plataforma; nenhuma ferramenta de deploy será acionada.
- Não avançar para certificado, emissão ou homologação completa.