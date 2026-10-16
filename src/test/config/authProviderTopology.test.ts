import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const sourcePath = (p: string) => relative(ROOT, p).replaceAll("\\", "/");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = resolve(directory, entry);
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
    return /\.(ts|tsx)$/.test(entry) ? [absolute] : [];
  });
}

describe("P0 pós-publicação — topologia do AuthProvider", () => {
  it("mantém todas as rotas sob o provider canônico", () => {
    const app = read("src/App.tsx");
    const providerStart = app.indexOf("<AuthProvider>");
    const routesStart = app.indexOf("<Routes>");
    const routesEnd = app.indexOf("</Routes>");
    const providerEnd = app.indexOf("</AuthProvider>");

    expect(providerStart).toBeGreaterThan(-1);
    expect(routesStart).toBeGreaterThan(providerStart);
    expect(routesEnd).toBeGreaterThan(routesStart);
    expect(providerEnd).toBeGreaterThan(routesEnd);
  });

  it("possui uma única definição de useAuth e AuthProvider", () => {
    const files = sourceFiles(resolve(ROOT, "src"));
    const productionFiles = files.filter((file) => !sourcePath(file).includes("/test/") && !/\.test\./.test(file));
    const useAuthDefinitions = productionFiles.filter((file) => /export function useAuth\s*\(/.test(readFileSync(file, "utf8")));
    const providerDefinitions = productionFiles.filter((file) => /export function AuthProvider\s*\(/.test(readFileSync(file, "utf8")));

    expect(useAuthDefinitions.map(sourcePath)).toEqual(["src/hooks/useAuth.tsx"]);
    expect(providerDefinitions.map(sourcePath)).toEqual(["src/hooks/useAuth.tsx"]);
  });

  it("mantém os imports de produção apontados ao hook canônico", () => {
    const files = sourceFiles(resolve(ROOT, "src"));
    const offenders = files
      .filter((file) => !sourcePath(file).includes("/test/") && !/\.test\./.test(file))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /\buseAuth\b/.test(source)
          && sourcePath(file) !== "src/hooks/useAuth.tsx"
          && !source.includes('from "@/hooks/useAuth"')
          && !source.includes('from "./useAuth"');
      });

    expect(offenders).toEqual([]);
  });
});