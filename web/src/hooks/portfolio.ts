import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi, parseAbiItem, type Address } from "viem";
import { ADDRESSES } from "@monolimit/shared";
import { BRIDGE_TOKENS, NATIVE_TOKEN } from "../config/tokens.ts";
import { fetchRelayTokens } from "../lib/relay.ts";
import { fetchSimplePrices, fetchTopPools } from "../lib/gecko.ts";
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
  /** deepest gecko pool — feeds the row sparkline */
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

export interface ActivityItem {
  dir: "in" | "out";
  token: Address;
  symbol: string;
  decimals: number;
  amount: number;
  counterparty: Address;
  tx: `0x${string}`;
  tsSec: number;
}

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
/** rpc1 serves 500k-block getLogs ranges — ~1 day of Monad blocks. */
const ACTIVITY_RANGE = 500_000n;
const ACTIVITY_LIMIT = 12;

/**
 * Recent wallet activity straight from chain: every ERC-20 Transfer in/out of
 * the wallet over the last ~day (strict decoding skips ERC-721s, which share
 * the Transfer signature). Runs on the rpc1 log client — rpc.monad.xyz caps
 * getLogs at 100 blocks.
 */
export function useActivity() {
  const { address } = useAccount();

  return useQuery({
    queryKey: ["activity", address],
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
    queryFn: async (): Promise<ActivityItem[]> => {
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
        .sort((a, b) => Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex)
        .slice(0, ACTIVITY_LIMIT);
      if (logs.length === 0) return [];

      // token meta (skips non-ERC-20s) + block timestamps
      const tokens = [...new Set(logs.map((l) => l.address.toLowerCase()))];
      const blocks = [...new Set(logs.map((l) => l.blockNumber))];
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

      return logs.flatMap((l): ActivityItem[] => {
        const m = tokenMeta.get(l.address.toLowerCase());
        if (!m || !l.transactionHash) return [];
        const out = l.args.from.toLowerCase() === address!.toLowerCase();
        return [
          {
            dir: out ? "out" : "in",
            token: l.address,
            symbol: m.symbol,
            decimals: m.decimals,
            amount: Number(l.args.value) / 10 ** m.decimals,
            counterparty: out ? l.args.to : l.args.from,
            tx: l.transactionHash,
            tsSec: blockTs.get(l.blockNumber) ?? 0,
          },
        ];
      });
    },
  });
}
