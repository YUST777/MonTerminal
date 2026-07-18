import { forwardRpc, rpcUpstreams } from "../server/rpcGateway.ts";

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const result = await forwardRpc(req.body, {
      upstreams: rpcUpstreams(process.env.RPC_URLS || process.env.MONAD_RPC_URL),
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(502).json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: (error as Error).message } });
  }
}
