import { afterEach, describe, expect, it, vi } from "vitest";
import { getGecko } from "../server/geckoGateway.ts";
import { getPortfolioHistory } from "../server/portfolioHistoryApi.ts";
import { forwardRpc, rpcUpstreams } from "../server/rpcGateway.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RPC gateway", () => {
  it("uses only configured HTTPS upstreams", () => {
    expect(rpcUpstreams(" http://bad.example, https://one.example ,ftp://bad ")).toEqual([
      "https://one.example",
    ]);
  });

  it("rejects disallowed methods before contacting an upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      forwardRpc({ jsonrpc: "2.0", id: 1, method: "admin_peers", params: [] }),
    ).rejects.toThrow("RPC method is not allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails over and returns the first successful JSON-RPC response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x8f" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      forwardRpc(
        { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
        { upstreams: ["https://one.example", "https://two.example"] },
      ),
    ).resolves.toMatchObject({ result: "0x8f" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("data gateway validation", () => {
  it("rejects non-Monad Gecko paths without an upstream request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getGecko("/api/v2/networks/ethereum/pools")).rejects.toThrow(
      "Only Monad Gecko data is allowed",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty portfolio history request", async () => {
    await expect(getPortfolioHistory({ pools: [], window: "week" })).rejects.toThrow(
      "Invalid pool count",
    );
  });
});
