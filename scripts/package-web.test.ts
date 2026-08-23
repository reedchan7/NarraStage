import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { repositoryContentRevision, webRevisionScope } from "./package-web";

const fixtures: string[] = [];

async function git(root: string, ...args: string[]) {
  const child = Bun.spawn(["git", ...args], {
    cwd: root,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Toonflow Test",
      GIT_AUTHOR_EMAIL: "test@toonflow.local",
      GIT_COMMITTER_NAME: "Toonflow Test",
      GIT_COMMITTER_EMAIL: "test@toonflow.local",
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (exitCode !== 0) throw new Error(stderr);
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true, force: true })),
  );
});

describe("repository content revision", () => {
  test("tracks scoped bytes without becoming stale after a metadata-only commit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "toonflow-provenance-"));
    fixtures.push(root);
    await mkdir(path.join(root, "apps/web/src"), { recursive: true });
    await writeFile(path.join(root, "package.json"), "{}\n");
    await writeFile(path.join(root, "apps/web/src/main.tsx"), "export const value = 1;\n");
    await git(root, "init", "--quiet");
    await git(root, "add", ".");
    await git(root, "commit", "--quiet", "-m", "initial");

    const initial = await repositoryContentRevision(root, webRevisionScope);
    await git(root, "commit", "--quiet", "--allow-empty", "-m", "metadata only");
    expect(await repositoryContentRevision(root, webRevisionScope)).toBe(initial);

    await writeFile(path.join(root, "apps/web/src/main.tsx"), "export const value = 2;\n");
    expect(await repositoryContentRevision(root, webRevisionScope)).not.toBe(initial);

    await unlink(path.join(root, "apps/web/src/main.tsx"));
    expect(await repositoryContentRevision(root, webRevisionScope)).not.toBe(initial);
  });
});
