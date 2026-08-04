# Botão "Gerar com IA" na aba Parceiro B2B das fichas

## Situação atual

- Ficha de **produto**: a aba B2B já usa o campo com IA (`ProfileFieldAI`), com o botão liberado para o time técnico.
- Ficha de **microrganismo**: a aba B2B usa um campo de texto simples, sem botão de IA — é a lacuna a corrigir.
- A função de IA já aceita o campo `explicacao_b2b` tanto para produto quanto para microrganismo, então não há mudança de backend.

## O que será feito

1. Na ficha de microrganismo, substituir o campo de texto da aba "B2B" pelo mesmo componente com IA usado nas demais abas, mantendo:
   - o rótulo "Linguagem para parceiro B2B" e as 6 linhas de altura;
   - os avisos existentes (ficha não criada, microrganismo não habilitado para B2B, aviso de edição restrita);
   - a regra de somente leitura para quem não pode editar.
2. O botão "Gerar com IA" aparece para o time técnico (mesmo critério já aplicado a produto), gerando sugestão que entra como versão pendente e exibe o aviso de revisão humana.

## Detalhes técnicos

- Arquivo: `src/components/protocolos/MicroorganismTechnicalProfileDialog.tsx`, bloco `TabsContent value="b2b"`.
- Troca de `Label` + `Textarea` por `ProfileFieldAI` com `entidadeTipo="microrganismo"`, `entidadeId={micro.id}`, `campo="explicacao_b2b"`, `readOnly={!canEditFull && !canEditB2BOnly}` e `canGenerateAI={canEditFull}`.
- Sem alteração de rotas, permissões, banco ou Edge Functions.
- Validação: typecheck, build e vitest.

## Permissões

Administradores (e gestores, consultores técnicos e técnicos agrônomos) já são os papéis autorizados a gerar com IA nas demais abas e na função de IA do servidor. Com esta mudança, o administrador passa a ter o botão na aba B2B exatamente como nas outras abas — sem nenhuma alteração de permissão, banco ou Edge Function.

O perfil gestor comercial continua podendo editar o texto B2B manualmente, mas sem o botão de IA (mesmo comportamento já vigente na ficha de produto).

