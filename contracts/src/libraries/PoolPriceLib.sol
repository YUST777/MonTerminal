// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.26;

import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {TickMath} from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v3-core/contracts/libraries/FullMath.sol";

/// @notice Pool price helpers: manipulation-resistant TWAP tick + tick→quote conversion.
library PoolPriceLib {
    error TwapUnavailable();

    /// @notice Time-weighted average tick over the last `secondsAgo` seconds.
    /// @dev Reverts with TwapUnavailable when the pool's observation buffer cannot
    ///      cover the window yet (pool reverts "OLD"); callers/keepers should retry
    ///      after cardinality growth catches up.
    function twapTick(IUniswapV3Pool pool, uint32 secondsAgo) internal view returns (int24 tick) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;

        try pool.observe(secondsAgos) returns (int56[] memory tickCumulatives, uint160[] memory) {
            int56 delta = tickCumulatives[1] - tickCumulatives[0];
            tick = int24(delta / int56(uint56(secondsAgo)));
            // Round toward negative infinity (matches Uniswap OracleLibrary semantics).
            if (delta < 0 && (delta % int56(uint56(secondsAgo)) != 0)) tick--;
        } catch {
            revert TwapUnavailable();
        }
    }

    /// @notice Amount of `quoteToken` equivalent to `baseAmount` of `baseToken` at `tick`.
    /// @dev Port of Uniswap OracleLibrary.getQuoteAtTick to 0.8 semantics.
    function quoteAtTick(int24 tick, uint128 baseAmount, address baseToken, address quoteToken)
        internal
        pure
        returns (uint256 quoteAmount)
    {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);

        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX192, baseAmount, 1 << 192)
                : FullMath.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX128, baseAmount, 1 << 128)
                : FullMath.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }
}
