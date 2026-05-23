// ========================
// 1. 初始化 Supabase 客户端（变量名改为 supabaseClient）
// ========================
const SUPABASE_URL = "https://afvukqjluoxzuouhiufw.supabase.co"; // 替换为你的 Project URL
const SUPABASE_ANON_KEY = "sb_publishable_1qYYVcrzSjwy8_-41Eeuig_dAjU9Zqd"; // 替换为你的 Publishable key

// 使用 window.supabase.createClient 创建实例，命名为 supabaseClient 避免冲突
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 昵称 → 内部邮箱映射
const NICKNAME_MAP = {
  "兵": "bing@chat.local",
  "沣": "feng@chat.local",
  "谢": "xie@chat.local",
  "周": "zhou@chat.local"
};

// 当前用户状态
let currentUser = null;
let currentNickname = "";
let currentAvatar = "";

// ========================
// 2. DOM 元素引用
// ========================
const loginContainer = document.getElementById("login-container");
const chatContainer = document.getElementById("chat-container");
const nicknameInput = document.getElementById("nickname-input");
const passwordInput = document.getElementById("password-input");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");

const avatarSmall = document.getElementById("avatar-small");
const nicknameDisplay = document.getElementById("nickname-display");
const discussionBtn = document.getElementById("discussion-btn");
const logoutBtn = document.getElementById("logout-btn");

const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

const modalOverlay = document.getElementById("modal-overlay");
const closeDiscussionBtn = document.getElementById("close-discussion");
const discussionMessages = document.getElementById("discussion-messages");
const discussionInput = document.getElementById("discussion-input");
const sendDiscussionBtn = document.getElementById("send-discussion-btn");

// 对话上下文（每次登录清空，符合不保存历史）
let conversationMessages = [
  { role: "system", content: "你是一个有帮助的助手，使用中文回答。" }
];

// ========================
// 3. 登录与退出
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

  // 使用 supabaseClient 代替 supabase
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
  chatContainer.classList.remove("hidden");
  updateUIWithUser();
  loadDiscussion();
});

function updateUIWithUser() {
  avatarSmall.src = currentAvatar;
  nicknameDisplay.textContent = currentNickname;
}

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  currentUser = null;
  chatContainer.classList.add("hidden");
  loginContainer.classList.remove("hidden");
  nicknameInput.value = "";
  passwordInput.value = "";
  loginError.textContent = "";
  chatMessages.innerHTML = "";
  conversationMessages = [
    { role: "system", content: "你是一个有帮助的助手，使用中文回答。" }
  ];
  modalOverlay.classList.add("hidden");
});

// 会话保持：刷新页面时检查登录状态
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
      chatContainer.classList.remove("hidden");
      updateUIWithUser();
      loadDiscussion();
    } else {
      await supabaseClient.auth.signOut();
    }
  }
}
checkSession();

// ========================
// 4. 对话功能（调用 Edge Function 流式响应）
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

  const assistantMsgDiv = appendMessage("assistant", "");
  let fullReply = "";

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
  } catch (error) {
    assistantMsgDiv.querySelector(".message-bubble").textContent = "请求出错：" + error.message;
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
// 5. 讨论区功能（读写 Supabase 数据库）
// ========================
discussionBtn.addEventListener("click", () => {
  modalOverlay.classList.remove("hidden");
  loadDiscussion();
});

closeDiscussionBtn.addEventListener("click", () => {
  modalOverlay.classList.add("hidden");
});

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) {
    modalOverlay.classList.add("hidden");
  }
});

async function loadDiscussion() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("加载讨论区失败", error);
    return;
  }

  discussionMessages.innerHTML = "";
  data.forEach(msg => {
    const msgDiv = document.createElement("div");
    msgDiv.className = "discuss-msg";
    const avatarFile = `avatars/${msg.nickname}.png`;
    msgDiv.innerHTML = `
      <img class="discuss-avatar" src="${avatarFile}" alt="">
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
    alert("发送失败：" + error.message);
    return;
  }
  discussionInput.value = "";
  loadDiscussion();
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}