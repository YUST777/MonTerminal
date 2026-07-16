import pino from "pino";

export function createLogger(level: string) {
  return pino({
    level,
    transport: process.stdout.isTTY
      ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
