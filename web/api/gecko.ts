import { getGecko } from "../server/geckoGateway.ts";

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawPath = req.query?.path;
  const path = Array.isArray(rawPath) ? rawPath[0] : rawPath;
  try {
    const value = await getGecko(path);
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=300");
    return res.status(200).json(value);
  } catch (error) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: (error as Error).message.slice(0, 200) });
  }
}
