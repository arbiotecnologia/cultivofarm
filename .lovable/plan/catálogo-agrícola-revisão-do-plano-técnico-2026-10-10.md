# Catálogo agrícola — revisão do plano técnico

## Resultado documental concluído
- Fechamento externo do recorte financeiro `4717ff86` registrado no H6 e roadmap, sem apresentar checks/publicação do Codex como execução própria.
- Auditoria e plano de **17 seções** em `docs/auditorias/catalogo-expansao-dependencias-plano-2026-10-10.md`, com campos, arquivos, RPCs, dependências, evidências, bloqueadores, testes e rollback.
- Nenhuma implementação funcional, alteração de banco, atualização de dependências ou publicação nesta rodada.

## Direção proposta para revisão
Reutilizar Produtos e Catálogo Técnico com famílias Biológicos, Químicos, Fertilizantes/Adubos e Sementes/Tratamento de sementes. Preservar `produtos.tipo` como aplicação, sem reclassificar históricos. Tratamento de sementes é finalidade independente da família.

Não aplicar conversões líquidas a massa/contagem. Não ampliar acesso: gestão global continua Platform Superadmin validado no servidor; portais técnicos não recebem preço indevido.

## Detalhes técnicos e sequência condicionada
1. **C0:** confirmar contratos canônicos e decidir aplicação opcional, subclasses e apresentações/fontes reais.
2. **C1–C4:** classificação aditiva, filtros/paginação, unidades e fichas; preservar códigos, históricos e revisão individual.
3. **C5:** projeções sanitizadas de portais/mobile, com prova de acesso e cache por contexto.
4. **C6–C8:** motor comercial, estoque e fiscal somente sob gates e autorizações próprias; sem emissão/cobrança real.

Cada fase futura requer prompt específico. A aprovação deste plano não inicia implementação ampla nem autoriza SQL/publicação.

## Validação e limites
Documento com 17 seções e referências literais verificadas; financeiro produção PASS focal por evidência externa. Catálogo expandido, contratos vivos e testes HTTP/browser continuam UNVERIFIED.

Scanner de dependências reportou 16 advisories (2 altas/14 moderadas) e SheetJS por URL não verificado; nenhuma atualização realizada. Sem deep scan recente comprovado: executar scan pela aba Security antes da homologação.

**Decisão:** GO para revisão documental; NO-GO para implementação ampla e operação de novas famílias até resolver os bloqueadores.