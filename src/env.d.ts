declare namespace NodeJS {
  interface ProcessEnv {
    readonly VITE_SUPABASE_URL?: string
    readonly VITE_SUPABASE_ANON_KEY?: string
  }
}

declare const process: { env: NodeJS.ProcessEnv }
