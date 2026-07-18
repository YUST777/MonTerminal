import { useEffect, useMemo, useState } from "react";
import { tickToExecutionPrice } from "@monolimit/shared";
import { useAccount } from "wagmi";
import { useLivePrice, usePoolStats } from "../../hooks/market.ts";
import {
  buildBuyLimitParams,
  buildOrderParams,
  usePlaceOrders,
  useTokenBalance,
  useTwapAvailable,
} from "../../hooks/trade.ts";
import { useToasts } from "../Toasts.tsx";
import { fmtAmount, fmtPrice, fmtUsd } from "../../lib/format.ts";
import {
  normalizeSmartOrderPlan,
  percentOfBalance,
  resolveTriggerQuotePrice,
  triggerDescription,
  type SmartOrderIntent,
  type SmartOrderPlan,
} from "../../lib/orderIntent.ts";
import { useTerminal } from "../../state/terminal.ts";
import { Row, TwapWarning } from "./shared.tsx";

const EXAMPLES = [
  "Sell 20% at $0.0003 and 30% at $0.0004",
  "Buy 25% when price drops 40%",
  "Sell 50% at 2x and stop the rest at -35%",
];

interface PreparedOrder {
  intent: SmartOrderIntent;
  amountIn: bigint;
  inputSymbol: string;
  inputDecimals: number;
  exactQuotePrice: number;
  exactUsdPrice: number | null;
  kind: "buy" | "take-profit" | "stop-loss";
  params: ReturnType<typeof buildOrderParams>;
}

interface Preparation {
  orders: PreparedOrder[];
  error: string | null;
  sellAmount: bigint;
  buyAmount: bigint;
  hasStopLoss: boolean;
}

function planPayload(
  text: string,
  tokenSymbol: string,
  tokenAddress: string,
  quoteSymbol: string,
  currentQuotePrice: number,
  currentUsdPrice: number | null,
) {
  return {
    text,
    market: {
      tokenSymbol,
      tokenAddress,
      quoteSymbol,
      currentQuotePrice,
      currentUsdPrice,
    },
  };
}

