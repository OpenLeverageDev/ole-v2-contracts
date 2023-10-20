// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MockToken.sol";

contract MockDexRouter {

    uint public constant MINIMUM_LIQUIDITY = 10**3;
    address public lpToken;
    
    constructor (address _lpToken) {
        lpToken = _lpToken;
    }

    event AddLiquidity (address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired);

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
    external
    virtual
    ensure(deadline)
    returns (
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    )
    {
        amountAMin;
        amountBMin;
        amountA = amountADesired;
        amountB = amountBDesired;
        liquidity = sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
        MockToken(lpToken).mint(to, liquidity);
        MockToken(tokenA).transferFrom(msg.sender, address(this), amountA);
        MockToken(tokenB).transferFrom(msg.sender, address(this), amountB);
        emit AddLiquidity(tokenA, tokenB, amountADesired, amountBDesired);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
    external
    virtual
    ensure(deadline)
    returns (
        uint256 amountA,
        uint256 amountB
    ) {
        MockToken(lpToken).burn(msg.sender, liquidity);
        uint tokenABalance = IERC20(tokenA).balanceOf(address(this));
        uint tokenBBalance = IERC20(tokenB).balanceOf(address(this));
        require(tokenABalance >= amountAMin, "UniswapRouter: INSUFFICIENT_A_AMOUNT");
        require(tokenBBalance >= amountBMin, "UniswapRouter: INSUFFICIENT_B_AMOUNT");
        MockToken(tokenA).transfer(to, tokenABalance);
        MockToken(tokenB).transfer(to, tokenBBalance);
        amountA = tokenABalance;
        amountB = tokenBBalance;
    }

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'PancakeRouter: EXPIRED');
        _;
    }

    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

}
