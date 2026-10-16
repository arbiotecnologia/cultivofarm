import { describe, it, expect } from "vitest";
import { buildNativeMimeMessage as coreBuild } from "../../../supabase/functions/_shared/comunicacao/native-smtp-client";
import { buildNativeMimeMessage as mirrorBuild } from "../../../scripts/smtp-tenant-candidate/f2f3/deploy/supabase/functions/_shared/comunicacao/native-smtp-client";

// Independent decoder: select the text/html part and undo quoted-printable (soft breaks + =XX).
function htmlPart(mime: string): string {
  const boundary = /boundary="([^"]+)"/.exec(mime)?.[1];
  expect(boundary).toBeTruthy();
  const part = mime.split(`--${boundary}`).find((p) => /Content-Type: text\/html/i.test(p));
  expect(part).toBeTruthy();
  const body = part!.split("\r\n\r\n").slice(1).join("\r\n\r\n");
  const unsoft = body.replace(/=\r\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < unsoft.length; i++) {
    if (unsoft[i] === "=" && /^[0-9A-F]{2}$/.test(unsoft.slice(i + 1, i + 3))) { bytes.push(parseInt(unsoft.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(unsoft.charCodeAt(i));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const base = { from: "sender@tenant-a.test", to: "consultor@tenant-a.test", subject: "Nova solicitação" };

describe.each([["core", coreBuild], ["mirror", mirrorBuild]])("MIME text fallback escape (%s)", (_n, build) => {
  it("untrusted text cannot close <pre> or inject markup", () => {
    const html = htmlPart(build({ ...base, content: "Tipo: </pre><b>UNTRUSTED</b>" }));
    expect(html).toContain("&lt;/pre&gt;&lt;b&gt;UNTRUSTED&lt;/b&gt;");
    expect(html).not.toContain("<b>UNTRUSTED</b>");
    expect(html.match(/<\/pre>/g)?.length).toBe(1);
  });
  it("escapes ampersand and quotes in fallback", () => {
    const html = htmlPart(build({ ...base, content: `a & "b" 'c'` }));
    expect(html).toContain("a &amp; &quot;b&quot; &#39;c&#39;");
  });
  it("explicit HTML is preserved as given", () => {
    const html = htmlPart(build({ ...base, content: "x", html: "<p><b>ok</b></p>" }));
    expect(html).toContain("<p><b>ok</b></p>");
  });
});
