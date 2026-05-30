// ===================== 配置层 =====================
const CONFIG = {
  SUPABASE_URL: "https://afvukqjluoxzuouhiufw.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_1qYYVcrzSjwy8_-41Eeuig_dAjU9Zqd",
  NICKNAME_MAP: {
    "兵": "bing@chat.local",
    "沣": "feng@chat.local",
    "谢": "xie@chat.local",
    "周": "zhou@chat.local"
  },
  SYSTEM_PROMPT: "你是VT4，你的主要工作是帮助用户完成编程作业，要求：1. 直接给出完整可运行的代码，不要讲思路。2. 代码必须使用初学者容易理解的简单语法，避免使用装饰器、生成器、列表推导式lambda、正则等高级特性。3.以常规、直白的方式，就像刚学的学生写出来的那样，用 for 循环、if/else、基础数据类型和内置函数（如 range、len、input、print 等）。4. 在代码前用中文简单说明思路。5. 如果没有特别要求，不需要写注释，保持干净。6. 如果用户的问题不清晰缺少，只问最关键的信息，不要多聊。",
  MODELS: [
    { name: "deepseek-v4-pro", provider: "deepseek", label: "DeepSeek V4 Pro", avatar: "avatars/deepseek.png" },
    { name: "mimo-v2.5", provider: "mimo", label: "MiMo V2.5", avatar: "avatars/xiaomi.png" }
  ]
};

// ===================== 状态层 =====================
const State = {
  user: null,
  nickname: "",
  avatar: "",
  apiUrl: "Loading...",
  model: CONFIG.MODELS[0],
  dropdownOpen: false,
  messages: [{ role: "system", content: CONFIG.SYSTEM_PROMPT }],
  channel: null,
  isChatSending: false,
  isDiscussSending: false
};

// ===================== DOM 缓存层 =====================
const DOM = (() => {
  const $ = (id) => document.getElementById(id);
  return {
    login: {
      container: $("login-container"),
      btn: $("login-btn"),
      error: $("login-error"),
      nickname: $("nickname-input"),
      password: $("password-input")
    },
    app: {
      container: $("app-container"),
      avatar: $("avatar-small"),
      nickname: $("nickname-display"),
      logout: $("logout-btn")
    },
    chat: {
      messages: $("chat-messages"),
      input: $("user-input"),
      send: $("send-btn")
    },
    discuss: {
      messages: $("discussion-messages"),
      input: $("discussion-input"),
      send: $("send-discussion-btn")
    },
    api: {
      model: $("api-model"),
      url: $("api-url"),
      rounds: $("api-rounds"),
      lastTime: $("api-last-time"),
      status: $("api-status"),
      respLen: $("api-resp-len"),
      testBtn: $("api-test-btn"),
      testStatus: $("api-test-status"),
      modelBtn: $("model-select-btn"),
      info: $("api-info")
    },
    log: $("log-content")
  };
})();

