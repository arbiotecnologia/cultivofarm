# Dossiês individuais e perfis fiscais — 14/11/2026

## Aplicado no Supabase canônico
Destino configurado e conectado: `swzpzcwiasxmjutrmvkm`.

1. `20261114010205_943657cc-5a38-4a10-b8bb-8804d6c6348e.sql`: perfil fiscal ativo DRAFT vazio na mesma transação de INSERT em produtos; permit privado de transação/produto/proprietário consumido pelo guard fiscal. Preflight do guard por MD5 e owner não nulo; edição, CAS, classificações e histórico existentes preservados.
2. `20261114010320_cd6dc58f-ea1d-4f7a-98fe-a2b760b6122d.sql`: vínculos documentais explícitos únicos, leitores de produtos/dossiê/documento, política de leitura privada e restritiva por proprietário.
3. `20261114010356_048ffea3-6e06-41a9-989e-c0bcac603f4c.sql`: pontos públicos INVOKER, núcleos privilegiados privados com autorização vigente. Eliminou os quatro novos avisos do linter sem retirar a leitura autorizada.

Bucket privado `fiscal-regulatorio` criado com limite de 20 MB; nenhum arquivo enviado.

## Estado medido
- Antes: 10 produtos, 6 sem perfil ativo, nenhum owner nulo; seis vínculos de composição, zero divergências entre empresa do vínculo/produto/microrganismo.
- Depois: 10 produtos e 10 perfis ativos; zero produtos sem perfil e zero duplicações ativas.
- Não havia dossiês regulatórios registrados. Nenhum dossiê ou vínculo documental foi inventado/preenchido automaticamente.

## Fluxo
Microrganismo → produtos comerciais por associação explícita ou composição real same-owner → detalhe individual → voltar. Produtos inativos mantêm identificação; insumos não são apresentados como produtos comerciais. Dossiê individual só existe após vínculo documental deliberado; legado permanece separado. Sem dossiê o detalhe mostra uma única mensagem, sem percentuais/contadores/progresso; listagem remove progresso vazio. Estados de carregamento, falha e ausência de produtos são distintos.

Documentos: leitor autenticado confere produto/dossiê/documento antes e depois dos bytes, Storage privado autoriza proprietário e SHA-256 é conferido. Não há URL pública/assinada, escrita regulatória liberada ou fallback de classificação. Pendências usam o motor fiscal canônico com fatos do dossiê exato e perfil do próprio produto.

## Evidências executadas
- Vitest: 77 testes em seis arquivos, zero falhas. Inclui fluxo individual, ausência, falha, contrato de sujeito, arquivo autorizado, revogação após bytes e regressões de CAS/edição/permissões fiscais.
- PostgreSQL 17.11 descartável: 16 verificações PASS. Inserção/rollback atômicos, unicidade, reexecução idempotente, permit privado consumido, recusa direta, legado não herdado, cross-tenant negado, documentos específicos e motor canônico de pendências.
- Schema reduzido e identidade/fatos sintéticos explicitamente declarados no teste; não representam JWT/RLS/Storage hospedados. Gate de pendências usa corpo canônico do repositório. Primeira tentativa falhou pela instalação local incompleta do PostgreSQL; execução final usou os binários completos locais.
- Build automático da prévia: OK. Não foi executado build/typecheck manual, conforme a regra do ambiente.

## Limitações
- Sem sessão legítima disponível: ambiente de autenticação externo não gerenciado. Navegação autenticada AR, abertura de arquivo real e criação/edição reais pela UI NÃO EXECUTADAS; nenhum login simulado ou credencial solicitada.
- Como não há dossiês reais, documentos/pendências positivos foram exercitados somente com fixtures locais. Não é certificação de Storage/JWT em produção.
- Gestão e writers regulatórios legados continuam contidos como antes; não foi criado editor paralelo ou atribuído dossiê antigo por composição. Registrar/associar um novo dossiê exige gestão documental autorizada, não liberada neste trabalho.
- Concorrência multissessão e revogação JWT sob locks não foram executadas. Unicidade é garantida pelo índice ativo existente; backfill não faz UPDATE dos perfis existentes.
- 499 alertas anteriores do linter permanecem fora do escopo; nenhum novo alerta após separar os núcleos privados.
- Nenhuma publicação frontend, emissão, transmissão, faturamento ou mudança de credenciais.