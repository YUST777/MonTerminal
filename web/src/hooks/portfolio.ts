import { useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi, parseAbiItem, type Address } from "viem";
import { ADDRESSES, monad } from "@monolimit/shared";
import { BRIDGE_TOKENS, NATIVE_TOKEN } from "../config/tokens.ts";
import { fetchRelayTokens } from "../lib/relay.ts";
import { fetchWalletTokens } from "../lib/blockscout.ts";
import { fetchTokenPrices, type DsTokenPrice } from "../lib/dexscreener.ts";
import { fetchSimplePrices, fetchTopPools, type TopPool } from "../lib/gecko.ts";
import {
  fetchPortfolioHistory,
  type PortfolioHistoryBundle,
  type PortfolioHistoryWindow,
  type PortfolioPricePoint,
} from "../lib/portfolioHistory.ts";
import { logClient } from "./orders.ts";

/** One held token, priced. `address` is null for native MON. */
export interface PortfolioAsset {
  address: Address | null;
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  /** human units */
  amount: number;
  priceUsd: number | null;
  change24hPct: number | null;
  valueUsd: number;
  /** deepest gecko pool — feeds sparklines + value history */
  pool: string | null;
}

export interface Portfolio {
  assets: PortfolioAsset[];
  totalUsd: number;
  /** Σ of value − value/(1 + chg) over priced assets — the real 24h move. */
  change24hUsd: number;
  change24hPct: number | null;
}

interface Candidate {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
}

/**
 * Real wallet holdings, fast: Blockscout's indexer returns every held token
 * in ONE call (symbol/name/decimals/icon included); DexScreener batch-prices
 * them (CORS-friendly, 300 req/min). GeckoTerminal only prices stragglers.
 * Fallback when the explorer is down: balance-check a token universe built
 * from the bridge registry + Relay list + cached top pools.
 */
export function usePortfolio() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: monad.id });
  const qc = useQueryClient();

  return useQuery({
    queryKey: ["portfolio", address],
    enabled: !!client && !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Portfolio> => {
      // 1. holdings — one universe scan + native MON, in parallel
      const [native, indexed] = await Promise.all([
        client!.getBalance({ address: address! }),
        fetchWalletTokens(address!).catch(() => null),
      ]);
      const held: { c: Candidate | null; balance: bigint }[] = [];
      if (native > 0n) held.push({ c: null, balance: native });
      if (indexed) {
        for (const t of indexed) held.push({ c: t, balance: t.balance });
      } else {
        // explorer down — legacy universe scan (bridge + relay + cached pools)
        held.push(...(await universeScan(qc, client!, address!)));
      }

      // 2. prices — DexScreener batch (dust wallets can hold 100s of airdrop
      // tokens; cap the priced set, the rest count as $0 dust)
      const wmonKey = ADDRESSES.WMON.toLowerCase();
      const priceable = held.slice(0, 150);
      const ds = await fetchTokenPrices([
        wmonKey,
        ...priceable.flatMap((h) => (h.c ? [h.c.address] : [])),
      ]).catch(() => new Map<string, DsTokenPrice>());

      // free extra joins from the home page's already-cached top pools
      const pools = qc.getQueryData<TopPool[]>(["top-pools"]) ?? [];
      const byToken = new Map<string, TopPool>();
      for (const p of pools) {
        const key = p.baseToken.toLowerCase();
        if (!byToken.has(key)) byToken.set(key, p); // deepest first
      }

      // 3. gecko simple-price only for what both sources missed
      const unpriced = priceable
        .map((h) => (h.c ? h.c.address.toLowerCase() : wmonKey))
        .filter((a) => ds.get(a)?.priceUsd == null && byToken.get(a)?.priceUsd == null);
      const fallback =
        unpriced.length > 0
          ? await fetchSimplePrices(unpriced).catch(() => new Map<string, number>())
          : new Map<string, number>();

      const monLogo = BRIDGE_TOKENS[monad.id]?.[0]?.logo ?? null;
      const assets = held
        .map(({ c, balance }): PortfolioAsset => {
          const key = c ? c.address.toLowerCase() : wmonKey; // MON prices as WMON
          const row = byToken.get(key);
          const dsp = ds.get(key);
          const priceUsd = dsp?.priceUsd ?? row?.priceUsd ?? fallback.get(key) ?? null;
          const decimals = c?.decimals ?? 18;
          const amount = Number(balance) / 10 ** decimals;
          return {
            address: c?.address ?? null,
            symbol: c?.symbol ?? "MON",
            name: c?.name ?? "Monad",
            decimals,
            logo: c ? (c.logo ?? dsp?.icon ?? null) : monLogo,
            amount,
            priceUsd,
            change24hPct: dsp?.change24hPct ?? row?.change24hPct ?? null,
            valueUsd: priceUsd != null ? amount * priceUsd : 0,
            pool: dsp?.pool ?? row?.address ?? null,
          };
        })
        .sort((a, b) => b.valueUsd - a.valueUsd);

      const totalUsd = assets.reduce((s, a) => s + a.valueUsd, 0);
      const change24hUsd = assets.reduce((s, a) => {
        if (a.priceUsd == null || a.change24hPct == null || a.change24hPct <= -100) return s;
        return s + (a.valueUsd - a.valueUsd / (1 + a.change24hPct / 100));
      }, 0);
      const prev = totalUsd - change24hUsd;
      return {
        assets,
        totalUsd,
        change24hUsd,
        change24hPct: prev > 0 ? (change24hUsd / prev) * 100 : null,
      };
    },
  });
}

