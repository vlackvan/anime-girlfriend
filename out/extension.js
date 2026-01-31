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
var vscode5 = __toESM(require("vscode"));

// src/ChatPanel.ts
var vscode = __toESM(require("vscode"));
var ChatPanel = class {
  constructor(extensionUri, apiKeyManager, userDataStore, chatGPTService) {
    this.extensionUri = extensionUri;
    this.apiKeyManager = apiKeyManager;
    this.userDataStore = userDataStore;
    this.chatGPTService = chatGPTService;
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
        case "ready":
          await this.sendInitialState();
          break;
        case "sendMessage":
          await this.handleChatMessage(message.content);
          break;
        case "enterApiKey":
          await this.apiKeyManager.enterApiKey();
          break;
        case "saveProfile":
          await this.handleSaveProfile(message.data);
          break;
        case "clearProfile":
          await this.userDataStore.clearProfile();
          this.chatGPTService.setUserProfile(void 0);
          this.chatGPTService.clearHistory();
          break;
      }
    });
  }
  async sendInitialState() {
    const profile = this.userDataStore.loadProfile();
    const hasApiKey = await this.apiKeyManager.hasApiKey();
    this.postMessage({
      type: "initialState",
      data: {
        hasProfile: profile !== void 0,
        profile,
        hasApiKey
      }
    });
  }
  async handleSaveProfile(profileData) {
    const profile = {
      character: profileData.character,
      bfi: profileData.bfi,
      pvq: profileData.pvq,
      personalitySummary: profileData.analysis
    };
    await this.userDataStore.saveProfile(profile);
    const savedProfile = this.userDataStore.loadProfile();
    if (savedProfile) {
      this.chatGPTService.setUserProfile(savedProfile);
    }
    this.postMessage({
      type: "profileSaved",
      success: true
    });
  }
  async handleChatMessage(content) {
    console.log("[ChatPanel] User message:", content);
    const hasApiKey = await this.apiKeyManager.hasApiKey();
    if (!hasApiKey) {
      this.postMessage({
        type: "botMessage",
        content: '\u274C No API key configured. Please use the command "Anime Girlfriend: Enter OpenAI API Key" to set your key.',
        isComplete: true
      });
      return;
    }
    this.postMessage({
      type: "botMessageStart",
      id: Date.now().toString()
    });
    await this.chatGPTService.sendMessage(content, {
      onToken: (token) => {
        this.postMessage({
          type: "botMessageToken",
          token
        });
      },
      onComplete: (fullResponse) => {
        this.postMessage({
          type: "botMessageComplete",
          content: fullResponse
        });
      },
      onError: (error) => {
        console.error("[ChatPanel] ChatGPT Error:", error);
        this.postMessage({
          type: "botMessageError",
          error: error.message
        });
      }
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

// src/UserDataStore.ts
var PROFILE_KEY = "anime-girlfriend.userProfile";
var UserDataStore = class {
  constructor(globalState) {
    this.globalState = globalState;
  }
  /**
   * Check if a user profile exists
   */
  hasProfile() {
    return this.globalState.get(PROFILE_KEY) !== void 0;
  }
  /**
   * Load the saved user profile
   */
  loadProfile() {
    return this.globalState.get(PROFILE_KEY);
  }
  /**
   * Save user profile after onboarding completion
   */
  async saveProfile(profile) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existing = this.loadProfile();
    const storedProfile = {
      ...profile,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    await this.globalState.update(PROFILE_KEY, storedProfile);
    console.log("[UserDataStore] Profile saved:", storedProfile.character);
  }
  /**
   * Update personality summary (from CoD pipeline)
   */
  async updatePersonalitySummary(summary) {
    const profile = this.loadProfile();
    if (profile) {
      profile.personalitySummary = summary;
      profile.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await this.globalState.update(PROFILE_KEY, profile);
      console.log("[UserDataStore] Personality summary updated");
    }
  }
  /**
   * Clear all stored data (reset)
   */
  async clearProfile() {
    await this.globalState.update(PROFILE_KEY, void 0);
    console.log("[UserDataStore] Profile cleared");
  }
};

// src/ChatGPTService.ts
var vscode4 = __toESM(require("vscode"));

// src/CodeContextProvider.ts
var vscode3 = __toESM(require("vscode"));
var CodeContextProvider = class {
  /**
   * Get the current code context from the active editor
   */
  getActiveContext() {
    const editor = vscode3.window.activeTextEditor;
    if (!editor) {
      return void 0;
    }
    const document = editor.document;
    const selection = editor.selection;
    const diagnostics = vscode3.languages.getDiagnostics(document.uri);
    const diagnosticInfos = diagnostics.map((d) => ({
      severity: this.getSeverityString(d.severity),
      message: d.message,
      line: d.range.start.line + 1,
      // 1-indexed
      column: d.range.start.character + 1
    }));
    const maxLines = 2e3;
    const lines = document.getText().split("\n");
    const content = lines.slice(0, maxLines).join("\n");
    const truncated = lines.length > maxLines;
    return {
      fileName: document.fileName.split(/[/\\]/).pop() || "unknown",
      filePath: document.fileName,
      languageId: document.languageId,
      content: truncated ? content + "\n// ... (truncated)" : content,
      selectedText: selection.isEmpty ? void 0 : document.getText(selection),
      diagnostics: diagnosticInfos
    };
  }
  /**
   * Build a formatted context string for the AI prompt
   */
  buildContextString() {
    const context = this.getActiveContext();
    if (!context) {
      return "No active code file.";
    }
    let result = `## Currently Editing
`;
    result += `**File:** ${context.fileName}
`;
    result += `**Language:** ${context.languageId}

`;
    if (context.diagnostics.length > 0) {
      result += `### Diagnostics
`;
      context.diagnostics.slice(0, 10).forEach((d) => {
        result += `- Line ${d.line}: [${d.severity.toUpperCase()}] ${d.message}
`;
      });
      if (context.diagnostics.length > 10) {
        result += `- ... and ${context.diagnostics.length - 10} more
`;
      }
      result += "\n";
    }
    if (context.selectedText) {
      result += `### Selected Code
\`\`\`${context.languageId}
${context.selectedText}
\`\`\`

`;
    }
    const codeLines = context.content.split("\n");
    const showLines = Math.min(codeLines.length, 100);
    result += `### Code (first ${showLines} lines)
\`\`\`${context.languageId}
`;
    result += codeLines.slice(0, showLines).join("\n");
    if (codeLines.length > showLines) {
      result += `
// ... (${codeLines.length - showLines} more lines)`;
    }
    result += "\n```\n";
    return result;
  }
  getSeverityString(severity) {
    switch (severity) {
      case vscode3.DiagnosticSeverity.Error:
        return "error";
      case vscode3.DiagnosticSeverity.Warning:
        return "warning";
      case vscode3.DiagnosticSeverity.Information:
        return "info";
      case vscode3.DiagnosticSeverity.Hint:
        return "hint";
      default:
        return "info";
    }
  }
};

// src/ChatGPTService.ts
var ChatGPTService = class {
  constructor(apiKeyManager) {
    this.conversationHistory = [];
    this.apiKeyManager = apiKeyManager;
    this.codeContextProvider = new CodeContextProvider();
  }
  /**
   * Set the user profile for personalization
   */
  setUserProfile(profile) {
    this.userProfile = profile;
  }
  /**
   * Clear conversation history (new session)
   */
  clearHistory() {
    this.conversationHistory = [];
  }
  /**
   * Send a message and stream the response
   */
  async sendMessage(userMessage, callbacks) {
    const apiKey = await this.apiKeyManager.getApiKey();
    if (!apiKey) {
      callbacks.onError(new Error("No API key configured. Please enter your OpenAI API key."));
      return;
    }
    const systemPrompt = this.buildSystemPrompt();
    this.conversationHistory.push({
      role: "user",
      content: userMessage
    });
    const messages = [
      { role: "system", content: systemPrompt },
      ...this.conversationHistory.slice(-20)
      // Keep last 20 messages for context
    ];
    try {
      const model = vscode4.workspace.getConfiguration("anime-girlfriend").get("openaiModel", "gpt-4o-mini");
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 2e3
        })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API Error: ${response.status}`);
      }
      if (!response.body) {
        throw new Error("No response body");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]")
              continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                callbacks.onToken(content);
              }
            } catch {
            }
          }
        }
      }
      this.conversationHistory.push({
        role: "assistant",
        content: fullResponse
      });
      callbacks.onComplete(fullResponse);
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  /**
   * Build the system prompt with persona, personality, and pedagogy rules
   */
  buildSystemPrompt() {
    const character = this.userProfile?.character || "aru";
    const codeContext = this.codeContextProvider.buildContextString();
    let prompt = `# Your Role
You are a coding companion helping the user with competitive programming (PS/CP) problems, particularly from Baekjoon Online Judge (BOJ).

## Your Persona
`;
    if (character === "aru") {
      prompt += `You are **Aru**, a bossy, tsundere coding genius. You act tough and sarcastic, but secretly care deeply about helping the user succeed. You often say things like "Hmph!" or "It's not like I wanted to help you or anything!" Your tone is playful but encouraging underneath the tsundere exterior.
`;
    } else {
      prompt += `You are **Chihiro**, a calm, analytical hacker AI. You speak in a measured, logical manner. You break down problems systematically and explain things clearly. Your tone is cool and professional, but supportive.
`;
    }
    if (this.userProfile?.personalitySummary) {
      prompt += `
## User's Personality Profile
${this.userProfile.personalitySummary}

Adapt your communication style based on this profile. Be more or less direct, more or less encouraging, based on their personality traits.
`;
    } else if (this.userProfile?.bfi) {
      const { bfi } = this.userProfile;
      prompt += `
## User's Personality Traits
- Extraversion: ${bfi.extraversion.toFixed(1)}/5
- Agreeableness: ${bfi.agreeableness.toFixed(1)}/5
- Conscientiousness: ${bfi.conscientiousness.toFixed(1)}/5
- Neuroticism: ${bfi.neuroticism.toFixed(1)}/5
- Openness: ${bfi.openness.toFixed(1)}/5

Adapt your tone based on these traits. For example:
- High neuroticism \u2192 Be more reassuring and patient
- Low extraversion \u2192 Keep explanations focused, less chatty
- High conscientiousness \u2192 Appreciate their systematic approach
`;
    }
    prompt += `
## Pedagogy Rules (CRITICAL)
You are a Socratic tutor. Your goal is to GUIDE the user's thinking, NOT give them answers.

### Core Rules:
1. **NEVER** give direct answers, complete solutions, or working code
2. **NEVER** reveal the algorithm or approach directly
3. Use questions to guide their thinking: "What happens when...?", "Have you considered...?"
4. Suggest debugging experiments: "Try printing X at this point", "What if the input was Y?"
5. Point out logical holes without fixing them: "Your logic assumes X, but what if...?"

### Hint Ladder (progressive):
- L0: Ask clarifying questions, reflect their understanding back
- L1: Ask about invariants and assumptions
- L2: Suggest a small experiment or edge case to test
- L3: Point to a suspicious region without revealing the fix
- L4: Give a conceptual hint or partial pseudocode (still not the full answer)

### The ONLY Exception:
If the user explicitly says something like:
- "I don't know, and I want you to teach me how"
- "I give up, please explain"
- "Just tell me the answer"

ONLY THEN may you switch to direct teaching mode. Even then, prefer explaining the concept rather than giving copy-paste code.

## BOJ Problem Handling
If the user mentions a BOJ problem number (e.g., "1000\uBC88", "\uBC31\uC900 1000", "problem 1000"):
1. Recognize it's a BOJ problem
2. Help them think through the approach WITHOUT revealing the solution
3. Ask about their current understanding of the problem
4. Guide them toward the right algorithmic approach through questions

## Code Context
${codeContext}

---
Remember: Your job is to make the user THINK, not to do the thinking for them. Be their sparring partner, not their answer key.
`;
    return prompt;
  }
  /**
   * Detect if a message mentions a BOJ problem
   */
  detectBOJProblem(message) {
    const patterns = [
      /백준\s*(\d{4,5})/i,
      /boj\s*(\d{4,5})/i,
      /(\d{4,5})번/,
      /problem\s*#?\s*(\d{4,5})/i,
      /문제\s*(\d{4,5})/
    ];
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }
};

// src/extension.ts
async function activate(context) {
  console.log("[Anime Girlfriend] Extension activating...");
  const apiKeyManager = new ApiKeyManager(context.secrets);
  const userDataStore = new UserDataStore(context.globalState);
  const chatGPTService = new ChatGPTService(apiKeyManager);
  const savedProfile = userDataStore.loadProfile();
  if (savedProfile) {
    chatGPTService.setUserProfile(savedProfile);
    console.log("[Anime Girlfriend] Loaded saved profile for:", savedProfile.character);
  }
  const chatPanel = new ChatPanel(
    context.extensionUri,
    apiKeyManager,
    userDataStore,
    chatGPTService
  );
  const port = vscode5.workspace.getConfiguration("anime-girlfriend").get("serverPort", 3e3);
  const localServer = new LocalServer(port, (data) => {
    console.log("[Anime Girlfriend] BOJ Success:", data);
    chatPanel.showOverlay(data.problemId);
  });
  context.subscriptions.push(
    vscode5.window.registerWebviewViewProvider("anime-girlfriend.chat", chatPanel)
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("anime-girlfriend.showChat", async () => {
      await vscode5.commands.executeCommand("anime-girlfriend.chat.focus");
    }),
    vscode5.commands.registerCommand("anime-girlfriend.enterApiKey", async () => {
      await apiKeyManager.enterApiKey();
    }),
    vscode5.commands.registerCommand("anime-girlfriend.resetProfile", async () => {
      await userDataStore.clearProfile();
      chatGPTService.setUserProfile(void 0);
      chatGPTService.clearHistory();
      vscode5.window.showInformationMessage("Profile cleared. Restart the chat to re-onboard.");
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
