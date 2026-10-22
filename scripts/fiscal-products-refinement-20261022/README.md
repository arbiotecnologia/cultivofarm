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

- **55/55 Vitest**: preparação5, hook/fences6, contrato existente34 e página unificada10. Dois testes adicionais exercitam envio real do formulário de produto com rascunho vazio (sem códigos/defaults) e pausa do ator impedindo formulário/submissão. Testes hook exercitam cache negado, resultado tardio após tenant, save tardio sem invalidação do próximo ator, CAS, ID divergente e lease expirada. Matriz completa em `FRONTEND-MATRIX.md`.
- Build automático da prévia: OK após alterações; sem execução manual de build/typecheck permitida neste ambiente. Não há recibo separado de typecheck integral da candidata coordenada; requer auditor.
- Nenhuma NF-e emitida, dado/role/session hosted alterado, SQL executado, Edge implantada ou publicação realizada.
- Prontidão fiscal final depende dos resolvers existentes para estabelecimento/regime/operação/RTC e homologação real; este refinamento não os substitui. Escritas servidor/schema/RLS preservados.
- Fixtures químico/fertilizante aguardam auditor com Superadmin e fluxo canônico; não criadas pelo agente. Financeiro/documentos fechados.
- UI autenticada real e regressão completa do editor de microrganismos/IBS-CBS não homologadas nesta rodada; refinamento focal produto não certifica os leitores irmãos.