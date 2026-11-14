# Dossiês individuais e perfil fiscal automático

## Resultado
- Em Fiscal → dossiês regulatórios, abrir um microrganismo apresenta seus produtos comerciais com vínculos explícitos da mesma empresa, sem associação por nome.
- Cada produto abre seu próprio detalhe, com identificação, situação, documentos privados e pendências do seu dossiê. Voltar preserva a lista selecionada.
- Sem dossiê: uma única mensagem, sem contadores ou progresso vazio. Carregamento, falha e nenhum produto são estados distintos.
- Dossiês legados continuam disponíveis separadamente, sem herdá-los como dossiês de produtos.
- Toda inserção em produtos cria, na mesma transação, um perfil fiscal ativo DRAFT vazio. Preenchimento idempotente das ausências mantém os perfis e parametrizações já existentes.

## Verificações encontradas
- Destino configurado confirmado: Supabase `swzpzcwiasxmjutrmvkm`.
- Existem 10 produtos, 6 sem perfil ativo; nenhum produto sem proprietário.
- Os seis vínculos de composição examinados não apresentam divergência de empresa.
- Não existem dossiês regulatórios registrados nem contrato atual de dossiê individual por produto.

## Decisão de escopo
Adicionar vínculo documental explícito produto–dossiê, sem preenchê-lo automaticamente a partir de composição ou associação fiscal. O legado mantém seu sujeito microrganismo; apenas vínculo documental deliberado identifica o dossiê individual do produto. Não abrir escritores regulatórios hoje contidos nem criar documentos fictícios. Nesta base, os detalhes inicialmente apresentarão ausência de dossiê, até existir registro documental explícito autorizado.

## Detalhes técnicos
- Leitores autenticados derivam empresa do ator e conferem propriedade do microrganismo, produto e dossiê; vínculos aceitos vêm de composição real ou associação explícita existente. Cache e respostas ficam cercados pela identidade/empresa vigente.
- Associação documental aditiva com unicidade e integridade por empresa; leitura de documentos e pendências usa exclusivamente o dossiê associado ao produto, nunca pendências agregadas do microrganismo.
- Arquivos abrem pelo mecanismo autenticado privado existente, com autorização antes/depois da leitura e sem URLs assinadas públicas. Verificar políticas efetivas de Storage antes de habilitar abertura.
- Trigger de produto e rotina privada de preenchimento reutilizam a tabela fiscal e seu índice único ativo. Exceção interna estreita para criação vazia, sem remover os gates de edição, sem GUC como autorização, sem aprovar tributação.
- Conferir todos os caminhos reais de inserção; manter a parametrização existente e suas regras CAS/idempotência.

## Validação e entrega
- Testes focados de vínculo, empresa, ausência, falha, documentos/pendências individuais e preservação do legado.
- Testes de persistência: inserção atômica, rollback, perfil único, reexecução do preenchimento, preservação de valores e edição canônica.
- Migrações no destino canônico, relatório dos resultados e limitações. Verificação autenticada no navegador somente se houver sessão legítima disponível; testes sintéticos não certificam JWT/Storage real.
- Não publicar frontend, emitir, transmitir ou alterar cobranças.