import fg from "fast-glob";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "..");
const testFiles = await fg(
  ["apps/server/src/**/*.test.ts", "apps/server/tests/**/*.test.ts", "scripts/**/*.test.ts"],
  {
    absolute: true,
    cwd: repositoryRoot,
  },
);

const child = Bun.spawn(
  [process.execPath, "test", ...testFiles, "--pass-with-no-tests", ...process.argv.slice(2)],
  {
    cwd: repositoryRoot,
    env: process.env,
    stderr: "inherit",
    stdout: "inherit",
  },
);

process.exit(await child.exited);
