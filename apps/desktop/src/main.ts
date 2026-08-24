import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ElectronCredentialVault } from "@/security/credentials/electronVault";
import {
  createEnvironmentCredentialVault,
  LayeredCredentialVault,
} from "@/security/credentials/runtime";
import {
  assertTrustedCredentialSender,
  credentialDeleteRequestSchema,
  credentialSetRequestSchema,
  credentialStatusRequestSchema,
} from "@/security/credentialIpc";

// 加速 Electron 启动：跳过 GPU 信息收集，减少初始化耗时
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

const ownsSingleInstanceLock = app.requestSingleInstanceLock();
if (!ownsSingleInstanceLock) app.quit();

const IMMUTABLE_RUNTIME_ENTRIES = new Set(["assets", "contracts", "models", "serve", "web"]);
const MUTABLE_RUNTIME_ENTRIES = new Set(["skills", "vendor"]);
const buildDirectory = path.dirname(fileURLToPath(import.meta.url));
const isolatedUserDataDirectory =
  process.env.NARRASTAGE_USER_DATA_DIR?.trim() ?? process.env.TOONFLOW_USER_DATA_DIR?.trim();
if (isolatedUserDataDirectory) app.setPath("userData", path.resolve(isolatedUserDataDirectory));

if (!isolatedUserDataDirectory) {
  const currentUserDataDirectory = app.getPath("userData");
  const legacyUserDataDirectory = path.join(path.dirname(currentUserDataDirectory), "ToonFlow");
  if (!fs.existsSync(currentUserDataDirectory) && fs.existsSync(legacyUserDataDirectory)) {
    fs.renameSync(legacyUserDataDirectory, currentUserDataDirectory);
  }
}

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.existsSync(d) || fs.copyFileSync(s, d);
  }
}

declare const __APP_VERSION__: string;

function compareVersions(a: string, b: string): number {
  const pa = a
    .split(".")
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  const pb = b
    .split(".")
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function initializeData(): void {
  const srcDir = path.join(process.resourcesPath, "data");
  const destDir = path.join(app.getPath("userData"), "data");
  const versionFilePath = path.join(destDir, "version.txt");

  let shouldForceReplace = false;
  if (!fs.existsSync(versionFilePath)) {
    shouldForceReplace = true;
  } else {
    const localVersion = fs.readFileSync(versionFilePath, "utf-8").trim();
    if (compareVersions(localVersion, __APP_VERSION__) < 0) {
      shouldForceReplace = true;
    }
  }

  for (const dir of IMMUTABLE_RUNTIME_ENTRIES) {
    const targetDir = path.join(destDir, dir);
    if (shouldForceReplace) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      copyDir(path.join(srcDir, dir), targetDir);
      continue;
    }
    if (!fs.existsSync(targetDir)) {
      copyDir(path.join(srcDir, dir), targetDir);
    }
  }

  for (const dir of MUTABLE_RUNTIME_ENTRIES) {
    copyDir(path.join(srcDir, dir), path.join(destDir, dir));
  }

  if (shouldForceReplace) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(versionFilePath, `${__APP_VERSION__}\n`, "utf-8");
  }
}

const externalDependencies = new Map(
  ["@huggingface/transformers", "onnxruntime-node", "sharp", "sqlite3"].map((specifier) => [
    specifier,
    import.meta.resolve(specifier),
  ]),
);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = externalDependencies.get(specifier);
    if (url) {
      return { shortCircuit: true, url };
    }
    return nextResolve(specifier, context);
  },
});

let mainWindow: BrowserWindow | null = null;
let activeRuntimePort: number | undefined;

function createMainWindow(runtimePort?: number): Promise<void> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 500,
      frame: false,
      show: false,
      autoHideMenuBar: true,
      resizable: true,
      thickFrame: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(buildDirectory, "preload.cjs"),
      },
    });
    mainWindow = win;
    win.setMenuBarVisibility(false);
    win.removeMenu();

    const htmlPath = app.isPackaged
      ? path.join(app.getPath("userData"), "data", "web", "index.html")
      : path.join(process.cwd(), "data", "web", "index.html");
    const trustedOrigins = [
      ...(process.env.VITE_DEV ? ["http://localhost:50188"] : []),
      ...(runtimePort ? [`http://localhost:${runtimePort}`] : []),
    ];
    const keepTrustedNavigation = (event: Electron.Event, targetUrl: string) => {
      try {
        assertTrustedCredentialSender(targetUrl, trustedOrigins, htmlPath);
      } catch {
        event.preventDefault();
      }
    };
    win.webContents.on("will-navigate", keepTrustedNavigation);
    win.webContents.on("will-redirect", keepTrustedNavigation);
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    win.on("closed", () => {
      mainWindow = null;
    });

    win.once("ready-to-show", () => {
      win.show();
      resolve();
    });

    if (process.env.VITE_DEV) {
      void win.loadURL("http://localhost:50188");
    } else if (runtimePort) {
      void win.loadURL(`http://localhost:${runtimePort}`);
    } else {
      void win.loadFile(htmlPath);
    }
  });
}

