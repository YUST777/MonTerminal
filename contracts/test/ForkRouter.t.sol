// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ForkRouter} from "../src/ForkRouter.sol";
import {LimitOrderBook} from "../src/LimitOrderBook.sol";
import {ISwapRouter02} from "../src/interfaces/ISwapRouter02.sol";
import {IWMON} from "../src/interfaces/IWMON.sol";

/// ForkRouter + LimitOrderBook against LIVE v3-fork pools on Monad mainnet:
/// Capricorn (emo/WMON) and PancakeSwap v3 (USDC/WMON). Proves the same book
/// bytecode executes orders on any v3 clone through our minimal router.
contract ForkRouterTest is Test {
    uint256 constant FORK_BLOCK = 88_084_706;

    // Capricorn
    address constant CAP_FACTORY = 0x6B5F564339DbAD6b780249827f2198a841FEB7F3;
    address constant EMO = 0x81A224F8A62f52BdE942dBF23A56df77A10b7777;
    address constant EMO_POOL = 0x714A2694C8d4f0B1bfbA0E5b76240E439df2182D; // emo/WMON 1%
    uint24 constant EMO_FEE = 10_000;

    // PancakeSwap v3
    address constant PCS_FACTORY = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    uint24 constant PCS_FEE = 500;

    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;

    ForkRouter capRouter;
    ForkRouter pcsRouter;
    LimitOrderBook capBook;

    address maker = makeAddr("maker");
    address keeper = makeAddr("keeper");

    function setUp() public {
        vm.createSelectFork(vm.envOr("MONAD_RPC_URL", string("https://rpc.monad.xyz")), FORK_BLOCK);
        capRouter = new ForkRouter(CAP_FACTORY);
        pcsRouter = new ForkRouter(PCS_FACTORY);
        capBook = new LimitOrderBook(CAP_FACTORY, address(capRouter), WMON);
    }

    function _fundWmon(address who, uint256 amount) internal {
        vm.deal(who, amount + 1 ether);
        vm.prank(who);
        IWMON(WMON).deposit{value: amount}();
    }

    function _swap(ForkRouter r, address who, address tokenIn, address tokenOut, uint24 fee, uint256 amountIn)
        internal
        returns (uint256 out)
    {
        vm.startPrank(who);
        IERC20(tokenIn).approve(address(r), amountIn);
        out = r.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: who,
                amountIn: amountIn,
                amountOutMinimum: 1,
                sqrtPriceLimitX96: 0
            })
        );
        vm.stopPrank();
    }

    /* ── router sanity on both forks ─────────────────────────────────────── */

    function test_capricorn_roundTripSwap() public {
        _fundWmon(maker, 100 ether);
        uint256 emoOut = _swap(capRouter, maker, WMON, EMO, EMO_FEE, 100 ether);
        assertGt(emoOut, 0, "bought emo on capricorn");
        assertEq(IERC20(EMO).balanceOf(maker), emoOut);

        uint256 wmonBack = _swap(capRouter, maker, EMO, WMON, EMO_FEE, emoOut);
        assertGt(wmonBack, 90 ether, "round trip within 2x 1% fee + impact");
        // router never holds a balance
        assertEq(IERC20(EMO).balanceOf(address(capRouter)), 0);
        assertEq(IERC20(WMON).balanceOf(address(capRouter)), 0);
    }

    function test_pancake_swap_usesPancakeCallback() public {
        _fundWmon(maker, 50 ether);
        uint256 usdcOut = _swap(pcsRouter, maker, WMON, USDC, PCS_FEE, 50 ether);
        assertGt(usdcOut, 0, "bought USDC on pancake v3");
        assertEq(IERC20(USDC).balanceOf(address(pcsRouter)), 0);
    }

    function test_router_slippageReverts() public {
        _fundWmon(maker, 1 ether);
        vm.startPrank(maker);
        IERC20(WMON).approve(address(capRouter), 1 ether);
        vm.expectRevert(ForkRouter.Slippage.selector);
        capRouter.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: WMON,
                tokenOut: EMO,
                fee: EMO_FEE,
                recipient: maker,
                amountIn: 1 ether,
                amountOutMinimum: type(uint128).max,
                sqrtPriceLimitX96: 0
            })
        );
        vm.stopPrank();
    }

    function test_callback_rejectsImpostor() public {
        vm.expectRevert(ForkRouter.BadCallback.selector);
        capRouter.uniswapV3SwapCallback(1e18, 0, abi.encode(ForkRouter.CallbackData(WMON, EMO, EMO_FEE, maker)));
    }

    /* ── full order lifecycle on Capricorn ───────────────────────────────── */

    function _buyEmo(address who, uint256 wmonIn) internal returns (uint256) {
        _fundWmon(who, wmonIn);
        return _swap(capRouter, who, WMON, EMO, EMO_FEE, wmonIn);
    }

    function test_capricorn_takeProfit_executes() public {
        uint256 bag = _buyEmo(maker, 100 ether);

        // Tight TP: minAmountOut just below what the pool currently pays.
        uint256 spotQuote = _quoteEmoToWmon(bag);
        vm.startPrank(maker);
        IERC20(EMO).approve(address(capBook), bag);
        LimitOrderBook.OrderParams[] memory ps = new LimitOrderBook.OrderParams[](1);
        ps[0] = LimitOrderBook.OrderParams({
            tokenIn: EMO,
            tokenOut: WMON,
            poolFee: EMO_FEE,
            amountIn: uint128(bag),
            minAmountOut: uint128(spotQuote * 95 / 100),
            triggerTick: 0,
            maxSlippageBps: 0,
            expiry: 0,
            keeperFeeBps: 30,
            kind: LimitOrderBook.OrderKind.TakeProfit,
            unwrapToNative: true
        });
        uint256 id = capBook.placeOrders(ps)[0];
        vm.stopPrank();

        uint256 makerBefore = maker.balance;
        vm.prank(keeper);
        capBook.executeOrder(id);

        assertGt(maker.balance - makerBefore, spotQuote * 90 / 100, "maker paid native MON");
        assertGt(IERC20(WMON).balanceOf(keeper), 0, "keeper earned fee");
        assertEq(IERC20(EMO).balanceOf(address(capBook)), 0, "book retains nothing");
        assertEq(IERC20(WMON).balanceOf(address(capBook)), 0);
    }

    function test_capricorn_stopLoss_twapGating() public {
        uint256 bag = _buyEmo(maker, 100 ether);

        // emo is token0 (0x81a… < WMON 0x3bd…)? Compare addresses to derive direction.
        bool emoIsToken0 = EMO < WMON;
        (, int24 spot,,,,,) = IPoolSlot0(EMO_POOL).slot0();
        // SL trigger 5% below spot in emo terms: price of token0 falls when tick falls.
        int24 trigger = emoIsToken0 ? spot - 500 : spot + 500;

        vm.startPrank(maker);
        IERC20(EMO).approve(address(capBook), bag);
        LimitOrderBook.OrderParams[] memory ps = new LimitOrderBook.OrderParams[](1);
        ps[0] = LimitOrderBook.OrderParams({
            tokenIn: EMO,
            tokenOut: WMON,
            poolFee: EMO_FEE,
            amountIn: uint128(bag),
            minAmountOut: 1,
            triggerTick: trigger,
            maxSlippageBps: 500,
            expiry: 0,
            keeperFeeBps: 30,
            kind: LimitOrderBook.OrderKind.StopLoss,
            unwrapToNative: true
        });
        uint256 id = capBook.placeOrders(ps)[0];
        vm.stopPrank();

        // Not fired at current price.
        vm.prank(keeper);
        vm.expectRevert(LimitOrderBook.TriggerNotMet.selector);
        capBook.executeOrder(id);

        // One-way dump: mint emo to a dumper (cheatcode) and market-sell it.
        address dumper = makeAddr("dumper");
        uint256 dumpSize = IERC20(EMO).balanceOf(EMO_POOL) / 4; // big enough to move the tick
        deal(EMO, dumper, dumpSize);
        _swap(capRouter, dumper, EMO, WMON, EMO_FEE, dumpSize);

        (, int24 afterTick,,,,,) = IPoolSlot0(EMO_POOL).slot0();
        assertTrue(emoIsToken0 ? afterTick <= trigger : afterTick >= trigger, "dump crossed trigger");

        // Same block: spot crossed but the 60s TWAP has not — still gated.
        vm.prank(keeper);
        vm.expectRevert(LimitOrderBook.TriggerNotMet.selector);
        capBook.executeOrder(id);

        // After the TWAP window elapses it fires, paying at least the dynamic floor.
        vm.warp(block.timestamp + 61);
        uint256 makerBefore = maker.balance;
        vm.prank(keeper);
        capBook.executeOrder(id);
        assertGt(maker.balance - makerBefore, 0, "SL paid out native MON");
        assertEq(IERC20(EMO).balanceOf(address(capBook)), 0, "book retains nothing");
    }

    function _quoteEmoToWmon(uint256 amountIn) internal returns (uint256) {
        // Static-call a real swap on a snapshot to learn the current fill.
        uint256 snap = vm.snapshotState();
        address probe = makeAddr("probe");
        deal(EMO, probe, amountIn);
        uint256 out = _swap(capRouter, probe, EMO, WMON, EMO_FEE, amountIn);
        vm.revertToState(snap);
        return out;
    }
}

interface IPoolSlot0 {
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool);
}
