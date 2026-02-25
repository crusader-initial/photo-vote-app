export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // 公司 OSS 直连（S3 兼容）
  ossEndpoint: process.env.OSS_ENDPOINT ?? "",
  ossAccessKey: process.env.OSS_ACCESS_KEY ?? "",
  ossSecretKey: process.env.OSS_SECRET_KEY ?? "",
  ossBucket: process.env.OSS_BUCKET ?? "",
  ossPublicBaseUrl: process.env.OSS_PUBLIC_BASE_URL ?? "",
  hermitPurpleBaseUrl: process.env.HERMIT_PURPLE_BASE_URL ?? "",
};