/** Natural-language order planner. AI drafts intent; deterministic code builds every on-chain parameter. */
export function SmartOrders() {
  const { isConnected } = useAccount();
  const { token, pool } = useTerminal();
  const { data: live } = useLivePrice(pool, token);
  const { data: stats } = usePoolStats(pool);
  const { data: tokenBalance } = useTokenBalance(token?.address);
  const { data: quoteBalance } = useTokenBalance(pool?.quote.address);
  const sellFlow = usePlaceOrders(token);
  const buyFlow = usePlaceOrders(pool?.quote ?? null);
  const twapOk = useTwapAvailable(pool);
  const push = useToasts((state) => state.push);
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<SmartOrderPlan | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"idle" | "approve-sell" | "approve-buy" | "place">("idle");

  useEffect(() => {
    setPlan(null);
    setModel(null);
    setError(null);
  }, [token?.address, pool?.address]);

  const preparation = useMemo<Preparation>(() => {
    const empty: Preparation = {
      orders: [],
      error: null,
      sellAmount: 0n,
      buyAmount: 0n,
      hasStopLoss: false,
    };
    if (!plan || !token || !pool || !live) return empty;
    try {
      const quoteUsd =
        stats?.priceUsd != null && stats.priceUsd > 0 ? stats.priceUsd / live.price : null;
      let sellAmount = 0n;
      let buyAmount = 0n;
      let hasStopLoss = false;
      const orders = plan.orders.map((intent): PreparedOrder => {
        const targetQuotePrice = resolveTriggerQuotePrice(intent, {
          currentQuotePrice: live.price,
          currentUsdPrice: stats?.priceUsd ?? null,
        });
        const multiple = targetQuotePrice / live.price;
        const balance = intent.side === "sell" ? tokenBalance : quoteBalance;
        const amountIn = balance === undefined ? 0n : percentOfBalance(balance, intent.percent);
        if (balance !== undefined && amountIn === 0n) {
          throw new Error(`${intent.label} is below the token's smallest unit`);
        }

        let params: ReturnType<typeof buildOrderParams>;
        let kind: PreparedOrder["kind"];
        if (intent.side === "sell") {
          if (multiple <= 0.01 || multiple > 11 || Math.abs(multiple - 1) < 0.005) {
            throw new Error(`${intent.label} is too close to or too far from the current price`);
          }
          const sellKind = multiple < 1 ? "sl" : "tp";
          hasStopLoss ||= sellKind === "sl";
          kind = sellKind === "sl" ? "stop-loss" : "take-profit";
          params = buildOrderParams(
            {
              kind: sellKind,
              amountIn: amountIn || 1n,
              multiple,
              maxSlippageBps: sellKind === "sl" ? 500 : undefined,
            },
            token,
            pool,
            live.tick,
          );
          sellAmount += amountIn;
        } else {
          if (multiple <= 0.01 || multiple > 0.995) {
            throw new Error(`${intent.label} must place the buy below the current market price`);
          }
          kind = "buy";
          params = buildBuyLimitParams(
            { amountIn: amountIn || 1n, dropPct: (multiple - 1) * 100 },
            token,
            pool,
            live.tick,
          );
          buyAmount += amountIn;
        }

        const exactQuotePrice = tickToExecutionPrice(
          params.triggerTick,
          token.address,
          pool.quote.address,
          token.decimals,
          pool.quote.decimals,
        );
        return {
          intent,
          amountIn,
          inputSymbol: intent.side === "sell" ? token.symbol : pool.quote.symbol,
          inputDecimals: intent.side === "sell" ? token.decimals : pool.quote.decimals,
          exactQuotePrice,
          exactUsdPrice: quoteUsd == null ? null : exactQuotePrice * quoteUsd,
          kind,
          params,
        };
      });
      return { orders, error: null, sellAmount, buyAmount, hasStopLoss };
    } catch (prepareError) {
      return { ...empty, error: (prepareError as Error).message };
    }
  }, [plan, token, pool, live, stats?.priceUsd, tokenBalance, quoteBalance]);

  if (!token || !pool) return null;

  const createPlan = async () => {
    if (!live || !text.trim()) return;
    setPlanning(true);
    setError(null);
    try {
      const response = await fetch("/api/order-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          planPayload(
            text,
            token.symbol,
            token.address,
            pool.quote.symbol,
            live.price,
            stats?.priceUsd ?? null,
          ),
        ),
      });
      const result = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(result?.error || `Order planner failed (${response.status})`);
      setPlan(normalizeSmartOrderPlan(result?.plan));
      setModel(typeof result?.model === "string" ? result.model : null);
    } catch (planError) {
      setPlan(null);
      setModel(null);
      setError((planError as Error).message);
    } finally {
      setPlanning(false);
    }
  };

  const run = async (
    nextAction: Exclude<typeof action, "idle">,
    operation: () => Promise<void>,
  ) => {
    setAction(nextAction);
    try {
      await operation();
    } catch (operationError) {
      push("error", (operationError as Error).message.split("\n")[0]!.slice(0, 160));
    } finally {
      setAction("idle");
    }
  };

  const needsSellApproval =
    preparation.sellAmount > 0n && sellFlow.needsApproval(preparation.sellAmount);
  const needsBuyApproval =
    preparation.buyAmount > 0n && buyFlow.needsApproval(preparation.buyAmount);
  const stopBlocked = preparation.hasStopLoss && twapOk.data === false;
  const balancesReady =
    preparation.orders.every((order) => order.amountIn > 0n) &&
    (preparation.sellAmount === 0n || tokenBalance !== undefined) &&
    (preparation.buyAmount === 0n || quoteBalance !== undefined);
  const ready =
    !!plan &&
    plan.orders.length > 0 &&
    !plan.clarification &&
    !preparation.error &&
    balancesReady &&
    !stopBlocked &&
    sellFlow.bookReady &&
    isConnected;

  const buttonLabel = !isConnected
    ? "Connect wallet to continue"
    : needsSellApproval
      ? `Approve ${token.symbol}`
      : needsBuyApproval
        ? `Approve ${pool.quote.symbol}`
        : `Place ${preparation.orders.length} order${preparation.orders.length === 1 ? "" : "s"}`;

  const executeNext = () => {
    if (needsSellApproval) return run("approve-sell", sellFlow.approve);
    if (needsBuyApproval) return run("approve-buy", buyFlow.approve);
    const params = preparation.orders.map((order) => order.params);
    const place = preparation.sellAmount > 0n ? sellFlow.place : buyFlow.place;
    return run("place", () => place(params));
  };

  return (
    <div className="space-y-2.5 p-2.5">
      <div>
        <div className="text-xs font-semibold">Tell MonTerminal your order plan</div>
        <div className="mt-0.5 text-[10px] leading-relaxed text-muted">
          AI translates your words into a draft. Deterministic code builds the contract call; you
          review and sign every transaction.
        </div>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void createPlan();
        }}
        rows={3}
        maxLength={600}
        placeholder={`Example: sell 20% at $0.0003 and buy 10% if ${token.symbol} drops 50%`}
        className="w-full resize-none rounded border border-line bg-bg px-2 py-1.5 text-xs leading-relaxed outline-none placeholder:text-muted focus:border-brand"
      />
      <div className="flex flex-wrap gap-1">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            onClick={() => setText(example)}
            className="rounded border border-line px-1.5 py-0.5 text-left text-[9px] text-muted hover:border-brand/50 hover:text-fg"
          >
            {example}
          </button>
        ))}
      </div>
      <button
        onClick={() => void createPlan()}
        disabled={planning || !live || text.trim().length < 3}
        className="w-full rounded border border-brand/50 bg-brand/10 py-1.5 text-xs font-semibold text-brand hover:bg-brand/15 disabled:opacity-40"
      >
        {planning ? "Understanding your plan…" : plan ? "Update order plan" : "Create order plan"}
      </button>

      {error && <div className="rounded border border-down/40 bg-down/10 p-2 text-[11px] text-down">{error}</div>}

      {plan?.clarification && (
        <div className="rounded border border-warn/40 bg-warn/10 p-2 text-[11px] text-warn">
          <div className="font-semibold">One thing to clarify</div>
          <div className="mt-0.5">{plan.clarification}</div>
        </div>
      )}

      {plan && plan.orders.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>{plan.summary}</span>
            <span>{model ? "AI draft" : "Draft"}</span>
          </div>
          {preparation.orders.map((order, index) => (
            <div key={`${order.intent.side}-${index}`} className="rounded border border-line bg-bg p-2">
              <div className="flex items-start gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    order.intent.side === "buy" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                  }`}
                >
                  {order.intent.side}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold">{order.intent.label}</div>
                  <div className="mt-0.5 text-[10px] text-muted">
                    {order.intent.percent}% of {order.inputSymbol} · {order.kind} · requested {triggerDescription(order.intent, pool.quote.symbol)}
                  </div>
                </div>
                <button
                  onClick={() =>
                    setPlan({ ...plan, orders: plan.orders.filter((_, orderIndex) => orderIndex !== index) })
                  }
                  aria-label={`Remove order ${index + 1}`}
                  className="text-muted hover:text-down"
                >
                  ✕
                </button>
              </div>
              <div className="mt-1.5 border-t border-line pt-1.5">
                <Row
                  k={order.intent.side === "buy" ? "Spend" : "Sell"}
                  v={
                    order.amountIn > 0n
                      ? `${fmtAmount(order.amountIn, order.inputDecimals)} ${order.inputSymbol}`
                      : "Loading balance…"
                  }
                />
                <Row
                  k="On-chain trigger"
                  v={`${fmtPrice(order.exactQuotePrice)} ${pool.quote.symbol}`}
                  tone={order.intent.side === "buy" || order.kind === "take-profit" ? "up" : "down"}
                />
                {order.exactUsdPrice != null && <Row k="Approx. USD" v={fmtUsd(order.exactUsdPrice)} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {preparation.error && (
        <div className="rounded border border-warn/40 bg-warn/10 p-2 text-[11px] text-warn">
          {preparation.error}
        </div>
      )}
      {stopBlocked && <TwapWarning />}

      {plan && plan.orders.length > 0 && !preparation.error && (
        <div className="rounded border border-line bg-bg p-2">
          <Row k="Orders in transaction" v={String(preparation.orders.length)} />
          {preparation.sellAmount > 0n && (
            <Row k={`${token.symbol} allocated`} v={`${plan.orders.filter((order) => order.side === "sell").reduce((sum, order) => sum + order.percent, 0)}%`} />
          )}
          {preparation.buyAmount > 0n && (
            <Row k={`${pool.quote.symbol} allocated`} v={`${plan.orders.filter((order) => order.side === "buy").reduce((sum, order) => sum + order.percent, 0)}%`} />
          )}
          <Row k="Keeper fee" v="0.30% per filled order" />
        </div>
      )}

      {plan && plan.orders.length > 0 && (
        <div className="space-y-1.5">
          {needsSellApproval && (
            <div className="text-[10px] text-muted">Step 1: approve {token.symbol} for sell orders.</div>
          )}
          {!needsSellApproval && needsBuyApproval && (
            <div className="text-[10px] text-muted">Approve {pool.quote.symbol} for buy orders.</div>
          )}
          <button
            onClick={() => void executeNext()}
            disabled={!ready || action !== "idle" || needsSellApproval && preparation.sellAmount === 0n || needsBuyApproval && preparation.buyAmount === 0n}
            className="monad-gradient w-full rounded py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {action === "approve-sell"
              ? `Approving ${token.symbol}…`
              : action === "approve-buy"
                ? `Approving ${pool.quote.symbol}…`
                : action === "place"
                  ? "Placing atomic order plan…"
                  : buttonLabel}
          </button>
          <div className="text-center text-[9px] text-muted">
            The AI cannot access your wallet or execute without your signature.
          </div>
        </div>
      )}
    </div>
  );
}
