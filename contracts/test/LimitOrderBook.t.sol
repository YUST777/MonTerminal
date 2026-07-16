// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import {LimitOrderBook} from "../src/LimitOrderBook.sol";
import {ISwapRouter02} from "../src/interfaces/ISwapRouter02.sol";
import {IWMON} from "../src/interfaces/IWMON.sol";
import {PoolPriceLib} from "../src/libraries/PoolPriceLib.sol";
import {
    ContractMaker,
    LiquidityHelper,
    MockERC20,
    MockFOT,
    ReentrantMaker,
    RejectingMaker
} from "./helpers/Handlers.sol";

/// @notice Fork tests against pinned Monad mainnet state.
///         Pool under test: WMON/USDC 0.3% (WMON is token0).
contract LimitOrderBookForkTest is Test {
    // Monad mainnet
    address constant FACTORY = 0x204FAca1764B154221e35c0d20aBb3c525710498;
    address constant ROUTER = 0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    uint24 constant POOL_FEE = 3000;
    uint256 constant FORK_BLOCK = 88_065_146;

    LimitOrderBook book;
    IUniswapV3Pool pool;
    address maker = makeAddr("maker");
    address keeper = makeAddr("keeper");

    function setUp() public {
        vm.createSelectFork(vm.envOr("MONAD_RPC_URL", string("https://rpc.monad.xyz")), FORK_BLOCK);
        book = new LimitOrderBook(FACTORY, ROUTER, WMON);
        pool = IUniswapV3Pool(IUniswapV3Factory(FACTORY).getPool(WMON, USDC, POOL_FEE));
        assertTrue(address(pool) != address(0), "pool missing");
        assertEq(pool.token0(), WMON, "WMON must be token0");
    }

    // ─────────────────────────────── helpers ────────────────────────────────

    function _fundWmon(address who, uint256 amount) internal {
        vm.deal(who, amount + 1 ether);
        vm.prank(who);
        IWMON(WMON).deposit{value: amount}();
        vm.prank(who);
        IERC20(WMON).approve(address(book), type(uint256).max);
    }

    /// @dev Acquire USDC by swapping WMON through the live pool (no deal-slot guesswork).
    function _fundUsdc(address who, uint256 wmonToSell) internal {
        address whale = makeAddr("usdc-source");
        vm.deal(whale, wmonToSell + 1 ether);
        vm.startPrank(whale);
        IWMON(WMON).deposit{value: wmonToSell}();
        IERC20(WMON).approve(ROUTER, wmonToSell);
        ISwapRouter02(ROUTER).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: WMON,
                tokenOut: USDC,
                fee: POOL_FEE,
                recipient: who,
                amountIn: wmonToSell,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        vm.stopPrank();
    }

    function _swap(address trader, address tokenIn, address tokenOut, uint256 amountIn) internal {
        vm.startPrank(trader);
        IERC20(tokenIn).approve(ROUTER, amountIn);
        ISwapRouter02(ROUTER).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: POOL_FEE,
                recipient: trader,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        vm.stopPrank();
    }

    function _spotTick() internal view returns (int24 tick) {
        (, tick,,,,,) = pool.slot0();
    }

    function _twap() internal view returns (int24) {
        return PoolPriceLib.twapTick(pool, 60);
    }

    /// @dev Invariant: the book must never hold funds between transactions.
    function _assertBookEmpty() internal view {
        assertEq(IERC20(WMON).balanceOf(address(book)), 0, "book holds WMON");
        assertEq(IERC20(USDC).balanceOf(address(book)), 0, "book holds USDC");
        assertEq(address(book).balance, 0, "book holds native");
    }

    function _defaultTp(uint128 amountIn, uint128 minOut)
        internal
        pure
        returns (LimitOrderBook.OrderParams memory p)
    {
        p = LimitOrderBook.OrderParams({
            tokenIn: WMON,
            tokenOut: USDC,
            poolFee: POOL_FEE,
            amountIn: amountIn,
            minAmountOut: minOut,
            triggerTick: 0,
            maxSlippageBps: 0,
            expiry: 0,
            keeperFeeBps: 30,
            kind: LimitOrderBook.OrderKind.TakeProfit,
            unwrapToNative: false
        });
    }

    function _defaultSl(uint128 amountIn, int24 triggerTick)
        internal
        pure
        returns (LimitOrderBook.OrderParams memory p)
    {
        p = LimitOrderBook.OrderParams({
            tokenIn: WMON,
            tokenOut: USDC,
            poolFee: POOL_FEE,
            amountIn: amountIn,
            minAmountOut: 1,
            triggerTick: triggerTick,
            maxSlippageBps: 500,
            expiry: 0,
            keeperFeeBps: 30,
            kind: LimitOrderBook.OrderKind.StopLoss,
            unwrapToNative: false
        });
    }

    function _placeOne(LimitOrderBook.OrderParams memory p) internal returns (uint256) {
        LimitOrderBook.OrderParams[] memory arr = new LimitOrderBook.OrderParams[](1);
        arr[0] = p;
        vm.prank(maker);
        return book.placeOrders(arr)[0];
    }

    /// @dev Like _placeOne but never indexes the result — safe under expectRevert.
    function _tryPlace(LimitOrderBook.OrderParams memory p) internal {
        LimitOrderBook.OrderParams[] memory arr = new LimitOrderBook.OrderParams[](1);
        arr[0] = p;
        vm.prank(maker);
        book.placeOrders(arr);
    }

    // ────────────────────────── placement validation ─────────────────────────

    function test_place_revertsOnZeroAmount() public {
        LimitOrderBook.OrderParams memory p = _defaultTp(0, 1);
        vm.expectRevert(LimitOrderBook.ZeroAmount.selector);
        _tryPlace(p);
    }

    function test_place_revertsOnZeroMinOut() public {
        LimitOrderBook.OrderParams memory p = _defaultTp(1e18, 0);
        vm.expectRevert(LimitOrderBook.BadMinAmountOut.selector);
        _tryPlace(p);
    }

    function test_place_revertsOnSameToken() public {
        LimitOrderBook.OrderParams memory p = _defaultTp(1e18, 1);
        p.tokenOut = WMON;
        vm.expectRevert(LimitOrderBook.SameToken.selector);
        _tryPlace(p);
    }

    function test_place_revertsOnMissingPool() public {
        LimitOrderBook.OrderParams memory p = _defaultTp(1e18, 1);
        p.poolFee = 12345;
        vm.expectRevert(LimitOrderBook.PoolMissing.selector);
        _tryPlace(p);
    }

    function test_place_revertsOnPastExpiry() public {
        LimitOrderBook.OrderParams memory p = _defaultTp(1e18, 1);
        p.expiry = uint40(block.timestamp);
        vm.expectRevert(LimitOrderBook.BadExpiry.selector);
        _tryPlace(p);
    }

    function test_place_revertsOnBadSlippage() public {
        // TP must not carry a slippage budget
        LimitOrderBook.OrderParams memory tp = _defaultTp(1e18, 1);
        tp.maxSlippageBps = 100;
        vm.expectRevert(LimitOrderBook.BadSlippage.selector);
        _tryPlace(tp);

        // SL must carry one, within bounds
        LimitOrderBook.OrderParams memory sl = _defaultSl(1e18, 0);
        sl.maxSlippageBps = 0;
        vm.expectRevert(LimitOrderBook.BadSlippage.selector);
        _tryPlace(sl);

        sl.maxSlippageBps = 5001;
        vm.expectRevert(LimitOrderBook.BadSlippage.selector);
        _tryPlace(sl);
    }

    function test_place_revertsOnBadUnwrap() public {
        LimitOrderBook.OrderParams memory p = _defaultTp(1e18, 1);
        p.unwrapToNative = true; // tokenOut is USDC, not WMON
        vm.expectRevert(LimitOrderBook.BadUnwrap.selector);
        _tryPlace(p);
    }

    function test_place_derivesTriggerDirection() public {
        // WMON is token0: SL (price of WMON falls) fires when tick goes DOWN.
        uint256 slId = _placeOne(_defaultSl(1e18, _spotTick() - 100));
        assertTrue(book.getOrder(slId).triggerWhenTickBelow);

        // TP on WMON fires when tick goes UP.
        uint256 tpId = _placeOne(_defaultTp(1e18, 1));
        assertFalse(book.getOrder(tpId).triggerWhenTickBelow);

        // Inverted for tokenIn == token1 (USDC in, WMON out).
        LimitOrderBook.OrderParams memory p = _defaultTp(1e6, 1);
        p.tokenIn = USDC;
        p.tokenOut = WMON;
        uint256 invId = _placeOne(p);
        assertTrue(book.getOrder(invId).triggerWhenTickBelow);
    }

    function test_place_clampsKeeperFee() public {
        LimitOrderBook.OrderParams memory p = _defaultTp(1e18, 1);
        p.keeperFeeBps = 0;
        uint256 low = _placeOne(p);
        assertEq(book.getOrder(low).keeperFeeBps, book.MIN_KEEPER_FEE_BPS());

        p.keeperFeeBps = 10_000;
        uint256 high = _placeOne(p);
        assertEq(book.getOrder(high).keeperFeeBps, book.MAX_KEEPER_FEE_BPS());
    }

    function testFuzz_place_keeperFeeAlwaysClamped(uint16 feeBps) public {
        LimitOrderBook.OrderParams memory p = _defaultTp(1e18, 1);
        p.keeperFeeBps = feeBps;
        uint256 id = _placeOne(p);
        uint16 stored = book.getOrder(id).keeperFeeBps;
        assertGe(stored, book.MIN_KEEPER_FEE_BPS());
        assertLe(stored, book.MAX_KEEPER_FEE_BPS());
    }

    function test_place_growsObservationCardinalityForSl() public {
        (,,,, uint16 cardinalityNextBefore,,) = pool.slot0();
        _placeOne(_defaultSl(1e18, _spotTick() - 100));
        (,,,, uint16 cardinalityNextAfter,,) = pool.slot0();
        assertGe(cardinalityNextAfter, book.TWAP_CARDINALITY());
        assertGe(cardinalityNextAfter, cardinalityNextBefore);
    }

    function test_place_ladderAtomically() public {
        _fundWmon(maker, 1000e18);
        LimitOrderBook.OrderParams[] memory arr = new LimitOrderBook.OrderParams[](3);
        arr[0] = _defaultSl(100e18, _spotTick() - 7000); // −50% stop
        arr[1] = _defaultTp(50e18, 1); // 2x leg
        arr[2] = _defaultTp(25e18, 1); // 5x leg
        vm.prank(maker);
        uint256[] memory ids = book.placeOrders(arr);
        assertEq(ids.length, 3);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(uint8(book.getOrder(ids[i]).status), uint8(LimitOrderBook.OrderStatus.Open));
            assertEq(book.getOrder(ids[i]).maker, maker);
        }
    }

    // ────────────────────────────── take-profit ──────────────────────────────

    function test_tp_executes_whenMinOutSatisfiable() public {
        _fundWmon(maker, 100e18);
        // Ask for slightly less than fair value so the order is executable now.
        uint256 fair = PoolPriceLib.quoteAtTick(_spotTick(), 100e18, WMON, USDC);
        uint128 minOut = uint128((fair * 98) / 100);
        uint256 id = _placeOne(_defaultTp(100e18, minOut));

        uint256 makerBefore = IERC20(USDC).balanceOf(maker);
        vm.prank(keeper);
        uint256 amountOut = book.executeOrder(id);

        assertGe(amountOut, minOut, "fill below asking price");
        uint256 fee = (amountOut * 30) / 10_000;
        assertEq(IERC20(USDC).balanceOf(keeper), fee, "keeper fee");
        assertEq(IERC20(USDC).balanceOf(maker) - makerBefore, amountOut - fee, "maker payout");
        assertEq(uint8(book.getOrder(id).status), uint8(LimitOrderBook.OrderStatus.Executed));
        _assertBookEmpty();
    }

    function test_tp_reverts_whenPriceBelowAsk() public {
        _fundWmon(maker, 100e18);
        // Ask 2x current value: unfillable at spot → router must revert.
        uint256 fair = PoolPriceLib.quoteAtTick(_spotTick(), 100e18, WMON, USDC);
        uint256 id = _placeOne(_defaultTp(100e18, uint128(fair * 2)));

        vm.prank(keeper);
        vm.expectRevert(); // router: "Too little received"
        book.executeOrder(id);
        assertEq(uint8(book.getOrder(id).status), uint8(LimitOrderBook.OrderStatus.Open));
        _assertBookEmpty();
    }

    function test_tp_pumpManipulation_onlyImprovesMakerFill() public {
        // Attacker's pre-acquisition of USDC dumps the price; the maker then
        // places a +5% TP relative to the *current* (post-dump) price.
        address attacker = makeAddr("attacker");
        _fundUsdc(attacker, 10_000_000e18);

        _fundWmon(maker, 100e18);
        uint256 fair = PoolPriceLib.quoteAtTick(_spotTick(), 100e18, WMON, USDC);
        uint128 minOut = uint128((fair * 105) / 100);
        uint256 id = _placeOne(_defaultTp(100e18, minOut));

        // Not executable yet.
        vm.prank(keeper);
        vm.expectRevert();
        book.executeOrder(id);

        // Attacker pumps WMON with USDC, then executes to collect the keeper fee.
        _swap(attacker, USDC, WMON, IERC20(USDC).balanceOf(attacker));

        uint256 makerBefore = IERC20(USDC).balanceOf(maker);
        vm.prank(attacker);
        uint256 amountOut = book.executeOrder(id);

        // Manipulation can only IMPROVE the maker's fill, never push it below ask.
        assertGe(amountOut, minOut);
        assertGe(IERC20(USDC).balanceOf(maker) - makerBefore, (uint256(minOut) * 9970) / 10_000);
        _assertBookEmpty();
    }

    // ─────────────────────────────── stop-loss ───────────────────────────────

    function test_sl_executes_whenTwapPastTrigger() public {
        _fundWmon(maker, 100e18);
        int24 twap = _twap();
        // Trigger above the current TWAP → condition already met.
        uint256 id = _placeOne(_defaultSl(100e18, twap + 100));

        uint256 twapQuote = PoolPriceLib.quoteAtTick(twap, 100e18, WMON, USDC);
        uint256 floor = (twapQuote * (10_000 - 500)) / 10_000;

        uint256 makerBefore = IERC20(USDC).balanceOf(maker);
        vm.prank(keeper);
        uint256 amountOut = book.executeOrder(id);

        assertGe(amountOut, floor, "fill below TWAP floor");
        uint256 fee = (amountOut * 30) / 10_000;
        assertEq(IERC20(USDC).balanceOf(maker) - makerBefore, amountOut - fee);
        _assertBookEmpty();
    }

    function test_sl_flashDump_cannotFireEarly_thenFiresAfterTwapCatchesUp() public {
        _fundWmon(maker, 100e18);
        int24 startTwap = _twap();
        int24 trigger = startTwap - 800; // ≈ −7.7%
        uint256 id = _placeOne(_defaultSl(100e18, trigger));

        // Not triggered at placement.
        vm.prank(keeper);
        vm.expectRevert(LimitOrderBook.TriggerNotMet.selector);
        book.executeOrder(id);

        // Flash-dump: attacker sells WMON until SPOT is far past the trigger.
        address dumper = makeAddr("dumper");
        vm.deal(dumper, 200_000_000e18);
        vm.prank(dumper);
        IWMON(WMON).deposit{value: 100_000_000e18}();
        for (uint256 i = 0; i < 20 && _spotTick() > trigger - 200; i++) {
            _swap(dumper, WMON, USDC, 5_000_000e18);
        }
        assertLt(_spotTick(), trigger, "dump failed to move spot past trigger");

        // Same-block (same timestamp): the 60s TWAP has NOT moved → still protected.
        vm.prank(keeper);
        vm.expectRevert(LimitOrderBook.TriggerNotMet.selector);
        book.executeOrder(id);

        // If the price STAYS down for the TWAP window, this is a real move → fires.
        vm.warp(block.timestamp + 61);
        int24 twapNow = _twap();
        assertLe(twapNow, trigger, "twap should have caught up");

        uint256 twapQuote = PoolPriceLib.quoteAtTick(twapNow, 100e18, WMON, USDC);
        uint256 floor = (twapQuote * (10_000 - 500)) / 10_000;

        vm.prank(keeper);
        uint256 amountOut = book.executeOrder(id);
        assertGe(amountOut, floor, "crash-sandwich stole the exit");
        _assertBookEmpty();
    }

    function test_sl_twapUnavailable_onFreshPool() public {
        // Fresh pool: only the initialization observation exists → observe(60s)
        // must revert "OLD", surfaced as TwapUnavailable.
        (MockERC20 tok, IUniswapV3Pool fresh) = _createFreshPool();

        LimitOrderBook.OrderParams memory p = _defaultSl(1e18, 0);
        p.tokenIn = address(tok);
        p.tokenOut = WMON;
        p.poolFee = 3000;
        uint256 id = _placeOne(p);
        assertTrue(address(fresh) != address(0));

        vm.prank(keeper);
        vm.expectRevert(PoolPriceLib.TwapUnavailable.selector);
        book.executeOrder(id);

        // isExecutable degrades gracefully too.
        (bool ok, string memory reason) = book.isExecutable(id);
        assertFalse(ok);
        assertEq(reason, "twap unavailable");
    }

    // ──────────────────────── cancel / expiry / lifecycle ────────────────────

    function test_cancel_lifecycle() public {
        _fundWmon(maker, 100e18);
        uint256 id = _placeOne(_defaultTp(100e18, 1));

        // Non-maker cannot cancel.
        vm.prank(keeper);
        vm.expectRevert(LimitOrderBook.NotMaker.selector);
        book.cancelOrder(id);

        vm.prank(maker);
        book.cancelOrder(id);
        assertEq(uint8(book.getOrder(id).status), uint8(LimitOrderBook.OrderStatus.Cancelled));

        // Double-cancel and execute-after-cancel both revert.
        vm.prank(maker);
        vm.expectRevert(LimitOrderBook.OrderNotOpen.selector);
        book.cancelOrder(id);

        vm.prank(keeper);
        vm.expectRevert(LimitOrderBook.OrderNotOpen.selector);
        book.executeOrder(id);
    }

    function test_cancelOrders_batch() public {
        _fundWmon(maker, 100e18);
        LimitOrderBook.OrderParams[] memory arr = new LimitOrderBook.OrderParams[](2);
        arr[0] = _defaultTp(10e18, 1);
        arr[1] = _defaultTp(20e18, 1);
        vm.prank(maker);
        uint256[] memory ids = book.placeOrders(arr);

        vm.prank(maker);
        book.cancelOrders(ids);
        assertEq(uint8(book.getOrder(ids[0]).status), uint8(LimitOrderBook.OrderStatus.Cancelled));
        assertEq(uint8(book.getOrder(ids[1]).status), uint8(LimitOrderBook.OrderStatus.Cancelled));
    }

    function test_execute_revertsAfterExpiry() public {
        _fundWmon(maker, 100e18);
        LimitOrderBook.OrderParams memory p = _defaultTp(100e18, 1);
        p.expiry = uint40(block.timestamp + 1 hours);
        uint256 id = _placeOne(p);

        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(keeper);
        vm.expectRevert(LimitOrderBook.OrderExpired.selector);
        book.executeOrder(id);
    }

    function test_execute_revertsOnDoubleExecute() public {
        _fundWmon(maker, 100e18);
        uint256 id = _placeOne(_defaultTp(100e18, 1));
        vm.prank(keeper);
        book.executeOrder(id);

        vm.prank(keeper);
        vm.expectRevert(LimitOrderBook.OrderNotOpen.selector);
        book.executeOrder(id);
    }

    // ─────────────────── reentrancy + native payout fallback ─────────────────

    function test_nativePayout_toEoa() public {
        // USDC → WMON order with unwrapToNative: maker receives native MON.
        _fundUsdc(maker, 10_000e18);
        vm.prank(maker);
        IERC20(USDC).approve(address(book), type(uint256).max);

        uint128 amountIn = uint128(IERC20(USDC).balanceOf(maker));
        LimitOrderBook.OrderParams memory p = _defaultTp(amountIn, 1);
        p.tokenIn = USDC;
        p.tokenOut = WMON;
        p.unwrapToNative = true;
        uint256 id = _placeOne(p);

        uint256 nativeBefore = maker.balance;
        vm.prank(keeper);
        uint256 amountOut = book.executeOrder(id);
        uint256 fee = (amountOut * 30) / 10_000;
        assertEq(maker.balance - nativeBefore, amountOut - fee, "native payout");
        _assertBookEmpty();
    }

    function test_nativePayout_fallsBackToWmon_whenRecipientRejects() public {
        RejectingMaker rejecting = new RejectingMaker();
        uint256 id = _placeContractMakerNativeOrder(address(rejecting));

        vm.prank(keeper);
        uint256 amountOut = book.executeOrder(id);
        uint256 fee = (amountOut * 30) / 10_000;
        // Native send failed → maker got WMON instead; execution not griefable.
        assertEq(IERC20(WMON).balanceOf(address(rejecting)), amountOut - fee);
        assertEq(address(rejecting).balance, 0);
        _assertBookEmpty();
    }

    function test_reentrancy_blockedDuringNativePayout() public {
        ReentrantMaker reentrant = new ReentrantMaker();
        uint256 id1 = _placeContractMakerNativeOrder(address(reentrant));
        uint256 id2 = _placeContractMakerNativeOrder(address(reentrant));

        reentrant.arm(book, id2);
        vm.prank(keeper);
        book.executeOrder(id1);

        // The nested executeOrder(id2) was swallowed by the maker's try/catch:
        // if the guard failed, id2 would now be Executed.
        assertEq(uint8(book.getOrder(id2).status), uint8(LimitOrderBook.OrderStatus.Open));
        assertEq(reentrant.reentryTarget(), 0, "reentry attempt did not run");
        _assertBookEmpty();
    }

    function _placeContractMakerNativeOrder(address contractMaker) internal returns (uint256) {
        _fundUsdc(contractMaker, 10_000e18);
        ContractMaker(contractMaker).approveToken(IERC20(USDC), address(book));

        LimitOrderBook.OrderParams[] memory arr = new LimitOrderBook.OrderParams[](1);
        arr[0] = _defaultTp(uint128(IERC20(USDC).balanceOf(contractMaker) / 2), 1);
        arr[0].tokenIn = USDC;
        arr[0].tokenOut = WMON;
        arr[0].unwrapToNative = true;
        return ContractMaker(contractMaker).place(book, arr)[0];
    }

    // ───────────────────────────── fee-on-transfer ───────────────────────────

    function test_feeOnTransfer_balanceDeltaAccounting() public {
        // FOT token taxes the maker→book pull (pool is exempt, like real meme FOTs).
        (MockFOT fot, IUniswapV3Pool fotPool) = _createFotPool();

        fot.mint(maker, 1_000e18);
        vm.prank(maker);
        fot.approve(address(book), type(uint256).max);

        LimitOrderBook.OrderParams memory p = _defaultTp(100e18, 1);
        p.tokenIn = address(fot);
        p.tokenOut = WMON;
        uint256 id = _placeOne(p);
        assertTrue(address(fotPool) != address(0));

        vm.prank(keeper);
        uint256 amountOut = book.executeOrder(id);

        // 2% tax burned on the pull; the book swapped only what it received and
        // retained nothing.
        assertGt(amountOut, 0);
        assertEq(fot.balanceOf(address(book)), 0, "book holds FOT");
        assertEq(fot.balanceOf(maker), 900e18, "maker debited exactly amountIn");
        _assertBookEmpty();
    }

    // ──────────────────────────────── fuzz ───────────────────────────────────

    function testFuzz_tp_execution_neverRetainsBalance(uint96 rawAmount) public {
        uint128 amountIn = uint128(bound(uint256(rawAmount), 1e15, 5_000e18));
        _fundWmon(maker, amountIn);
        uint256 id = _placeOne(_defaultTp(amountIn, 1));

        uint256 makerBefore = IERC20(USDC).balanceOf(maker);
        vm.prank(keeper);
        uint256 amountOut = book.executeOrder(id);

        uint256 fee = (amountOut * 30) / 10_000;
        assertEq(
            (IERC20(USDC).balanceOf(maker) - makerBefore) + IERC20(USDC).balanceOf(keeper),
            amountOut
        );
        assertEq(fee, IERC20(USDC).balanceOf(keeper));
        _assertBookEmpty();
    }

    // ───────────────────────────── pool factories ────────────────────────────

    function _createFreshPool() internal returns (MockERC20 tok, IUniswapV3Pool fresh) {
        tok = new MockERC20();
        fresh = IUniswapV3Pool(IUniswapV3Factory(FACTORY).createPool(address(tok), WMON, 3000));
        fresh.initialize(uint160(1) << 96); // 1:1, tick 0
        _seedLiquidity(fresh, address(tok));
    }

    function _createFotPool() internal returns (MockFOT fot, IUniswapV3Pool fotPool) {
        fot = new MockFOT();
        fotPool = IUniswapV3Pool(IUniswapV3Factory(FACTORY).createPool(address(fot), WMON, 3000));
        fot.setExempt(address(fotPool), true); // meme-token style: pool is tax-exempt
        fotPool.initialize(uint160(1) << 96); // 1:1, tick 0
        _seedLiquidity(fotPool, address(fot));
    }

    function _seedLiquidity(IUniswapV3Pool p, address tok) internal {
        LiquidityHelper lp = new LiquidityHelper();
        MockERC20(tok).mint(address(lp), 1_000_000e18);
        vm.deal(address(this), 1_000_000e18);
        IWMON(WMON).deposit{value: 1_000_000e18}();
        IERC20(WMON).transfer(address(lp), 1_000_000e18);
        lp.addLiquidity(p, -600_000, 600_000, 1e22);
    }

    receive() external payable {}
}
