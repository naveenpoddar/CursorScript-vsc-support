const vscode = require("vscode");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { chmodSync } = require("fs");
const { execSync } = require("child_process");
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");

let client;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // --- LSP Client Setup ---
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Options to control the language client
  const clientOptions = {
    // Register the server for plain text documents
    documentSelector: [{ scheme: "file", language: "cursor" }],
    synchronize: {
      // Notify the server about file changes to '.cursor' files
      fileEvents: vscode.workspace.createFileSystemWatcher("**/.cursor"),
    },
    // Keep it alive and show errors
    diagnosticCollectionName: "CursorScript",
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "cursorScriptLanguageServer",
    "CursorScript Language Server",
    serverOptions,
    clientOptions,
  );

  // Start the client. This will also launch the server
  client.start().catch((err) => {
    console.error("LSP Start Failed:", err);
  });

  // --- End LSP Client Setup ---

  const storagePath = context.globalStorageUri.fsPath;
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  // 1. Just check for the tag in the background (Non-blocking)
  syncLatestTag(storagePath);

  let disposable = vscode.commands.registerCommand(
    "cursorScript.runFile",
    async () => {
      const activeEditor = vscode.window.activeTextEditor;

      if (
        !activeEditor ||
        !activeEditor.document.fileName.endsWith(".cursor")
      ) {
        vscode.window.showErrorMessage("Please open a .cursor file to run.");
        return;
      }

      const filePath = activeEditor.document.fileName;
      const zipName = getBinaryName();
      const exeName = process.platform === "win32" ? "cursorx.exe" : "cursorx";
      const zipPath = path.join(storagePath, zipName);

      const config = getConfig(storagePath);
      let exePath = config.runner;

      // Ensure exePath is valid or try to find it
      if (!exePath || !fs.existsSync(exePath)) {
        exePath = path.join(storagePath, exeName);
        if (!fs.existsSync(exePath)) {
          const found = findFileRecursively(storagePath, exeName);
          if (found) exePath = found;
        }
      }

      // 2. Update Check: If remote version > local version, update before running
      const currentVersion = config.version || "0.0.0";
      const latestVersion = config.latestAvailableTag || "0.0.0";

      const needsInitialDownload = !exePath || !fs.existsSync(exePath);
      const needsUpdate =
        latestVersion !== "0.0.0" && latestVersion !== currentVersion;

      if (needsInitialDownload || needsUpdate) {
        const msg = needsInitialDownload
          ? "Installing CursorScript..."
          : `Updating to ${latestVersion}...`;
        const success = await downloadBinary(zipName, zipPath, true, msg);

        if (success) {
          // Extract the zip
          try {
            if (process.platform === "win32") {
              // tar is built-in on Windows 10/11 and is more reliable than PowerShell
              execSync(`tar -xf "${zipPath}" -C "${storagePath}"`);
            } else {
              execSync(`unzip -o "${zipPath}" -d "${storagePath}"`);
            }
            // Clean up zip
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

            // Re-check for exe path as it might be in a subfolder
            const found = findFileRecursively(storagePath, exeName);
            if (found) exePath = found;
          } catch (err) {
            vscode.window.showErrorMessage(
              "Failed to extract CursorScript: " + err.message,
            );
            return;
          }

          updateConfig(storagePath, {
            version: latestVersion !== "0.0.0" ? latestVersion : "1.0.0",
            runner: exePath,
          });
        } else if (needsInitialDownload) {
          return; // Can't run without the binary
        }
      }

      if (process.platform !== "win32") {
        chmodSync(exePath, "755");
      }

      // 3. Run in Terminal
      let terminal = vscode.window.terminals.find(
        (t) => t.name === "CursorScript",
      );
      if (!terminal) {
        terminal = vscode.window.createTerminal("CursorScript");
      }

      terminal.show();
      const commandPrefix = process.platform === "win32" ? "& " : "";
      terminal.sendText(`${commandPrefix}"${exePath}" "${filePath}"`);
    },
  );

  context.subscriptions.push(disposable);
}

/**
 * Fetches the latest tag and saves it to config, but DOES NOT download yet.
 */
