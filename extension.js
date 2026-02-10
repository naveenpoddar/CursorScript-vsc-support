const vscode = require("vscode");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { chmodSync } = require("fs");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // 1. Just check for the tag in the background (Non-blocking)
  syncLatestTag(context);

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
      const binaryName = getBinaryName();
      const storagePath = context.globalStorageUri.fsPath;
      const binaryPath = path.join(storagePath, binaryName);

      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }

      // 2. Update Check: If remote version > local version, update before running
      const currentVersion = context.globalState.get("binaryVersion", "0.0.0");
      const latestVersion = context.globalState.get(
        "latestAvailableTag",
        "0.0.0",
      );

      const needsInitialDownload = !fs.existsSync(binaryPath);
      const needsUpdate =
        latestVersion !== "0.0.0" && latestVersion !== currentVersion;

      if (needsInitialDownload || needsUpdate) {
        const msg = needsInitialDownload
          ? "Installing CursorScript..."
          : `Updating to ${latestVersion}...`;
        const success = await downloadBinary(binaryName, binaryPath, true, msg);

        if (success) {
          context.globalState.update(
            "binaryVersion",
            latestVersion !== "0.0.0" ? latestVersion : "1.0.0",
          );
        } else if (needsInitialDownload) {
          return; // Can't run without the binary
        }
      }

      if (process.platform !== "win32") {
        chmodSync(binaryPath, "755");
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
      terminal.sendText(`${commandPrefix}"${binaryPath}" "${filePath}"`);
    },
  );

  context.subscriptions.push(disposable);
}

/**
 * Fetches the latest tag and saves it to state, but DOES NOT download yet.
 */
async function syncLatestTag(context) {
  try {
    const latestRelease = await getLatestTag();
    if (latestRelease) {
      context.globalState.update("latestAvailableTag", latestRelease);
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

  if (plat === "win32") return "cursorscript-windows-x64-baseline.exe";
  if (plat === "darwin") return `cursorscript-darwin-${arch}`;
  if (plat === "linux") return `cursorscript-linux-${arch}`;

  throw new Error(`Unsupported Platform: ${plat}-${arch}`);
}

const CONCURRENT_CONNECTIONS = 4;

async function downloadBinary(name, dest, showProgress) {
  const url = `https://github.com/naveenpoddar/CursorScript/releases/latest/download/${name}`;

  const downloadTask = async (progress) => {
    try {
      // 1. Get the final URL (handle redirects) and file size
      const metadata = await getFileMetadata(url);
      const totalSize = parseInt(metadata.size);
      const finalUrl = metadata.url;

      if (isNaN(totalSize) || totalSize <= 0) {
        throw new Error("Could not determine file size");
      }

      // 2. Calculate Chunks
      const chunkSize = Math.ceil(totalSize / CONCURRENT_CONNECTIONS);
      const promises = [];

      // Ensure directory exists
      const fd = fs.openSync(dest, "w");
      fs.closeSync(fd);

      for (let i = 0; i < CONCURRENT_CONNECTIONS; i++) {
        const start = i * chunkSize;
        const end =
          i === CONCURRENT_CONNECTIONS - 1
            ? totalSize - 1
            : (i + 1) * chunkSize - 1;

        promises.push(downloadChunk(finalUrl, dest, start, end));
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
        title: `Installing CursorScript Engine (Parallel)...`,
        cancellable: false,
      },
      downloadTask,
    );
  }
  return downloadTask();
}

/**
 * Gets the actual file size and handles GitHub redirects
 */
function getFileMetadata(url) {
  return new Promise((resolve, reject) => {
    const options = {
      method: "HEAD",
      headers: { "User-Agent": "CursorScript-Extension" },
    };
    https
      .request(url, options, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          return resolve(getFileMetadata(res.headers.location));
        }
        resolve({ size: res.headers["content-length"], url: url });
      })
      .on("error", reject)
      .end();
  });
}

/**
 * Downloads a specific byte range and writes it to the file
 */
function downloadChunk(url, dest, start, end) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "CursorScript-Extension",
        Range: `bytes=${start}-${end}`,
      },
    };

    https
      .get(url, options, (res) => {
        if (res.statusCode !== 206 && res.statusCode !== 200) {
          return reject(new Error(`Status: ${res.statusCode}`));
        }

        const writeStream = fs.createWriteStream(dest, {
          flags: "r+",
          start: start,
        });
        res.pipe(writeStream);
        res.on("end", () => resolve());
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
