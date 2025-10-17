import { z } from "zod";

const rawEnv = {
  PORT: process.env.PORT,
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION
};

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  AZURE_OPENAI_ENDPOINT: z
    .string()
    .url()
    .optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_API_VERSION: z.string().default("2024-05-01-preview")
});

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error("Environment validation error:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. Check .env.local values.");
}

const env = parsed.data;

const azureConfigured =
  Boolean(env.AZURE_OPENAI_ENDPOINT) &&
  Boolean(env.AZURE_OPENAI_DEPLOYMENT) &&
  Boolean(env.AZURE_OPENAI_API_KEY);

export const runtimeEnv = {
  ...env,
  azure: {
    configured: azureConfigured,
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    deployment: env.AZURE_OPENAI_DEPLOYMENT,
    apiVersion: env.AZURE_OPENAI_API_VERSION,
    apiKey: env.AZURE_OPENAI_API_KEY
  }
};
