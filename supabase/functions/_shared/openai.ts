// Server-only OpenAI Responses transport. Never accepts credentials/model from clients.
export class OpenAIError extends Error {
  httpStatus: number;
  code: string;
  constructor(httpStatus: number, code: string) {
    super(code);
    this.name = 'OpenAIError';
    this.httpStatus = httpStatus;
    this.code = code;
  }
}
export function openAIModel(research = false): string {
  return Deno.env.get(research ? 'OPENAI_RESEARCH_MODEL' : 'OPENAI_TEXT_MODEL')?.trim()
    || (research ? 'gpt-6-astra' : 'gpt-6.1-terra');
}
export async function generateResponse(body: Record<string, unknown>, options: { signal?: AbortSignal } = {}) {
  const key = Deno.env.get('OPENAI_API_KEY')?.trim();
  if (!key) throw new OpenAIError(503, 'openai_not_configured');
  const signal = AbortSignal.any([AbortSignal.timeout(70000), ...(options.signal ? [options.signal] : [])]);
  let response: Response;
  let data: any;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal, redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ ...body, store: false }),
    });
    data = await response.json();
  } catch {
    throw new OpenAIError(signal.aborted ? 504 : 502, signal.aborted ? 'openai_timeout' : 'openai_unavailable');
  }
  if (!response.ok) {
    const credit = response.status === 402 || (response.status === 429 &&
      ['insufficient_quota', 'credit_balance_exhausted', 'billing_hard_limit_reached'].includes(data?.error?.code));
    throw new OpenAIError(credit ? 402 : response.status === 429 ? 429 : [401, 403].includes(response.status) ? 503 : 502,
      credit ? 'openai_credit_limit' : response.status === 429 ? 'openai_rate_limit' : 'openai_unavailable');
  }
  if (data?.status !== 'completed' || !Array.isArray(data.output)) throw new OpenAIError(502, 'openai_incomplete_response');
  return data;
}
export function responseText(response: any): string {
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    if (item.status && item.status !== 'completed') throw new OpenAIError(502, 'openai_incomplete_response');
    for (const content of item.content ?? []) {
      if (content.type === 'refusal') throw new OpenAIError(422, 'openai_refusal');
      if (content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  if (!parts.length) throw new OpenAIError(502, 'openai_empty_response');
  return parts.join('\n');
}