async function syncLatestTag(storagePath) {
  try {
    const latestRelease = await getLatestTag();
    if (latestRelease) {
      updateConfig(storagePath, { latestAvailableTag: latestRelease });
    }
  } catch (err) {
    console.error("Failed to fetch latest tag", err);
  }
}

async function getLatestTag() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: "/repos/naveenpoddar/CursorScript/releases/latest",
      headers: { "User-Agent": "CursorScript-VSCode-Extension" },
    };

    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.tag_name);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function getBinaryName() {
  const plat = process.platform;
  const arch = process.arch;

  if (plat === "win32") return "cursorscript-windows-x64-baseline.zip";
  if (plat === "darwin") return `cursorscript-darwin-${arch}.zip`;
  if (plat === "linux") return `cursorscript-linux-${arch}.zip`;

  throw new Error(`Unsupported Platform: ${plat}-${arch}`);
}

async function getFileMetadata(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        { method: "HEAD", headers: { "User-Agent": "CursorScript-Extension" } },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            resolve(getFileMetadata(res.headers.location));
          } else {
            resolve({
              size: res.headers["content-length"],
              url: url,
            });
          }
        },
      )
      .on("error", reject);
  });
}

const CONCURRENT_CONNECTIONS = 4;
async function downloadBinary(name, dest, showProgress) {
  const url = `https://github.com/naveenpoddar/CursorScript/releases/latest/download/${name}`;

  const downloadTask = async (progress) => {
    try {
      const metadata = await getFileMetadata(url);
      const totalSize = parseInt(metadata.size);
      const finalUrl = metadata.url;

      if (isNaN(totalSize) || totalSize <= 0) throw new Error("Invalid size");

      const chunkSize = Math.ceil(totalSize / CONCURRENT_CONNECTIONS);
      const promises = [];

      // Track total bytes downloaded across all streams
      let totalDownloaded = 0;

      // Ensure file exists
      fs.writeFileSync(dest, "");

      for (let i = 0; i < CONCURRENT_CONNECTIONS; i++) {
        const start = i * chunkSize;
        const end =
          i === CONCURRENT_CONNECTIONS - 1
            ? totalSize - 1
            : (i + 1) * chunkSize - 1;

        // Pass a callback to track progress per chunk
        promises.push(
          downloadChunk(finalUrl, dest, start, end, (downloadedInChunk) => {
            totalDownloaded += downloadedInChunk;
            const percentage = ((totalDownloaded / totalSize) * 100).toFixed(0);

            progress.report({
              // 'increment' is the delta since the last report,
              // but for simplicity, we can also just update the message:
              message: `${percentage}% (${(totalDownloaded / 1024 / 1024).toFixed(2)} MB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`,
            });
          }),
        );
      }

      await Promise.all(promises);
      return true;
    } catch (err) {
      console.error("Parallel download failed:", err);
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      return false;
    }
  };

  if (showProgress) {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading CursorScript...`,
        cancellable: false,
      },
      downloadTask,
    );
  }
  return downloadTask({ report: () => {} }); // Mock progress for background tasks
}

function downloadChunk(url, dest, start, end, onProgress) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "CursorScript-Extension",
        Range: `bytes=${start}-${end}`,
      },
    };

    https
      .get(url, options, (res) => {
        const writeStream = fs.createWriteStream(dest, {
          flags: "r+",
          start: start,
        });

        res.on("data", (chunk) => {
          onProgress(chunk.length); // Notify the parent of new bytes
        });

        res.pipe(writeStream);
        res.on("end", () => resolve());
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function deactivate() {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

function findFileRecursively(dir, fileName) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const found = findFileRecursively(fullPath, fileName);
      if (found) return found;
    } else if (file === fileName) {
      return fullPath;
    }
  }
  return null;
}

function getConfig(storagePath) {
  const configPath = path.join(storagePath, "cursorx-config.json");
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function updateConfig(storagePath, newConfig) {
  const configPath = path.join(storagePath, "cursorx-config.json");
  const oldConfig = getConfig(storagePath);
  const config = { ...oldConfig, ...newConfig };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = { activate, deactivate };
