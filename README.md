# Photo Vote App

照片投票应用：用户创建投票卡片（上传 2–4 张照片并预测会被选中的一张），其他用户投票并查看结果。支持收藏、评论、自猜等能力。

本文档面向**其他开发者**，说明技术栈、数据库、本地启动与文件存储等。

---

## 一、技术栈与组成

### 1.1 整体架构

- **前端**：Expo (React Native) + Expo Router，支持 **Web** 与 **Android**（可扩展 iOS）
- **后端**：Node.js + Express，单进程，默认端口 3000
- **API**：tRPC（类型安全、基于 HTTP batch），路径 `/api/trpc`
- **数据库**：MySQL，通过 Drizzle ORM 访问
- **认证**：可选 OAuth（Manus 体系） + JWT Cookie；本地/匿名场景以 `deviceId` 区分用户

### 1.2 前端技术

| 类别     | 技术 |
|----------|------|
| 框架     | React 19、React Native、Expo SDK 54 |
| 路由     | Expo Router（基于 file-based routing） |
| 样式     | NativeWind (Tailwind for RN) |
| 状态/请求 | TanStack React Query + tRPC React |
| 构建/开发 | Metro（Expo 默认），Web 端口 8081 |

主要目录：

- `app/`：页面与路由（`_layout.tsx`、`(tabs)/`、`create.tsx`、`vote.tsx`、`result.tsx` 等）
- `components/`：通用 UI（如 `history-drawer`、`photo-card`、`progress-ring`）
- `lib/`：tRPC 客户端、主题、工具函数
- `constants/`：OAuth、主题等配置
- `hooks/`：鉴权、设备 ID、主题等

### 1.3 后端技术

| 类别     | 技术 |
|----------|------|
| 运行时   | Node.js，开发用 `tsx watch`，生产可打包为 `dist/index.js` |
| 框架     | Express |
| API      | tRPC（Express adapter），路由挂载在 `/api/trpc` |
| 数据库   | Drizzle ORM + MySQL（见下一节） |
| 认证     | JWT（jose）、Cookie、可选 OAuth 回调 |

主要目录：

- `server/_core/`：Express 入口、tRPC context、OAuth、Cookie、环境变量等
- `server/routers.ts`：业务 tRPC 路由（cards、votes、comments、favorites、auth 等）
- `server/db.ts`：所有数据库访问封装
- `server/storage.ts`：云存储上传/下载封装（Forge 代理）
- `drizzle/`：Schema、迁移、relations

---

## 二、数据库

### 2.1 类型与驱动

- **数据库**：MySQL
- **ORM**：Drizzle
- **连接**：通过环境变量 `DATABASE_URL`（例如 `mysql://user:pass@host:3306/dbname`）

### 2.2 Schema 概览（`drizzle/schema.ts`）

| 表名       | 说明 |
|------------|------|
| `users`    | 用户（OAuth openId、name、email、role 等） |
| `cards`    | 投票卡片：创建者 deviceId、预测照片下标、总票数、是否已满 30 票等 |
| `photos`   | 卡片下的照片：cardId、url、photoIndex(0–3)、voteCount |
| `votes`    | 单次投票：cardId、photoId、deviceId、voteDate（用于按天限流） |
| `comments` | 评论：cardId、parentId（楼中楼）、deviceId、content |
| `favorites`| 收藏：cardId、deviceId |

### 2.3 迁移

- Schema 定义：`drizzle/schema.ts`
- 迁移文件：`drizzle/*.sql`，由 Drizzle Kit 生成
- 执行迁移（生成并应用）：

```bash
pnpm db:push
```

依赖：已配置 `DATABASE_URL`（见下文「环境变量」）。

---

## 三、本地启动

### 3.1 环境要求

- Node.js（建议 LTS）
- pnpm（项目使用 `pnpm`，见 `packageManager`）
- MySQL：本地或远程实例，并创建好数据库
- （可选）Android 开发环境：跑真机/模拟器时需 Android Studio / SDK

### 3.2 环境变量

在项目根目录创建 `.env`（已加入 `.gitignore`，不会提交）。常用变量：

**后端 / 数据库**

| 变量名         | 说明 |
|----------------|------|
| `DATABASE_URL` | MySQL 连接串，例如 `mysql://user:password@localhost:3306/photo_vote` |
| `JWT_SECRET`   | JWT 签名密钥（OAuth 登录等） |
| `PORT`         | 后端端口，默认 3000 |

**前端 / 客户端**

