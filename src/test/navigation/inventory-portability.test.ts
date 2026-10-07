import { describe, expect, it, vi } from "vitest";

vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:path")>();
  return { ...actual, join: actual.win32.join };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readdirSync: vi.fn((root: string) => {
      const tree: Record<string, { name: string; directory: boolean }[]> = {
        src: [{ name: "pages", directory: true }, { name: "App.tsx", directory: false }, { name: "logo.png", directory: false }],
        "src/pages": [{ name: "Auth.tsx", directory: false }, { name: "helper.js", directory: false }],
      };
      const entries = tree[root];
      if (!entries) throw new Error(`Unnormalized directory: ${root}`);
      return entries.map(({ name, directory }) => ({ name, isDirectory: () => directory }));
    }),
  };
});

import { sourceFiles } from "../../../scripts/navigation-audit/inventory";

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