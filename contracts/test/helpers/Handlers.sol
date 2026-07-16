// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LimitOrderBook} from "../../src/LimitOrderBook.sol";

/// @notice ERC20 that taxes transfers unless sender or recipient is exempt —
///         models meme tokens that exempt their AMM pool.
contract MockFOT is ERC20 {
    uint256 public constant TAX_BPS = 200; // 2%
    mapping(address => bool) public taxExempt;

    constructor() ERC20("FeeOnTransfer", "FOT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setExempt(address who, bool exempt) external {
        taxExempt[who] = exempt;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && !taxExempt[from] && !taxExempt[to]) {
            uint256 tax = (value * TAX_BPS) / 10_000;
            super._update(from, address(0xdead), tax);
            value -= tax;
        }
        super._update(from, to, value);
    }
}

/// @notice Plain mintable ERC20 for fresh-pool tests.
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Implements the v3 mint callback so tests can seed fresh pools.
contract LiquidityHelper {
    function addLiquidity(IUniswapV3Pool pool, int24 tickLower, int24 tickUpper, uint128 liquidity)
        external
    {
        pool.mint(address(this), tickLower, tickUpper, liquidity, abi.encode(address(pool)));
    }

    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data)
        external
    {
        address pool = abi.decode(data, (address));
        require(msg.sender == pool, "bad callback");
        if (amount0Owed > 0) IERC20(IUniswapV3Pool(pool).token0()).transfer(pool, amount0Owed);
        if (amount1Owed > 0) IERC20(IUniswapV3Pool(pool).token1()).transfer(pool, amount1Owed);
    }
}

/// @notice Base for contract makers: can approve tokens and place orders.
abstract contract ContractMaker {
    function approveToken(IERC20 token, address spender) external {
        token.approve(spender, type(uint256).max);
    }

    function place(LimitOrderBook book_, LimitOrderBook.OrderParams[] calldata params)
        external
        returns (uint256[] memory)
    {
        return book_.placeOrders(params);
    }
}

/// @notice Maker contract that, on receiving native, attempts to re-enter the book.
///         If the guard works the attempt reverts inside the try/catch and the
///         native payout still succeeds.
contract ReentrantMaker is ContractMaker {
    LimitOrderBook public book;
    uint256 public reentryTarget;

    function arm(LimitOrderBook book_, uint256 target) external {
        book = book_;
        reentryTarget = target;
    }

    receive() external payable {
        if (address(book) != address(0) && reentryTarget != 0) {
            uint256 target = reentryTarget;
            reentryTarget = 0; // only try once
            try book.executeOrder(target) {} catch {}
        }
    }
}

/// @notice Maker contract that rejects all native payments (forces WMON fallback).
contract RejectingMaker is ContractMaker {
    receive() external payable {
        revert("no native");
    }
}
