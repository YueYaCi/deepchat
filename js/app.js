// ========================
// 1. 初始化 Supabase 客户端
// ========================
const SUPABASE_URL = "https://afvukqjluoxzuouhiufw.supabase.co";   // 替换为你的 Project URL
const SUPABASE_ANON_KEY = "sb_publishable_1qYYVcrzSjwy8_-41Eeuig_dAjU9Zqd";                     // 替换为你的 Publishable key

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 昵称映射
const NICKNAME_MAP = {
  "兵": "bing@chat.local",
  "沣": "feng@chat.local",
  "谢": "xie@chat.local",
  "周": "zhou@chat.local"
};

// ========================
// 2. 全局状态
// ========================
let currentUser = null;
let currentNickname = "";
let currentAvatar = "";
let actualApiUrl = "Loading...";        // 动态 API URL
let currentModel = "deepseek-v4-pro";   // 当前选中模型
let currentProvider = "deepseek";       // 当前模型提供商
let modelDropdownVisible = false;       // 模型下拉菜单是否打开

// 对话上下文
let conversationMessages = [
  { role: "system", content: "你是一个有帮助的助手，使用中文回答。" }
];

// ========================
// 3. 结构化日志系统
// ========================
const logContainer = document.getElementById("log-content");

function addLog(level, component, message, details = {}) {
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 8) + "." + String(now.getMilliseconds()).padStart(3, "0");

  const detailStr = Object.entries(details)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");

  const lineText = `${timeStr} ${level.padEnd(5)} [${component.padEnd(7)}] ${message}${detailStr ? " — " + detailStr : ""}`;

  const entryDiv = document.createElement("div");
  entryDiv.className = `log-entry ${level.toLowerCase()}`;
  entryDiv.textContent = lineText;
  logContainer.appendChild(entryDiv);
  logContainer.scrollTop = logContainer.scrollHeight;

  // 同步输出到浏览器控制台
  const consoleMsg = {
    time: now.toISOString(),
    level,
    component,
    message,
    details
  };
  switch (level) {
    case "ERROR": console.error(consoleMsg); break;
    case "WARN": console.warn(consoleMsg); break;
    case "DEBUG": console.debug(consoleMsg); break;
    default: console.info(consoleMsg);
  }
}

// ========================
// 4. DOM 元素引用
// ========================
// 登录
const loginContainer = document.getElementById("login-container");
const appContainer = document.getElementById("app-container");
const nicknameInput = document.getElementById("nickname-input");
const passwordInput = document.getElementById("password-input");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");

// 用户
const avatarSmall = document.getElementById("avatar-small");
const nicknameDisplay = document.getElementById("nickname-display");
const logoutBtn = document.getElementById("logout-btn");

// 对话
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

// 讨论区
const discussionMessages = document.getElementById("discussion-messages");
const discussionInput = document.getElementById("discussion-input");
const sendDiscussionBtn = document.getElementById("send-discussion-btn");

// API 信息显示
const apiModel = document.getElementById("api-model");
const apiUrl = document.getElementById("api-url");
const apiRounds = document.getElementById("api-rounds");
const apiLastTime = document.getElementById("api-last-time");
const apiStatus = document.getElementById("api-status");
const apiRespLen = document.getElementById("api-resp-len");

// API 控制按钮
const modelSelectBtn = document.getElementById("model-select-btn");
const apiTestBtn = document.getElementById("api-test-btn");
const apiTestStatus = document.getElementById("api-test-status");
const apiInfoDiv = document.getElementById("api-info");

// ========================
// 5. 工具函数
// ========================
function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, parseInt(textarea.style.maxHeight)) + 'px';
}

// 更新 API URL 显示
function updateApiUrlDisplay() {
  if (apiUrl) apiUrl.textContent = actualApiUrl;
}

// 更新 API 信息面板
function updateApiInfo(status, respLen = null) {
  apiModel.textContent = currentModel;
  apiRounds.textContent = conversationMessages.length - 1;
  apiLastTime.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  apiStatus.textContent = status;
  if (respLen !== null) {
    apiRespLen.textContent = respLen + " chars";
  } else {
    apiRespLen.textContent = "—";
  }
  updateApiUrlDisplay();
}

// ========================
// 6. 模型选择逻辑
// ========================
function toggleModelDropdown() {
  const existingDropdown = document.querySelector(".model-dropdown");
  if (existingDropdown) {
    existingDropdown.remove();
    modelDropdownVisible = false;
    return;
  }

  const dropdown = document.createElement("div");
  dropdown.className = "model-dropdown";

  const models = [
    {
      name: "deepseek-v4-pro",
      provider: "deepseek",
      label: "DeepSeek V4 Pro",
      avatar: "avatars/deepseek.png"
    },
    {
      name: "mimo-v2.5",
      provider: "mimo",
      label: "MiMo V2.5",
      avatar: "avatars/xiaomi.png"
    }
  ];

  models.forEach(model => {
    const option = document.createElement("div");
    option.className = `model-option ${model.name === currentModel ? "active" : ""}`;
    option.innerHTML = `
      <img class="model-option-icon" src="${model.avatar}" alt="">
      <span>${model.label}</span>
    `;
    option.addEventListener("click", () => selectModel(model));
    dropdown.appendChild(option);
  });

  // 使父容器相对定位，下拉菜单绝对定位
  apiInfoDiv.style.position = "relative";
  apiInfoDiv.appendChild(dropdown);
  modelDropdownVisible = true;
}

