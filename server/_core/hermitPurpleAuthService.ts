import axios, { type AxiosInstance } from "axios";
import { AXIOS_TIMEOUT_MS } from "../../shared/const.js";
import { ENV } from "./env";

export type LoginType = "SMS";

export type SmsType = "LOGIN_OR_REGISTER" | "FORGET_PASSWORD";

export interface ApiResponse<T> {
  success: boolean;
  code?: string | number;
  msg?: string;
  data?: T;
}

export interface UserLoginRequest {
  rePhone: string;
  password?: string;
  loginType: LoginType;
  smsType: SmsType;
  verificationCode: string;
  deviceId?: string;
  username?: string;
  idCard?: string;
  email?: string;
  userUUID?: string;
  loginToken?: string;
}

export interface UserVo {
  userUUID: string;
  username: string;
}

const HERMIT_PURPLE_BASE_URL = ENV.hermitPurpleBaseUrl;

const createHermitClient = (): AxiosInstance =>
  axios.create({
    baseURL: HERMIT_PURPLE_BASE_URL,
    timeout: AXIOS_TIMEOUT_MS,
  });

const client = createHermitClient();

function logHermitError(action: string, error: unknown) {
  if (axios.isAxiosError(error)) {
    console.error(`[HermitPurple] ${action} failed`, {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
    });
    return;
  }
  console.error(`[HermitPurple] ${action} failed`, error);
}

export async function sendSmsCode(
  phone: string,
  smsType: SmsType = "LOGIN_OR_REGISTER",
): Promise<string> {
  if (!HERMIT_PURPLE_BASE_URL) {
    throw new Error("HERMIT_PURPLE_BASE_URL is not configured");
  }

  try {
    const { data } = await client.get<ApiResponse<string>>("/api/fetchVerifyCode", {
      params: {
        smsType,
        phone,
      },
    });

    if (!data.success) {
      throw new Error(data.msg || "Failed to send verification code");
    }

    return data.data ?? "";
  } catch (error) {
    logHermitError("sendSmsCode", error);
    throw error;
  }
}

export async function loginBySmsCode(
  phone: string,
  code: string,
  options?: { smsType?: SmsType; deviceId?: string },
): Promise<UserVo> {
  if (!HERMIT_PURPLE_BASE_URL) {
    throw new Error("HERMIT_PURPLE_BASE_URL is not configured");
  }

  const body: UserLoginRequest = {
    rePhone: phone,
    verificationCode: code,
    loginType: "SMS",
    smsType: options?.smsType ?? "LOGIN_OR_REGISTER",
    deviceId: options?.deviceId,
  };

  try {
    const { data } = await client.post<ApiResponse<UserVo>>("/user/login", body);

    if (!data.success || !data.data) {
      throw new Error(data.msg || "Verification code login failed");
    }

    return data.data;
  } catch (error) {
    logHermitError("loginBySmsCode", error);
    throw error;
  }
}
