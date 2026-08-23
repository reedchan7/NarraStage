export interface LocalApiPolicy {
  host: string;
  allowedOrigins: ReadonlySet<string>;
  registerListeningPort(port: number): void;
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
  }
  if (input.nodeEnv === "dev" && loopbackHosts.has(host)) {
    allowedOrigins.add("http://localhost:50188");
    allowedOrigins.add("http://127.0.0.1:50188");
  }
  if (input.runtime === "standalone" && !loopbackHosts.has(host) && allowedOrigins.size === 0) {
    throw new Error("local_api.allowed_origins_required");
  }

  return {
    host,
    allowedOrigins,
    registerListeningPort(port) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("local_api.invalid_listening_port");
      }
      if (!loopbackHosts.has(host)) return;

      const originHosts =
        host === "::1"
          ? ["[::1]", "localhost"]
          : host === "127.0.0.1"
            ? ["127.0.0.1", "localhost"]
            : ["localhost", "127.0.0.1", "[::1]"];
      for (const originHost of originHosts) {
        allowedOrigins.add(`http://${originHost}:${port}`);
      }
    },
    isOriginAllowed(origin) {
      return origin === undefined || allowedOrigins.has(origin);
    },
  };
}
