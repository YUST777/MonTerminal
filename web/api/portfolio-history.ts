import { getPortfolioHistory } from "../server/portfolioHistoryApi.ts";

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "private, max-age=60");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    return res.status(200).json(await getPortfolioHistory(req.body));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message.slice(0, 200) });
  }
}
