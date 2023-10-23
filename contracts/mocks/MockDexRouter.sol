// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MockToken.sol";

contract MockDexRouter {

    uint256 public constant MINIMUM_LIQUIDITY = 10**3;
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
    ){
        uint256 reserveA = IERC20(tokenA).balanceOf(address(this));
        uint256 reserveB = IERC20(tokenB).balanceOf(address(this));
        uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);
        if (amountBOptimal <= amountBDesired) {
            require(amountBOptimal >= amountBMin, "PancakeRouter: INSUFFICIENT_B_AMOUNT");
            (amountA, amountB) = (amountADesired, amountBOptimal);
        } else {
            uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
            assert(amountAOptimal <= amountADesired);
            require(amountAOptimal >= amountAMin, "PancakeRouter: INSUFFICIENT_A_AMOUNT");
            (amountA, amountB) = (amountAOptimal, amountBDesired);
        }
        MockToken(tokenA).transferFrom(msg.sender, address(this), amountA);
        MockToken(tokenB).transferFrom(msg.sender, address(this), amountB);
        liquidity = sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
        MockToken(lpToken).mint(to, liquidity);
        emit AddLiquidity(tokenA, tokenB, amountADesired, amountBDesired);
    }

    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) internal pure returns (uint256 amountB) {
        require(amountA > 0, "PancakeLibrary: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "PancakeLibrary: INSUFFICIENT_LIQUIDITY");
        amountB = amountA * reserveB / reserveA;
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
