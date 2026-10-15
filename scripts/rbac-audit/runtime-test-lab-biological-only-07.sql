\set ON_ERROR_STOP on
BEGIN;
-- Harness deve fornecer produtos bio/químico/fertilizante, micro e OS/programações isoladas.
-- PASS: produto biologico; PASS: microrganismo; FAIL 23514: químico; FAIL 23514: fertilizante.
-- Pedido misto: somente linha biológica gera OS/programação/lote; linhas não fabricáveis ficam sem vínculo de produção.
-- UPDATE irrelevante de histórico químico/fertilizante existente deve permanecer permitido.
-- Não usar enum legado tipo como decisão: biofungicida e fungicida químico divergem por familia_catalogo.
SELECT CASE WHEN platform_private.lab_item_is_manufacturable(:bio_product::uuid,NULL) THEN 'PASS' ELSE 'FAIL' END;
SELECT CASE WHEN platform_private.lab_item_is_manufacturable(NULL,:micro::uuid) THEN 'PASS' ELSE 'FAIL' END;
SELECT CASE WHEN NOT platform_private.lab_item_is_manufacturable(:chemical_product::uuid,NULL) THEN 'PASS' ELSE 'FAIL' END;
SELECT CASE WHEN NOT platform_private.lab_item_is_manufacturable(:fertilizer_product::uuid,NULL) THEN 'PASS' ELSE 'FAIL' END;
-- FAIL fechado: microrganismo válido não pode tornar um produto químico fabricável.
SELECT CASE WHEN NOT platform_private.lab_item_is_manufacturable(:chemical_product::uuid,:micro::uuid) THEN 'PASS' ELSE 'FAIL' END;
-- Também rejeita vínculo duplo biológico+micro por ambiguidade; a entrada deve escolher um root.
SELECT CASE WHEN NOT platform_private.lab_item_is_manufacturable(:bio_product::uuid,:micro::uuid) THEN 'PASS' ELSE 'FAIL' END;
ROLLBACK;
