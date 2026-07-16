import { z } from "zod";

const envSchema = z.object({
  RPC_URLS: z
    .string()
    .default("https://rpc.monad.xyz,https://rpc1.monad.xyz,https://rpc2.monad.xyz,https://rpc3.monad.xyz")
    .transform((s) => s.split(",").map((u) => u.trim()).filter(Boolean)),
  PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "PRIVATE_KEY must be a 0x-prefixed 32-byte hex"),
  // Books + deploy blocks come from @monolimit/shared MARKETS.
  POLL_MS: z.coerce.number().int().min(200).default(1000),
  DRY_RUN: z
    .string()
    .default("true")
    .transform((s) => s !== "false" && s !== "0"),
  LOG_LEVEL: z.string().default("info"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid keeper configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}
