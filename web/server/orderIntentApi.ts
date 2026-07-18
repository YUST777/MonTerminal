import { normalizeSmartOrderPlan } from "../src/lib/orderIntent.ts";

interface MarketContext {
  tokenSymbol: string;
  tokenAddress: string;
  quoteSymbol: string;
  currentQuotePrice: number;
  currentUsdPrice: number | null;
}

interface ParseOrderRequest {
  text: string;
  market: MarketContext;
}

interface ModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function parseRequest(value: unknown): ParseOrderRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid request");
  const body = value as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 3) throw new Error("Describe the order you want to place");
  if (text.length > 600) throw new Error("Order instructions must be under 600 characters");
  if (!body.market || typeof body.market !== "object" || Array.isArray(body.market)) {
    throw new Error("Market context is missing");
  }
  const market = body.market as Record<string, unknown>;
  const tokenSymbol = String(market.tokenSymbol ?? "").slice(0, 32);
  const tokenAddress = String(market.tokenAddress ?? "").slice(0, 64);
  const quoteSymbol = String(market.quoteSymbol ?? "").slice(0, 32);
  const currentQuotePrice = Number(market.currentQuotePrice);
  const currentUsdPrice = market.currentUsdPrice == null ? null : Number(market.currentUsdPrice);
  if (!tokenSymbol || !tokenAddress || !quoteSymbol || !Number.isFinite(currentQuotePrice) || currentQuotePrice <= 0) {
    throw new Error("Current market price is unavailable");
  }
  return {
    text,
    market: {
      tokenSymbol,
      tokenAddress,
      quoteSymbol,
      currentQuotePrice,
      currentUsdPrice:
        currentUsdPrice != null && Number.isFinite(currentUsdPrice) && currentUsdPrice > 0
          ? currentUsdPrice
          : null,
    },
  };
}

function systemPrompt(market: MarketContext): string {
  return `You translate a trader's instruction into a transparent order plan for MonTerminal.

CURRENT MARKET
- token: ${market.tokenSymbol} (${market.tokenAddress})
- quote token: ${market.quoteSymbol}
- current token price: ${market.currentQuotePrice} ${market.quoteSymbol}
- current token USD price: ${market.currentUsdPrice ?? "unavailable"}

Return JSON only using exactly this shape:
{
  "summary": "short plain-English summary",
  "orders": [
    {
      "side": "buy" | "sell",
      "percent": number,
      "trigger": { "unit": "usd" | "quote" | "percent" | "multiple", "value": number },
      "label": "short human-readable order label"
    }
  ],
  "clarification": string | null
}

RULES
- Produce at most 6 orders.
- Percent means percent of the current ${market.tokenSymbol} balance for sells and percent of the current ${market.quoteSymbol} balance for buys.
- Percentages for all sells together must not exceed 100. Percentages for all buys together must not exceed 100.
- "$0.0003" is unit "usd". A price explicitly named in ${market.quoteSymbol} is unit "quote".
- A bare decimal price defaults to USD when USD price is available; otherwise it defaults to ${market.quoteSymbol}.
- "2x" is unit "multiple" with value 2. "down 30%" is unit "percent" with value -30.
- A sell above market becomes a take-profit. A sell below market becomes a stop-loss. Do not label that distinction incorrectly.
- A buy trigger must be below the current market price. If the user requests an impossible or unsafe buy above market, ask for clarification.
- If the user says "the rest", calculate the remaining percentage after earlier orders of that side.
- Never invent another token, wallet action, swap, leverage, bridge, transfer, or market order.
- Never claim an order has been executed. This output is only a draft that the user will review and sign.
- If the request is ambiguous or unsupported, return zero orders and one concise clarification question.
- The order labels must repeat the actual side, percentage, and trigger in clear language.`;
}

function stripJsonFence(content: string): string {
  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export async function createOrderIntent(
  input: unknown,
  config: ModelConfig,
): Promise<{ plan: ReturnType<typeof normalizeSmartOrderPlan>; model: string }> {
  const request = parseRequest(input);
  const baseUrl = config.baseUrl.replace(/\/$/, "").replace(/\/v1$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(request.market) },
          { role: "user", content: request.text },
        ],
      }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Model request failed (${response.status})`);
    }
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("The model returned no order plan");
    const plan = normalizeSmartOrderPlan(JSON.parse(stripJsonFence(content)));
    return { plan, model: String(payload?.model || config.model) };
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("The order planner timed out. Try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
