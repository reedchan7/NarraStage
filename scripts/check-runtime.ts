const expectedBunVersion = "1.4.1";
const currentBunVersion = process.versions.bun;

if (currentBunVersion !== expectedBunVersion) {
  console.error(`Bun ${expectedBunVersion} is required; found ${currentBunVersion ?? "unknown"}.`);
  process.exit(1);
}