// ===================== 工具层 =====================
const Utils = {
  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<<>"']/g, m => map[m]);
  },

  // FIX: 使用 getComputedStyle 读取 CSS 中的 max-height
  autoResize(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = parseInt(getComputedStyle(textarea).maxHeight) || 150;
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
  },

  formatTime(date) {
    return new Date(date).toLocaleString("zh-CN", { hour12: false });
  },

  setLoading(btn, isLoading) {
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    if (text) text.classList.toggle('hidden', isLoading);
    if (loader) loader.classList.toggle('hidden', !isLoading);
    btn.disabled = isLoading;
  },

  addLog(level, component, message, details = {}) {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8) + "." + String(now.getMilliseconds()).padStart(3, "0");
    const detailStr = Object.entries(details).map(([k, v]) => `${k}=${v}`).join(" ");
    const line = `${timeStr} ${level.padEnd(5)} [${component.padEnd(7)}] ${message}${detailStr ? " — " + detailStr : ""}`;

    if (DOM.log) {
      const entry = document.createElement("div");
      entry.className = `log-entry ${level.toLowerCase()}`;
      entry.textContent = line;
      DOM.log.appendChild(entry);
      DOM.log.scrollTop = DOM.log.scrollHeight;
    }

    const consoleMsg = { time: now.toISOString(), level, component, message, details };
    const fn = { ERROR: console.error, WARN: console.warn, DEBUG: console.debug }[level] || console.info;
    fn(consoleMsg);
  },

  // 简易 Markdown 代码块解析（仅处理 ``` 代码块与行内代码）
  formatContent(text) {
    if (!text) return '';
    const blocks = [];
    let idx = 0;

    const replaced = text.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${idx++}_${Math.random().toString(36).slice(2)}__`;
      blocks.push({ lang, code: Utils.escapeHtml(code) });
      return placeholder;
    });

    let html = Utils.escapeHtml(replaced);

    blocks.forEach(({ lang, code }) => {
      const langClass = lang ? ` language-${lang}` : '';
      const blockHtml = `<pre class="code-block-wrapper"><code class="code-block${langClass}">${code}</code></pre>`;
      html = html.replace(/__CODE_BLOCK_\d+_[a-z0-9]+__/, blockHtml);
    });

    html = html.replace(/`([^`]+)`/g, '<code class="code-inline">$1</code>');
    return html;
  }
};

// ===================== Supabase 客户端 =====================
let supabaseClient = null;

// ===================== 认证模块 =====================
const Auth = {
  async login() {
    const { btn, error, nickname, password } = DOM.login;
    const nick = nickname.value.trim();
    const pass = password.value;

    if (!nick || !pass) {
      error.textContent = "请输入昵称和密码";
      Utils.addLog("WARN", "AUTH", "Empty credentials", { nick });
      return;
    }

    const email = CONFIG.NICKNAME_MAP[nick];
    if (!email) {
      error.textContent = "昵称不存在";
      Utils.addLog("WARN", "AUTH", "Invalid nickname", { nick });
      return;
    }

    Utils.setLoading(btn, true);
    error.textContent = "";
    Utils.addLog("INFO", "AUTH", "Signing in", { nick, email });

    try {
      const { data, error: authError } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
      if (authError) throw authError;

      State.user = data.user;
      State.nickname = nick;
      State.avatar = `avatars/${nick}.png`;

      Utils.addLog("INFO", "AUTH", "Sign-in success", { userId: data.user.id, nick });
      UI.switchView('app');
      Auth.updateUI();
      await Discuss.load();
      Discuss.subscribe();
      UI.updateApiInfo("Idle");
    } catch (err) {
      error.textContent = "登录失败：" + err.message;
      Utils.addLog("ERROR", "AUTH", "Sign-in failed", { error: err.message });
    } finally {
      Utils.setLoading(btn, false);
    }
  },

  async logout() {
    Utils.addLog("INFO", "AUTH", "Signing out", { nick: State.nickname });
    await supabaseClient.auth.signOut();

    State.user = null;
    State.nickname = "";
    State.avatar = "";
    State.messages = [{ role: "system", content: CONFIG.SYSTEM_PROMPT }];
    State.apiUrl = "Loading...";

    UI.switchView('login');
    DOM.chat.messages.innerHTML = "";
    DOM.discuss.messages.innerHTML = "";
    DOM.log.innerHTML = "";
    DOM.login.nickname.value = "";
    DOM.login.password.value = "";
    DOM.login.error.textContent = "";

    Discuss.unsubscribe();
    UI.updateApiInfo("—");

    Utils.addLog("INFO", "AUTH", "Signed out, UI reset");
  },

  async restore() {
    Utils.addLog("INFO", "AUTH", "Checking session");
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
      Utils.addLog("INFO", "AUTH", "No active session");
      return;
    }

    const email = session.user.email;
    let nick = "";
    for (const [k, v] of Object.entries(CONFIG.NICKNAME_MAP)) {
      if (v === email) { nick = k; break; }
    }

    if (!nick) {
      Utils.addLog("WARN", "AUTH", "Unknown session email", { email });
      await supabaseClient.auth.signOut();
      return;
    }

    State.user = session.user;
    State.nickname = nick;
    State.avatar = `avatars/${nick}.png`;

    Utils.addLog("INFO", "AUTH", "Session restored", { nick });
    UI.switchView('app');
    Auth.updateUI();
    await Discuss.load();
    Discuss.subscribe();
    UI.updateApiInfo("Idle");
  },

  updateUI() {
    DOM.app.avatar.src = State.avatar;
    DOM.app.nickname.textContent = State.nickname;
  }
};

