export const MAX_SMART_ORDERS = 6;

export type OrderSide = "buy" | "sell";
export type TriggerUnit = "usd" | "quote" | "percent" | "multiple";

export interface SmartOrderIntent {
  side: OrderSide;
  percent: number;
  trigger: {
    unit: TriggerUnit;
    value: number;
  };
  label: string;
}

export interface SmartOrderPlan {
  summary: string;
  orders: SmartOrderIntent[];
  clarification: string | null;
}

export interface PriceContext {
  currentQuotePrice: number;
  currentUsdPrice: number | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The model returned an invalid order plan");
  }
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
}

export function normalizeSmartOrderPlan(value: unknown): SmartOrderPlan {
  const root = asRecord(value);
  const summary = typeof root.summary === "string" ? root.summary.trim().slice(0, 180) : "";
  const clarification =
    typeof root.clarification === "string" && root.clarification.trim()
      ? root.clarification.trim().slice(0, 240)
      : null;
  if (!Array.isArray(root.orders)) throw new Error("The model did not return an orders array");
  if (root.orders.length > MAX_SMART_ORDERS) {
    throw new Error(`A plan can contain at most ${MAX_SMART_ORDERS} orders`);
  }

  const orders = root.orders.map((entry, index): SmartOrderIntent => {
    const order = asRecord(entry);
    if (order.side !== "buy" && order.side !== "sell") {
      throw new Error(`Order ${index + 1} has an invalid side`);
    }
    const percent = finiteNumber(order.percent, `percentage for order ${index + 1}`);
    if (percent <= 0 || percent > 100) {
      throw new Error(`Order ${index + 1} percentage must be between 0 and 100`);
    }
    const trigger = asRecord(order.trigger);
    if (
      trigger.unit !== "usd" &&
      trigger.unit !== "quote" &&
      trigger.unit !== "percent" &&
      trigger.unit !== "multiple"
    ) {
      throw new Error(`Order ${index + 1} has an invalid trigger unit`);
    }
    const triggerValue = finiteNumber(trigger.value, `trigger for order ${index + 1}`);
    if ((trigger.unit === "usd" || trigger.unit === "quote" || trigger.unit === "multiple") && triggerValue <= 0) {
      throw new Error(`Order ${index + 1} trigger must be positive`);
    }
    if (trigger.unit === "percent" && triggerValue <= -99) {
      throw new Error(`Order ${index + 1} percentage move is too low`);
    }
    const label =
      typeof order.label === "string" && order.label.trim()
        ? order.label.trim().slice(0, 100)
        : `${order.side === "buy" ? "Buy" : "Sell"} ${percent}%`;
    return {
      side: order.side,
      percent,
      trigger: { unit: trigger.unit, value: triggerValue },
      label,
    };
  });

  if (!clarification && orders.length === 0) throw new Error("The order plan is empty");

  const sellPercent = orders
    .filter((order) => order.side === "sell")
    .reduce((total, order) => total + order.percent, 0);
  const buyPercent = orders
    .filter((order) => order.side === "buy")
    .reduce((total, order) => total + order.percent, 0);
  if (sellPercent > 100.0001) throw new Error("Sell orders allocate more than 100% of the token balance");
  if (buyPercent > 100.0001) throw new Error("Buy orders allocate more than 100% of the quote balance");

  return { summary: summary || "Smart order plan", orders, clarification };
}

export function resolveTriggerQuotePrice(
  order: SmartOrderIntent,
  context: PriceContext,
): number {
  const { currentQuotePrice, currentUsdPrice } = context;
  if (!Number.isFinite(currentQuotePrice) || currentQuotePrice <= 0) {
    throw new Error("Current on-chain price is unavailable");
  }

  let target: number;
  switch (order.trigger.unit) {
    case "quote":
      target = order.trigger.value;
      break;
    case "multiple":
      target = currentQuotePrice * order.trigger.value;
      break;
    case "percent":
      target = currentQuotePrice * (1 + order.trigger.value / 100);
      break;
    case "usd":
      if (currentUsdPrice == null || !Number.isFinite(currentUsdPrice) || currentUsdPrice <= 0) {
        throw new Error("USD pricing is unavailable; describe the trigger in WMON or as a percentage");
      }
      target = order.trigger.value * (currentQuotePrice / currentUsdPrice);
      break;
  }
  if (!Number.isFinite(target) || target <= 0) throw new Error("Resolved trigger price is invalid");
  return target;
}

export function percentOfBalance(balance: bigint, percent: number): bigint {
  const basisPoints = Math.round(percent * 100);
  return (balance * BigInt(basisPoints)) / 10_000n;
}

export function triggerDescription(order: SmartOrderIntent, quoteSymbol: string): string {
  const { unit, value } = order.trigger;
  if (unit === "usd") return `$${value}`;
  if (unit === "quote") return `${value} ${quoteSymbol}`;
  if (unit === "multiple") return `${value}×`;
  return `${value > 0 ? "+" : ""}${value}%`;
}
