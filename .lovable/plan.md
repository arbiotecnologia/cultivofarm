# Correção de aceite — ciclo pós-salvamento do DRAFT

## Objetivo
Corrigir somente o estado do editor após salvar, sem publicar versão ou aplicativo, sem alterar contratos comerciais e sem mudanças no banco.

## Implementação
1. Extrair utilitários puros para:
   - converter `datetime-local` do navegador para ISO/timestamptz e fazer o caminho inverso sem deslocamento visual;
   - montar e comparar o fingerprint comercial canônico apenas com plano, preço normalizado, moeda, ciclo, trial, vigência, limites e features ordenadas.
2. Separar no editor:
   - estado persistente comercial e baseline validado;
   - estado operacional (`motivo`, confirmação, buscas, filtros e diálogos).
3. Após o save:
   - manter o `draftId` retornado;
   - aguardar a recarga canônica das versões;
   - validar no servidor o mesmo DRAFT;
   - registrar como baseline limpo o snapshot canônico recarregado;
   - preservar o motivo e limpar somente `PUBLICAR`.
4. Controlar os botões pelo fingerprint:
   - “Salvar rascunho” apenas quando houver alteração comercial real ou ainda não existir baseline salvo;
   - “Publicar versão” apenas com `draftId`, validação `complete=true` e `valid=true`, fingerprint atual igual ao baseline, motivo preenchido e confirmação exata.
5. Manter a mesma chave idempotente em retries; renovar somente após save concluído ou alteração comercial real.

## Validação
- Ampliar os testes focados para os sete cenários solicitados, incluindo o round-trip `2026-10-07T00:13`.
- Rodar Vitest focado, `tsgo`, ESLint focado, scanner de segredos e build.
- Consultar o Supabase canônico somente em modo leitura para registrar quantidades finais de DRAFT/PUBLISHED.
- Não clicar em “Publicar versão” e não executar DDL.

## Critério de aceite
O DRAFT recarregado permanece limpo; motivo não suja o conteúdo; `PUBLICAR` é limpa após save; o botão de publicação habilita apenas para o snapshot validado e volta a bloquear após qualquer mudança comercial.