/** Legacy discovery path — only runs when Blockscout is unreachable. */
async function universeScan(
  qc: ReturnType<typeof useQueryClient>,
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  address: Address,
): Promise<{ c: Candidate; balance: bigint }[]> {
  const [pools, relay] = await Promise.all([
    qc
      .fetchQuery({
        queryKey: ["top-pools"],
        queryFn: () => fetchTopPools(),
        staleTime: 60_000,
      })
      .catch(() => []),
    fetchRelayTokens(monad.id).catch(() => []),
  ]);

  const candidates = new Map<string, Candidate>();
  const add = (c: Candidate) => {
    const key = c.address.toLowerCase();
    if (!candidates.has(key)) candidates.set(key, c);
  };
  for (const t of BRIDGE_TOKENS[monad.id] ?? []) {
    if (t.address !== NATIVE_TOKEN) {
      add({ ...t, address: t.address, logo: t.logo || null });
    }
  }
  for (const t of relay) {
    if (t.address !== NATIVE_TOKEN) {
      add({ ...t, address: t.address, logo: t.logo || null });
    }
  }
  for (const p of pools) {
    if (p.baseDecimals == null || !p.baseToken.startsWith("0x")) continue;
    add({
      address: p.baseToken as Address,
      symbol: p.baseSymbol,
      name: p.baseName ?? p.baseSymbol,
      decimals: p.baseDecimals,
      logo: p.imageUrl,
    });
  }
  const universe = [...candidates.values()];

  const balances = await client.multicall({
    contracts: universe.map((c) => ({
      address: c.address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address] as const,
    })),
    allowFailure: true,
  });
  const held: { c: Candidate; balance: bigint }[] = [];
  balances.forEach((r, i) => {
    if (r.status === "success" && r.result > 0n) {
      held.push({ c: universe[i]!, balance: r.result });
    }
  });
  return held;
}

/* ------------------------------ value history ----------------------------- */

export type HistoryRange = "1D" | "1W" | "1M";
export interface HistoryPoint {
  ts: number;
  value: number;
  /** MON benchmark rebased to the window's starting portfolio value */
  bench: number | null;
}

const RANGE_CFG: Record<HistoryRange, { window: PortfolioHistoryWindow; points: number }> = {
  "1D": { window: "week", points: 24 },
  "1W": { window: "week", points: 168 },
  "1M": { window: "month", points: 180 },
};
const HISTORY_ASSETS = 8;

interface HoldingsHistoryResult {
  points: HistoryPoint[];
  assetSeries: Record<string, PortfolioPricePoint[]>;
}

/**
 * Value of the CURRENT holdings over time: each tracked asset's real USD
 * OHLCV closes × its live balance, summed on a shared timeline (assets
 * without an indexed pool contribute their flat current value). Benchmark is
 * WMON's price over the same window, rebased to the starting total. This is
 * real market data — not a fabricated portfolio history.
 */
