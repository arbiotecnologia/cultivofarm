/**
 * Fase F4 — Parser XML mínimo e fail-closed.
 *
 * Não usa DOMParser nem bibliotecas externas: aceita apenas o subconjunto
 * de XML permitido pelo leiaute NF-e 4.00 (elementos, atributos, texto).
 * Rejeita explicitamente DOCTYPE, ENTITY, CDATA, processing instructions e
 * comentários — vetores clássicos de XXE/entity expansion.
 *
 * Módulo puro (sem APIs Deno): compartilhado entre Edge Function e testes.
 */

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export class XmlParseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "XmlParseError";
  }
}

const FORBIDDEN = [
  { token: "<!DOCTYPE", code: "XML_DOCTYPE_FORBIDDEN" },
  { token: "<!ENTITY", code: "XML_ENTITY_FORBIDDEN" },
  { token: "<![CDATA[", code: "XML_CDATA_FORBIDDEN" },
  { token: "<!--", code: "XML_COMMENT_FORBIDDEN" },
];

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

export function unescapeXml(raw: string): string {
  return raw.replace(/&(lt|gt|amp|quot|apos|#\d+);/g, (m, g: string) => {
    switch (g) {
      case "lt": return "<";
      case "gt": return ">";
      case "amp": return "&";
      case "quot": return '"';
      case "apos": return "'";
      default: {
        const code = Number(g.slice(1));
        if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) {
          throw new XmlParseError("XML_BAD_CHARREF", "referência de caractere inválida");
        }
        return String.fromCodePoint(code);
      }
    }
  });
}

/** Faz o parse de um documento XML simples e devolve o elemento raiz. */
export function parseXml(input: string): XmlNode {
  if (typeof input !== "string" || input.length === 0) {
    throw new XmlParseError("XML_EMPTY", "documento XML vazio");
  }
  if (input.length > 5 * 1024 * 1024) {
    throw new XmlParseError("XML_TOO_LARGE", "documento XML acima do limite de 5 MiB");
  }
  const upper = input.toUpperCase();
  for (const f of FORBIDDEN) {
    if (upper.includes(f.token.toUpperCase())) {
      throw new XmlParseError(f.code, `construção XML proibida: ${f.token}`);
    }
  }

  let i = 0;
  // Prolog opcional (uma única declaração XML).
  if (input.startsWith("<?xml")) {
    const end = input.indexOf("?>");
    if (end < 0) throw new XmlParseError("XML_BAD_PROLOG", "declaração XML não fechada");
    i = end + 2;
  }
  if (input.indexOf("<?", i) >= 0) {
    throw new XmlParseError("XML_PI_FORBIDDEN", "processing instruction não permitida");
  }

  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;

  while (i < input.length) {
    const lt = input.indexOf("<", i);
    if (lt < 0) {
      if (input.slice(i).trim().length > 0) {
        throw new XmlParseError("XML_TRAILING_TEXT", "texto fora de elemento");
      }
      break;
    }
    if (lt > i) {
      const chunk = input.slice(i, lt);
      if (stack.length === 0) {
        if (chunk.trim().length > 0) {
          throw new XmlParseError("XML_TRAILING_TEXT", "texto fora do elemento raiz");
        }
      } else {
        stack[stack.length - 1].text += unescapeXml(chunk);
      }
    }
    const gt = input.indexOf(">", lt);
    if (gt < 0) throw new XmlParseError("XML_UNCLOSED_TAG", "tag não fechada");
    const raw = input.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim();
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new XmlParseError("XML_MISMATCHED_TAG", `fechamento inesperado de <${name}>`);
      }
      if (stack.length === 0) root = open;
      continue;
    }

    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1).trim() : raw;
    const spaceAt = body.search(/\s/);
    const name = spaceAt < 0 ? body : body.slice(0, spaceAt);
    if (!NAME_RE.test(name)) {
      throw new XmlParseError("XML_BAD_NAME", `nome de elemento inválido: ${name}`);
    }
    const attrs: Record<string, string> = {};
    if (spaceAt >= 0) {
      const attrRe = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*"([^"]*)"/g;
      const attrPart = body.slice(spaceAt);
      let m: RegExpExecArray | null;
      let consumed = 0;
      while ((m = attrRe.exec(attrPart)) !== null) {
        attrs[m[1]] = unescapeXml(m[2]);
        consumed += m[0].length;
      }
      if (attrPart.replace(/\s+/g, "").length !== consumed.valueOf() - 0 &&
          attrPart.trim().length > 0 && Object.keys(attrs).length === 0) {
        throw new XmlParseError("XML_BAD_ATTRS", `atributos inválidos em <${name}>`);
      }
    }

    const node: XmlNode = { name, attrs, children: [], text: "" };
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else if (root !== null) throw new XmlParseError("XML_MULTIPLE_ROOTS", "mais de um elemento raiz");

    if (selfClosing) {
      if (stack.length === 0) root = node;
    } else {
      stack.push(node);
    }
  }

  if (stack.length > 0) {
    throw new XmlParseError("XML_UNCLOSED_ELEMENT", `elemento <${stack[stack.length - 1].name}> não fechado`);
  }
  if (!root) throw new XmlParseError("XML_NO_ROOT", "documento sem elemento raiz");
  return root;
}

export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((c) => c.name === name);
}

export function firstChild(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => c.name === name);
}
