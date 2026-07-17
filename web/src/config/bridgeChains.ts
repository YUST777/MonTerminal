// AUTO-GENERATED from https://api.relay.link/chains (refreshed 2026-07-17).
// Every EVM chain Relay can bridge from, beyond the majors pinned in
// wagmi.ts. Monad itself is excluded — it's the home chain. Non-EVM
// chains (Solana, Tron, Bitcoin, TON…) and deposit-disabled ones are out.
// RPC endpoints are the ones Relay itself publishes.
import { defineChain, type Chain } from "viem";

const evm = (
  id: number,
  name: string,
  symbol: string,
  decimals: number,
  rpc: string,
  explorer: string,
): Chain =>
  defineChain({
    id,
    name,
    nativeCurrency: { name: symbol, symbol, decimals },
    rpcUrls: { default: { http: [rpc] } },
    ...(explorer
      ? { blockExplorers: { default: { name: "Explorer", url: explorer } } }
      : {}),
  });

/** Alphabetical — the majors (ETH, Base, Arbitrum, OP, BNB, Polygon) stay pinned first in wagmi.ts. */
export const EXTRA_ORIGINS = [
  evm(2741, "Abstract", "ETH", 18, "https://api.mainnet.abs.xyz", "https://abscan.org"),
  evm(69000, "Animechain", "ANIME", 18, "https://public-rpc.anime.xyz/", "https://explorer-animechain-39xf6m45e3.t.conduit.xyz"),
  evm(33139, "ApeChain", "APE", 18, "https://apechain.calderachain.xyz/http", "https://apescan.io"),
  evm(43114, "Avalanche", "AVAX", 18, "https://api.avax.network/ext/bc/C/rpc", "https://snowtrace.io"),
  evm(8333, "B3", "ETH", 18, "https://mainnet-rpc.b3.fun/http", "https://explorer.b3.fun"),
  evm(80094, "Berachain", "BERA", 18, "https://rpc.berachain.com/", "https://beratrail.io"),
  evm(81457, "Blast", "ETH", 18, "https://rpc.blast.io/", "https://blastscan.io"),
  evm(60808, "BOB", "ETH", 18, "https://rpc.gobob.xyz/", "https://explorer.gobob.xyz"),
  evm(288, "Boba Network", "ETH", 18, "https://mainnet.boba.network", "https://bobascan.com"),
  evm(42220, "Celo", "CELO", 18, "https://forno.celo.org", "https://celoscan.io"),
  evm(25, "Cronos", "CRO", 18, "https://cronos.drpc.org", "https://cronoscan.com"),
  evm(7560, "Cyber", "ETH", 18, "https://cyber.alt.technology/", "https://cyberscan.co"),
  evm(1514, "Data", "DATA", 18, "https://mainnet.datarpc.io", "https://www.datanetscan.io"),
  evm(666666666, "Degen", "DEGEN", 18, "https://rpc.degen.tips", "https://explorer.degen.tips"),
  evm(97477, "Doma", "ETH", 18, "https://doma.drpc.org", "https://explorer.doma.xyz"),
  evm(5064014, "Ethereal", "USDe", 18, "https://rpc.ethereal.trade", "https://explorer.ethereal.trade"),
  evm(747, "Flow EVM", "FLOW", 18, "https://mainnet.evm.nodes.onflow.org", "https://evm.flowscan.io"),
  evm(685689, "Gensyn", "ETH", 18, "https://gensyn-mainnet.g.alchemy.com/public", "https://gensyn-mainnet.explorer.alchemy.com"),
  evm(100, "Gnosis", "xDAI", 18, "https://rpc.gnosischain.com/", "https://gnosisscan.io"),
  evm(43419, "Gunz", "GUN", 18, "https://subnets.avax.network/gunzilla/mainnet/rpc", "https://gunzscan.io"),
  evm(43111, "Hemi", "ETH", 18, "https://rpc.hemi.network/rpc", "https://explorer.hemi.xyz"),
  evm(999, "HyperEVM", "HYPE", 18, "https://rpc.hyperliquid.xyz/evm", "https://hyperevmscan.io"),
  evm(57073, "Ink", "ETH", 18, "https://ink.drpc.org", "https://explorer.inkonchain.com"),
  evm(747474, "Katana", "ETH", 18, "https://rpc.katana.network", "https://explorer.katanarpc.com"),
  evm(59144, "Linea", "ETH", 18, "https://rpc.linea.build", "https://lineascan.build"),
  evm(1135, "Lisk", "ETH", 18, "https://rpc.api.lisk.com", "https://blockscout.lisk.com"),
  evm(169, "Manta Pacific", "ETH", 18, "https://pacific-rpc.manta.network/http", "https://pacific-explorer.manta.network"),
  evm(5000, "Mantle", "MNT", 18, "https://rpc.mantle.xyz", "https://mantlescan.xyz"),
  evm(4326, "MegaETH", "ETH", 18, "https://mainnet.megaeth.com/rpc", "https://megaeth.blockscout.com"),
  evm(1088, "Metis", "METIS", 18, "https://metis-rpc.publicnode.com", "https://explorer.metis.io"),
  evm(34443, "Mode", "ETH", 18, "https://mainnet.mode.network/", "https://explorer.mode.network"),
  evm(2818, "Morph", "ETH", 18, "https://rpc-quicknode.morphl2.io", "https://explorer.morphl2.io"),
  evm(42018, "Mythos", "ETH", 18, "https://mythos-mainnet.g.alchemy.com/public/", "https://mythos-mainnet.explorer.alchemy.com"),
  evm(9745, "Plasma", "XPL", 18, "https://rpc.plasma.to", "https://plasmascan.to"),
  evm(98866, "Plume", "PLUME", 18, "https://rpc.plume.org", "https://explorer.plume.org"),
  evm(4663, "Robinhood Chain", "ETH", 18, "https://rpc.mainnet.chain.robinhood.com", "https://8crv4vmq6tiu1yqr.blockscout.com"),
  evm(2020, "Ronin", "RON", 18, "https://api.roninchain.com/rpc", "https://explorer.roninchain.com"),
  evm(534352, "Scroll", "ETH", 18, "https://rpc.scroll.io/", "https://scrollscan.com"),
  evm(1329, "Sei", "SEI", 18, "https://evm-rpc.sei-apis.com", "https://seitrace.com"),
  evm(360, "Shape", "ETH", 18, "https://mainnet.shape.network", "https://shapescan.xyz"),
  evm(5031, "Somnia", "SOMI", 18, "https://api.infra.mainnet.somnia.network", "https://explorer.somnia.network"),
  evm(1868, "Soneium", "ETH", 18, "https://rpc.soneium.org/", "https://soneium.blockscout.com"),
  evm(146, "Sonic", "S", 18, "https://rpc.soniclabs.com", "https://sonicscan.org"),
  evm(988, "Stable", "gUSDT", 18, "https://rpc.stable.xyz", "https://stablescan.xyz"),
  evm(55244, "Superposition", "ETH", 18, "https://rpc.superposition.so", "https://explorer.superposition.so"),
  evm(5330, "Superseed", "ETH", 18, "https://mainnet.superseed.xyz", "https://explorer.superseed.xyz"),
  evm(4217, "Tempo", "USD", 18, "https://rpc.mainnet.tempo.xyz", "https://explore.tempo.xyz"),
  evm(130, "Unichain", "ETH", 18, "https://mainnet.unichain.org", "https://uniscan.xyz"),
  evm(480, "World Chain", "ETH", 18, "https://worldchain-mainnet.gateway.tenderly.co", "https://worldscan.org"),
  evm(48900, "Zircuit", "ETH", 18, "https://mainnet.zircuit.com", "https://explorer.zircuit.com"),
  evm(324, "zkSync Era", "ETH", 18, "https://mainnet.era.zksync.io", "https://explorer.zksync.io"),
  evm(7777777, "Zora", "ETH", 18, "https://rpc.zora.energy", "https://explorer.zora.energy"),
] as const;
