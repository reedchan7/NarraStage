// 打包默认使用 prod 环境变量
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "prod";
}

const externalDependencies = [
  "electron",
  "@rmp135/sql-ts",
  "@huggingface/transformers",
  "onnxruntime-node",
  "sqlite3",
  "better-sqlite3",
  "sharp",
  "mysql",
  "mysql2",
  "mariadb",
  "mariadb/callback",
  "pg",
  "pg-query-stream",
  "oracledb",
  "tedious",
  "mssql",
];

// 后端服务打包配置
const appBuildConfig: Bun.BuildConfig = {
  entrypoints: ["src/app.ts"],
  minify: false,
  format: "esm",
  outdir: "data/serve",
  naming: "app.js",
  target: "node",
  sourcemap: false,
  external: externalDependencies,
};

// Electron 主进程打包配置
const mainBuildConfig: Bun.BuildConfig = {
  entrypoints: ["scripts/main.ts"],
  minify: false,
  format: "esm",
  outdir: "build",
  naming: "main.js",
  target: "node",
  sourcemap: false,
  external: externalDependencies,
};

export async function build(): Promise<void> {
  const pkg = await Bun.file("package.json").json();
  const version = JSON.stringify(pkg.version);
  appBuildConfig.define = { __APP_VERSION__: version };
  mainBuildConfig.define = { __APP_VERSION__: version };

  console.log("🔨 开始构建...\n");

  const results = await Promise.all([Bun.build(appBuildConfig), Bun.build(mainBuildConfig)]);
  const failedResults = results.filter((result) => !result.success);

  if (failedResults.length > 0) {
    for (const result of failedResults) {
      for (const log of result.logs) {
        console.error(log);
      }
    }
    throw new Error("构建失败");
  }

  console.log("✅ 后端服务构建完成: data/serve/app.js");
  console.log("✅ Electron主进程构建完成: build/main.js");
  console.log("\n🎉 所有构建任务完成!\n");
}

if (import.meta.main) {
  build().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
