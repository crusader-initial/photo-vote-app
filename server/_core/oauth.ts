import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { getUserByOpenId, getUserByPhone, createUserWithPhone, createUserByPhone, upsertUser } from "../db";
import { phoneToOpenId } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { hashPassword, verifyPassword } from "./password";
import { sdk } from "./sdk";
import { loginBySmsCode, sendSmsCode } from "./hermitPurpleAuthService";

/** 中国大陆手机号：1 开头，第二位 3-9，共 11 位 */
const PHONE_REGEX = /^1[3-9]\d{9}$/;

function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone.trim());
}

function isValidVerificationCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

async function syncUser(userInfo: {
  openId?: string | null;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
}) {
  if (!userInfo.openId) {
    throw new Error("openId missing from user info");
  }

  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return (
    saved ?? {
      openId: userInfo.openId,
      name: userInfo.name,
      email: userInfo.email,
      loginMethod: userInfo.loginMethod ?? null,
      lastSignedIn,
    }
  );
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    | {
        id?: number;
        openId: string;
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        loginMethod?: string | null;
        lastSignedIn?: Date | null;
      },
) {
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    phone: (user as any)?.phone ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect to the frontend URL (Expo web on port 8081)
      // Cookie is set with parent domain so it works across both 3000 and 8081 subdomains
      const frontendUrl =
        process.env.EXPO_WEB_PREVIEW_URL ||
        process.env.EXPO_PACKAGER_PROXY_URL ||
        "http://localhost:8081";
      res.redirect(302, frontendUrl);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  app.get("/api/oauth/mobile", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);

      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        app_session_id: sessionToken,
        user: buildUserResponse(user),
      });
    } catch (error) {
      console.error("[OAuth] Mobile exchange failed", error);
      res.status(500).json({ error: "OAuth mobile exchange failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Get current authenticated user - works with both cookie (web) and Bearer token (mobile)
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/me failed:", error);
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  app.post("/api/auth/phone-send-code", async (req: Request, res: Response) => {
    try {
      const { phone } = req.body as { phone?: string };
      const raw = typeof phone === "string" ? phone.trim() : "";
      if (!raw) {
        res.status(400).json({ error: "请输入手机号" });
        return;
      }
      if (!isValidPhone(raw)) {
        res.status(400).json({ error: "请输入正确的手机号" });
        return;
      }

      await sendSmsCode(raw, "LOGIN_OR_REGISTER");

      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] phone-send-code failed:", error);
      const message = error instanceof Error ? error.message : "发送失败";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/auth/phone-login", async (req: Request, res: Response) => {
    try {
      const { phone, code } = req.body as { phone?: string; code?: string };
      const raw = typeof phone === "string" ? phone.trim() : "";
      if (!raw) {
        res.status(400).json({ error: "请输入手机号" });
        return;
      }
      if (!isValidPhone(raw)) {
        res.status(400).json({ error: "请输入正确的手机号" });
        return;
      }
      const codeStr = typeof code === "string" ? code.trim() : "";
      if (!isValidVerificationCode(codeStr)) {
        res.status(400).json({ error: "请输入 6 位验证码" });
        return;
      }

      // 调用 Java 服务完成短信验证码校验与登录/注册
      const hermitUser = await loginBySmsCode(raw, codeStr, { smsType: "LOGIN_OR_REGISTER" });
      const hermitUserUUID = hermitUser.userUUID;

      let user = await getUserByPhone(raw);
      if (!user) {
        user = await createUserByPhone(raw, hermitUserUUID);
      }
      if (!user) {
        res.status(500).json({ error: "登录失败" });
        return;
      }
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.phone ?? "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ user: buildUserResponse(user), token: sessionToken });
    } catch (error) {
      console.error("[Auth] phone-login failed:", error);
      const message = error instanceof Error ? error.message : "登录失败";
      res.status(500).json({ error: message });
    }
  });

  // Phone register (password): keep for backward compatibility
  app.post("/api/auth/phone-register", async (req: Request, res: Response) => {
    try {
      const { phone, password } = req.body as { phone?: string; password?: string };
      const raw = typeof phone === "string" ? phone.trim() : "";
      if (!raw || !isValidPhone(raw)) {
        res.status(400).json({ error: "请输入正确手机号" });
        return;
      }
      const pwd = typeof password === "string" ? password : "";
      if (pwd.length < 6) {
        res.status(400).json({ error: "密码至少 6 位" });
        return;
      }
      const existing = await getUserByPhone(raw);
      if (existing) {
        res.status(400).json({ error: "该手机号已注册" });
        return;
      }
      const passwordHash = hashPassword(pwd);
      const user = await createUserWithPhone(raw, passwordHash);
      if (!user) {
        res.status(500).json({ error: "注册失败" });
        return;
      }
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.phone ?? "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.status(201).json({ user: buildUserResponse(user), token: sessionToken });
    } catch (error) {
      console.error("[Auth] phone-register failed:", error);
      const message = error instanceof Error ? error.message : "注册失败";
      res.status(500).json({ error: message });
    }
  });

  // Establish session cookie from Bearer token
  // Used by iframe preview: frontend receives token via postMessage, then calls this endpoint
  // to get a proper Set-Cookie response from the backend (3000-xxx domain)
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      // Authenticate using Bearer token from Authorization header
      const user = await sdk.authenticateRequest(req);

      // Get the token from the Authorization header to set as cookie
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();

      // Set cookie for this domain (3000-xxx)
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/session failed:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
