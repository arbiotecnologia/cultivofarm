import { probeSmtpProvider, type ProbeConnection, type SmtpProbeResult } from "./smtp-provider-probe.ts";
import type { WorkerEnv } from "./adapters-types.ts";

type DenoSocket = ProbeConnection;

export function probeSmtpProviderInDeno(env: WorkerEnv): Promise<SmtpProbeResult> {
  return probeSmtpProvider(env, {
    connect: (hostname, port) => Deno.connect({ hostname, port, transport: "tcp" }) as Promise<DenoSocket>,
    connectTls: (hostname, port) => Deno.connectTls({ hostname, port }) as Promise<DenoSocket>,
    startTls: (connection, hostname) => Deno.startTls(connection as Deno.TcpConn, { hostname }) as Promise<DenoSocket>,
  });
}
