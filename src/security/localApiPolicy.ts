export interface LocalApiPolicy {
  host: string;
  allowedOrigins: ReadonlySet<string>;
  isOriginAllowed(origin: string | undefined): boolean;
}

interface LocalApiPolicyInput {
  runtime: "desktop" | "standalone";
  nodeEnv: string;
  env: Readonly<Record<string, string | undefined>>;
}

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export function resolveLocalApiPolicy(input: LocalApiPolicyInput): LocalApiPolicy {
  const host = input.runtime === "desktop" ? "127.0.0.1" : input.env.TOONFLOW_HOST || "127.0.0.1";
  const configuredOrigins = (input.env.TOONFLOW_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set<string>(configuredOrigins);

  if (input.runtime === "desktop") {
    allowedOrigins.add("null");
    if (input.nodeEnv === "dev") {
      allowedOrigins.add("http://localhost:50188");
      allowedOrigins.add("http://127.0.0.1:50188");
    }
  } else if (!loopbackHosts.has(host) && allowedOrigins.size === 0) {
    throw new Error("local_api.allowed_origins_required");
  }

  return {
    host,
    allowedOrigins,
    isOriginAllowed(origin) {
      return origin === undefined || allowedOrigins.has(origin);
    },
  };
}
