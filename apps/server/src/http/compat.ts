import { createReadStream } from "node:fs";
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "node:http";
import { createAdaptorServer, type HttpBindings } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";

const LEGACY_BODY_LIMIT_BYTES = 100 * 1024 * 1024;

export type NextFunction = () => void | Promise<void>;

export interface Request extends IncomingMessage {
  body: any;
  params: Record<string, string>;
  path: string;
  query: Record<string, string | string[]>;
  user?: unknown;
}

export interface Response extends ServerResponse {
  locals: Record<string, unknown>;
  json(value: unknown): Response;
  send(value?: unknown): Response;
  sendFile(filePath: string): Response;
  status(code: number): Response;
  type(contentType: string): Response;
}

export type Handler = (request: Request, response: Response, next: NextFunction) => unknown;
export type ErrorHandler = (
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
) => unknown;

type LegacyRoute = {
  handlers: Handler[];
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
};

export type HonoEnvironment = {
  Bindings: HttpBindings;
  Variables: { user?: unknown };
};

export class LegacyRouter {
  readonly routes: LegacyRoute[] = [];

  get(path: string, ...handlers: Handler[]): this {
    return this.add("GET", path, handlers);
  }

  post(path: string, ...handlers: Handler[]): this {
    return this.add("POST", path, handlers);
  }

  put(path: string, ...handlers: Handler[]): this {
    return this.add("PUT", path, handlers);
  }

  delete(path: string, ...handlers: Handler[]): this {
    return this.add("DELETE", path, handlers);
  }

  patch(path: string, ...handlers: Handler[]): this {
    return this.add("PATCH", path, handlers);
  }

  private add(method: LegacyRoute["method"], path: string, handlers: Handler[]): this {
    this.routes.push({ handlers, method, path });
    return this;
  }
}

function mountedPath(prefix: string, routePath: string): string {
  const base = prefix === "/" ? "" : prefix.replace(/\/$/, "");
  const suffix = routePath === "/" ? "" : routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${base}${suffix}` || "/";
}

function requestHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string | string[] | undefined> {
  return headers;
}

async function enhanceRequest(context: Context<HonoEnvironment>): Promise<Request> {
  const incoming = context.env.incoming as Request;
  const contentType = context.req.header("content-type")?.toLowerCase() ?? "";
  let body: unknown;
  if (!/^(GET|HEAD)$/i.test(context.req.method)) {
    if (contentType.includes("application/json")) {
      body = await context.req.json().catch(() => undefined);
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const values = new URLSearchParams(await context.req.text());
      body = Object.fromEntries(values.entries());
    }
  }
  incoming.body = body;
  incoming.headers = requestHeaders(incoming.headers);
  incoming.params = context.req.param();
  incoming.path = context.req.path;
  incoming.query = Object.fromEntries(
    Object.entries(context.req.queries()).map(([key, values]) => [
      key,
      values.length === 1 ? values[0]! : values,
    ]),
  );
  incoming.user = context.get("user");
  return incoming;
}

function enhanceResponse(outgoing: ServerResponse): Response {
  const response = outgoing as Response;
  response.locals ??= {};
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };
  response.type = (contentType) => {
    response.setHeader("content-type", contentType);
    return response;
  };
  response.json = (value) => {
    if (!response.hasHeader("content-type")) {
      response.setHeader("content-type", "application/json; charset=utf-8");
    }
    response.end(JSON.stringify(value));
    return response;
  };
  response.send = (value) => {
    if (value !== null && typeof value === "object" && !ArrayBuffer.isView(value)) {
      return response.json(value);
    }
    response.end(value === undefined ? undefined : value);
    return response;
  };
  response.sendFile = (filePath) => {
    createReadStream(filePath)
      .on("error", (error) => response.destroy(error))
      .pipe(response);
    return response;
  };
  return response;
}

async function runHandlers(
  handlers: Handler[],
  request: Request,
  response: Response,
): Promise<void> {
  const run = async (index: number): Promise<void> => {
    if (index >= handlers.length || response.writableEnded) return;
    let continuation: Promise<void> | undefined;
    const next = async () => {
      continuation ??= run(index + 1);
      await continuation;
    };
    await handlers[index]!(request, response, next);
    await continuation;
  };
  await run(0);
}

export class LegacyHttpApplication {
  readonly hono: Hono<HonoEnvironment>;
  private readonly middleware: Handler[] = [];
  private readonly errorHandlers: ErrorHandler[] = [];

  constructor(hono = new Hono<HonoEnvironment>()) {
    this.hono = hono;
    this.hono.use("*", async (context, next) => {
      const contentType = context.req.header("content-type")?.toLowerCase() ?? "";
      if (
        !contentType.includes("application/json") &&
        !contentType.includes("application/x-www-form-urlencoded")
      ) {
        return next();
      }
      return bodyLimit({
        maxSize: LEGACY_BODY_LIMIT_BYTES,
        onError: (limitedContext) =>
          limitedContext.json({ code: 413, data: null, message: "请求内容超过 100 MB 限制" }, 413),
      })(context, next);
    });
  }

  use(handler: Handler): this;
  use(handler: ErrorHandler): this;
  use(prefix: string, router: LegacyRouter): this;
  use(first: string | Handler | ErrorHandler, second?: LegacyRouter): this {
    if (typeof first === "string" && second) {
      this.mount(first, second);
    } else if (typeof first === "function" && first.length === 4) {
      this.errorHandlers.push(first as ErrorHandler);
    } else if (typeof first === "function") {
      this.middleware.push(first as Handler);
    }
    return this;
  }

  listen(port: number): Server {
    const server = createAdaptorServer({ fetch: this.hono.fetch }) as Server;
    server.listen(port);
    return server;
  }

  useError(handler: ErrorHandler): this {
    this.errorHandlers.push(handler);
    return this;
  }

  mount(prefix: string, router: LegacyRouter): void {
    for (const route of router.routes) {
      this.hono.on(route.method, mountedPath(prefix, route.path), async (context) => {
        const request = await enhanceRequest(context);
        const response = enhanceResponse(context.env.outgoing);
        try {
          await runHandlers([...this.middleware, ...route.handlers], request, response);
        } catch (error) {
          if (this.errorHandlers.length === 0) {
            response.status(500).json({ message: (error as Error).message });
          } else {
            await runHandlers(
              this.errorHandlers.map(
                (handler) => (req, res, next) => handler(error, req, res, next),
              ),
              request,
              response,
            );
          }
        }
        if (!response.writableEnded && !response.headersSent) response.status(204).end();
        return RESPONSE_ALREADY_SENT;
      });
    }
  }
}

function bodyParser(): Handler {
  return (_request, _response, next) => next();
}

const legacyHttp = Object.assign(() => new LegacyHttpApplication(), {
  json: bodyParser,
  Router: (_options?: { mergeParams?: boolean }) => new LegacyRouter(),
  urlencoded: bodyParser,
});

export default legacyHttp;
