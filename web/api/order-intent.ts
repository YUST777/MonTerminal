import { createOrderIntent } from "../server/orderIntentApi.ts";

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.FREEMODEL_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Order planner is not configured" });

  try {
    const result = await createOrderIntent(req.body, {
      apiKey,
      baseUrl: process.env.FREEMODEL_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.freemodel.dev",
      model: process.env.FREEMODEL_MODEL || "gpt-5.4-mini",
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message.slice(0, 240) });
  }
}
