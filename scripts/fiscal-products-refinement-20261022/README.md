# Perfis fiscais existentes — refinamento local revisável

## Alterações

- `FiscalProdutos.tsx`: orientações sem exemplos arbitrários NCM/CFOP; estado de rascunho incompleto/revisão contábil/validação da operação, submit com fence e trava, conflito consulta versão atual; troca de scope limpa campos do produto.
- `useProductFiscalProfiles.ts`: leitores pelo wrapper canônico com isolamento ator/tenant/epoch e cache oculto após negativa; saves validam schema e ID/CAS, rechecando antes/depois dos awaits e antes da invalidação. RLS permanece autoridade. Não promete cancelar write já enviado.
- `productFiscalValidation.ts`: estado informativo não confunde classificação mínima ou revisão contábil com NF-e pronta. Sem campos ou códigos novos; rascunho vazio permanece permitido e nenhuma tributação default é enviada.

## Fontes oficiais lidas

- Portal Notas Técnicas: https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY=
- NT 2025.002 v1.52, publicada no portal em 01/10/2026: https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=HXPO8VLbh4o=
  PDF HTTP200, SHA256 `54ed893327040a20a4a3c0562d342953542a1dc98e55d73dbe607d6c13d3d416`. Seção3 informa tabelas CST/cClassTrib dinâmicas e vínculo às regras; não permite deduzir classificação pela família comercial.
- NT 2026.002 v1.11, publicada no portal em 01/10/2026: https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=m8aACnFLK/Y=
  PDF HTTP200, SHA256 `72c033b2c7490710f61488a14d0bb3d7bb54e5345aa8d33d6ff2c270c228f046`. Trata DANFE simplificado/autorização com alerta; não foi usada para inventar classificação tributária.

## Validação e limites

- **59/59 Vitest**: preparação5, hook/fences10, contrato existente34 e página unificada10. Testes adicionais comprovam a chave efetiva ator/tenant/request, invalidação somente do ator correspondente, revogação durante pré-check sem INSERT e negativa RLS sem sucesso/invalidação. Matriz completa em `FRONTEND-MATRIX.md`.
- Build automático da prévia: OK após alterações; sem execução manual de build/typecheck permitida neste ambiente. Não há recibo separado de typecheck integral da candidata coordenada; requer auditor.
- Nenhuma NF-e emitida, dado/role/session hosted alterado, SQL executado, Edge implantada ou publicação realizada.
- Prontidão fiscal final depende dos resolvers existentes para estabelecimento/regime/operação/RTC e homologação real; este refinamento não os substitui. Escritas servidor/schema/RLS preservados.
- Evidência informada pelo proprietário02:26: Superadmin criou INS-4 TESTE AUDITORIA QUIMICO 20261021 — SEM USO COMERCIAL (inseticida/químicos/Inseticida) e SOLO-4 TESTE AUDITORIA FERTILIZANTE 20261021 — SEM USO COMERCIAL (solo/fertilizantes/sem rótulo). Ambos inativos/fora B2B, sem dose/composição/fiscal inventados. Não recriados, alterados ou consultados como fixtures pelo agente. Financeiro/documentos fechados.
- UI autenticada real e regressão completa do editor de microrganismos/IBS-CBS não homologadas nesta rodada; refinamento focal produto não certifica os leitores irmãos.

## Conferência 02:28 — cache frontend não substitui RLS

`PRODUCT_FISCAL_KEYS` são prefixos de recurso; todas as quatro leituras usam `useScopedPortalQuery`, que acrescenta `actor.scope` e `fence.scope` contendo ator/tenant/papéis/epoch. Teste verifica a chave efetivamente registrada no QueryClient. Não havia leitura raw usando só o prefixo. Correção focal: invalidação pós-save antes ampla agora filtra o sufixo do ator capturado; rechecagem dupla após awaits e antes/depois da invalidação. CAS continua `.eq(id).eq(product_id).eq(updated_at)`; zero rows é conflito, não sucesso.

Consultas hosted SOMENTE LEITURA, após validar `supabase/config.toml` ref `swzpzcwiasxmjutrmvkm`:
- `product_fiscal_profiles` RLS=true; SELECT permite administrador/gestor/financeiro por role, **sem predicado tenant**; INSERT/UPDATE exigem `is_platform_superadmin(auth.uid())`; DELETE=false.
- View readiness possui `security_invoker=true`. Tabela perfil não tem organization_id/tenant_id; tem FK product_id→produtos, sem unicidade product_id listada; trigger fiscal_audit AFTER INSERT/UPDATE/DELETE, nenhum trigger BEFORE updated_at listado.
- Portanto isolamento frontend foi testado, **isolamento server-side tenant não foi comprovado**. Superadmin-only sem papel interno também não está incluído explicitamente na política SELECT capturada; fluxo create `.select()`/pré-check depende disso. Não habilitar fiscal para parceiros/novos perfis nem inferir autoridade da família ou do cache.
- Timestamp CAS é preservado no cliente, mas avanço automático de updated_at no servidor não foi comprovado nesta captura; exige revisão/teste real concorrente antes de homologar edição. Não alterar RLS, schema ou triggers nesta rodada.
- SQL sintético e policies lidas não equivalem a negativos JWT/RLS reais. Gates fiscal e pacote conjunto permanecem NO-GO para ativação independente não revisada.

Aviso falso no formulário global corrigido: criação com classificação pendente seguida de classificação canônica; tipo de aplicação não determina família. Fluxo criação existente:25/25 testes passaram; sem teste de copy/markup adicionado.