| 变量名                         | 说明 |
|--------------------------------|------|
| `EXPO_PUBLIC_API_BASE_URL`     | 前端请求的后端地址。本地网页可留空（会使用 localhost:3000）；**手机调试时填电脑局域网 IP**，如 `http://192.168.1.100:3000` |
| `EXPO_PUBLIC_OAUTH_PORTAL_URL` | OAuth 门户地址（可选） |
| `EXPO_PUBLIC_OAUTH_SERVER_URL` | OAuth 服务地址（可选） |
| `EXPO_PUBLIC_APP_ID`           | 应用 ID（可选） |
| `EXPO_PUBLIC_OWNER_OPEN_ID`    | 所有者 OpenID（可选） |

**云存储（可选）**

优先使用**公司 OSS 直连**（S3 兼容），配置后照片/文件会直接上传到 OSS：

| 变量名                 | 说明 |
|------------------------|------|
| `OSS_ENDPOINT`         | OSS 地址，如 `http://pf-hermit-purple.oss.corp.qunar.com` |
| `OSS_ACCESS_KEY`       | OSS Access Key |
| `OSS_SECRET_KEY`       | OSS Secret Key |
| `OSS_BUCKET`           | Bucket 名（即 object.key），如 `hermit-purple` |
| `OSS_PUBLIC_BASE_URL`  | （可选）文件访问基础 URL，不填则用 `OSS_ENDPOINT/OSS_BUCKET` |

若未配置 OSS，则使用 **Forge 存储代理**：

| 变量名                   | 说明 |
|--------------------------|------|
| `BUILT_IN_FORGE_API_URL` | Forge 存储代理 base URL |
| `BUILT_IN_FORGE_API_KEY` | Forge 存储代理 API Key |

以上都未配置或为占位值时，上传会走**本地文件存储**（见第四节）。**请勿将 OSS/Forge 密钥提交到 Git，仅放在 `.env` 中。**

### 3.3 安装依赖与数据库

```bash
cd photo-vote-app
pnpm install
```

确保 MySQL 已启动，并在 `.env` 中配置好 `DATABASE_URL`，然后执行：

```bash
pnpm db:push
```

### 3.4 启动方式

| 场景           | 命令              | 访问地址 |
|----------------|-------------------|----------|
| **推荐：后端 + Web** | `pnpm dev`        | 后端 API：<http://localhost:3000>，网页：<http://localhost:8081> |
| 仅后端         | `pnpm dev:server` | <http://localhost:3000> |
| 仅网页（需先起后端） | `pnpm dev:metro`  | <http://localhost:8081> |
| Android（Expo Go） | `pnpm dev` 后按 `a` 或扫码 | 同 Metro，API 需配置 `EXPO_PUBLIC_API_BASE_URL` 为电脑局域网 IP |
| Android 开发包   | `pnpm dev` + 另开终端 `npx expo run:android` | 同上 |

**一条命令启动后端 + 网页：**

```bash
pnpm dev
```

会同时启动：

1. **后端**：`http://localhost:3000`（API + 健康检查 `/api/health`）
2. **Metro（含 Web）**：`http://localhost:8081`

浏览器打开 **http://localhost:8081** 使用网页版；前端会自动请求 `http://localhost:3000` 的 API。

**仅后端：**

```bash
pnpm dev:server
```

**仅 Metro（Web）：**

需先有后端在跑，再在另一终端：

```bash
pnpm dev:metro
```

**Android：**

- 使用 Expo Go：在 `pnpm dev` 的终端里按 `a`，或手机扫二维码
- 开发版 APK：先 `pnpm dev`，再另开终端执行 `npx expo run:android`

### 3.5 应用图标（更换后仍显示旧图标时）

应用图标是在**构建时**写入安装包的，不是运行时从 `assets` 读取。因此只替换 `assets/images/icon.png` 后，**必须重新构建并重新安装**才会看到新图标。

- **若当前是用 Expo Go 扫码运行**：Expo Go 里显示的一直是 Expo Go 的图标，不是本应用的图标。要看到自定义图标，需打**开发包**或**正式包**并安装到设备（见下）。
- **若已安装过开发包/正式包**：
  1. 先**卸载**设备上的旧应用（避免系统或启动器缓存旧图标）。
  2. 再重新构建并安装：
     - 本地：`npx expo prebuild --clean` 后执行 `npx expo run:android`（或 iOS 对应命令）。
     - EAS：重新执行一次 `eas build`，安装新生成的安装包。
  3. 安装完成后，新图标才会出现在桌面/启动器。

**图标资源位置**（`app.config.ts` 中配置）：

| 用途 | 文件路径 |
|------|----------|
| 通用 / iOS | `assets/images/icon.png` |
| Android 桌面（自适应图标） | `assets/images/android-icon-foreground.png`、`android-icon-background.png`、`android-icon-monochrome.png` |
| Web  favicon | `assets/images/favicon.png` |
| 启动屏 | `assets/images/splash-icon.png` |

若只在 Android 上看到旧图标，请确认已同步更新上述 **Android 自适应图标** 三张图并重新构建。

