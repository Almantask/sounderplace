export interface Env {
  DB: D1Database
  AUDIO: R2Bucket
  VECTORS?: VectorizeIndex
  SESSION_SECRET: string
  APP_URL: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  OPERATOR_TOKEN?: string
  ALLOW_DEV_LOGIN?: string
  DONATE_CENTS?: string
}