async function selectModel(model) {
  currentModel = model.name;
  currentProvider = model.provider;
  addLog("INFO", "APP", "Model switched", { model: currentModel, provider: currentProvider });
  apiModel.textContent = currentModel;
  document.querySelector(".model-dropdown")?.remove();
  modelDropdownVisible = false;
  // 切换模型后清空对话上下文
  conversationMessages = [
    { role: "system", content: "你是一个有帮助的助手，使用中文回答。" }
  ];
  chatMessages.innerHTML = "";
  addLog("INFO", "APP", "Conversation context cleared due to model switch");
}

modelSelectBtn.addEventListener("click", toggleModelDropdown);
document.addEventListener("click", (e) => {
  if (modelDropdownVisible && !e.target.closest("#api-info")) {
    document.querySelector(".model-dropdown")?.remove();
    modelDropdownVisible = false;
  }
});

// ========================
// 7. API 连通性测试
// ========================
async function testApiConnection() {
  apiTestStatus.classList.remove("hidden", "success", "error");
  apiTestStatus.textContent = ">> 正在测试 API 连通性...";
  apiTestStatus.className = "api-status-message info";
  addLog("INFO", "API", "Initiating API connectivity test");

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("Missing access token");

    const response = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hi" }],
        provider: currentProvider
      })
    });

    const returnedUrl = response.headers.get("X-Actual-API-URL");
    if (returnedUrl) {
      actualApiUrl = returnedUrl;
      updateApiUrlDisplay();
      addLog("INFO", "API", "API URL updated via test", { url: actualApiUrl });
    }

    if (response.ok) {
      apiTestStatus.textContent = "[OK] API 连接正常";
      apiTestStatus.className = "api-status-message success";
      addLog("INFO", "API", "Connectivity test passed", { status: response.status });
    } else {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }
  } catch (error) {
    apiTestStatus.textContent = `[ERR] API 连接失败: ${error.message}`;
    apiTestStatus.className = "api-status-message error";
    addLog("ERROR", "API", "Connectivity test failed", { error: error.message });
  }

  setTimeout(() => {
    apiTestStatus.classList.add("hidden");
  }, 5000);
}

apiTestBtn.addEventListener("click", testApiConnection);

// ========================
// 8. 登录 / 退出
// ========================
loginBtn.addEventListener("click", async () => {
  const nickname = nicknameInput.value.trim();
  const password = passwordInput.value;
  if (!nickname || !password) {
    loginError.textContent = "请输入昵称和密码";
    addLog("WARN", "AUTH", "Login attempt with empty credentials", { nickname, hasPassword: !!password });
    return;
  }
  const email = NICKNAME_MAP[nickname];
  if (!email) {
    loginError.textContent = "昵称不存在";
    addLog("WARN", "AUTH", "Login attempt with invalid nickname", { nickname });
    return;
  }

  addLog("INFO", "AUTH", "Attempting sign-in", { nickname, email });
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    loginError.textContent = "登录失败：" + error.message;
    addLog("ERROR", "AUTH", "Sign-in failed", { error: error.message, status: error.status });
    return;
  }

  currentUser = data.user;
  currentNickname = nickname;
  currentAvatar = `avatars/${nickname}.png`;
  addLog("INFO", "AUTH", "Sign-in successful", { userId: currentUser.id, nickname });

  loginContainer.classList.add("hidden");
  appContainer.classList.remove("hidden");
  updateUserUI();
  loadDiscussion();
  updateApiInfo("Idle");
  addLog("INFO", "APP", "Chat UI loaded", { user: nickname });
});

function updateUserUI() {
  avatarSmall.src = currentAvatar;
  nicknameDisplay.textContent = currentNickname;
}

logoutBtn.addEventListener("click", async () => {
  addLog("INFO", "AUTH", "Manual sign-out initiated", { nickname: currentNickname });
  await supabaseClient.auth.signOut();
  currentUser = null;
  appContainer.classList.add("hidden");
  loginContainer.classList.remove("hidden");
  nicknameInput.value = "";
  passwordInput.value = "";
  loginError.textContent = "";
  chatMessages.innerHTML = "";
  conversationMessages = [
    { role: "system", content: "你是一个有帮助的助手，使用中文回答。" }
  ];
  logContainer.innerHTML = "";
  addLog("INFO", "AUTH", "User signed out, UI reset");
});