手机访问后端时，请将 `.env` 中 `EXPO_PUBLIC_API_BASE_URL` 设为电脑局域网 IP（如 `http://192.168.1.100:3000`），并确保手机与电脑在同一 WiFi。

### 3.5 常用脚本

| 命令           | 说明 |
|----------------|------|
| `pnpm dev`     | 后端 + Metro（Web），一次启动 |
| `pnpm dev:server` | 仅后端 |
| `pnpm dev:metro`  | 仅 Metro（Web） |
| `pnpm dev:android`| 后端 + 仅 Android 入口 |
| `pnpm db:push` | 生成并执行 Drizzle 迁移 |
| `pnpm test`    | 运行测试（Vitest） |
| `pnpm check`   | TypeScript 检查 |
| `pnpm build`   | 打包后端到 `dist/` |

更多见 `package.json` 的 `scripts`。

---

## 四、文件存储

应用需要存储**用户上传的投票照片**。支持两种方式：**本地磁盘** 与 **云存储（Forge 代理）**。

### 4.1 策略选择

- **云存储**：当配置了 `BUILT_IN_FORGE_API_URL` 与 `BUILT_IN_FORGE_API_KEY`（且非占位值 `your-api-key`）时，创建卡片时的照片会通过 `server/storage.ts` 上传到 Forge 代理（返回可访问 URL）。
- **本地存储**：未配置或为占位值时，照片写入项目下的 **`uploads/`** 目录，并通过 Express 静态资源对外提供。

逻辑在 `server/routers.ts` 的 `cards.create` 中：根据环境变量决定走 `storagePut` 还是本地写入。

### 4.2 本地存储

- **目录**：项目根目录下的 `uploads/`（已在 `.gitignore` 中忽略内容，仅保留 `uploads/.gitkeep`）。
- **命名**：`card-{cardId}-photo-{index}-{random}.{ext}`，避免冲突。
- **访问**：Express 挂载静态目录 `app.use('/uploads', express.static('uploads'))`，因此照片 URL 形如：
  - 本地：`http://localhost:3000/uploads/xxx.jpg`
  - 或 `EXPO_PUBLIC_API_BASE_URL` + `/uploads/xxx.jpg`

本地开发若不配置 Forge，默认就是本地存储，无需额外配置。

### 4.3 云存储（Forge）

- **封装**：`server/storage.ts`，提供 `storagePut(relKey, data, contentType)`、`storageGet(relKey)`。
- **依赖环境变量**：`BUILT_IN_FORGE_API_URL`、`BUILT_IN_FORGE_API_KEY`。
- 上传后数据库 `photos.url` 存的是云存储返回的访问 URL；不经过本地 `uploads/`。

其他使用到存储的功能（如语音转写、图像生成）若用到 Forge，同样依赖上述两个环境变量。

---

## 五、目录结构速览

```
photo-vote-app/
├── app/                    # Expo Router 页面
│   ├── _layout.tsx
│   ├── (tabs)/              # 底部 Tab
│   ├── create.tsx           # 创建投票卡
│   ├── vote.tsx             # 投票页
│   ├── result.tsx           # 结果页
│   ├── favorites.tsx        # 收藏
│   ├── oauth/callback.tsx    # OAuth 回调
│   └── ...
├── components/              # 通用组件
├── constants/               # 前端常量（OAuth、主题等）
├── drizzle/
│   ├── schema.ts            # 表结构
│   ├── relations.ts
│   └── *.sql                # 迁移
├── server/
│   ├── _core/               # 服务端核心（Express、tRPC、OAuth、Cookie、env）
│   ├── routers.ts           # tRPC 路由
│   ├── db.ts                # 数据库封装
│   └── storage.ts           # 云存储封装
├── lib/                     # 前端库（trpc、auth、theme 等）
├── hooks/
├── shared/                  # 前后端共享常量/类型
├── uploads/                 # 本地上传目录（不提交）
├── .env                     # 环境变量（不提交）
├── package.json
├── drizzle.config.ts
├── DEVELOPMENT.md           # 本地开发说明（网页 + APP）
└── README.md                # 本说明文档
```

---

## 六、扩展说明

- **OAuth**：若不需要登录，可不配置 OAuth 相关环境变量；应用仍可通过 `deviceId` 完成投票、评论、收藏等。
- **数据库**：新增表或字段时，改 `drizzle/schema.ts`，再执行 `pnpm db:push` 生成并应用迁移。
- **API 约定**：所有业务接口均通过 tRPC 暴露，类型与 `server/routers.ts`、`drizzle/schema.ts` 一致，前端通过 `lib/trpc.ts` 的 client 调用。

更细的本地开发与端口说明见 **DEVELOPMENT.md**。
