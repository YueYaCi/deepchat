# VTChat

一个供我和我的朋友四人使用的 AI 对话与实时讨论平台。前端托管于 GitHub Pages，后端服务完全由 Supabase 免费套餐承载。

---

## 功能概览

- **AI 对话区**（屏幕中央）：支持 DeepSeek V4 Pro、MiMo V2.5、Kimi K2.6 三个模型（有待完善...），流式输出，可实时切换模型。对话上下文仅在当前会话保留，刷新即清空。
- **实时讨论区**（屏幕右侧）：基于 Supabase Realtime 的多人聊天室，消息持久化存储，Enter 发送，Shift+Enter 换行。
- **API 状态面板**（屏幕左侧）：显示当前模型、API 地址、请求轮次、响应状态等运行时信息，附带结构化日志。
- **高级设置**：Temperature、Max Tokens、Top P、Presence/Frequency Penalty 等参数可调，按模型隔离配置，会话级持久化。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML5 / CSS3 / ES6+，无框架 |
| 部署 | GitHub Pages |
| 后端 | Supabase（PostgreSQL + Auth + Realtime + Edge Functions）|
| AI 代理 | Supabase Edge Function (`deepseek-proxy`)，Deno Runtime |

---

## 项目结构

```
vtchat/
├── index.html              # 入口，三栏布局
├── css/
│   └── style.css           # 深色主题、毛玻璃、响应式基础
├── js/
│   └── app.js              # 全部业务逻辑（模块化对象）
├── avatars/                # 用户与 AI 头像
│   ├── 兵.png
│   ├── 沣.png
│   ├── 谢.png
│   ├── 周.png
│   ├── deepseek.png
│   ├── xiaomi.png
│   └── kimi.png
└── images/
    └── background.jpg      # 登录页与主界面背景
```

> 注：本项目为纯静态前端，所有动态能力（登录、数据库、AI 请求）均通过 Supabase 客户端直连实现。

---

## 部署指南

### 1. 前置准备

- GitHub 账号（开启 Pages）
- Supabase 账号（免费计划即可）
- 三个 AI 平台的 API Key：DeepSeek、MiMo（小米）、Moonshot（Kimi）

### 2. Supabase 项目配置

#### 2.1 创建项目
在 Supabase Dashboard 新建项目，记下 **Project URL** 和 **Project API Key**（`anon/public`）。

#### 2.2 认证（Authentication）
路径：`Authentication → Providers → Email`

- 开启 Email 登录
- **关闭** "Confirm email"（项目使用假邮箱，无需真实验证）

手动创建 4 个用户：

| 昵称 | 邮箱 | 密码 |
|------|------|------|
| 兵 | `bing@chat.local` | `bing123` |
| 沣 | `feng@chat.local` | `feng123` |
| 谢 | `xie@chat.local` | `xie123` |
| 周 | `zhou@chat.local` | `zhou123` |

> 前端登录时只输入昵称，JS 内部映射到对应邮箱。

#### 2.3 数据库（Database）
在 SQL Editor 执行：

```sql
CREATE TABLE public.messages (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users not null,
  nickname text not null,
  content text not null,
  created_at timestamp with time zone default now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "允许已登录用户读取所有消息"
ON public.messages FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "允许用户插入自己的消息"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

#### 2.4 实时推送（Realtime）
执行以下 SQL 开启 `messages` 表的实时广播：

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
```

检查路径：`Database → Publications → supabase_realtime`，确认 `messages` 已勾选。

#### 2.5 Edge Function
路径：`Edge Functions → New Function`

- **函数名**：`deepseek-proxy`
- **部署方式**：Via Editor

将 `supabase/functions/deepseek-proxy/index.ts` 的完整代码粘贴进去（见下文），点击 **Deploy**。

#### 2.6 Secrets 配置
路径：`Settings → Edge Functions → Secrets`