// 会话保持
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    const email = session.user.email;
    for (let [nick, e] of Object.entries(NICKNAME_MAP)) {
      if (e === email) {
        currentNickname = nick;
        break;
      }
    }
    if (currentNickname) {
      currentAvatar = `avatars/${currentNickname}.png`;
      loginContainer.classList.add("hidden");
      appContainer.classList.remove("hidden");
      updateUserUI();
      loadDiscussion();
      addLog("INFO", "AUTH", "Session restored", { nickname: currentNickname });
      updateApiInfo("Idle");
    } else {
      addLog("WARN", "AUTH", "Session found but nickname unrecognized, signing out");
      await supabaseClient.auth.signOut();
    }
  } else {
    addLog("INFO", "AUTH", "No active session detected");
  }
}
checkSession();

// ========================
// 9. 对话功能
// ========================
sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
userInput.addEventListener("input", () => autoResize(userInput));

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || !currentUser) return;

  const userMsgId = Date.now().toString(36);
  addLog("INFO", "CHAT", "User message input", { id: userMsgId, from: currentNickname, length: text.length, preview: text.slice(0, 50) });

  appendMessage("user", text);
  conversationMessages.push({ role: "user", content: text });
  userInput.value = "";
  autoResize(userInput);
  sendBtn.disabled = true;

  const assistantMsgDiv = appendMessage("assistant", "");
  let fullReply = "";
  const startTime = performance.now();
  updateApiInfo("Requesting...");

  addLog("INFO", "API", "Sending chat request to Edge Function", {
    model: currentModel,
    provider: currentProvider,
    rounds: conversationMessages.length - 1
  });

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("Missing access token");

    const response = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        messages: conversationMessages,
        provider: currentProvider
      })
    });

    // 动态读取实际 API URL
    const returnedUrl = response.headers.get("X-Actual-API-URL");
    if (returnedUrl) {
      actualApiUrl = returnedUrl;
      updateApiUrlDisplay();
    }

    addLog("INFO", "API", "Received HTTP response", { status: response.status, ok: response.ok });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let chunkCount = 0;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullReply += delta;
                assistantMsgDiv.querySelector(".message-bubble").textContent = fullReply;
              }
            } catch (e) { }
          }
        }
      }
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    addLog("INFO", "API", "Stream completed", {
      chunks: chunkCount,
      replyLength: fullReply.length,
      elapsed: elapsed + "s"
    });
    conversationMessages.push({ role: "assistant", content: fullReply });
    updateApiInfo("Success", fullReply.length);
  } catch (error) {
    assistantMsgDiv.querySelector(".message-bubble").textContent = "请求出错：" + error.message;
    addLog("ERROR", "API", "Chat request failed", { error: error.message });
    updateApiInfo("Failed");
  } finally {
    sendBtn.disabled = false;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function appendMessage(role, content) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  // 根据当前提供商决定助手头像
  let avatarSrc;
  if (role === "user") {
    avatarSrc = currentAvatar;
  } else {
    avatarSrc = currentProvider === "mimo" ? "avatars/xiaomi.png" : "avatars/deepseek.png";
  }
  row.innerHTML = `
    <img class="message-avatar" src="${avatarSrc}" alt="">
    <div class="message-bubble">${content}</div>
  `;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return row;
}

// ========================
// 10. 讨论区功能
// ========================
discussionInput.addEventListener("input", () => autoResize(discussionInput));
discussionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendDiscussion();
  }
});

async function loadDiscussion() {
  if (!currentUser) return;
  addLog("INFO", "DISCUSS", "Loading discussion messages from DB");
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    addLog("ERROR", "DB", "Failed to fetch discussion messages", { error: error.message, code: error.code });
    return;
  }

  addLog("INFO", "DISCUSS", "Rendering discussion panel", { count: data.length });
  discussionMessages.innerHTML = "";
  data.forEach(msg => {
    const msgDiv = document.createElement("div");
    msgDiv.className = "discuss-msg";
    msgDiv.innerHTML = `
      <img class="discuss-avatar" src="avatars/${msg.nickname}.png" alt="">
      <div>
        <div class="discuss-content">
          <span class="discuss-nickname">${msg.nickname}</span>${escapeHtml(msg.content)}
        </div>
        <div class="discuss-time">${new Date(msg.created_at).toLocaleString("zh-CN")}</div>
      </div>
    `;
    discussionMessages.appendChild(msgDiv);
  });
  discussionMessages.scrollTop = discussionMessages.scrollHeight;
}

async function sendDiscussion() {
  const content = discussionInput.value.trim();
  if (!content || !currentUser) return;

  const msgPreview = content.slice(0, 50);
  addLog("INFO", "DISCUSS", "Attempting to insert discussion message", {
    from: currentNickname,
    length: content.length,
    preview: msgPreview
  });

  const { error } = await supabaseClient
    .from("messages")
    .insert([
      {
        user_id: currentUser.id,
        nickname: currentNickname,
        content
      }
    ]);

  if (error) {
    addLog("ERROR", "DB", "Insert discussion message failed", { error: error.message, code: error.code });
    return;
  }

  addLog("INFO", "DISCUSS", "Message inserted successfully, refreshing display", { preview: msgPreview });
  discussionInput.value = "";
  autoResize(discussionInput);
  await loadDiscussion();
}