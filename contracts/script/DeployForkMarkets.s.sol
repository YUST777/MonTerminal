// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ForkRouter} from "../src/ForkRouter.sol";
import {LimitOrderBook} from "../src/LimitOrderBook.sol";

/// @notice Deploys a ForkRouter + LimitOrderBook pair per v3 fork so tokens
///         that only pool on Capricorn / PancakeSwap v3 get the same limit
///         orders as Uniswap v3 tokens.
/// @dev    forge script script/DeployForkMarkets.s.sol --rpc-url monad --broadcast --private-key $PRIVATE_KEY
contract DeployForkMarkets is Script {
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant CAPRICORN_FACTORY = 0x6B5F564339DbAD6b780249827f2198a841FEB7F3;
    address constant PANCAKE_V3_FACTORY = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;

    function run() external {
        vm.startBroadcast();

        ForkRouter capRouter = new ForkRouter(CAPRICORN_FACTORY);
        LimitOrderBook capBook = new LimitOrderBook(CAPRICORN_FACTORY, address(capRouter), WMON);

        ForkRouter pcsRouter = new ForkRouter(PANCAKE_V3_FACTORY);
        LimitOrderBook pcsBook = new LimitOrderBook(PANCAKE_V3_FACTORY, address(pcsRouter), WMON);

        vm.stopBroadcast();

        console.log("Capricorn  ForkRouter    ", address(capRouter));
        console.log("Capricorn  LimitOrderBook", address(capBook));
        console.log("PancakeV3  ForkRouter    ", address(pcsRouter));
        console.log("PancakeV3  LimitOrderBook", address(pcsBook));
    }
}
