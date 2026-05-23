// ========================
// 1. 初始化 Supabase 客户端
// ========================
const SUPABASE_URL = "https://afvukqjluoxzuouhiufw.supabase.co";   // Project URL
const SUPABASE_ANON_KEY = "sb_publishable_1qYYVcrzSjwy8_-41Eeuig_dAjU9Zqd";                     // Publishable key

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 昵称映射
const NICKNAME_MAP = {
  "兵": "bing@chat.local",
  "沣": "feng@chat.local",
  "谢": "xie@chat.local",
  "周": "zhou@chat.local"
};

// 当前状态
let currentUser = null;
let currentNickname = "";
let currentAvatar = "";

// 对话上下文
let conversationMessages = [
  { role: "system", content: "你是一个有帮助的助手，使用中文回答。" }
];

// ========================
// 2. DOM 元素
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
const apiRounds = document.getElementById("api-rounds");
const apiLastTime = document.getElementById("api-last-time");
const apiStatus = document.getElementById("api-status");
const apiRespLen = document.getElementById("api-resp-len");

// 日志
const logContent = document.getElementById("log-content");

// ========================
// 3. 日志系统
// ========================
function addLog(message, type = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  entry.textContent = `[${time}] ${message}`;
  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight;
}

// ========================
// 4. 更新 API 信息
// ========================
function updateApiInfo(status, respLen = null) {
  apiModel.textContent = "deepseek-chat";
  apiRounds.textContent = conversationMessages.length - 1; // 减去 system 提示
  apiLastTime.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  apiStatus.textContent = status;
  if (respLen !== null) {
    apiRespLen.textContent = respLen + " 字符";
  } else {
    apiRespLen.textContent = "—";
  }
}

// ========================
// 5. 登录 / 退出
// ========================
loginBtn.addEventListener("click", async () => {
  const nickname = nicknameInput.value.trim();
  const password = passwordInput.value;
  if (!nickname || !password) {
    loginError.textContent = "请输入昵称和密码";
    return;
  }
  const email = NICKNAME_MAP[nickname];
  if (!email) {
    loginError.textContent = "昵称不存在";
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    loginError.textContent = "登录失败：" + error.message;
    return;
  }

  currentUser = data.user;
  currentNickname = nickname;
  currentAvatar = `avatars/${nickname}.png`;

  loginContainer.classList.add("hidden");
  appContainer.classList.remove("hidden");
  updateUserUI();
  loadDiscussion();
  addLog(`${nickname} 已登录`, "success");
  updateApiInfo("就绪");
});

function updateUserUI() {
  avatarSmall.src = currentAvatar;
  nicknameDisplay.textContent = currentNickname;
}

logoutBtn.addEventListener("click", async () => {
  addLog(`${currentNickname} 退出登录`, "info");
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
  logContent.innerHTML = "";
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
      addLog(`${currentNickname} 已自动登录`, "success");
      updateApiInfo("就绪");
    } else {
      await supabaseClient.auth.signOut();
    }
  }
}
checkSession();

// ========================
// 6. 对话功能
// ========================
sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || !currentUser) return;

  appendMessage("user", text);
  conversationMessages.push({ role: "user", content: text });
  userInput.value = "";
  userInput.style.height = "auto";
  sendBtn.disabled = true;
  addLog(`发送消息: ${text.slice(0, 30)}…`, "info");

  const assistantMsgDiv = appendMessage("assistant", "");
  let fullReply = "";

  const startTime = Date.now();
  updateApiInfo("请求中...");

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("No access token");

    const response = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({ messages: conversationMessages })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
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

    conversationMessages.push({ role: "assistant", content: fullReply });
    addLog(`接收完成 (${fullReply.length} 字符, 耗时 ${((Date.now() - startTime)/1000).toFixed(1)}s)`, "success");
    updateApiInfo("成功", fullReply.length);
  } catch (error) {
    assistantMsgDiv.querySelector(".message-bubble").textContent = "请求出错：" + error.message;
    addLog(`请求失败: ${error.message}`, "error");
    updateApiInfo("失败");
  } finally {
    sendBtn.disabled = false;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function appendMessage(role, content) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  const avatarSrc = role === "user" ? currentAvatar : "avatars/deepseek.png";
  row.innerHTML = `
    <img class="message-avatar" src="${avatarSrc}" alt="">
    <div class="message-bubble">${content}</div>
  `;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return row;
}

// ========================
// 7. 讨论区功能
// ========================
async function loadDiscussion() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    addLog(`加载讨论区失败: ${error.message}`, "error");
    return;
  }

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

sendDiscussionBtn.addEventListener("click", sendDiscussion);
discussionInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendDiscussion();
});

async function sendDiscussion() {
  const content = discussionInput.value.trim();
  if (!content || !currentUser) return;

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
    addLog(`讨论区发送失败: ${error.message}`, "error");
    return;
  }
  addLog(`${currentNickname} 在讨论区发言`, "info");
  discussionInput.value = "";
  loadDiscussion();
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}