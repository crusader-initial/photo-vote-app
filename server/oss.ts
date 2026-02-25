/**
 * 直连公司 OSS（S3 兼容）上传/下载
 * 使用环境变量：OSS_ENDPOINT, OSS_ACCESS_KEY, OSS_SECRET_KEY, OSS_BUCKET, OSS_PUBLIC_BASE_URL
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const OSS_ENDPOINT = process.env.OSS_ENDPOINT ?? "";
const OSS_ACCESS_KEY = process.env.OSS_ACCESS_KEY ?? "";
const OSS_SECRET_KEY = process.env.OSS_SECRET_KEY ?? "";
const OSS_BUCKET = process.env.OSS_BUCKET ?? "";
/** 文件公网/内网访问的基础 URL，例如 http://pf-hermit-purple.oss.corp.qunar.com/hermit-purple */
const OSS_PUBLIC_BASE_URL =
  process.env.OSS_PUBLIC_BASE_URL ?? "https://qimgs.qunarzz.com";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function buildObjectKey(): string {
  return `hermit-purple-${randomUUID()}`;
}

function getClient(): S3Client {
  if (!OSS_ENDPOINT || !OSS_ACCESS_KEY || !OSS_SECRET_KEY || !OSS_BUCKET) {
    throw new Error(
      "OSS credentials missing: set OSS_ENDPOINT, OSS_ACCESS_KEY, OSS_SECRET_KEY, OSS_BUCKET",
    );
  }
  const endpoint = OSS_ENDPOINT.replace(/\/+$/, "");
  return new S3Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: OSS_ACCESS_KEY,
      secretAccessKey: OSS_SECRET_KEY,
    },
    endpoint,
    forcePathStyle: true,
  });
}

function isOssConfigured(): boolean {
  return !!(OSS_ENDPOINT && OSS_ACCESS_KEY && OSS_SECRET_KEY && OSS_BUCKET);
}

/**
 * 上传文件到 OSS，返回可访问的 URL。
 */
export async function ossPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const client = getClient();
  const key = buildObjectKey();
  const body = typeof data === "string" ? Buffer.from(data, "utf8") : data;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: OSS_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  } catch (error: any) {
    const metadata = error?.$metadata ?? {};
    console.error("[OSS] Upload failed", {
      bucket: OSS_BUCKET,
      key,
      endpoint: OSS_ENDPOINT,
      statusCode: metadata.httpStatusCode,
      requestId: metadata.requestId,
      extendedRequestId: metadata.extendedRequestId,
      errorName: error?.name,
      errorCode: error?.Code ?? error?.code,
      message: error?.message,
    });
    throw error;
  }

  const baseUrl = (OSS_PUBLIC_BASE_URL || `${OSS_ENDPOINT}/${OSS_BUCKET}`).replace(
    /\/+$/,
    "",
  );
  const url = `${baseUrl}/${key}`;
  return { key, url };
}

export { isOssConfigured };
