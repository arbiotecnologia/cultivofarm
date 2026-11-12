// F4.1 harness — usa o assinador/verificador REAIS do motor (sem cópia).
// Uso: deno run --allow-read --allow-write sign_fixture.ts sign <payload.json> <cert.pem> <key.pem> <out.xml>
//      deno run --allow-read verify <signed.xml>
import { buildNfeXml, NFE_NAMESPACE } from "../../supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts";
import { validateAgainstOfficialXsd } from "../../supabase/functions/fiscal-xml-engine/xsdValidate.ts";
import { signNfeXml, verifyNfeSignature } from "../../supabase/functions/_shared/fiscal/nfe/signNfeXml.ts";

const [mode, ...a] = Deno.args;
if (mode === "sign") {
  const payload = JSON.parse(await Deno.readTextFile(a[0]));
  const built = buildNfeXml(payload);
  const infNFeId = built.xml.match(/<infNFe [^>]*Id="([^"]+)"/)?.[1];
  if (!infNFeId) throw new Error("infNFe Id ausente");
  const res = signNfeXml({
    xml: built.xml, infNFeId, namespace: NFE_NAMESPACE,
    material: { certPem: await Deno.readTextFile(a[1]), keyPem: await Deno.readTextFile(a[2]) },
  });
  await Deno.writeTextFile(a[3], res.signedXml);
  console.log(JSON.stringify({ infNFeId, metadata: res.metadata, selfVerify: verifyNfeSignature(res.signedXml, NFE_NAMESPACE) }));
} else if (mode === "verify") {
  console.log(JSON.stringify(verifyNfeSignature(await Deno.readTextFile(a[0]), NFE_NAMESPACE)));
} else if (mode === "xsd") {
  // Validador normativo do motor (Xerces-C++ WASM + bundle com integridade verificada).
  const out: Record<string, unknown> = {};
  for (const f of a) out[f] = await validateAgainstOfficialXsd(await Deno.readTextFile(f));
  console.log(JSON.stringify(out));
} else {
  throw new Error("modo inválido");
}
