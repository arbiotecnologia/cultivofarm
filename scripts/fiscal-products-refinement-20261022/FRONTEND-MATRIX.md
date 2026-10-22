# Matriz frontend — página FiscalProdutos existente

Fixtures abaixo são doubles locais dos testes, não dados ou classificações de produção.

| Situação | Resultado requerido | Evidência |
|---|---|---|
| Superadmin com autoridade global válida, perfil produto ausente | Candidata reutiliza formulário para rascunho vazio, sem defaults; cadastro ainda não homologado | acesso candidato + teste antigo de formulário; UI integrada global pendente |
| Administrador/gestor/financeiro | Candidata permite somente leitura; save perfil e IBS/CBS negados | testes acesso candidato + negativos SQL local |
| Gestor somente leitura | Ações mutantes ausentes; nenhuma elevação por capacidade B2B | teste UI somente leitura existente |
| Rascunho sem classificação mínima | `incomplete_draft`, nunca NF-e pronta | preparação pura |
| Mínimo classificado sem validação contábil | `accounting_pending`, nunca NF-e pronta | preparação pura |
| Cadastro revisado contabilmente | `operation_pending`; operação/regime/emitente/RTC ainda necessários | preparação pura |
| Perfil inativo ou prontidão indisponível | Não declara prontidão | preparação pura |
| Pause/lease expirado no produto aberto | Formulário não submetido; cartão IBS/CBS não montado durante indisponibilidade | teste UI paused actor + teste hook lease |
| Resultado tardio após troca tenant/ator | Cache anterior não publicado; save tardio não invalida queries do novo ator | testes hooks sessão |
| Refetch autorizado anteriormente, agora negado | Dados fiscais stale ocultos, sem falsa aprovação | testes hooks |
| CAS concorrente | Conflito explícito, não toast de sucesso; consulta versão atual antes de nova tentativa | teste hook CAS; fluxo drawer preservado |
| Microrganismo com perfil próprio | Não herda NCM do produto vinculado | teste lista existente |
| Químico/fertilizante sem dados tributários autorizados | Nenhum NCM/CEST/CFOP/CST/IBS-CBS deduzido da família | INS-4/SOLO-4 criação relatada; rascunho testado localmente, prontidão real não homologada |
| NF-e | Nenhuma emissão/ativação; cadastro não substitui resolver fiscal server-side | flag emissão preservada; todas preparações `readyForNfe:false` |

59 testes focados passaram nesta rodada. Chave efetiva actor/tenant/request, invalidação isolada, revogação no pré-check e RLS negada cobertas. São testes sintéticos frontend/hook; não certificam JWT/RLS, escrituração, correção contábil dos códigos ou emissão. Captura readonly mostrou SELECT por role sem tenant na tabela global e avanço server updated_at não comprovado: revisão RLS/modelo global e CAS real são gates antes de habilitar. Nenhum formulário ou tabela paralelos.