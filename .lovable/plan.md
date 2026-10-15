# Personalização do catálogo por empresa — plano aprovado (revisão 15/10/2026)

Diagnóstico: `authenticated` tem somente SELECT em produtos, microrganismos, culturas, formulacoes e catalogo_volumes; não há escrita global aberta e a contenção existente não é refeita. `formulacoes` não tem `updated_at`.

## Fases
1. Visibilidade de globais por empresa + cache por identidade/empresa + consumidores integrados (candidato entregue, SQL não aplicado). Relatório: `docs/auditorias/catalogo-personalizacao-tenant.md`.
2. Integrar consumidores pendentes (B2B pela empresa fornecedora via vínculo comercial validado, desktop, produção) somente com leitor seguro.
3. Ownership e CRUD próprio, após proteger leitores DEFINER, RPCs globais e descendentes.
4. Matriz de evidências por canal/perfil, sem certificação total.

## Regras
- Empresa sempre derivada no servidor; SA fora da operação da empresa.
- Ocultar não altera ativo/B2B/fórmula/preço; exibir não reativa inativo; histórico preservado.
- Rollback revoga apenas entradas novas e preserva preferências/ledger; nunca restaura grants globais.
