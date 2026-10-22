# Matriz frontend — página FiscalProdutos existente

Fixtures abaixo são doubles locais dos testes, não dados ou classificações de produção.

| Situação | Resultado requerido | Evidência |
|---|---|---|
| Administrador com leitura autorizada, perfil produto ausente | Formulário existente permite rascunho vazio; envia campos vazios, sem defaults tributários | teste UI `existing product drawer saves an empty draft` |
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
| Químico/fertilizante sem dados tributários autorizados | Nenhum NCM/CEST/CFOP/CST/IBS-CBS deduzido da família | rascunho vazio; positivo real aguarda fixtures auditor |
| NF-e | Nenhuma emissão/ativação; cadastro não substitui resolver fiscal server-side | flag emissão preservada; todas preparações `readyForNfe:false` |

55 testes focados passaram nesta rodada. São testes sintéticos frontend/hook; não certificam JWT/RLS, escrituração, correção contábil dos códigos ou emissão. Homologação autenticada e revisão independente continuam gates. Nenhum formulário ou tabela paralelos.