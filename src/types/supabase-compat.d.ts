import type { PostgrestQueryBuilder, PostgrestFilterBuilder } from '@supabase/supabase-js';

declare module '@supabase/supabase-js' {
  interface SupabaseClient<Database = any, SchemaName = any, Schema = any, ClientOptions = any> {
    from(relation: string): PostgrestQueryBuilder<ClientOptions, Schema, any, string>;
    rpc(
      fn: string,
      args?: Record<string, unknown>,
      options?: { head?: boolean; get?: boolean; count?: 'exact' | 'planned' | 'estimated' },
    ): PostgrestFilterBuilder<ClientOptions, Schema, any, any, string, any, 'RPC'>;
  }
}
