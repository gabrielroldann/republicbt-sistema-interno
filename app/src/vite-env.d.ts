/// <reference types="vite/client" />

/**
 * As variáveis que o painel lê do ambiente.
 *
 * Tipadas de propósito: sem isto, `import.meta.env.VITE_QUALQUER_COISA` compila
 * e volta `undefined` em produção. Um erro de digitação no nome viraria "modo
 * demonstração" silencioso — o painel abriria com dados inventados achando que
 * está no banco.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
