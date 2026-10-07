import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { win32 } from "node:path";
import ts from "typescript";

// Run the real script with Windows path semantics; external scripts are not
// transformed for vi.mock by this Vite configuration.
const code = ts.transpileModule(readFileSync("scripts/navigation-audit/inventory.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsObject: { sourceFiles?: (root: string) => string[] } = {};
const tree: Record<string, { name: string; directory: boolean }[]> = {
  src: [{ name: "pages", directory: true }, { name: "App.tsx", directory: false }, { name: "logo.png", directory: false }],
  "src/pages": [{ name: "Auth.tsx", directory: false }, { name: "helper.js", directory: false }],
};
const load = (id: string) => {
  if (id === "typescript") return ts;
  if (id === "node:path") return win32;
  if (id === "node:fs") return {
    readdirSync: (root: string) => {
      const entries = tree[root];
      if (!entries) throw new Error(`Unnormalized directory: ${root}`);
      return entries.map(({ name, directory }) => ({ name, isDirectory: () => directory }));
    },
  };
  throw new Error(`Unexpected import: ${id}`);
};
new Function("require", "exports", code)(load, exportsObject);
const sourceFiles = (root: string) => {
  if (!exportsObject.sourceFiles) throw new Error("sourceFiles export missing");
  return exportsObject.sourceFiles(root);
};

describe("inventário — portabilidade Windows", () => {
  it("normaliza separadores antes da recursão e no resultado sem incluir mídia", () => {
    expect(sourceFiles("src")).toEqual(["src/pages/Auth.tsx", "src/pages/helper.js", "src/App.tsx"]);
  });

  it("preserva caminhos comparáveis aos consumidores do inventário", () => {
    const files = sourceFiles("src");
    expect(files.every((file) => !file.includes("\\"))).toBe(true);
    expect(files.filter((file) => file.startsWith("src/pages/"))).toHaveLength(2);
  });
});