// ===================== API 模块 =====================
const API = {
  async getToken() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("未登录或会话已过期，请重新登录");
    return token;
  },

  async test() {
    const { testBtn, testStatus } = DOM.api;
    if (!testStatus) return;

    testBtn.disabled = true;
    testStatus.className = "api-status-message info";
    testStatus.textContent = ">> 正在测试 API 连通性...";
    testStatus.classList.remove("hidden");
    Utils.addLog("INFO", "API", "Testing connectivity");

    try {
      const token = await API.getToken();
      const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/deepseek-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }], provider: State.model.provider })
      });

      const returnedUrl = response.headers.get("X-Actual-API-URL");
      if (returnedUrl) {
        State.apiUrl = returnedUrl;
        DOM.api.url.textContent = State.apiUrl;
        Utils.addLog("INFO", "API", "URL updated", { url: returnedUrl });
      }

      if (response.ok) {
        testStatus.textContent = "[OK] API 连接正常";
        testStatus.className = "api-status-message success";
        Utils.addLog("INFO", "API", "Test passed", { status: response.status });
      } else {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
    } catch (err) {
      testStatus.textContent = `[ERR] API 连接失败: ${err.message}`;
      testStatus.className = "api-status-message error";
      Utils.addLog("ERROR", "API", "Test failed", { error: err.message });
    } finally {
      testBtn.disabled = false;
      setTimeout(() => testStatus.classList.add("hidden"), 5000);
    }
  }
};