export function useHoldingsHistory(portfolio: Portfolio | undefined, range: HistoryRange) {
  const qc = useQueryClient();
  const tracked = (portfolio?.assets ?? [])
    .filter((a) => a.pool && a.valueUsd > 0)
    .slice(0, HISTORY_ASSETS);
  const trackedKey = tracked.map((asset) => asset.pool!.toLowerCase()).sort().join(",");
  const config = RANGE_CFG[range];

  const query = useQuery({
    queryKey: ["portfolio-history-batch", config.window, trackedKey],
    enabled: !!portfolio && tracked.length > 0,
    staleTime: 10 * 60_000,
    retry: 0,
    placeholderData: keepPreviousData,
    queryFn: () => loadHistoryBundle(qc, tracked, config.window),
  });

  const result = useMemo<HoldingsHistoryResult | undefined>(() => {
    if (!query.data || !portfolio) return undefined;
    return {
      points: buildHoldingsHistory(portfolio, tracked, range, query.data),
      assetSeries: query.data.series,
    };
  }, [query.data, portfolio, trackedKey, range]);

  return { ...query, data: result?.points, assetSeries: result?.assetSeries ?? {} };
}

async function loadHistoryBundle(
  qc: ReturnType<typeof useQueryClient>,
  tracked: PortfolioAsset[],
  window: PortfolioHistoryWindow,
): Promise<PortfolioHistoryBundle & { benchPool: string | null }> {
  const wmon = ADDRESSES.WMON.toLowerCase();
  const cached = qc.getQueryData<TopPool[]>(["top-pools"]) ?? [];
  const benchPool =
    cached.find((p) => p.baseToken.toLowerCase() === wmon)?.address ??
    (await fetchTokenPrices([wmon]).catch(() => new Map<string, DsTokenPrice>())).get(wmon)
      ?.pool ??
    null;
  const pools = [...new Set([...tracked.map((asset) => asset.pool!), ...(benchPool ? [benchPool] : [])])];
  return { ...(await fetchPortfolioHistory(pools, window)), benchPool };
}

function buildHoldingsHistory(
  portfolio: Portfolio,
  tracked: PortfolioAsset[],
  range: HistoryRange,
  bundle: PortfolioHistoryBundle & { benchPool: string | null },
): HistoryPoint[] {
  const cfg = RANGE_CFG[range];
  const flatUsd = portfolio.totalUsd - tracked.reduce((sum, asset) => sum + asset.valueUsd, 0);
  const series = tracked.map((asset) => bundle.series[asset.pool!.toLowerCase()] ?? []);
  const bench = bundle.benchPool ? (bundle.series[bundle.benchPool.toLowerCase()] ?? []) : [];

  const tsSet = new Set<number>();
  for (const assetSeries of series) for (const point of assetSeries) tsSet.add(point.timestamp);
  const timeline = [...tsSet].sort((x, y) => x - y).slice(-cfg.points);
  if (timeline.length < 2) return [];

  const maps = series.map((assetSeries) => new Map(assetSeries.map((point) => [point.timestamp, point.close])));
  const lastClose = series.map((assetSeries) => assetSeries[0]?.close ?? 0);
  const benchMap = new Map(bench.map((point) => [point.timestamp, point.close]));
  let benchLast = bench[0]?.close ?? 0;
  const bench0 = benchLast;

  const raw = timeline.map((ts) => {
    let value = flatUsd;
    tracked.forEach((a, i) => {
      const close = maps[i]!.get(ts);
      if (close != null && Number.isFinite(close) && close > 0) lastClose[i] = close;
      value += a.amount * lastClose[i]!;
    });
    const b = benchMap.get(ts);
    if (b != null && Number.isFinite(b) && b > 0) benchLast = b;
    return { ts, value, benchClose: benchLast };
  });
  const start = raw[0]!.value;
  return raw.map((r) => ({
    ts: r.ts,
    value: r.value,
    bench: bench0 > 0 && start > 0 ? start * (r.benchClose / bench0) : null,
  }));
}

/* -------------------------------- activity -------------------------------- */

export interface ActivityLeg {
  token: Address;
  symbol: string;
  amount: number;
}

export interface ActivityEntry {
  tx: `0x${string}`;
  tsSec: number;
  /** a tx with transfers both in and out of the wallet is a swap */
  kind: "swap" | "in" | "out";
  inLeg: ActivityLeg | null;
  outLeg: ActivityLeg | null;
  counterparty: Address | null;
}

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
/** ~1 day of Monad blocks per getLogs sweep. */
const ACTIVITY_RANGE = 500_000n;
const ACTIVITY_TXS = 8;