| Secret | 说明 |
|--------|------|
| `DEEPSEEK_API_KEY` | DeepSeek 开放平台申请的 Key |
| `MIMO_API_KEY` | 小米 MiMo 的 Key |
| `KIMI_API_KEY` | Moonshot AI 的 Key |
| `DEEPSEEK_API_URL` | 可选，默认 `https://api.deepseek.com/v1/chat/completions` |
| `MIMO_API_URL` | 可选，默认 `https://api.xiaomimimo.com/v1/chat/completions` |
| `KIMI_API_URL` | 可选，默认 `https://api.moonshot.cn/v1/chat/completions` |

### 3. 前端配置

修改 `js/app.js` 顶部的 `CONFIG`：

```javascript
const CONFIG = {
  SUPABASE_URL: "https://你的项目.supabase.co",
  SUPABASE_ANON_KEY: "你的 anon key",
  // ...
};
```

如需调整用户映射，修改 `NICKNAME_MAP` 和对应密码（密码仅在 Supabase Auth 后台创建用户时使用，前端代码不存储密码）。

### 4. 推送至 GitHub Pages

1. 将本项目 push 到 GitHub 仓库。
2. 进入仓库 `Settings → Pages`，选择分支（如 `main` / `root`）并保存。
3. 等待约 1 分钟，通过分配的 `https://用户名.github.io/仓库名/` 访问。

---

## Edge Function 源码

文件：`supabase/functions/deepseek-proxy/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY")!;
const DEEPSEEK_API_URL = Deno.env.get("DEEPSEEK_API_URL") || "https://api.deepseek.com/v1/chat/completions";

const MIMO_API_KEY = Deno.env.get("MIMO_API_KEY")!;
const MIMO_API_URL = Deno.env.get("MIMO_API_URL") || "https://api.xiaomimimo.com/v1/chat/completions";

const KIMI_API_KEY = Deno.env.get("KIMI_API_KEY")!;
const KIMI_API_URL = Deno.env.get("KIMI_API_URL") || "https://api.moonshot.cn/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Expose-Headers": "X-Actual-API-URL",
      }
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  const { messages, provider, settings = {} } = await req.json();

  let apiUrl, apiKey, modelName;

  if (provider === 'mimo') {
    apiUrl = MIMO_API_URL;
    apiKey = MIMO_API_KEY;
    modelName = "mimo-v2.5";
  } else if (provider === 'kimi') {
    apiUrl = KIMI_API_URL;
    apiKey = KIMI_API_KEY;
    modelName = "kimi-k2-6";
  } else {
    apiUrl = DEEPSEEK_API_URL;
    apiKey = DEEPSEEK_API_KEY;
    modelName = "deepseek-v4-pro";
  }

  if (messages && messages.length > 0 && messages[0].model) {
    modelName = messages[0].model;
    delete messages[0].model;
  }

  try {
    const requestBody: Record<string, unknown> = {
      model: modelName,
      messages,
      stream: true,
      ...settings
    };

    Object.keys(requestBody).forEach(key => {
      if (requestBody[key] === undefined) delete requestBody[key];
    });

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Expose-Headers": "X-Actual-API-URL",
        "X-Actual-API-URL": apiUrl,
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
});
```

---

## 使用说明

1. 打开部署好的网址，输入昵称（兵/沣/谢/周）和密码登录。
2. 中间输入框与 AI 对话，左侧面板可切换模型或测试 API 连通性。
3. 右侧讨论区与在线的其他人实时聊天，消息自动同步。
4. 点击左侧"更多设置"可调整 Temperature、Max Tokens 等参数，设置随标签页会话保存。

---

## 已知限制与注意事项

- **Token 过期**：Supabase `access_token` 默认 1 小时过期，过期后 API 请求会返回 401，需手动重新登录。未实现自动刷新。
- **Kimi K2.6 温度约束**：官方要求思考模式固定 `temperature=1.0`，非思考模式固定 `temperature=0.6`，范围仅支持 `[0, 1]`。设置面板已做范围限制，但仍建议保持默认或按官方要求填写，否则将收到 `invalid_request_error`。
- **背景图**：`images/background.jpg` 需自行准备。若未放置，页面会回退到纯色背景 `#0d1117`。
- **头像**：`avatars/` 目录下的文件名必须与 `NICKNAME_MAP` 的键及模型 `provider` 严格对应，否则显示空白。

---

## License

本项目为私人用途，代码仅供参考学习。
