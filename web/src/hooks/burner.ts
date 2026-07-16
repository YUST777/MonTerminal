import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWalletClient, useWriteContract } from "wagmi";
import { erc20Abi, parseAbi, parseAbiItem, type Address } from "viem";
import { ADDRESSES } from "@monolimit/shared";
import { BRIDGE_TOKENS, NATIVE_TOKEN } from "../config/tokens.ts";
import { fetchRelayTokens, getRelayQuote, executeRelaySteps, NATIVE } from "../lib/relay.ts";
import { fetchSimplePrices, fetchTopPools } from "../lib/gecko.ts";
import { useToasts } from "../components/Toasts.tsx";
import { logClient } from "./orders.ts";

/** The conventional burn sink — tokens sent here are gone forever. */
export const DEAD = "0x000000000000000000000000000000000000dEaD" as Address;
export const USDC = "0x754704Bc059F8C67012fED69BC8a327a5AAfb603" as Address;

export type BurnAction = "burn" | "sell" | "convert";

export interface BurnerToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  balance: bigint;
  /** human units */
  amount: number;
  priceUsd: number | null;
  valueUsd: number;
  liquidityUsd: number | null;
  /** in the bridge registry or Relay's verified Monad list */
  whitelisted: boolean;
  /** only known because someone transferred it in — classic airdrop-spam signal */
  airdropped: boolean;
  dust: boolean;
  lowLiquidity: boolean;
}

export interface BurnerScan {
  tokens: BurnerToken[];
  /** contracts balance-checked (universe + airdropped) */
  scanned: number;
  /** Σ USD value of the dust rows */
  reclaimableUsd: number;
  /** live MON price — fee lines */
  monUsd: number | null;
}

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
/** rpc1 serves 500k-block getLogs ranges — ~1 day of Monad blocks. */
const SCAN_RANGE = 500_000n;
const DUST_USD = 1;
const LOW_LIQ_USD = 10_000;

/**
 * Wallet dust scan, all real: the token universe is every verified Monad
 * token (bridge registry + Relay list + top-pools bases) UNION every ERC-20
 * that ever sent the wallet a Transfer in the last ~day (airdrop spam shows
 * up here and nowhere else). One balanceOf multicall over the lot, prices
 * from GeckoTerminal, then each held token is classified: dust (<$1),
 * low/no liquidity, spam (airdropped + unverified).
 */
