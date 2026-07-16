import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad } from "@monolimit/shared";
import type { Config } from "./config.ts";

export interface Clients {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, Account>;
  account: Account;
}

export function createClients(config: Config): Clients {
  const transport = fallback(
    config.RPC_URLS.map((url) => http(url, { timeout: 5_000, retryCount: 1 })),
    { rank: false },
  );
  const account = privateKeyToAccount(config.PRIVATE_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: monad,
    transport,
    batch: { multicall: { wait: 16 } },
  }) as PublicClient;

  const walletClient = createWalletClient({ account, chain: monad, transport });
  return { publicClient, walletClient, account };
}
