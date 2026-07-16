import type { Address } from "viem";
import { erc20Abi } from "viem";
import { LIMIT_ORDER_BOOK_ABI } from "@monolimit/shared";
import type { Clients } from "./clients.ts";
import type { Config } from "./config.ts";
import { isProfitable } from "./gas.ts";
import type { Logger } from "./logger.ts";
import { NonceQueue } from "./nonce.ts";
import type { OrderStore, StoredOrder } from "./orderStore.ts";

/** Per-error retry backoff (ms). TriggerNotMet is the normal "not yet" case. */
const BACKOFF: Record<string, number> = {
  TriggerNotMet: 0, // re-evaluated next poll anyway
  TwapUnavailable: 5_000,
  AllowanceMissing: 30_000,
  BalanceMissing: 30_000,
  Simulation: 10_000,
  Send: 5_000,
};

export class Executor {
  private nonceQueue = new NonceQueue();
  private backoffUntil = new Map<bigint, number>();
  private inFlight = new Set<bigint>();

  constructor(
    private clients: Clients,
    private config: Config,
    private store: OrderStore,
    private log: Logger,
  ) {}

  /** Attempt execution of a pre-filtered order. Never throws. */
  async tryExecute(order: StoredOrder, spotTick: number): Promise<void> {
    const id = order.orderId;
    if (this.inFlight.has(id)) return;
    if ((this.backoffUntil.get(id) ?? 0) > Date.now()) return;
    this.inFlight.add(id);
    try {
      await this.execute(order, spotTick);
    } catch (err) {
      this.log.error({ orderId: id.toString(), err: (err as Error).message }, "unexpected executor error");
      this.backoff(id, "Send");
    } finally {
      this.inFlight.delete(id);
    }
  }

  private async execute(order: StoredOrder, spotTick: number): Promise<void> {
    const { publicClient, walletClient, account } = this.clients;
    const book = this.config.BOOK_ADDRESS as Address;
    const id = order.orderId;

    // Cheap pre-flight: maker still has balance + allowance? (multicalled)
    const [balance, allowance] = await publicClient.multicall({
      contracts: [
        { address: order.tokenIn, abi: erc20Abi, functionName: "balanceOf", args: [order.maker] },
        { address: order.tokenIn, abi: erc20Abi, functionName: "allowance", args: [order.maker, book] },
      ],
      allowFailure: false,
    });
    if (balance < order.amountIn) return this.backoff(id, "BalanceMissing", "maker balance too low");
    if (allowance < order.amountIn) return this.backoff(id, "AllowanceMissing", "maker allowance too low");

    // The contract is the source of truth: simulate executeOrder.
    let request;
    let expectedAmountOut: bigint;
    try {
      const sim = await publicClient.simulateContract({
        address: book,
        abi: LIMIT_ORDER_BOOK_ABI,
        functionName: "executeOrder",
        args: [id],
        account,
      });
      request = sim.request;
      expectedAmountOut = sim.result;
    } catch (err) {
      const msg = (err as Error).message ?? "";
      const named = ["TriggerNotMet", "TwapUnavailable", "OrderNotOpen", "OrderExpired"].find((e) =>
        msg.includes(e),
      );
      if (named === "OrderNotOpen" || named === "OrderExpired") {
        this.store.remove(id);
        return;
      }
      return this.backoff(id, named ?? "Simulation", named ?? msg.slice(0, 160));
    }

    const gasPrice = await publicClient.getGasPrice();
    const gasEstimate = request.gas ?? 400_000n;
    if (!isProfitable(order, spotTick, expectedAmountOut, gasEstimate, gasPrice)) {
      return this.backoff(id, "Simulation", "unprofitable at current gas");
    }

    if (this.config.DRY_RUN) {
      this.log.info(
        {
          orderId: id.toString(),
          to: book,
          fn: "executeOrder",
          args: [id.toString()],
          expectedAmountOut: expectedAmountOut.toString(),
          gasEstimate: gasEstimate.toString(),
        },
        "DRY_RUN: would execute",
      );
      this.backoff(id, "Send"); // don't spam the same order every poll
      return;
    }

    const hash = await this.nonceQueue.enqueue(() => walletClient.writeContract(request));
    this.log.info({ orderId: id.toString(), hash }, "execution sent");
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    if (receipt.status === "success") {
      this.log.info({ orderId: id.toString(), hash, gasUsed: receipt.gasUsed.toString() }, "order executed");
      this.store.remove(id);
    } else {
      this.backoff(id, "Send", "tx reverted on-chain");
    }
  }

  private backoff(id: bigint, kind: string, reason?: string): void {
    const ms = BACKOFF[kind] ?? 10_000;
    if (ms > 0) this.backoffUntil.set(id, Date.now() + ms);
    if (reason && kind !== "TriggerNotMet") {
      this.log.debug({ orderId: id.toString(), kind, reason, backoffMs: ms }, "execution deferred");
    }
  }
}