export function useBurnerScan() {
  const { address } = useAccount();
  const client = usePublicClient();
  const qc = useQueryClient();

  return useQuery({
    queryKey: ["burner-scan", address],
    enabled: !!client && !!address,
    staleTime: 60_000,
    queryFn: async (): Promise<BurnerScan> => {
      // 1. verified universe + airdropped contracts from incoming logs
      const latest = await logClient.getBlockNumber();
      const fromBlock = latest > SCAN_RANGE ? latest - SCAN_RANGE : 0n;
      const [pools, relay, incoming] = await Promise.all([
        qc
          .fetchQuery({
            queryKey: ["top-pools"],
            queryFn: () => fetchTopPools(),
            staleTime: 60_000,
          })
          .catch(() => []),
        fetchRelayTokens(143).catch(() => []),
        logClient
          .getLogs({
            event: TRANSFER,
            args: { to: address! },
            fromBlock,
            toBlock: latest,
            strict: true, // drops ERC-721s (same topic0, different shape)
          })
          .catch(() => []),
      ]);

      const verified = new Set<string>();
      const known = new Map<
        string,
        { address: Address; symbol: string; name: string; decimals: number; logo: string | null }
      >();
      for (const t of [...(BRIDGE_TOKENS[143] ?? []), ...relay]) {
        if (t.address === NATIVE_TOKEN) continue;
        const key = t.address.toLowerCase();
        verified.add(key);
        if (!known.has(key)) known.set(key, { ...t, logo: t.logo || null });
      }
      for (const p of pools) {
        if (p.baseDecimals == null || !p.baseToken.startsWith("0x")) continue;
        const key = p.baseToken.toLowerCase();
        if (!known.has(key)) {
          known.set(key, {
            address: p.baseToken as Address,
            symbol: p.baseSymbol,
            name: p.baseName ?? p.baseSymbol,
            decimals: p.baseDecimals,
            logo: p.imageUrl,
          });
        }
      }
      const airdropped = new Set<string>();
      for (const l of incoming) airdropped.add(l.address.toLowerCase());
      const unknown = [...airdropped].filter((a) => !known.has(a));

      // 2. metadata for airdropped strangers + balances for everything
      const contracts = [...known.keys(), ...unknown];
      const [meta, balances] = await Promise.all([
        unknown.length > 0
          ? client!.multicall({
              contracts: unknown.flatMap((t) => [
                { address: t as Address, abi: erc20Abi, functionName: "symbol" as const },
                { address: t as Address, abi: erc20Abi, functionName: "name" as const },
                { address: t as Address, abi: erc20Abi, functionName: "decimals" as const },
              ]),
              allowFailure: true,
            })
          : Promise.resolve([]),
        client!.multicall({
          contracts: contracts.map((t) => ({
            address: t as Address,
            abi: erc20Abi,
            functionName: "balanceOf" as const,
            args: [address!] as const,
          })),
          allowFailure: true,
        }),
      ]);
      unknown.forEach((t, i) => {
        const [sym, name, dec] = [meta[i * 3], meta[i * 3 + 1], meta[i * 3 + 2]];
        if (sym?.status === "success" && dec?.status === "success") {
          known.set(t, {
            address: t as Address,
            symbol: String(sym.result),
            name: name?.status === "success" ? String(name.result) : String(sym.result),
            decimals: Number(dec.result),
            logo: null,
          });
        }
      });

      const held: { key: string; balance: bigint }[] = [];
      balances.forEach((r, i) => {
        if (r.status === "success" && r.result > 0n && known.has(contracts[i]!)) {
          held.push({ key: contracts[i]!, balance: r.result });
        }
      });

      // 3. prices + liquidity — top-pools rows first, gecko batch for the rest
      const byToken = new Map<string, (typeof pools)[number]>();
      for (const p of pools) {
        const key = p.baseToken.toLowerCase();
        if (!byToken.has(key)) byToken.set(key, p); // deepest first
      }
      const unpriced = held.map((h) => h.key).filter((a) => byToken.get(a)?.priceUsd == null);
      const fallback =
        unpriced.length > 0
          ? await fetchSimplePrices(unpriced).catch(() => new Map<string, number>())
          : new Map<string, number>();

      const tokens = held
        .map(({ key, balance }): BurnerToken => {
          const m = known.get(key)!;
          const row = byToken.get(key);
          const priceUsd = row?.priceUsd ?? fallback.get(key) ?? null;
          const amount = Number(balance) / 10 ** m.decimals;
          const valueUsd = priceUsd != null ? amount * priceUsd : 0;
          const liquidityUsd = row ? row.reserveUsd : null;
          return {
            ...m,
            balance,
            amount,
            priceUsd,
            valueUsd,
            liquidityUsd,
            whitelisted: verified.has(key),
            airdropped: airdropped.has(key),
            dust: valueUsd < DUST_USD,
            lowLiquidity: liquidityUsd == null || liquidityUsd < LOW_LIQ_USD,
          };
        })
        .sort((a, b) => Number(a.whitelisted) - Number(b.whitelisted) || b.valueUsd - a.valueUsd);

      const wmon = byToken.get(ADDRESSES.WMON.toLowerCase());
      return {
        tokens,
        scanned: contracts.length,
        reclaimableUsd: tokens.filter((t) => t.dust).reduce((s, t) => s + t.valueUsd, 0),
        monUsd: wmon?.priceUsd ?? null,
      };
    },
  });
}

/* -------------------------------- execution ------------------------------- */

/** ERC-20 transfer gas — fee estimates only, wallets estimate the real thing. */
const TRANSFER_GAS = 60_000n;

/** Live per-burn network fee: gasPrice × transfer gas → MON. */
export function useBurnFee() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["burn-fee"],
    enabled: !!client,
    staleTime: 60_000,
    queryFn: async () => {
      const gasPrice = await client!.getGasPrice();
      return Number(gasPrice * TRANSFER_GAS) / 1e18; // MON per transfer
    },
  });
}

/**
 * Executes the chosen action over the selected tokens, one tx per token:
 * burn = transfer the full balance to 0x…dEaD; sell/convert = Relay
 * same-chain swap into MON / USDC (quote + steps through the wallet).
 */
export function useBurnExecute() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const run = async (action: BurnAction, tokens: BurnerToken[]) => {
    if (tokens.length === 0 || busy) return;
    setBusy(true);
    let done = 0;
    try {
      for (const t of tokens) {
        setProgress(`${t.symbol} (${done + 1}/${tokens.length})…`);
        if (action === "burn") {
          const hash = await writeContractAsync({
            address: t.address,
            abi: erc20Abi,
            functionName: "transfer",
            args: [DEAD, t.balance],
          });
          const receipt = await client!.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error(`${t.symbol} burn reverted`);
        } else {
          const quote = await getRelayQuote({
            user: address!,
            originChainId: 143,
            destinationChainId: 143,
            originCurrency: t.address,
            destinationCurrency: action === "sell" ? NATIVE : USDC,
            amount: t.balance.toString(),
          });
          await executeRelaySteps(quote, walletClient!, (msg) =>
            setProgress(`${t.symbol}: ${msg}`),
          );
        }
        done++;
      }
      push(
        "success",
        action === "burn"
          ? `Burned ${done} token${done > 1 ? "s" : ""} forever 🔥`
          : `${action === "sell" ? "Sold" : "Converted"} ${done} token${done > 1 ? "s" : ""}`,
      );
    } catch (e) {
      if (done > 0) push("info", `${done}/${tokens.length} done before the error`);
      push("error", e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setBusy(false);
      setProgress(null);
      qc.invalidateQueries({ queryKey: ["burner-scan"] });
      qc.invalidateQueries({ queryKey: ["burn-history"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    }
  };

  return { run, busy, progress };
}

/* ---------------------------------- NFTs ---------------------------------- */

/** ERC-721 Transfer — tokenId is indexed, unlike the ERC-20 shape above. */
const NFT_TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);
const NFT_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function name() view returns (string)",
]);

