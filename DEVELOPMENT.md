# 本地开发：同时使用网页版和 APP

让**后端**、**网页前端**和 **APP 前端**一起跑，网页和手机都能正常访问接口。

---

## 一、一条命令同时启动后端 + 网页 + APP 入口

在项目根目录执行：

```bash
pnpm dev
```

会同时启动：

1. **后端**：`http://localhost:3000`（API）
2. **Expo（含网页）**：Metro + 网页，默认 `http://localhost:8081`

网页和 APP 共用同一个 Metro，后端单独一个进程。

---

## 二、使用方式

### 网页版

1. 保持 `pnpm dev` 运行。
2. 浏览器打开：**http://localhost:8081**
3. 网页会请求 **http://localhost:3000** 的 API（代码里已对 localhost 做了处理）。

### APP（Android）

**方式 A：Expo Go**

1. 手机和电脑在同一 WiFi。
2. 保持 `pnpm dev` 运行，在终端里按 **`a`** 用 Expo Go 打开 Android。
3. 或手机装 Expo Go 后扫终端里出现的二维码。

**方式 B：开发版 APK（不依赖 Expo Go）**

1. 先装好 Android 开发环境（Android Studio / SDK）。
2. 终端 1：`pnpm dev`（保持运行）。
3. 终端 2：`npx expo run:android`，会编译并安装到手机/模拟器，并连到当前 Metro。

手机要能访问你电脑的后端，需要在 `.env` 里把 `EXPO_PUBLIC_API_BASE_URL` 设成**电脑在局域网里的 IP**，例如：

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000
```

（把 `192.168.1.100` 换成你电脑的 IP，可在命令行用 `ipconfig` / `ifconfig` 查看。）

---

## 三、环境与端口

| 用途     | 地址/端口        | 说明                          |
|----------|------------------|-------------------------------|
| 后端 API | `localhost:3000` | 网页和 APP 都连这个（网页用 localhost，APP 用上面说的 IP） |
| 网页     | `localhost:8081` | `pnpm dev` 里的 Metro 提供    |
| APP      | 同 Metro         | 通过 Expo Go 或 `expo run:android` 连到 8081 |

---

## 四、常见问题

- **网页“Failed to fetch”**  
  确保后端已起来（`pnpm dev` 里应能看到 server 在跑），且浏览器访问的是 **http://localhost:8081**。网页端会自动用 `localhost:3000` 调 API。

- **手机连不上后端**  
  检查 `.env` 里 `EXPO_PUBLIC_API_BASE_URL` 是否为电脑局域网 IP（如 `http://192.168.x.x:3000`），且手机和电脑在同一 WiFi。

- **只想跑网页**  
  同样用 `pnpm dev`，只开浏览器访问 8081 即可；APP 不连也没关系。

- **只想跑 APP、不要网页**  
  可用：`pnpm dev:android`（后端 + 只开 Android），或先 `pnpm dev:server`，再另开终端 `pnpm start:android`。

总结：**平时开发网页 + APP 一起用时，一条 `pnpm dev` 即可；网页开 8081，APP 通过 Expo 连同一 Metro，并保证 APP 的 `.env` 里 API 地址是电脑局域网 IP。**
