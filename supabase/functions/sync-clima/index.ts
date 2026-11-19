import { createHandler } from './handler.mjs';

Deno.serve(createHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL')!,
  publicKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  fetcher: fetch,
}));