export interface BurnerNft {
  contract: Address;
  tokenId: bigint;
  collection: string;
}

/**
 * NFTs received in the last ~day, straight from ERC-721 Transfer logs
 * (strict decoding only matches the 4-topic 721 shape), ownership confirmed
 * with an ownerOf multicall — transferred-away tokens drop out.
 */
export function useNftScan() {
  const { address } = useAccount();
  const client = usePublicClient();

  return useQuery({
    queryKey: ["burner-nfts", address],
    enabled: !!client && !!address,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<BurnerNft[]> => {
      const latest = await logClient.getBlockNumber();
      const fromBlock = latest > SCAN_RANGE ? latest - SCAN_RANGE : 0n;
      const logs = await logClient.getLogs({
        event: NFT_TRANSFER,
        args: { to: address! },
        fromBlock,
        toBlock: latest,
        strict: true,
      });
      const seen = new Map<string, { contract: Address; tokenId: bigint }>();
      for (const l of logs) {
        seen.set(`${l.address.toLowerCase()}:${l.args.tokenId}`, {
          contract: l.address,
          tokenId: l.args.tokenId,
        });
      }
      const candidates = [...seen.values()].slice(0, 60);
      if (candidates.length === 0) return [];

      const owners = await client!.multicall({
        contracts: candidates.map((c) => ({
          address: c.contract,
          abi: NFT_ABI,
          functionName: "ownerOf" as const,
          args: [c.tokenId] as const,
        })),
        allowFailure: true,
      });
      const owned = candidates.filter(
        (_, i) =>
          owners[i]?.status === "success" &&
          String(owners[i]!.result).toLowerCase() === address!.toLowerCase(),
      );
      const contracts = [...new Set(owned.map((c) => c.contract.toLowerCase()))];
      const names = await client!.multicall({
        contracts: contracts.map((c) => ({
          address: c as Address,
          abi: NFT_ABI,
          functionName: "name" as const,
        })),
        allowFailure: true,
      });
      const nameOf = new Map(
        contracts.map((c, i) => [
          c,
          names[i]?.status === "success" ? String(names[i]!.result) : "Unknown collection",
        ]),
      );
      return owned.map((c) => ({
        ...c,
        collection: nameOf.get(c.contract.toLowerCase()) ?? "Unknown collection",
      }));
    },
  });
}

const NFT_TRANSFER_ABI = parseAbi([
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
]);

/** Burn one NFT: safeTransferFrom(me, 0x…dEaD, id). */
export function useNftBurn() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [burning, setBurning] = useState<string | null>(null);

  const burn = async (nft: BurnerNft) => {
    if (burning) return;
    setBurning(`${nft.contract}:${nft.tokenId}`);
    try {
      const hash = await writeContractAsync({
        address: nft.contract,
        abi: NFT_TRANSFER_ABI,
        functionName: "safeTransferFrom",
        args: [address!, DEAD, nft.tokenId],
      });
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("NFT burn reverted");
      push("success", `${nft.collection} #${nft.tokenId} burned 🔥`);
    } catch (e) {
      push("error", e instanceof Error ? e.message : "NFT burn failed");
    } finally {
      setBurning(null);
      qc.invalidateQueries({ queryKey: ["burner-nfts"] });
    }
  };

  return { burn, burning };
}

/* --------------------------------- summary -------------------------------- */

export interface BurnRecord {
  tx: `0x${string}`;
  tsSec: number;
  symbol: string;
  amount: number;
}

/** Past burns — every Transfer from the wallet to 0x…dEaD, from chain logs. */
export function useBurnHistory() {
  const { address } = useAccount();

  return useQuery({
    queryKey: ["burn-history", address],
    enabled: !!address,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<BurnRecord[]> => {
      const latest = await logClient.getBlockNumber();
      const fromBlock = latest > SCAN_RANGE ? latest - SCAN_RANGE : 0n;
      const logs = await logClient.getLogs({
        event: TRANSFER,
        args: { from: address!, to: DEAD },
        fromBlock,
        toBlock: latest,
        strict: true,
      });
      if (logs.length === 0) return [];
      const recent = logs
        .sort((a, b) => Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex)
        .slice(0, 20);
      const tokens = [...new Set(recent.map((l) => l.address.toLowerCase()))];
      const blocks = [...new Set(recent.map((l) => l.blockNumber))];
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
      return recent.flatMap((l) => {
        const m = tokenMeta.get(l.address.toLowerCase());
        if (!m) return [];
        return [
          {
            tx: l.transactionHash as `0x${string}`,
            tsSec: blockTs.get(l.blockNumber) ?? 0,
            symbol: m.symbol,
            amount: Number(l.args.value) / 10 ** m.decimals,
          },
        ];
      });
    },
  });
}
