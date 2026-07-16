// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapRouter02} from "./interfaces/ISwapRouter02.sol";

interface IV3FactoryMinimal {
    function getPool(address, address, uint24) external view returns (address);
}

interface IV3PoolMinimal {
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

/**
 * Minimal exactInputSingle router for Uniswap v3 FORKS (Capricorn, PancakeSwap
 * v3, …). The canonical periphery hard-codes each fork's pool init-code hash;
 * this router instead asks the fork's own factory via getPool, so one ~100-line
 * contract works against any v3-compatible factory. Exposes the same
 * exactInputSingle signature as SwapRouter02, so LimitOrderBook plugs in
 * unchanged.
 *
 * Payment flows callback-style: the caller (the book) approves this router,
 * the pool calls back, and the router pulls tokenIn straight from the caller
 * into the pool. The router itself never holds a balance.
 */
contract ForkRouter {
    using SafeERC20 for IERC20;

    /// @dev TickMath bounds (inclusive) — used when the caller passes no limit.
    uint160 private constant MIN_SQRT_RATIO = 4295128739;
    uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    IV3FactoryMinimal public immutable factory;

    error PoolMissing();
    error Slippage();
    error BadCallback();

    constructor(address factory_) {
        factory = IV3FactoryMinimal(factory_);
    }

    struct CallbackData {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address payer;
    }

    function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata p)
        external
        payable
        returns (uint256 amountOut)
    {
        address pool = factory.getPool(p.tokenIn, p.tokenOut, p.fee);
        if (pool == address(0)) revert PoolMissing();

        bool zeroForOne = p.tokenIn < p.tokenOut;
        (int256 amount0, int256 amount1) = IV3PoolMinimal(pool).swap(
            p.recipient,
            zeroForOne,
            int256(uint256(p.amountIn)),
            p.sqrtPriceLimitX96 == 0
                ? (zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1)
                : p.sqrtPriceLimitX96,
            abi.encode(CallbackData(p.tokenIn, p.tokenOut, p.fee, msg.sender))
        );
        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
        if (amountOut < p.amountOutMinimum) revert Slippage();
    }

    /// Canonical Uniswap v3 callback name.
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        _pay(amount0Delta, amount1Delta, data);
    }

    /// PancakeSwap v3 renamed the callback.
    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        _pay(amount0Delta, amount1Delta, data);
    }

    /// Other forks rename it again (Capricorn calls back with selector
    /// 0x05c8011e). The shape is always (int256,int256,bytes) and authenticity
    /// is proven by msg.sender == factory.getPool(...) inside _pay — never by
    /// the selector — so dispatch any unknown selector the same way.
    fallback() external {
        (int256 amount0Delta, int256 amount1Delta, bytes memory data) =
            abi.decode(msg.data[4:], (int256, int256, bytes));
        _pay(amount0Delta, amount1Delta, data);
    }

    function _pay(int256 amount0Delta, int256 amount1Delta, bytes memory data) internal {
        CallbackData memory cb = abi.decode(data, (CallbackData));
        // Only the genuine pool for this pair/fee may collect payment.
        if (msg.sender != factory.getPool(cb.tokenIn, cb.tokenOut, cb.fee)) revert BadCallback();
        uint256 owed = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        IERC20(cb.tokenIn).safeTransferFrom(cb.payer, msg.sender, owed);
    }
}
