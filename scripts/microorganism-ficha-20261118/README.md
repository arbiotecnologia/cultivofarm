# Ficha de microrganismos — preparação 18/11/2026

**Não publicar ainda. Nenhum SQL, Edge, dado ou aprovação foi aplicado em produção.**

## Implementado
- Catálogo/Microrganismos, Base Técnica e catálogo móvel abrem o mesmo editor; nome clicável e Abrir ficha.
- Seis seções visíveis, área central rolável, salvar/cancelar fixos e confirmação de saída dentro da ficha.
- Campos atuais preservados; cepa, sinônimos, origem, unidade/apresentação, textos de culturas/alvos e pendências documentais em complemento privado candidato. Nenhum preço, dose, aprovação ou fabricação é inferido.
- Editor fiscal existente pode ser embutido, sem novo diálogo; dossiês comerciais usam navegação existente.
- IA envia identidade completa disponível e separa espécie de produto/cepa. Seleção antes da pesquisa, comparação atual/sugestão, fontes por campo, aplicação ao rascunho e salvamento explícito.
- Cancelamento e timeout 90s aposentam geração; respostas antigas não liberam requisição nova. Edição manual não é desabilitada durante pesquisa. Fontes retêm texto aceito e indicam alteração manual posterior.
- Contrato candidato atômico reutiliza root writer, CAS da raiz + perfil, recibo e reautorização; complemento privado não muda dono/IDs. Rollback nega escrita e preserva fontes/histórico.

## Sequência de revisão
1. Comprovar destino canônico `swzpzcwiasxmjutrmvkm` pelo operador; executar somente `01-pre` read-only e arquivar ACL, constraints, triggers e hash dos 27 micros AR Bio. Esta sessão não certificou a contagem 27.
2. Revisar `02-install`: pins reais actor `5e0ce9cc9122f1c21d76e29a13de8b59`, root `7db253bcc2150276ea2bb2f7bd90e471`. Instalação mantém ACL cliente fechada e gate OFF. Não reaplicar pacote antigo documental/mobile.
3. `03-post`, revisão independente em teste autorizado, depois decisão separada `05-release`. Não executar release automaticamente.
4. Montar `service/` dentro de uma única Edge `catalog-documentary-suggestions` somente após autorização. Imports locais/autossuficientes, SDK e modelo existente preservados, configuração revisável separada. Não usar `ai-generate-ficha-campo`, nem service-role. LOVABLE_API_KEY é configuração privada do serviço, nunca código.
5. Testes reais abaixo e somente então publicação pelo root. `04-rollback` é deny-only, nunca apaga fatos ou restaura catálogo global.

## Bloqueios reais / escopo não concluído
- Backend candidato não instalado: salvar ficha completa informa erro e preserva rascunho; serviço documental ausente ainda requer implantação. Não escondemos com botão permanentemente desabilitado nem alegamos prontidão para publicação.
- Sessão `external_unmanaged`: não há JWT restaurável nem teste hospedado autenticado disponível. CLI read-only recusou backend externo; captura de metadados veio da ferramenta de leitura após comprovar ref. Nada foi alterado.
- Captura de receipt sofreu sanitização automática (`[REDACTED]`); não é SQL executável. Harness reconstrói essa dependência a partir do original revisado e declara a costura. Root deve recapturar antes de certificar cadeia integral.
- Relações canônicas culturas/alvos são consultadas, mas seus writers atuais ficam fechados. Textos de uso documentado têm persistência candidata, não substituem vínculos operacionais.
- Documentos regulatórios existentes ficam localizáveis via produtos vinculados e dossiê canônico. Upload/edição de documentos próprios do microrganismo continua contido; **não foi criado um writer regulatório paralelo**. Exige revisão do contrato fiscal/regulatório existente antes de declarar escopo completo.
- Teste de locks/ revogação durante espera, quotas compartilhadas servidor e prova de Storage precisam completar auditoria. URLs retornadas pela busca não demonstram, sozinhas, que o trecho sustenta uma alegação; revisão humana continua obrigatória.

## Roteiro hospedado pendente
Com fixtures exclusivamente no teste autorizado: Admin/Gestor A salvar/reabrir identificação, conteúdo e fontes; leitor técnico sem salvar/IA; Financeiro apenas fiscal conforme regra existente; B2B e Superadmin sem CRUD. B outro tenant deve receber negação direta nos três RPCs. Repetir JWT antigo após revogação e espera de lock; CAS raiz/perfil conflitante não altera complemento. Cancelar pesquisa, editar texto manual, trocar empresa A→B→A, devolver resposta antiga e repetir após falha. Testar fiscal embutido, documentos, logout e desktop 1280/mobile390. PRE/POST preservar contagem e hash de identidades; nenhuma aprovação real.

A instalação inicial é transacional e aborta se já instalada, exigindo POST/revisão em vez de reaplicar. Ainda não certificada como instalador idempotente completo nem como cadeia de locks integral.