// ===================== UI 渲染模块 =====================
const UI = {
  switchView(view) {
    if (view === 'app') {
      DOM.login.container.classList.add('hidden');
      DOM.app.container.classList.remove('hidden');
    } else {
      DOM.app.container.classList.add('hidden');
      DOM.login.container.classList.remove('hidden');
    }
  },

  updateApiInfo(status, respLen = null) {
    const { model, url, rounds, lastTime, status: st, respLen: rl } = DOM.api;
    if (model) model.textContent = State.model.name;
    if (url) url.textContent = State.apiUrl;
    if (rounds) rounds.textContent = State.messages.length - 1;
    if (lastTime) lastTime.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    if (st) st.textContent = status;
    if (rl) rl.textContent = respLen !== null ? `${respLen} chars` : "—";
  },

  appendChatMessage(role, content = '', isStreaming = false) {
    const container = DOM.chat.messages;
    const row = document.createElement("div");
    row.className = `message-row ${role}`;

    const avatarSrc = role === 'user'
      ? State.avatar
      : (State.model.provider === 'mimo' ? 'avatars/xiaomi.png' : 'avatars/deepseek.png');

    row.innerHTML = `<img class="message-avatar" src="${avatarSrc}" alt="" onerror="this.style.visibility='hidden'">`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (isStreaming) {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = Utils.formatContent(content);
    }

    row.appendChild(bubble);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;

    return bubble;
  },

  appendDiscussMessage(msg, isOwn = false) {
    const container = DOM.discuss.messages;
    if (!container) return;

    const msgDiv = document.createElement("div");
    msgDiv.className = `discuss-msg ${isOwn || msg.user_id === State.user?.id ? 'own' : ''}`;
    msgDiv.dataset.msgId = msg.id || '';

    const timeStr = msg.created_at ? Utils.formatTime(msg.created_at) : '';

    msgDiv.innerHTML = `
      <img class="discuss-avatar" src="avatars/${msg.nickname}.png" alt="" onerror="this.style.visibility='hidden'">
      <div class="discuss-content-wrapper">
        <div class="discuss-content">
          <span class="discuss-nickname">${Utils.escapeHtml(msg.nickname)}</span>${Utils.formatContent(msg.content)}
        </div>
        ${timeStr ? `<div class="discuss-time">${timeStr}</div>` : ''}
      </div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  },

  toggleModelDropdown() {
    const existing = document.querySelector(".model-dropdown");
    if (existing) {
      existing.remove();
      State.dropdownOpen = false;
      return;
    }

    const dropdown = document.createElement("div");
    dropdown.className = "model-dropdown";

    CONFIG.MODELS.forEach(m => {
      const option = document.createElement("div");
      option.className = `model-option ${m.name === State.model.name ? "active" : ""}`;
      option.innerHTML = `<img class="model-option-icon" src="${m.avatar}" alt=""><span>${m.label}</span>`;
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        UI.selectModel(m);
      });
      dropdown.appendChild(option);
    });

    DOM.api.info.appendChild(dropdown);
    State.dropdownOpen = true;
  },

  selectModel(model) {
    State.model = model;
    Utils.addLog("INFO", "APP", "Model switched", { model: model.name, provider: model.provider });
    UI.updateApiInfo("Idle");

    State.messages = [{ role: "system", content: CONFIG.SYSTEM_PROMPT }];
    DOM.chat.messages.innerHTML = "";

    UI.closeDropdown();
    Utils.addLog("INFO", "APP", "Context cleared");
  },

  closeDropdown() {
    document.querySelector(".model-dropdown")?.remove();
    State.dropdownOpen = false;
  }
};

// ===================== 聊天模块 =====================
const Chat = {
  async send() {
    const { input, send: btn, messages: container } = DOM.chat;
    const text = input.value.trim();
    if (!text || !State.user || State.isChatSending) return;

    State.isChatSending = true;
    Utils.setLoading(btn, true);

    const msgId = Date.now().toString(36);
    Utils.addLog("INFO", "CHAT", "User message", { id: msgId, length: text.length, preview: text.slice(0, 50) });

    UI.appendChatMessage('user', text);
    State.messages.push({ role: "user", content: text });

    input.value = "";
    Utils.autoResize(input);

    const bubble = UI.appendChatMessage('assistant', '', true);
    const startTime = performance.now();
    UI.updateApiInfo("Requesting...");

    try {
      const token = await API.getToken();
      const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/deepseek-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ messages: State.messages, provider: State.model.provider })
      });

      const returnedUrl = response.headers.get("X-Actual-API-URL");
      if (returnedUrl) {
        State.apiUrl = returnedUrl;
        DOM.api.url.textContent = State.apiUrl;
      }

      Utils.addLog("INFO", "API", "Response received", { status: response.status, ok: response.ok });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const fullReply = await Chat.handleStream(response, bubble);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

      State.messages.push({ role: "assistant", content: fullReply });
      Utils.addLog("INFO", "API", "Stream done", { elapsed: elapsed + "s", length: fullReply.length });
      UI.updateApiInfo("Success", fullReply.length);
    } catch (err) {
      bubble.innerHTML = Utils.formatContent("请求出错：" + err.message);
      Utils.addLog("ERROR", "API", "Chat failed", { error: err.message });
      UI.updateApiInfo("Failed");
    } finally {
      State.isChatSending = false;
      Utils.setLoading(btn, false);
      container.scrollTop = container.scrollHeight;
    }
  },

  async handleStream(response, bubbleEl) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullReply = "";
    let chunkCount = 0;
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (!value) continue;

      chunkCount++;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullReply += delta;
            bubbleEl.textContent = fullReply;
          }
        } catch (e) {
          // 忽略无法解析的行
        }
      }
    }

    // 流结束后渲染完整 Markdown
    bubbleEl.innerHTML = Utils.formatContent(fullReply);
    return fullReply;
  }
};

// ===================== 讨论区模块 =====================
const Discuss = {
  async load() {
    if (!State.user) return;
    Utils.addLog("INFO", "DISCUSS", "Loading messages");

    const { data, error } = await supabaseClient
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      Utils.addLog("ERROR", "DB", "Load failed", { error: error.message });
      return;
    }

    DOM.discuss.messages.innerHTML = "";
    data.forEach(msg => UI.appendDiscussMessage(msg, msg.user_id === State.user.id));

    Utils.addLog("INFO", "DISCUSS", "Messages loaded", { count: data.length });
  },

  async send() {
    const { input, send: btn } = DOM.discuss;
    const content = input.value.trim();
    if (!content || !State.user || State.isDiscussSending) return;

    State.isDiscussSending = true;
    btn.disabled = true;

    const preview = content.slice(0, 50);
    Utils.addLog("INFO", "DISCUSS", "Sending message", { length: content.length, preview });

    // FIX: 乐观更新——立即本地渲染自己的消息
    const tempMsg = {
      id: `temp-${Date.now()}`,
      user_id: State.user.id,
      nickname: State.nickname,
      content: content,
      created_at: new Date().toISOString()
    };
    UI.appendDiscussMessage(tempMsg, true);

    try {
      const { error } = await supabaseClient
        .from("messages")
        .insert([{ user_id: State.user.id, nickname: State.nickname, content }]);

      if (error) throw error;

      Utils.addLog("INFO", "DISCUSS", "Message sent", { preview });
      input.value = "";
      Utils.autoResize(input);
    } catch (err) {
      Utils.addLog("ERROR", "DB", "Insert failed", { error: err.message });
      // 标记临时消息为失败
      const tempEl = DOM.discuss.messages.querySelector(`[data-msg-id="${tempMsg.id}"]`);
      if (tempEl) tempEl.classList.add('failed');
    } finally {
      State.isDiscussSending = false;
      btn.disabled = false;
    }
  },

  subscribe() {
    Discuss.unsubscribe();

    State.channel = supabaseClient
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        // 过滤自己的消息（已由乐观更新显示）
        if (payload.new.user_id === State.user?.id) return;
        UI.appendDiscussMessage(payload.new, false);
        Utils.addLog("INFO", "DISCUSS", "Realtime message received", { from: payload.new.nickname });
      })
      .subscribe();

    Utils.addLog("INFO", "DISCUSS", "Realtime subscribed");
  },

  unsubscribe() {
    if (State.channel) {
      supabaseClient.removeChannel(State.channel);
      State.channel = null;
      Utils.addLog("INFO", "DISCUSS", "Realtime unsubscribed");
    }
  }
};

// ===================== 事件绑定 =====================
const Events = {
  bind() {
    // 登录
    DOM.login.btn.addEventListener("click", Auth.login);
    DOM.login.nickname.addEventListener("keydown", (e) => {
      if (e.key === "Enter") Auth.login();
    });
    DOM.login.password.addEventListener("keydown", (e) => {
      if (e.key === "Enter") Auth.login();
    });

    // 退出
    DOM.app.logout.addEventListener("click", Auth.logout);

    // 对话
    DOM.chat.send.addEventListener("click", Chat.send);
    DOM.chat.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        Chat.send();
      }
    });
    DOM.chat.input.addEventListener("input", () => Utils.autoResize(DOM.chat.input));

    // 讨论区
    DOM.discuss.send.addEventListener("click", Discuss.send);
    DOM.discuss.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        Discuss.send();
      }
    });
    DOM.discuss.input.addEventListener("input", () => Utils.autoResize(DOM.discuss.input));

    // API 控制
    DOM.api.modelBtn.addEventListener("click", UI.toggleModelDropdown);
    DOM.api.testBtn.addEventListener("click", API.test);

    // 全局交互
    document.addEventListener("click", (e) => {
      if (State.dropdownOpen && !e.target.closest("#api-info")) {
        UI.closeDropdown();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && State.dropdownOpen) {
        UI.closeDropdown();
      }
    });
  }
};

// ===================== 初始化入口 =====================
const App = {
  init() {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    Events.bind();
    Auth.restore();
    Utils.addLog("INFO", "APP", "Application initialized");
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());