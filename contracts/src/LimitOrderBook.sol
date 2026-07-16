// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {TickMath} from "@uniswap/v3-core/contracts/libraries/TickMath.sol";

import {ISwapRouter02} from "./interfaces/ISwapRouter02.sol";
import {IWMON} from "./interfaces/IWMON.sol";
import {PoolPriceLib} from "./libraries/PoolPriceLib.sol";

/// @title  LimitOrderBook — non-custodial take-profit / stop-loss book for Uniswap v3 on Monad
/// @notice Approval-based: makers keep custody until execution. Anyone may execute a
///         triggered order and earn the maker-set keeper fee, so MEV searchers act as
///         free backup keepers. The contract is immutable: no owner, no pause, no upgrade.
///
///         Trigger proof:
///          - Take-profit: `minAmountOut` IS the trigger. The swap reverts unless the
///            maker receives at least it, so the market itself proves the condition and
///            manipulation can only improve the maker's fill. No oracle read.
///          - Stop-loss: a 60s TWAP tick must be past `triggerTick`, and the swap's
///            floor is quoteAtTick(twap) haircut by `maxSlippageBps`. Flash-loan dumps
///            cannot fire it early; crash-sandwiches cannot steal the exit.
contract LimitOrderBook is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────── types ────────────────────────────────────

    enum OrderKind {
        TakeProfit,
        StopLoss
    }

    enum OrderStatus {
        Nonexistent,
        Open,
        Executed,
        Cancelled
    }

    struct OrderParams {
        address tokenIn;
        address tokenOut;
        uint24 poolFee;
        uint128 amountIn;
        uint128 minAmountOut;
        int24 triggerTick;
        uint16 maxSlippageBps; // stop-loss only: haircut on the TWAP quote floor
        uint40 expiry; // 0 = good-til-cancelled
        uint16 keeperFeeBps; // clamped to [MIN_KEEPER_FEE_BPS, MAX_KEEPER_FEE_BPS]
        OrderKind kind;
        bool unwrapToNative; // tokenOut == WMON → pay maker native MON
    }

    struct Order {
        address maker;
        address tokenIn;
        address tokenOut;
        uint24 poolFee;
        uint128 amountIn;
        uint128 minAmountOut;
        int24 triggerTick;
        uint16 maxSlippageBps;
        uint40 expiry;
        uint16 keeperFeeBps;
        OrderKind kind;
        bool triggerWhenTickBelow; // derived on placement from pool token ordering
        bool unwrapToNative;
        OrderStatus status;
    }

    // ─────────────────────────────────── errors ───────────────────────────────────

    error ZeroAmount();
    error SameToken();
    error PoolMissing();
    error BadExpiry();
    error BadTriggerTick();
    error BadSlippage();
    error BadMinAmountOut();
    error BadUnwrap();
    error NoOrders();
    error NotMaker();
    error OrderNotOpen();
    error OrderExpired();
    error TriggerNotMet();
    error NativeOnlyFromWmon();

    // ─────────────────────────────────── events ───────────────────────────────────

    event OrderPlaced(
        uint256 indexed orderId,
        address indexed maker,
        address indexed tokenIn,
        address tokenOut,
        uint24 poolFee,
        uint128 amountIn,
        uint128 minAmountOut,
        int24 triggerTick,
        bool triggerWhenTickBelow,
        uint16 maxSlippageBps,
        uint40 expiry,
        uint16 keeperFeeBps,
        OrderKind kind,
        bool unwrapToNative
    );

    event OrderExecuted(
        uint256 indexed orderId,
        address indexed maker,
        address indexed keeper,
        uint256 amountIn,
        uint256 amountOut,
        uint256 keeperFee
    );

    event OrderCancelled(uint256 indexed orderId, address indexed maker);

    // ────────────────────────────────── constants ─────────────────────────────────

    uint32 public constant TWAP_WINDOW = 60;
    uint16 public constant TWAP_CARDINALITY = 180;
    uint16 public constant MIN_KEEPER_FEE_BPS = 10;
    uint16 public constant MAX_KEEPER_FEE_BPS = 100;
    uint16 public constant MAX_SLIPPAGE_BPS = 5_000;
    uint16 internal constant BPS = 10_000;

    IUniswapV3Factory public immutable factory;
    ISwapRouter02 public immutable router;
    IWMON public immutable wmon;

    // ─────────────────────────────────── storage ──────────────────────────────────

    uint256 public nextOrderId = 1;
    mapping(uint256 => Order) internal _orders;

    constructor(address factory_, address router_, address wmon_) {
        factory = IUniswapV3Factory(factory_);
        router = ISwapRouter02(router_);
        wmon = IWMON(wmon_);
    }

    /// @dev Accept native only from WMON.withdraw during unwrapping.
    receive() external payable {
        if (msg.sender != address(wmon)) revert NativeOnlyFromWmon();
    }

    // ─────────────────────────────────── placing ──────────────────────────────────

    /// @notice Place one or many orders atomically (ladders are N independent orders).
    /// @dev Custody stays with the maker: only an ERC-20 approval to this book is
    ///      needed. Placement validates params and derives the trigger direction from
    ///      the pool's token ordering so keepers/makers cannot encode a wrong side.
    function placeOrders(OrderParams[] calldata params) external returns (uint256[] memory orderIds) {
        if (params.length == 0) revert NoOrders();
        orderIds = new uint256[](params.length);

        for (uint256 i = 0; i < params.length; i++) {
            OrderParams calldata p = params[i];

            if (p.amountIn == 0) revert ZeroAmount();
            if (p.minAmountOut == 0) revert BadMinAmountOut();
            if (p.tokenIn == p.tokenOut) revert SameToken();
            if (p.expiry != 0 && p.expiry <= block.timestamp) revert BadExpiry();
            if (p.triggerTick < TickMath.MIN_TICK || p.triggerTick > TickMath.MAX_TICK) {
                revert BadTriggerTick();
            }
            if (p.unwrapToNative && p.tokenOut != address(wmon)) revert BadUnwrap();

            address pool = factory.getPool(p.tokenIn, p.tokenOut, p.poolFee);
            if (pool == address(0)) revert PoolMissing();

            // Trigger direction is a pure function of order kind and token ordering:
            // tokenIn == token0 → price of tokenIn rises with tick.
            bool tokenInIsToken0 = p.tokenIn < p.tokenOut;
            bool triggerWhenTickBelow;
            if (p.kind == OrderKind.StopLoss) {
                if (p.maxSlippageBps == 0 || p.maxSlippageBps > MAX_SLIPPAGE_BPS) revert BadSlippage();
                triggerWhenTickBelow = tokenInIsToken0;
                // Make sure the pool can serve a 60s TWAP by the time this can fire.
                IUniswapV3Pool(pool).increaseObservationCardinalityNext(TWAP_CARDINALITY);
            } else {
                if (p.maxSlippageBps != 0) revert BadSlippage();
                triggerWhenTickBelow = !tokenInIsToken0;
            }

            uint16 feeBps = p.keeperFeeBps;
            if (feeBps < MIN_KEEPER_FEE_BPS) feeBps = MIN_KEEPER_FEE_BPS;
            if (feeBps > MAX_KEEPER_FEE_BPS) feeBps = MAX_KEEPER_FEE_BPS;

            uint256 orderId = nextOrderId++;
            _orders[orderId] = Order({
                maker: msg.sender,
                tokenIn: p.tokenIn,
                tokenOut: p.tokenOut,
                poolFee: p.poolFee,
                amountIn: p.amountIn,
                minAmountOut: p.minAmountOut,
                triggerTick: p.triggerTick,
                maxSlippageBps: p.maxSlippageBps,
                expiry: p.expiry,
                keeperFeeBps: feeBps,
                kind: p.kind,
                triggerWhenTickBelow: triggerWhenTickBelow,
                unwrapToNative: p.unwrapToNative,
                status: OrderStatus.Open
            });
            orderIds[i] = orderId;

            emit OrderPlaced(
                orderId,
                msg.sender,
                p.tokenIn,
                p.tokenOut,
                p.poolFee,
                p.amountIn,
                p.minAmountOut,
                p.triggerTick,
                triggerWhenTickBelow,
                p.maxSlippageBps,
                p.expiry,
                feeBps,
                p.kind,
                p.unwrapToNative
            );
        }
    }

    // ────────────────────────────────── cancelling ────────────────────────────────

    function cancelOrder(uint256 orderId) public {
        Order storage order = _orders[orderId];
        if (order.maker != msg.sender) revert NotMaker();
        if (order.status != OrderStatus.Open) revert OrderNotOpen();
        order.status = OrderStatus.Cancelled;
        emit OrderCancelled(orderId, msg.sender);
    }

    function cancelOrders(uint256[] calldata orderIds) external {
        for (uint256 i = 0; i < orderIds.length; i++) {
            cancelOrder(orderIds[i]);
        }
    }

    // ────────────────────────────────── executing ─────────────────────────────────

    /// @notice Execute a triggered order. Permissionless: the caller earns
    ///         `keeperFeeBps` of the output.
    function executeOrder(uint256 orderId) external nonReentrant returns (uint256 amountOut) {
        Order storage order = _orders[orderId];
        if (order.status != OrderStatus.Open) revert OrderNotOpen();
        if (order.expiry != 0 && block.timestamp > order.expiry) revert OrderExpired();

        // Effects before interactions: an executed order can never run twice.
        order.status = OrderStatus.Executed;

        uint256 amountOutMinimum = order.minAmountOut;
        if (order.kind == OrderKind.StopLoss) {
            // Manipulation-resistant trigger: the 60s TWAP must be past the trigger.
            IUniswapV3Pool pool =
                IUniswapV3Pool(factory.getPool(order.tokenIn, order.tokenOut, order.poolFee));
            int24 twap = PoolPriceLib.twapTick(pool, TWAP_WINDOW);
            bool met = order.triggerWhenTickBelow ? twap <= order.triggerTick : twap >= order.triggerTick;
            if (!met) revert TriggerNotMet();

            // Dynamic floor: fair value at the TWAP, minus the maker's slippage budget.
            uint256 twapQuote =
                PoolPriceLib.quoteAtTick(twap, order.amountIn, order.tokenIn, order.tokenOut);
            uint256 floor = (twapQuote * (BPS - order.maxSlippageBps)) / BPS;
            if (floor > amountOutMinimum) amountOutMinimum = floor;
        }
        // Take-profit: amountOutMinimum == minAmountOut and *is* the trigger — the swap
        // below reverts unless the maker gets their asking output.

        IERC20 tokenIn = IERC20(order.tokenIn);
        IERC20 tokenOut = IERC20(order.tokenOut);

        // Pull with balance-delta accounting (fee-on-transfer safe).
        uint256 inBefore = tokenIn.balanceOf(address(this));
        tokenIn.safeTransferFrom(order.maker, address(this), order.amountIn);
        uint256 received = tokenIn.balanceOf(address(this)) - inBefore;

        tokenIn.forceApprove(address(router), received);
        uint256 outBefore = tokenOut.balanceOf(address(this));
        router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: order.tokenIn,
                tokenOut: order.tokenOut,
                fee: order.poolFee,
                recipient: address(this),
                amountIn: received,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );
        amountOut = tokenOut.balanceOf(address(this)) - outBefore;

        uint256 keeperFee = (amountOut * order.keeperFeeBps) / BPS;
        uint256 makerAmount = amountOut - keeperFee;

        if (keeperFee > 0) tokenOut.safeTransfer(msg.sender, keeperFee);
        _payMaker(tokenOut, order.maker, makerAmount, order.unwrapToNative);

        emit OrderExecuted(orderId, order.maker, msg.sender, received, amountOut, keeperFee);
    }

    /// @dev Pays the maker, unwrapping WMON to native when requested. If the native
    ///      send fails (e.g. maker is a contract without receive), falls back to WMON
    ///      so execution can never be griefed by the recipient.
    function _payMaker(IERC20 tokenOut, address maker, uint256 amount, bool unwrapToNative) internal {
        if (unwrapToNative && address(tokenOut) == address(wmon)) {
            wmon.withdraw(amount);
            (bool ok,) = maker.call{value: amount, gas: 50_000}("");
            if (ok) return;
            wmon.deposit{value: amount}();
        }
        tokenOut.safeTransfer(maker, amount);
    }

    // ─────────────────────────────────── views ────────────────────────────────────

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function getOrders(uint256[] calldata orderIds) external view returns (Order[] memory orders) {
        orders = new Order[](orderIds.length);
        for (uint256 i = 0; i < orderIds.length; i++) {
            orders[i] = _orders[orderIds[i]];
        }
    }

    /// @notice Cheap keeper pre-check. For stop-losses this reads the TWAP; for
    ///         take-profits it compares the spot tick as a *hint* (the swap's
    ///         minAmountOut remains the real trigger).
    function isExecutable(uint256 orderId) external view returns (bool executable, string memory reason) {
        Order storage order = _orders[orderId];
        if (order.status != OrderStatus.Open) return (false, "not open");
        if (order.expiry != 0 && block.timestamp > order.expiry) return (false, "expired");

        IUniswapV3Pool pool =
            IUniswapV3Pool(factory.getPool(order.tokenIn, order.tokenOut, order.poolFee));

        int24 tick;
        if (order.kind == OrderKind.StopLoss) {
            try this.twapTickExternal(pool) returns (int24 t) {
                tick = t;
            } catch {
                return (false, "twap unavailable");
            }
        } else {
            (, tick,,,,,) = pool.slot0();
        }

        bool met = order.triggerWhenTickBelow ? tick <= order.triggerTick : tick >= order.triggerTick;
        if (!met) return (false, "trigger not met");
        return (true, "");
    }

    /// @dev External wrapper so isExecutable can try/catch a library call.
    function twapTickExternal(IUniswapV3Pool pool) external view returns (int24) {
        return PoolPriceLib.twapTick(pool, TWAP_WINDOW);
    }
}
