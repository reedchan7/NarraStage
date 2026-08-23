import { io } from "socket.io-client";
import { readFile } from "node:fs/promises";
import { startDeterministicProductFixture } from "@tooling/deterministic-product-fixture";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`acceptance.${message}`);
}

interface Envelope<T> {
  code: number;
  data: T;
  message: string;
}

async function json<T>(response: Response): Promise<T> {
  invariant(response.ok, `http_${response.status}`);
  return response.json() as Promise<T>;
}

const fixture = await startDeterministicProductFixture(0);
const baseUrl = `http://127.0.0.1:${fixture.port}`;
const authorization = "Bearer deterministic-acceptance";
const headers = { Authorization: authorization, "Content-Type": "application/json" };
let socket: ReturnType<typeof io> | undefined;

try {
  const login = await json<Envelope<{ token: string }>>(
    await fetch(`${baseUrl}/api/login/login`, { method: "POST", body: "{}" }),
  );
  invariant(login.data.token === authorization, "login_contract");
  const catalog = await json<Envelope<{ offerings: Array<{ id: string }> }>>(
    await fetch(`${baseUrl}/api/v2/catalog`, { headers }),
  );
  invariant(catalog.data.offerings.length === 2, "catalog_contract");
  const projects = await json<Envelope<Array<{ imageModel?: string; videoOfferingId?: string }>>>(
    await fetch(`${baseUrl}/api/project/getProject`, {
      method: "POST",
      headers,
    }),
  );
  invariant(projects.data[0]?.imageModel === "deterministic:image", "image_offering_pin");
  invariant(projects.data[0]?.videoOfferingId === "deterministic:video", "video_offering_pin");

  async function runJob(
    operation: "image.generate" | "video.generate",
    offeringId: string,
    canonicalModelId: string,
    input: { mode?: string; values: Record<string, unknown>; assets: unknown[] },
  ) {
    const request = {
      schemaVersion: "2.0.0",
      idempotencyKey: `acceptance-${operation}`,
      canonicalModelId,
      offeringId,
      operation,
      input,
    };
    const first = await json<Envelope<{ id: string }>>(
      await fetch(`${baseUrl}/api/v2/jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
      }),
    );
    const repeated = await json<Envelope<{ id: string }>>(
      await fetch(`${baseUrl}/api/v2/jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
      }),
    );
    invariant(first.data.id === repeated.data.id, `${operation}_idempotency`);
    const completed = await json<
      Envelope<{ state: string; result: { outputs: Array<{ assetId: string }> } }>
    >(await fetch(`${baseUrl}/api/v2/jobs/${first.data.id}`, { headers }));
    invariant(completed.data.state === "succeeded", `${operation}_terminal`);
    const assetId = completed.data.result.outputs[0]!.assetId;
    const media = await fetch(
      `${baseUrl}/api/v2/media-assets/${encodeURIComponent(assetId)}/content`,
      {
        headers,
      },
    );
    invariant(media.ok && (await media.arrayBuffer()).byteLength > 1_000, `${operation}_media`);
    return first.data.id;
  }

  const imageJob = await runJob("image.generate", "deterministic:image", "deterministic:image-v1", {
    values: { prompt: "月港信使穿过潮门", aspectRatio: "16:9" },
    assets: [],
  });
  const keyframe = await readFile(
    new URL("../data/skills/art_skills/2D_90s_japanese_anime/images/1.png", import.meta.url),
  );
  const uploaded = await json<Envelope<{ assetId: string; kind: string }>>(
    await fetch(`${baseUrl}/api/v2/media-assets/upload`, {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "X-Toonflow-Media-Type": "image/png",
        "X-Toonflow-Filename": "keyframe.png",
      },
      body: keyframe,
    }),
  );
  invariant(uploaded.data.kind === "image", "upload_contract");
  const videoJob = await runJob("video.generate", "deterministic:video", "deterministic:video-v1", {
    mode: "keyframes",
    values: {
      prompt: "月港信使穿过潮门",
      durationSeconds: 4,
      resolution: "768P",
      aspectRatio: "16:9",
    },
    assets: [{ assetId: uploaded.data.assetId, kind: "image", role: "first_frame" }],
  });

  const scripts = await json<Envelope<Array<{ name: string }>>>(
    await fetch(`${baseUrl}/api/script/getScrptApi`, {
      method: "POST",
      headers,
      body: JSON.stringify({ projectId: 7001, name: "月港" }),
    }),
  );
  invariant(
    scripts.data.some((script) => script.name === "月港信使"),
    "scripts_surface",
  );
  const assets = await json<Envelope<Array<{ type: string }>>>(
    await fetch(`${baseUrl}/api/cornerScape/getAllAssets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ projectId: 7001 }),
    }),
  );
  invariant(
    assets.data.some((asset) => asset.type === "role"),
    "assets_surface",
  );
  const jobs = await json<Envelope<{ jobs: Array<{ id: string }> }>>(
    await fetch(`${baseUrl}/api/v2/jobs?limit=100`, { headers }),
  );
  invariant(
    jobs.data.jobs.some((job) => job.id === videoJob),
    "jobs_surface",
  );

  socket = io(`${baseUrl}/api/socket/scriptAgent`, {
    auth: { token: authorization, isolationKey: "acceptance", projectId: 7001 },
    transports: ["websocket"],
  });
  const conversation = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("acceptance.conversation_timeout")), 3_000);
    let text = "";
    socket!.on("connect_error", reject);
    socket!.on("content:update", (event: { data?: string }) => {
      text += event.data ?? "";
    });
    socket!.on("message:update", (event: { status?: string }) => {
      if (event.status !== "complete") return;
      clearTimeout(timeout);
      resolve(text);
    });
    socket!.on("connect", () => socket!.emit("chat", { content: "拆成三个镜头" }));
  });
  invariant(conversation.includes("三个镜头"), "conversation_terminal");

  console.log(
    JSON.stringify({
      login: true,
      catalog: true,
      projectOfferingPins: true,
      scripts: true,
      assets: true,
      jobs: true,
      conversation: true,
      image: { jobId: imageJob, idempotent: true, media: true },
      video: { jobId: videoJob, idempotent: true, media: true, keyframeUpload: true },
    }),
  );
} finally {
  socket?.disconnect();
  await fixture.close();
}
