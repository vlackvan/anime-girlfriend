"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode3 = __toESM(require("vscode"));

// src/ChatPanel.ts
var vscode = __toESM(require("vscode"));
var ChatPanel = class {
  constructor(extensionUri, apiKeyManager) {
    this.extensionUri = extensionUri;
    this.apiKeyManager = apiKeyManager;
  }
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtmlContent(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "sendMessage":
          await this.handleChatMessage(message.content);
          break;
        case "enterApiKey":
          await this.apiKeyManager.enterApiKey();
          break;
        case "onboardingComplete":
          this.postMessage({ type: "onboardingComplete", data: message.data });
          break;
      }
    });
  }
  async handleChatMessage(content) {
    console.log("[ChatPanel] User message:", content);
    this.postMessage({
      type: "botMessage",
      content: `I received: "${content}". (ChatGPT integration coming soon!)`
    });
  }
  showOverlay(problemId) {
    this.postMessage({
      type: "showOverlay",
      problemId
    });
  }
  postMessage(message) {
    this.view?.webview.postMessage(message);
  }
  getHtmlContent(webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "assets", "styles.css")
    );
    const aruImageUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "assets", "aru.webp")
    );
    const chihiroImageUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "assets", "chihiro.jpg")
    );
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Anime Girlfriend</title>
</head>
<body>
  <div id="root"></div>
  <script>
    window.assetBaseUri = {
      aru: "${aruImageUri}",
      chihiro: "${chihiroImageUri}"
    };
    window.vscode = acquireVsCodeApi();
  </script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
};

// src/ApiKeyManager.ts
var vscode2 = __toESM(require("vscode"));
var ApiKeyManager = class _ApiKeyManager {
  constructor(secrets) {
    this.onUpdateEmitter = new vscode2.EventEmitter();
    this.onUpdate = this.onUpdateEmitter.event;
    this.secrets = secrets;
  }
  static {
    this.KEY = "anime-girlfriend.openai-api-key";
  }
  async getApiKey() {
    return this.secrets.get(_ApiKeyManager.KEY);
  }
  async hasApiKey() {
    const key = await this.getApiKey();
    return key !== void 0 && key.length > 0;
  }
  async enterApiKey() {
    const key = await vscode2.window.showInputBox({
      prompt: "Enter your OpenAI API Key",
      password: true,
      placeHolder: "sk-...",
      validateInput: (value) => {
        if (!value.startsWith("sk-")) {
          return 'API key should start with "sk-"';
        }
        return void 0;
      }
    });
    if (key) {
      await this.secrets.store(_ApiKeyManager.KEY, key);
      this.onUpdateEmitter.fire();
      vscode2.window.showInformationMessage("OpenAI API key saved!");
    }
  }
  async clearApiKey() {
    await this.secrets.delete(_ApiKeyManager.KEY);
    this.onUpdateEmitter.fire();
    vscode2.window.showInformationMessage("OpenAI API key cleared.");
  }
};

// src/LocalServer.ts
var http = __toESM(require("http"));
var LocalServer = class {
  constructor(port, onBOJSuccess) {
    this.port = port;
    this.server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }
      if (req.method === "POST" && req.url === "/success") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            console.log("[LocalServer] Received BOJ success:", data);
            onBOJSuccess(data);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, message: "Received!" }));
          } catch (error) {
            console.error("[LocalServer] Parse error:", error);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Invalid JSON" }));
          }
        });
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });
    this.server.listen(this.port, () => {
      console.log(`[LocalServer] Listening on port ${this.port}`);
    });
    this.server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`[LocalServer] Port ${this.port} is already in use`);
      } else {
        console.error("[LocalServer] Server error:", err);
      }
    });
  }
  stop() {
    this.server.close();
    console.log("[LocalServer] Server stopped");
  }
};

// src/extension.ts
async function activate(context) {
  console.log("[Anime Girlfriend] Extension activating...");
  const apiKeyManager = new ApiKeyManager(context.secrets);
  const chatPanel = new ChatPanel(context.extensionUri, apiKeyManager);
  const port = vscode3.workspace.getConfiguration("anime-girlfriend").get("serverPort", 3e3);
  const localServer = new LocalServer(port, (data) => {
    console.log("[Anime Girlfriend] BOJ Success:", data);
    chatPanel.showOverlay(data.problemId);
  });
  context.subscriptions.push(
    vscode3.window.registerWebviewViewProvider("anime-girlfriend.chat", chatPanel)
  );
  context.subscriptions.push(
    vscode3.commands.registerCommand("anime-girlfriend.showChat", async () => {
      await vscode3.commands.executeCommand("anime-girlfriend.chat.focus");
    }),
    vscode3.commands.registerCommand("anime-girlfriend.enterApiKey", async () => {
      await apiKeyManager.enterApiKey();
    })
  );
  context.subscriptions.push({
    dispose: () => {
      localServer.stop();
    }
  });
  console.log("[Anime Girlfriend] Extension activated!");
}
function deactivate() {
  console.log("[Anime Girlfriend] Extension deactivated");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