let closeServeFn: (() => Promise<void>) | undefined;

if (ownsSingleInstanceLock)
  app.whenReady().then(async () => {
    try {
      process.env.NARRASTAGE_DATA_DIR = app.isPackaged
        ? path.join(app.getPath("userData"), "data")
        : path.join(process.cwd(), "data");
      const persistedCredentialVault = new ElectronCredentialVault(
        path.join(app.getPath("userData"), "credentials", "credentials.v1.json"),
        safeStorage,
      );
      const credentialVault = new LayeredCredentialVault(
        createEnvironmentCredentialVault(),
        persistedCredentialVault,
      );
      const developmentOrigins = process.env.VITE_DEV ? ["http://localhost:50188"] : [];
      const trustedRendererOrigins = [...developmentOrigins];
      const trustedRendererPath = app.isPackaged
        ? path.join(app.getPath("userData"), "data", "web", "index.html")
        : path.join(process.cwd(), "data", "web", "index.html");
      const trustedRequest = (event: Electron.IpcMainInvokeEvent) => {
        if (
          event.sender !== mainWindow?.webContents ||
          event.senderFrame !== event.sender.mainFrame
        ) {
          throw new Error("credential.untrusted_renderer");
        }
        assertTrustedCredentialSender(
          event.senderFrame?.url || event.sender.getURL(),
          trustedRendererOrigins,
          trustedRendererPath,
        );
      };
      ipcMain.handle("narrastage:credentials:status", async (event, request) => {
        trustedRequest(event);
        return credentialVault.status(credentialStatusRequestSchema.parse(request));
      });
      ipcMain.handle("narrastage:credentials:set", async (event, request) => {
        trustedRequest(event);
        const parsed = credentialSetRequestSchema.parse(request);
        await credentialVault.set(
          { providerId: parsed.providerId, slot: parsed.slot },
          parsed.value,
        );
        return credentialVault.status(parsed);
      });
      ipcMain.handle("narrastage:credentials:delete", async (event, request) => {
        trustedRequest(event);
        const parsed = credentialDeleteRequestSchema.parse(request);
        await credentialVault.delete(parsed);
        return credentialVault.status(parsed);
      });
      ipcMain.handle("narrastage:window:minimize", async (event) => {
        trustedRequest(event);
        mainWindow?.minimize();
      });
      ipcMain.handle("narrastage:window:toggle-maximize", async (event) => {
        trustedRequest(event);
        if (mainWindow?.isMaximized()) mainWindow.unmaximize();
        else mainWindow?.maximize();
      });
      ipcMain.handle("narrastage:window:close", async (event) => {
        trustedRequest(event);
        mainWindow?.close();
      });

      let servePath: string;
      if (app.isPackaged) {
        // 生产环境：让出主线程一次，确保 loading 窗口渲染后再做耗时文件拷贝
        await new Promise((r) => setTimeout(r, 0));
        initializeData();
        servePath = path.join(app.getPath("userData"), "data", "serve", "app.js");
      } else {
        servePath = path.join(process.cwd(), "data", "serve", "app.js");
      }
      const mod = await import(pathToFileURL(servePath).href);
      closeServeFn = mod.closeServe;
      const port = await mod.default({
        randomPort: !process.env.VITE_DEV,
        credentialVault,
        credentialMigrationVault: credentialVault,
      });
      activeRuntimePort = port;
      process.env.PORT = port;
      trustedRendererOrigins.push(`http://localhost:${port}`);
      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, 2000);
      });
      // 服务启动成功，创建主窗口（主窗口 ready-to-show 时自动关闭loading）
      await createMainWindow(port);
      console.log(`[桌面客户端就绪]: http://localhost:${port}`);
    } catch (err) {
      console.error("[服务启动失败]:", err);
      await createMainWindow();
    }
  });

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(activeRuntimePort);
  }
});

app.on("before-quit", async (event) => {
  if (closeServeFn) await closeServeFn();
});
