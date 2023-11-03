// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./libraries/TransferHelper.sol";

contract OLEV1Lock {
    using TransferHelper for IERC20;

    IERC20 public immutable ole;
    uint64 public immutable expireTime;

    event Locked (address account, uint amount);

    constructor (IERC20 _ole, uint64 _expireTime){
        ole = _ole;
        expireTime = _expireTime;
    }

    function lock(uint256 _amount) external {
        require(expireTime > block.timestamp, 'Expired');
        uint v1BalanceBefore = ole.balanceOf(address(this));
        ole.safeTransferFrom(msg.sender, address(this), _amount);
        uint v1BalanceAfter = ole.balanceOf(address(this));
        require(v1BalanceAfter - v1BalanceBefore == _amount, "ERR");
        emit Locked(msg.sender, _amount);
    }

}