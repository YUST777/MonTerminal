/**
 * On-chain token metadata — pump.fun-style launchpad tokens often expose
 * `getTokenInfo()` returning the creator, a media URI (usually `ipfs://…`
 * pointing straight at the logo PNG) and social links. Free, unlimited (it's
 * just our RPC), and works the second a token launches — long before
 * GeckoTerminal or DexScreener have any media for it. Tokens without the
 * method simply revert and resolve to null.
 */

import type { Address, PublicClient } from "viem";

/** Verified against live pons tokens: (creator, uri, description, 5 socials). */
const TOKEN_INFO_ABI = [
  {
    type: "function",
    name: "getTokenInfo",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "creator", type: "address" },
      { name: "uri", type: "string" },
      { name: "description", type: "string" },
      {
        name: "socials",
        type: "tuple",
        components: [
          { name: "s0", type: "string" },
          { name: "s1", type: "string" },
          { name: "s2", type: "string" },
          { name: "s3", type: "string" },
          { name: "s4", type: "string" },
        ],
      },
    ],
  },
] as const;

export interface OnchainTokenInfo {
  creator: Address;
  imageUrl: string | null;
  description: string | null;
  /** non-empty social/website links, in launchpad order */
  links: string[];
}

/** ipfs://CID → public gateway URL; http(s) passes through; anything else → null. */
function resolveUri(uri: string): string | null {
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  if (/^https?:\/\//.test(uri)) return uri;
  return null;
}

/** Some launches point the URI at a pump.fun-style JSON instead of the image. */
async function resolveImage(uri: string): Promise<{ image: string | null; description?: string }> {
  const url = resolveUri(uri);
  if (!url) return { image: null };
  if (!/\.json($|\?)/i.test(url)) return { image: url };
  try {
    const json = await fetch(url).then((r) => (r.ok ? r.json() : null));
    const image = typeof json?.image === "string" ? resolveUri(json.image) : null;
    return { image, description: typeof json?.description === "string" ? json.description : undefined };
  } catch {
    return { image: null };
  }
}

function parseInfo(r: readonly [Address, string, string, Record<string, string>]): {
  creator: Address;
  uri: string;
  description: string;
  links: string[];
} {
  const [creator, uri, description, socials] = r;
  return {
    creator,
    uri,
    description,
    links: Object.values(socials).filter((s) => typeof s === "string" && s.length > 0),
  };
}

/** Full metadata for one token — null when it's not a launchpad token. */
export async function fetchOnchainTokenInfo(
  client: PublicClient,
  token: Address,
): Promise<OnchainTokenInfo | null> {
  try {
    const raw = await client.readContract({
      address: token,
      abi: TOKEN_INFO_ABI,
      functionName: "getTokenInfo",
    });
    const info = parseInfo(raw as never);
    const { image, description } = await resolveImage(info.uri);
    return {
      creator: info.creator,
      imageUrl: image,
      description: description ?? (info.description || null),
      links: info.links,
    };
  } catch {
    return null; // plain ERC-20 without getTokenInfo
  }
}

/**
 * Logos for many tokens in ONE multicall — feeds the pool tables. JSON-uri
 * launches resolve in parallel afterwards; failures just miss the map.
 */
export async function fetchOnchainIcons(
  client: PublicClient,
  tokens: Address[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (tokens.length === 0) return out;
  const results = await client.multicall({
    contracts: tokens.map((address) => ({
      address,
      abi: TOKEN_INFO_ABI,
      functionName: "getTokenInfo" as const,
    })),
    allowFailure: true,
  });
  await Promise.all(
    results.map(async (r, i) => {
      if (r.status !== "success") return;
      const { image } = await resolveImage(parseInfo(r.result as never).uri);
      if (image) out.set(tokens[i]!.toLowerCase(), image);
    }),
  );
  return out;
}
