const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let backendProcess;

function startBackend() {
  const backendDir = path.join(__dirname, "..", "backend");
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  backendProcess = spawn(pythonCmd, ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"], {
    cwd: backendDir,
    stdio: "ignore",
  });

  backendProcess.on("error", (err) => {
    console.error("Backend failed to start:", err.message);
  });

  backendProcess.on("exit", (code) => {
    console.log("Backend exited with code:", code);
  });
}

function waitForBackend(url, retries = 30) {
  return new Promise((resolve, reject) => {
    const http = require("http");
    let attempts = 0;

    function check() {
      attempts++;
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve(true);
        } else if (attempts < retries) {
          setTimeout(check, 1000);
        } else {
          reject(new Error("Backend did not start in time"));
        }
      });

      req.on("error", () => {
        if (attempts < retries) {
          setTimeout(check, 1000);
        } else {
          reject(new Error("Backend did not start in time"));
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts < retries) {
          setTimeout(check, 1000);
        } else {
          reject(new Error("Backend did not start in time"));
        }
      });
    }

    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "aeo.creations",
    icon: path.join(__dirname, "..", "frontend", "favicon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: "#0a0a0f",
    titleBarStyle: "default",
    autoHideMenuBar: true,
  });

  mainWindow.loadURL("http://127.0.0.1:8000");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  startBackend();

  try {
    await waitForBackend("http://127.0.0.1:8000", 30);
  } catch (e) {
    console.error(e.message);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill("SIGTERM");
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill("SIGTERM");
  }
});
