import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import base from "../../vitest.config";

const here = __dirname;
// Módulos que a candidata substitui resolvem para as cópias candidatas; todo o resto
// continua resolvendo para o runtime vigente em src/.
const candidate = (p: string) => resolve(here, "frontend/src", p);

export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: [
      { find: "@/lib/catalogo/platformCatalogLabels", replacement: candidate("lib/catalogo/platformCatalogLabels.ts") },
      { find: "@/lib/catalogo/platformCatalogFamily", replacement: candidate("lib/catalogo/platformCatalogFamily.ts") },
      { find: "@/lib/catalogo/platformCatalogRead", replacement: candidate("lib/catalogo/platformCatalogRead.ts") },
      { find: "@/components/plataforma/PlatformCatalogFamilyDialog", replacement: candidate("components/plataforma/PlatformCatalogFamilyDialog.tsx") },
      { find: "@/components/plataforma/PlatformCatalogLabelsPanel", replacement: candidate("components/plataforma/PlatformCatalogLabelsPanel.tsx") },
      { find: "@", replacement: resolve(here, "../../src") },
    ],
  },
  test: { ...base.test, include: ["scripts/catalog-labels-20261021/frontend/**/*.test.tsx"] },
});
