import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const mode = import.meta.env.MODE;
  const nodeEnv = import.meta.env.NODE_ENV;

  // 1) import.meta.env
  const importMetaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const importMetaVal = importMetaEnv?.PHRASE_TTS_ENCRYPTION_KEY;
  const importMetaKeysSample = importMetaEnv
    ? Object.keys(importMetaEnv).filter((name) =>
        ["PHRASE", "TTS", "SUPABASE", "APP"].some((prefix) => name.includes(prefix))
      )
    : [];

  // 2) Astro runtime env (Cloudflare bindings)
  let runtimeEnvHasKey = false;
  let runtimeEnvLength: number | null = null;
  let runtimeEnvKeysSample: string[] = [];

  try {
    const id = ["astro", "runtime", "server"].join("/");
    // Use dynamic import via Function to avoid bundler resolution at build time
    const dynImport = new Function("m", "return import(m);") as (m: string) => Promise<unknown>;
    const mod = (await dynImport(id)) as { getRuntime?: () => { env?: Record<string, string | undefined> } };
    const runtime = typeof mod?.getRuntime === "function" ? mod.getRuntime() : undefined;
    const env = runtime?.env ?? {};

    const runtimeVal = env.PHRASE_TTS_ENCRYPTION_KEY;
    if (typeof runtimeVal === "string" && runtimeVal.length > 0) {
      runtimeEnvHasKey = true;
      runtimeEnvLength = runtimeVal.length;
    }

    runtimeEnvKeysSample = Object.keys(env).filter((name) =>
      ["PHRASE", "TTS", "SUPABASE", "APP"].some((prefix) => name.includes(prefix))
    );
  } catch {
    // ignore - non-Cloudflare or during build
  }

  // 3) process.env (mostly for local dev / tests)
  const processVal = typeof process !== "undefined" ? process.env.PHRASE_TTS_ENCRYPTION_KEY : undefined;

  // 4) Cloudflare-specific request metadata (if available)
  const rawRequest = context.request as Request & { cf?: Record<string, unknown> };
  const cf = rawRequest.cf ?? {};
  const cfKeysSample = Object.keys(cf);
  const cfPagesHostName = typeof cf.pagesHostName === "string" ? (cf.pagesHostName as string) : null;
  const host = rawRequest.headers.get("host");

  // 5) globalThis.env (some runtimes expose bindings here)
  let globalEnvKeysSample: string[] = [];
  try {
    const anyGlobal = globalThis as unknown as { env?: Record<string, string | undefined> };
    if (anyGlobal.env) {
      globalEnvKeysSample = Object.keys(anyGlobal.env).filter((name) =>
        ["PHRASE", "TTS", "SUPABASE", "APP"].some((prefix) => name.includes(prefix))
      );
    }
  } catch {
    // ignore
  }

  // 6) Astro APIContext inspection (adapter-specific)
  const contextAny = context as unknown as {
    locals?: Record<string, unknown>;
    env?: Record<string, string | undefined>;
  };
  const contextKeys = Object.keys(contextAny ?? {});
  const localsKeys = contextAny.locals ? Object.keys(contextAny.locals) : [];
  const contextEnvKeysSample = contextAny.env
    ? Object.keys(contextAny.env).filter((name) =>
        ["PHRASE", "TTS", "SUPABASE", "APP"].some((prefix) => name.includes(prefix))
      )
    : [];
  const localsRuntimeEnvKeysSample =
    contextAny.locals && (contextAny.locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env
      ? Object.keys(
          (contextAny.locals as { runtime?: { env?: Record<string, string | undefined> } }).runtime?.env ?? {}
        ).filter((name) => ["PHRASE", "TTS", "SUPABASE", "APP"].some((prefix) => name.includes(prefix)))
      : [];

  const body = {
    mode,
    nodeEnv,
    importMeta: {
      hasKey: !!importMetaVal,
      length: typeof importMetaVal === "string" ? importMetaVal.length : null,
      keysSample: importMetaKeysSample,
    },
    runtimeEnv: {
      hasKey: runtimeEnvHasKey,
      length: runtimeEnvLength,
      keysSample: runtimeEnvKeysSample,
    },
    processEnv: {
      hasKey: !!processVal,
      length: typeof processVal === "string" ? processVal.length : null,
    },
    cloudflare: {
      host,
      pagesHostName: cfPagesHostName,
      cfKeysSample,
    },
    globalEnv: {
      keysSample: globalEnvKeysSample,
    },
    astroContext: {
      contextKeys,
      localsKeys,
      contextEnvKeysSample,
      localsRuntimeEnvKeysSample,
    },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
