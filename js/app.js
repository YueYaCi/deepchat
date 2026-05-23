// ========================
// 配置（请替换为你自己的 Supabase 信息）
// ========================
const SUPABASE_URL = "https://afvukqjluoxzuouhiufw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1qYYVcrzSjwy8_-41Eeuig_dAjU9Zqd";

// ========================
// 等待 DOM 加载完成后执行所有逻辑
// ========================
document.addEventListener('DOMContentLoaded', () => {

  // ---------- 初始化 Supabase 客户端 ----------
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------- 昵称映射 ----------
  const NICKNAME_MAP = {
    "兵": "bing@chat.local",
    "沣": "feng@chat.local",
    "谢": "xie@chat.local",
    "周": "zhou@chat.local"
  };

  // ---------- 全局状态 ----------
  let currentUser = null;
  let currentNickname = "";
  let currentAvatar = "";
  let actualApiUrl = "Loading...";
  let currentModel = "deepseek-v4-pro";
  let currentProvider = "deepseek";
  let modelDropdownVisible = false;
  let conversationMessages = [
    { role: "system", content: "你是一个有帮助的助手，使用中文回答。" }
  ];

  // ---------- DOM 元素（使用安全的获取方式，若获取不到则为 null） ----------
  const $ = (id) => document.getElementById(id);

  const loginContainer = $("login-container");
  const appContainer = $("app-container");
  const nicknameInput = $("nickname-input");
  const passwordInput = $("password-input");
  const loginBtn = $("login-btn");
  const loginError = $("login-error");

  const avatarSmall = $("avatar-small");
  const nicknameDisplay = $("nickname-display");
  const logoutBtn = $("logout-btn");

  const chatMessages = $("chat-messages");
  const userInput = $("user-input");
  const sendBtn = $("send-btn");

  const discussionMessages = $("discussion-messages");
  const discussionInput = $("discussion-input");
  const sendDiscussionBtn = $("send-discussion-btn");

  const apiModel = $("api-model");
  const apiUrl = $("api-url");
  const apiRounds = $("api-rounds");
  const apiLastTime = $("api-last-time");
  const apiStatus = $("api-status");
  const apiRespLen = $("api-resp-len");

  const modelSelectBtn = $("model-select-btn");
  const apiTestBtn = $("api-test-btn");
  const apiTestStatus = $("api-test-status");
  const apiInfoDiv = $("api-info");

  const logContent = $("log-content");

  // ---------- 工具函数 ----------
  const escapeHtml = (text) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
  };

  const autoResize = (textarea) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = parseInt(textarea.style.maxHeight) || 150;
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
  };

  // 日志输出（同时输出到日志区和控制台）
  const addLog = (level, component, message, details = {}) => {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8) + "." + String(now.getMilliseconds()).padStart(3, "0");
    const detailStr = Object.entries(details).map(([k, v]) => `${k}=${v}`).join(" ");
    const lineText = `${timeStr} ${level.padEnd(5)} [${component.padEnd(7)}] ${message}${detailStr ? " — " + detailStr : ""}`;

    if (logContent) {
      const entryDiv = document.createElement("div");
      entryDiv.className = `log-entry ${level.toLowerCase()}`;
      entryDiv.textContent = lineText;
      logContent.appendChild(entryDiv);
      logContent.scrollTop = logContent.scrollHeight;
    }

    const consoleMsg = { time: now.toISOString(), level, component, message, details };
    switch (level) {
      case "ERROR": console.error(consoleMsg); break;
      case "WARN": console.warn(consoleMsg); break;
      case "DEBUG": console.debug(consoleMsg); break;
      default: console.info(consoleMsg);
    }
  };

  // 更新 API 信息面板
  const updateApiUrlDisplay = () => {
    if (apiUrl) apiUrl.textContent = actualApiUrl;
  };

  const updateApiInfo = (status, respLen = null) => {
    if (apiModel) apiModel.textContent = currentModel;
    if (apiRounds) apiRounds.textContent = conversationMessages.length - 1;
    if (apiLastTime) apiLastTime.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    if (apiStatus) apiStatus.textContent = status;
    if (apiRespLen) apiRespLen.textContent = respLen !== null ? `${respLen} chars` : "—";
    updateApiUrlDisplay();
  };

  // ---------- 模型选择下拉菜单 ----------
  const toggleModelDropdown = () => {
    const existing = document.querySelector(".model-dropdown");
    if (existing) {
      existing.remove();
      modelDropdownVisible = false;
      return;
    }

    const dropdown = document.createElement("div");
    dropdown.className = "model-dropdown";

    const models = [
      { name: "deepseek-v4-pro", provider: "deepseek", label: "DeepSeek V4 Pro", avatar: "avatars/deepseek.png" },
      { name: "mimo-v2.5", provider: "mimo", label: "MiMo V2.5", avatar: "avatars/xiaomi.png" }
    ];

    models.forEach(model => {
      const option = document.createElement("div");
      option.className = `model-option ${model.name === currentModel ? "active" : ""}`;
      option.innerHTML = `<img class="model-option-icon" src="${model.avatar}" alt=""><span>${model.label}</span>`;
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        selectModel(model);
      });
      dropdown.appendChild(option);
    });

    if (apiInfoDiv) {
      apiInfoDiv.style.position = "relative";
      apiInfoDiv.appendChild(dropdown);
      modelDropdownVisible = true;
    }
  };

  const selectModel = (model) => {
    currentModel = model.name;
    currentProvider = model.provider;
    addLog("INFO", "APP", "Model switched", { model: currentModel, provider: currentProvider });
    if (apiModel) apiModel.textContent = currentModel;
    document.querySelector(".model-dropdown")?.remove();
    modelDropdownVisible = false;
    conversationMessages = [{ role: "system", content: "你是一个有帮助的助手，使用中文回答。" }];
    if (chatMessages) chatMessages.innerHTML = "";
    addLog("INFO", "APP", "Conversation context cleared due to model switch");
  };

  // 绑定模型选择按钮
  if (modelSelectBtn) {
    modelSelectBtn.addEventListener("click", toggleModelDropdown);
  }
  // 点击页面其他区域关闭下拉菜单
  document.addEventListener("click", (e) => {
    if (modelDropdownVisible && !e.target.closest("#api-info")) {
      document.querySelector(".model-dropdown")?.remove();
      modelDropdownVisible = false;
    }
  });

  // ---------- API 连通性测试 ----------
  const testApiConnection = async () => {
    if (!apiTestStatus) return;
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
  };

  if (apiTestBtn) {
    apiTestBtn.addEventListener("click", testApiConnection);
  }

  // ---------- 登录功能 ----------
  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      const nickname = nicknameInput?.value.trim() || "";
      const password = passwordInput?.value || "";
      if (!nickname || !password) {
        if (loginError) loginError.textContent = "请输入昵称和密码";
        addLog("WARN", "AUTH", "Login attempt with empty credentials", { nickname, hasPassword: !!password });
        return;
      }
      const email = NICKNAME_MAP[nickname];
      if (!email) {
        if (loginError) loginError.textContent = "昵称不存在";
        addLog("WARN", "AUTH", "Login attempt with invalid nickname", { nickname });
        return;
      }

      addLog("INFO", "AUTH", "Attempting sign-in", { nickname, email });
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (error) {
        if (loginError) loginError.textContent = "登录失败：" + error.message;
        addLog("ERROR", "AUTH", "Sign-in failed", { error: error.message, status: error.status });
        return;
      }

      currentUser = data.user;
      currentNickname = nickname;
      currentAvatar = `avatars/${nickname}.png`;
      addLog("INFO", "AUTH", "Sign-in successful", { userId: currentUser.id, nickname });

      loginContainer?.classList.add("hidden");
      appContainer?.classList.remove("hidden");
      updateUserUI();
      loadDiscussion();
      updateApiInfo("Idle");
      addLog("INFO", "APP", "Chat UI loaded", { user: nickname });
    });
  }

  const updateUserUI = () => {
    if (avatarSmall) avatarSmall.src = currentAvatar;
    if (nicknameDisplay) nicknameDisplay.textContent = currentNickname;
  };

  // 退出登录
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      addLog("INFO", "AUTH", "Manual sign-out initiated", { nickname: currentNickname });
      await supabaseClient.auth.signOut();
      currentUser = null;
      appContainer?.classList.add("hidden");
      loginContainer?.classList.remove("hidden");
      if (nicknameInput) nicknameInput.value = "";
      if (passwordInput) passwordInput.value = "";
      if (loginError) loginError.textContent = "";
      if (chatMessages) chatMessages.innerHTML = "";
      conversationMessages = [{ role: "system", content: "你是一个有帮助的助手，使用中文回答。" }];
      if (logContent) logContent.innerHTML = "";
      addLog("INFO", "AUTH", "User signed out, UI reset");
    });
  }

  // 会话保持
  const checkSession = async () => {
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
        loginContainer?.classList.add("hidden");
        appContainer?.classList.remove("hidden");
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
  };
  checkSession();

  // ---------- 对话功能 ----------
  if (sendBtn) sendBtn.addEventListener("click", sendMessage);
  if (userInput) {
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    userInput.addEventListener("input", () => autoResize(userInput));
  }

  async function sendMessage() {
    const text = userInput?.value.trim() || "";
    if (!text || !currentUser) return;

    const userMsgId = Date.now().toString(36);
    addLog("INFO", "CHAT", "User message input", { id: userMsgId, from: currentNickname, length: text.length, preview: text.slice(0, 50) });

    appendMessage("user", text);
    conversationMessages.push({ role: "user", content: text });
    if (userInput) {
      userInput.value = "";
      autoResize(userInput);
    }
    if (sendBtn) sendBtn.disabled = true;

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
      let done = false, chunkCount = 0;

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
                  const bubble = assistantMsgDiv?.querySelector(".message-bubble");
                  if (bubble) bubble.textContent = fullReply;
                }
              } catch (e) {}
            }
          }
        }
      }

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      addLog("INFO", "API", "Stream completed", { chunks: chunkCount, replyLength: fullReply.length, elapsed: elapsed + "s" });
      conversationMessages.push({ role: "assistant", content: fullReply });
      updateApiInfo("Success", fullReply.length);
    } catch (error) {
      if (assistantMsgDiv) {
        const bubble = assistantMsgDiv.querySelector(".message-bubble");
        if (bubble) bubble.textContent = "请求出错：" + error.message;
      }
      addLog("ERROR", "API", "Chat request failed", { error: error.message });
      updateApiInfo("Failed");
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function appendMessage(role, content) {
    const row = document.createElement("div");
    row.className = `message-row ${role}`;
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

  // ---------- 讨论区功能 ----------
  // 强制绑定按钮和输入框（不使用可选链，确保一定绑定）
  if (sendDiscussionBtn) {
    sendDiscussionBtn.addEventListener("click", (e) => {
      e.preventDefault();
      sendDiscussion();
    });
  } else {
    console.error("讨论区发送按钮未找到，请检查 HTML 中 ID 是否为 send-discussion-btn");
  }

  if (discussionInput) {
    discussionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendDiscussion();
      }
    });
    discussionInput.addEventListener("input", () => autoResize(discussionInput));
  } else {
    console.error("讨论区输入框未找到，请检查 HTML 中 ID 是否为 discussion-input");
  }

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
    if (discussionMessages) {
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
  }

  async function sendDiscussion() {
    if (!discussionInput) return;
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
      .insert([{
        user_id: currentUser.id,
        nickname: currentNickname,
        content
      }]);

    if (error) {
      addLog("ERROR", "DB", "Insert discussion message failed", { error: error.message, code: error.code });
      return;
    }

    addLog("INFO", "DISCUSS", "Message inserted successfully, refreshing display", { preview: msgPreview });
    discussionInput.value = "";
    autoResize(discussionInput);
    await loadDiscussion();
  }

});