import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface RouteInventory {
  path: string;
  line: number;
  index: boolean;
  components: string[];
  ancestors: string[];
  redirect: string | null;
}

/** Inspect actual JSX, including pathless parents and relative/index routes. */
export function declaredRoutes(source = readFileSync("src/App.tsx", "utf8")): RouteInventory[] {
  const file = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const routes: RouteInventory[] = [];
  const tags = (node: ts.Node): string[] => {
    const result: string[] = [];
    const visit = (child: ts.Node) => {
      if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) result.push(child.tagName.getText(file));
      ts.forEachChild(child, visit);
    };
    visit(node);
    return result;
  };
  const walk = (node: ts.Node, parentPath = "", ancestors: string[] = []) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (opening.tagName.getText(file) === "Route") {
        const attrs = opening.attributes.properties.filter(ts.isJsxAttribute);
        const value = (name: string) => {
          const attr = attrs.find((a) => a.name.getText(file) === name);
          return attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : null;
        };
        const path = value("path");
        const index = attrs.some((a) => a.name.getText(file) === "index");
        const full = path?.startsWith("/") || path === "*" ? path : path ? `${parentPath}/${path}` : parentPath;
        const element = attrs.find((a) => a.name.getText(file) === "element");
        const components = element ? tags(element) : [];
        let redirect: string | null = null;
        if (element) {
          const findTo = (child: ts.Node) => {
            if (ts.isJsxAttribute(child) && child.name.getText(file) === "to" && child.initializer && ts.isStringLiteral(child.initializer)) redirect = child.initializer.text;
            ts.forEachChild(child, findTo);
          };
          findTo(element);
        }
        if (path || index) routes.push({ path: full || "/", line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, index, components, ancestors, redirect });
        if (ts.isJsxElement(node)) node.children.forEach((child) => walk(child, full, [...ancestors, ...components]));
        return;
      }
    }
    ts.forEachChild(node, (child) => walk(child, parentPath, ancestors));
  };
  walk(file);
  return routes;
}

export function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name).replace(/\\/g, "/");
    return entry.isDirectory() ? sourceFiles(path) : /\.[jt]sx?$/.test(path) ? [path] : [];
  });
}

export function matchesRoute(pattern: string, path: string): boolean {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (pattern === "*") return false;
  const parts = pattern.split("/");
  const actual = clean.split("/");
  return parts.length === actual.length && parts.every((p, i) => p.startsWith(":") || p === actual[i]);
}