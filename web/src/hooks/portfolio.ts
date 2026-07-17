import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi, parseAbiItem, type Address } from "viem";
import { ADDRESSES } from "@monolimit/shared";
import { BRIDGE_TOKENS, NATIVE_TOKEN } from "../config/tokens.ts";
import { fetchRelayTokens } from "../lib/relay.ts";
import { fetchOhlcv, fetchSimplePrices, fetchTopPools, type Timeframe } from "../lib/gecko.ts";
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
 * Real wallet holdings: the token universe is every Monad token we already
 * know about (top-pools base tokens + bridge registry + Relay's verified
 * list), balance-checked in one multicall. Prices join from the same
 * top-pools fetch the home page uses; leftovers hit gecko's batch
 * simple-price endpoint. No indexer, no mock data.
 */
export function usePortfolio() {
  const { address } = useAccount();
  const client = usePublicClient();
  const qc = useQueryClient();

  return useQuery({
    queryKey: ["portfolio", address],
    enabled: !!client && !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Portfolio> => {
      // 1. token universe (top pools shared with the home page cache)
      const [pools, relay] = await Promise.all([
        qc
          .fetchQuery({
            queryKey: ["top-pools"],
            queryFn: () => fetchTopPools(),
            staleTime: 60_000,
          })
          .catch(() => []),
        fetchRelayTokens(143).catch(() => []),
      ]);

      const candidates = new Map<string, Candidate>();
      const add = (c: Candidate) => {
        const key = c.address.toLowerCase();
        if (!candidates.has(key)) candidates.set(key, c);
      };
      for (const t of BRIDGE_TOKENS[143] ?? []) {
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

      // 2. balances — one multicall + native MON
      const [native, balances] = await Promise.all([
        client!.getBalance({ address: address! }),
        client!.multicall({
          contracts: universe.map((c) => ({
            address: c.address,
            abi: erc20Abi,
            functionName: "balanceOf" as const,
            args: [address!] as const,
          })),
          allowFailure: true,
        }),
      ]);

      const held: { c: Candidate | null; balance: bigint }[] = [];
      if (native > 0n) held.push({ c: null, balance: native });
      balances.forEach((r, i) => {
        if (r.status === "success" && r.result > 0n) {
          held.push({ c: universe[i]!, balance: r.result });
        }
      });

      // 3. prices — top-pools rows first (also carry 24h change + a pool for
      // the sparkline), gecko simple-price batch for the rest
      const byToken = new Map<string, (typeof pools)[number]>();
      for (const p of pools) {
        const key = p.baseToken.toLowerCase();
        if (!byToken.has(key)) byToken.set(key, p); // deepest first
      }
      const wmonKey = ADDRESSES.WMON.toLowerCase();
      const unpriced = held
        .map((h) => (h.c ? h.c.address.toLowerCase() : wmonKey))
        .filter((a) => !byToken.has(a) || byToken.get(a)!.priceUsd == null);
      const fallback =
        unpriced.length > 0
          ? await fetchSimplePrices(unpriced).catch(() => new Map<string, number>())
          : new Map<string, number>();

      const monLogo = BRIDGE_TOKENS[143]?.[0]?.logo ?? null;
      const assets = held
        .map(({ c, balance }): PortfolioAsset => {
          const key = c ? c.address.toLowerCase() : wmonKey; // MON prices as WMON
          const row = byToken.get(key);
          const priceUsd = row?.priceUsd ?? fallback.get(key) ?? null;
          const decimals = c?.decimals ?? 18;
          const amount = Number(balance) / 10 ** decimals;
          return {
            address: c?.address ?? null,
            symbol: c?.symbol ?? "MON",
            name: c?.name ?? "Monad",
            decimals,
            logo: c ? c.logo : monLogo,
            amount,
            priceUsd,
            change24hPct: row?.change24hPct ?? null,
            valueUsd: priceUsd != null ? amount * priceUsd : 0,
            pool: row?.address ?? null,
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

/* ------------------------------ value history ----------------------------- */

export type HistoryRange = "1D" | "1W" | "1M";
export interface HistoryPoint {
  ts: number;
  value: number;
  /** MON benchmark rebased to the window's starting portfolio value */
  bench: number | null;
}

const RANGE_CFG: Record<HistoryRange, { tf: Timeframe; limit: number }> = {
  "1D": { tf: "15m", limit: 96 },
  "1W": { tf: "1h", limit: 168 },
  "1M": { tf: "4h", limit: 180 },
};
/** one OHLCV call per tracked asset — stay inside gecko's free rate limit */
const HISTORY_ASSETS = 8;

/**
 * Value of the CURRENT holdings over time: each tracked asset's real USD
 * OHLCV closes × its live balance, summed on a shared timeline (assets
 * without an indexed pool contribute their flat current value). Benchmark is
 * MON's price over the same window, rebased to the starting total. This is
 * real market data — not a fabricated portfolio history.
 */
export function useHoldingsHistory(portfolio: Portfolio | undefined, range: HistoryRange) {
  const { address } = useAccount();
  const qc = useQueryClient();
  const tracked = (portfolio?.assets ?? [])
    .filter((a) => a.pool && a.valueUsd > 0)
    .slice(0, HISTORY_ASSETS);
  const trackedKey = tracked.map((a) => a.pool).join(",");

  const query = useQuery({
    queryKey: ["holdings-history", address, range, trackedKey],
    enabled: !!portfolio && tracked.length > 0,
    staleTime: 300_000,
    retry: 0,
    placeholderData: keepPreviousData, // last range's line stays while the next loads
    queryFn: () => buildHoldingsHistory(qc, portfolio!, tracked, range),
  });

  // Warm the other ranges once the visible one lands — chip flips are then
  // instant (and usually served straight from the OHLCV cache anyway).
  useEffect(() => {
    if (!query.data || !portfolio) return;
    for (const r of (Object.keys(RANGE_CFG) as HistoryRange[])) {
      if (r === range) continue;
      qc.prefetchQuery({
        queryKey: ["holdings-history", address, r, trackedKey],
        staleTime: 300_000,
        queryFn: () => buildHoldingsHistory(qc, portfolio, tracked, r),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, range, trackedKey]);

  return query;
}

async function buildHoldingsHistory(
  qc: ReturnType<typeof useQueryClient>,
  portfolio: Portfolio,
  tracked: PortfolioAsset[],
  range: HistoryRange,
): Promise<HistoryPoint[]> {
  const cfg = RANGE_CFG[range];
  const flatUsd = portfolio.totalUsd - tracked.reduce((s, a) => s + a.valueUsd, 0);
  const pools = await qc
    .fetchQuery({
      queryKey: ["top-pools"],
      queryFn: () => fetchTopPools(),
      staleTime: 60_000,
    })
    .catch(() => []);
  const wmon = ADDRESSES.WMON.toLowerCase();
  const benchPool = pools.find((p) => p.baseToken.toLowerCase() === wmon)?.address ?? null;

  const [series, bench] = await Promise.all([
    Promise.all(
      tracked.map((a) => fetchOhlcv(a.pool!, cfg.tf, cfg.limit, "usd").catch(() => [])),
    ),
    benchPool
      ? fetchOhlcv(benchPool, cfg.tf, cfg.limit, "usd").catch(() => [])
      : Promise.resolve([]),
  ]);

  const tsSet = new Set<number>();
  for (const s of series) for (const c of s) tsSet.add(c.timestamp);
  const timeline = [...tsSet].sort((x, y) => x - y);
  if (timeline.length < 2) return [];

  const maps = series.map((s) => new Map(s.map((c) => [c.timestamp, c.close])));
  const lastClose = series.map((s) => s[0]?.close ?? 0);
  const benchMap = new Map(bench.map((c) => [c.timestamp, c.close]));
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
/** rpc1 serves 500k-block getLogs ranges — ~1 day of Monad blocks. */
const ACTIVITY_RANGE = 500_000n;
const ACTIVITY_TXS = 8;

/**
 * Recent wallet activity straight from chain: ERC-20 Transfer logs in/out of
 * the wallet over the last ~day, grouped per tx so swaps show both legs
 * (strict decoding skips ERC-721s, which share the Transfer signature).
 * Runs on the rpc1 log client — rpc.monad.xyz caps getLogs at 100 blocks.
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
