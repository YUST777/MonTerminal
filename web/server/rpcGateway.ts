const DEFAULT_UPSTREAMS = ["https://rpc.monad.xyz", "https://rpc1.monad.xyz"];
const MAX_BATCH = 50;
const MAX_BODY_BYTES = 256_000;

export interface RpcGatewayOptions {
  upstreams?: string[];
  timeoutMs?: number;
}

export function rpcUpstreams(raw?: string): string[] {
  const configured = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^https:\/\//.test(value));
  return configured.length > 0 ? configured : DEFAULT_UPSTREAMS;
}

function validateRequest(body: unknown) {
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH) throw new Error("Invalid RPC batch size");
  for (const call of calls) {
    if (!call || typeof call !== "object") throw new Error("Invalid JSON-RPC request");
    const method = (call as { method?: unknown }).method;
    if (typeof method !== "string" || !/^(eth|net|web3)_/.test(method)) {
      throw new Error("RPC method is not allowed");
    }
  }
}

export async function forwardRpc(body: unknown, options: RpcGatewayOptions = {}) {
  validateRequest(body);
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded) > MAX_BODY_BYTES) throw new Error("RPC request is too large");

  const errors: string[] = [];
  for (const upstream of options.upstreams ?? DEFAULT_UPSTREAMS) {
    try {
      const response = await fetch(upstream, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: encoded,
        signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
      });
      if (!response.ok) {
        errors.push(`${response.status} from ${new URL(upstream).host}`);
        continue;
      }
      const result = await response.json();
      return result;
    } catch (error) {
      errors.push((error as Error).message.slice(0, 80));
    }
  }
  throw new Error(`All Monad RPC upstreams failed: ${errors.join("; ")}`);
}
