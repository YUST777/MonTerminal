import type { Address } from "viem";

/** Relay's convention: the zero address means the chain's native gas token. */
export const NATIVE_TOKEN: Address = "0x0000000000000000000000000000000000000000";

export interface BridgeToken {
  symbol: string;
  name: string;
  /** ERC-20 address, or the zero address for the native gas token. */
  address: Address;
  decimals: number;
  logo: string;
}

export const isNative = (t: BridgeToken) => t.address === NATIVE_TOKEN;

/**
 * Native gas token synthesized from a chain's registry entry — the fallback
 * for the 52 generated chains that have no static BRIDGE_TOKENS list.
 */
export const nativeFromChain = (chain: {
  nativeCurrency: { name: string; symbol: string; decimals: number };
}): BridgeToken => ({
  symbol: chain.nativeCurrency.symbol,
  name: chain.nativeCurrency.name,
  address: NATIVE_TOKEN,
  decimals: chain.nativeCurrency.decimals,
  // ETH natives share the canonical mark; other gas tokens fall back to the
  // letter avatar until the live Relay list supplies real artwork.
  logo: chain.nativeCurrency.symbol === "ETH" ? LOGO.ETH : "",
});

const TW = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";
const chainLogo = (slug: string) => `${TW}/${slug}/info/logo.png`;
const assetLogo = (slug: string, addr: string) => `${TW}/${slug}/assets/${addr}/logo.png`;

// Shared logos — same artwork regardless of which chain the token lives on.
const LOGO = {
  ETH: chainLogo("ethereum"),
  WETH: assetLogo("ethereum", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
  USDC: assetLogo("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
  USDT: assetLogo("ethereum", "0xdAC17F958D2ee523a2206206994597C13D831ec7"),
  DAI: assetLogo("ethereum", "0x6B175474E89094C44Da98b954EedeAC495271d0F"),
  WBTC: assetLogo("ethereum", "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"),
  BNB: chainLogo("smartchain"),
  POL: chainLogo("polygon"),
};

const native = (symbol: string, name: string, logo: string): BridgeToken => ({
  symbol,
  name,
  address: NATIVE_TOKEN,
  decimals: 18,
  logo,
});

const erc20 = (
  symbol: string,
  name: string,
  address: Address,
  decimals: number,
  logo: string,
): BridgeToken => ({ symbol, name, address, decimals, logo });

/**
 * Static fallback token list per chain id (native gas token always first).
 * The picker fetches the live list from Relay's currencies API and only
 * falls back to these while loading / offline.
 */
export const BRIDGE_TOKENS: Record<number, BridgeToken[]> = {
  // Monad (Relay verified list — addresses from api.relay.link/currencies)
  143: [
    native("MON", "Monad", chainLogo("monad")),
    erc20("WMON", "Wrapped Monad", "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A", 18, chainLogo("monad")),
    erc20(
      "USDC",
      "USD Coin",
      "0x754704Bc059F8C67012fED69BC8a327a5AAfb603",
      6,
      LOGO.USDC,
    ),
    erc20(
      "mUSD",
      "MetaMask USD",
      "0xacA92E438df0B2401fF60dA7E4337B687a2435DA",
      6,
      "https://coin-images.coingecko.com/coins/images/68451/large/MetaMask-mUSD-Icon-200x200.png",
    ),
  ],
  // Ethereum
  1: [
    native("ETH", "Ether", LOGO.ETH),
    erc20("WETH", "Wrapped Ether", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 18, LOGO.WETH),
    erc20("USDC", "USD Coin", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6, LOGO.USDC),
    erc20("USDT", "Tether USD", "0xdAC17F958D2ee523a2206206994597C13D831ec7", 6, LOGO.USDT),
    erc20("DAI", "Dai Stablecoin", "0x6B175474E89094C44Da98b954EedeAC495271d0F", 18, LOGO.DAI),
    erc20("WBTC", "Wrapped BTC", "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 8, LOGO.WBTC),
  ],
  // Base
  8453: [
    native("ETH", "Ether", LOGO.ETH),
    erc20("WETH", "Wrapped Ether", "0x4200000000000000000000000000000000000006", 18, LOGO.WETH),
    erc20("USDC", "USD Coin", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6, LOGO.USDC),
    erc20("USDT", "Tether USD", "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", 6, LOGO.USDT),
    erc20("DAI", "Dai Stablecoin", "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", 18, LOGO.DAI),
    erc20(
      "cbBTC",
      "Coinbase Wrapped BTC",
      "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      8,
      assetLogo("ethereum", "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"),
    ),
  ],
  // Arbitrum One
  42161: [
    native("ETH", "Ether", LOGO.ETH),
    erc20("WETH", "Wrapped Ether", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", 18, LOGO.WETH),
    erc20("USDC", "USD Coin", "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", 6, LOGO.USDC),
    erc20("USDT", "Tether USD", "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", 6, LOGO.USDT),
    erc20("DAI", "Dai Stablecoin", "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", 18, LOGO.DAI),
    erc20("WBTC", "Wrapped BTC", "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", 8, LOGO.WBTC),
    erc20(
      "ARB",
      "Arbitrum",
      "0x912CE59144191C1204E64559FE8253a0e49E6548",
      18,
      assetLogo("arbitrum", "0x912CE59144191C1204E64559FE8253a0e49E6548"),
    ),
  ],
  // OP Mainnet
  10: [
    native("ETH", "Ether", LOGO.ETH),
    erc20("WETH", "Wrapped Ether", "0x4200000000000000000000000000000000000006", 18, LOGO.WETH),
    erc20("USDC", "USD Coin", "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", 6, LOGO.USDC),
    erc20("USDT", "Tether USD", "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", 6, LOGO.USDT),
    erc20("DAI", "Dai Stablecoin", "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", 18, LOGO.DAI),
    erc20("WBTC", "Wrapped BTC", "0x68f180fcCe6836688e9084f035309E29Bf0A2095", 8, LOGO.WBTC),
    erc20(
      "OP",
      "Optimism",
      "0x4200000000000000000000000000000000000042",
      18,
      assetLogo("optimism", "0x4200000000000000000000000000000000000042"),
    ),
  ],
  // BNB Smart Chain (note: USDT/USDC are 18 decimals on BSC)
  56: [
    native("BNB", "BNB", LOGO.BNB),
    erc20("WBNB", "Wrapped BNB", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 18, LOGO.BNB),
    erc20("USDT", "Tether USD", "0x55d398326f99059fF775485246999027B3197955", 18, LOGO.USDT),
    erc20("USDC", "USD Coin", "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 18, LOGO.USDC),
    erc20("ETH", "Binance-Peg Ether", "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", 18, LOGO.ETH),
    erc20(
      "BTCB",
      "Binance BTC",
      "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
      18,
      assetLogo("smartchain", "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c"),
    ),
    erc20("DAI", "Dai Stablecoin", "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", 18, LOGO.DAI),
  ],
  // Polygon
  137: [
    native("POL", "Polygon Ecosystem Token", LOGO.POL),
    erc20("WPOL", "Wrapped POL", "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", 18, LOGO.POL),
    erc20("USDC", "USD Coin", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", 6, LOGO.USDC),
    erc20("USDC.e", "Bridged USDC", "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", 6, LOGO.USDC),
    erc20("USDT", "Tether USD", "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", 6, LOGO.USDT),
    erc20("WETH", "Wrapped Ether", "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", 18, LOGO.WETH),
    erc20("DAI", "Dai Stablecoin", "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", 18, LOGO.DAI),
    erc20("WBTC", "Wrapped BTC", "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", 8, LOGO.WBTC),
  ],
};
