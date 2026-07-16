// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {LimitOrderBook} from "../src/LimitOrderBook.sol";

/// @notice Deploys LimitOrderBook to Monad mainnet.
/// @dev    forge script script/Deploy.s.sol --rpc-url monad --broadcast --private-key $PRIVATE_KEY
contract Deploy is Script {
    address constant FACTORY = 0x204FAca1764B154221e35c0d20aBb3c525710498;
    address constant ROUTER = 0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;

    function run() external {
        vm.startBroadcast();
        LimitOrderBook book = new LimitOrderBook(FACTORY, ROUTER, WMON);
        vm.stopBroadcast();
        console.log("LimitOrderBook deployed at", address(book));
    }
}
