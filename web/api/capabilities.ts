export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({
    orderPlannerConfigured: Boolean(process.env.FREEMODEL_API_KEY || process.env.OPENAI_API_KEY),
    keeperPubliclyVerified: false,
  });
}
