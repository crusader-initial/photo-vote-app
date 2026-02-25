import { promises as fs } from "fs";
import path from "path";
import { isOssConfigured, ossPut } from "./oss";

const STORAGE_DRIVER = process.env.STORAGE_DRIVER ?? "oss";
const LOCAL_PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
const REMOTE_UPLOAD_URL = process.env.OSS_UPLOAD_URL ?? "";

function normalizeKey(relKey: string): string {
  const clean = relKey.replace(/^\/+/, "");
  return clean.replace(/\.\.(\/|\\)/g, "");
}

async function localPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const uploadsDir = path.join(process.cwd(), "uploads");
  const targetPath = path.join(uploadsDir, key);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const body = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  await fs.writeFile(targetPath, body);

  const baseUrl = LOCAL_PUBLIC_BASE_URL.replace(/\/+$/, "");
  const url = baseUrl ? `${baseUrl}/uploads/${key}` : `/uploads/${key}`;
  return { key, url };
}

async function remotePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  if (!REMOTE_UPLOAD_URL) {
    throw new Error("OSS_UPLOAD_URL is not configured");
  }

  const key = normalizeKey(relKey);
  const lastSlash = key.lastIndexOf("/");
  const directory = lastSlash >= 0 ? key.slice(0, lastSlash) : "";
  const fileName = lastSlash >= 0 ? key.slice(lastSlash + 1) : key;

  const body = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const form = new FormData();
  form.append("file", new Blob([body], { type: contentType }), fileName || "file");
  form.append("directory", directory);
  form.append("fileName", fileName || "file");

  const response = await fetch(REMOTE_UPLOAD_URL, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Remote upload failed: ${response.status} ${text}`);
  }

  const result = (await response.json()) as {
    success?: boolean;
    data?: { url?: string };
    msg?: string;
  };

  if (!result?.success || !result?.data?.url) {
    throw new Error(result?.msg || "Remote upload returned invalid response");
  }

  return { key, url: result.data.url };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  if (STORAGE_DRIVER === "remote" || REMOTE_UPLOAD_URL) {
    return remotePut(relKey, data, contentType);
  }
  if (STORAGE_DRIVER === "local" || !isOssConfigured()) {
    return localPut(relKey, data, contentType);
  }
  return ossPut(relKey, data, contentType);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  return {
    key: relKey,
    url: "",
  };
}