/**
 * Recent wallet activity straight from chain: ERC-20 Transfer logs in/out of
 * the wallet over the last ~day, grouped per tx so swaps show both legs
 * (strict decoding skips ERC-721s, which share the Transfer signature).
 * Runs on the shared log client against rpc.mainnet.chain.monad.com.
 */
export function useActivity() {
  const { address } = useAccount();

  return useQuery({
    queryKey: ["activity", address],
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
    queryFn: async (): Promise<ActivityEntry[]> => {
      const me = address!.toLowerCase();
      const latest = await logClient.getBlockNumber();
      const fromBlock = latest > ACTIVITY_RANGE ? latest - ACTIVITY_RANGE : 0n;
      const [outgoing, incoming] = await Promise.all([
        logClient.getLogs({
          event: TRANSFER,
          args: { from: address! },
          fromBlock,
          toBlock: latest,
          strict: true,
        }),
        logClient.getLogs({
          event: TRANSFER,
          args: { to: address! },
          fromBlock,
          toBlock: latest,
          strict: true,
        }),
      ]);

      const logs = [...outgoing, ...incoming]
        .filter(
          // self-transfers would appear twice
          (l, i, all) =>
            all.findIndex(
              (x) => x.transactionHash === l.transactionHash && x.logIndex === l.logIndex,
            ) === i,
        )
        .sort((a, b) => Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex);

      // newest N transactions, each keeping all of its transfer legs
      const byTx = new Map<string, typeof logs>();
      for (const l of logs) {
        if (!l.transactionHash) continue;
        const group = byTx.get(l.transactionHash);
        if (group) group.push(l);
        else if (byTx.size < ACTIVITY_TXS) byTx.set(l.transactionHash, [l]);
      }
      if (byTx.size === 0) return [];

      const grouped = [...byTx.values()].flat();
      const tokens = [...new Set(grouped.map((l) => l.address.toLowerCase()))];
      const blocks = [...new Set(grouped.map((l) => l.blockNumber))];
      const [meta, blockData] = await Promise.all([
        logClient.multicall({
          contracts: tokens.flatMap((t) => [
            { address: t as Address, abi: erc20Abi, functionName: "symbol" as const },
            { address: t as Address, abi: erc20Abi, functionName: "decimals" as const },
          ]),
          allowFailure: true,
        }),
        Promise.all(blocks.map((b) => logClient.getBlock({ blockNumber: b }))),
      ]);
      const tokenMeta = new Map<string, { symbol: string; decimals: number }>();
      tokens.forEach((t, i) => {
        const sym = meta[i * 2];
        const dec = meta[i * 2 + 1];
        if (sym?.status === "success" && dec?.status === "success") {
          tokenMeta.set(t, { symbol: String(sym.result), decimals: Number(dec.result) });
        }
      });
      const blockTs = new Map(blocks.map((b, i) => [b, Number(blockData[i]!.timestamp)]));

      const entries: ActivityEntry[] = [];
      for (const [tx, group] of byTx) {
        const legs = group.flatMap((l) => {
          const m = tokenMeta.get(l.address.toLowerCase());
          if (!m) return [];
          return [
            {
              log: l,
              out: l.args.from.toLowerCase() === me,
              leg: {
                token: l.address,
                symbol: m.symbol,
                amount: Number(l.args.value) / 10 ** m.decimals,
              } satisfies ActivityLeg,
            },
          ];
        });
        if (legs.length === 0) continue;
        const biggest = (arr: typeof legs) =>
          arr.length ? arr.reduce((a, b) => (b.leg.amount > a.leg.amount ? b : a)) : null;
        const inn = biggest(legs.filter((l) => !l.out));
        const out = biggest(legs.filter((l) => l.out));
        const main = inn ?? out;
        entries.push({
          tx: tx as `0x${string}`,
          tsSec: blockTs.get(group[0]!.blockNumber) ?? 0,
          kind: inn && out ? "swap" : inn ? "in" : "out",
          inLeg: inn?.leg ?? null,
          outLeg: out?.leg ?? null,
          counterparty:
            inn && out ? null : main ? (main.out ? main.log.args.to : main.log.args.from) : null,
        });
      }
      return entries;
    },
  });
}
