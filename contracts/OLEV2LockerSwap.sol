// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./common/Adminable.sol";
import "./common/ReentrancyGuard.sol";
import "./libraries/TransferHelper.sol";

contract OLEV2LockerSwap is Adminable, ReentrancyGuard {
    using TransferHelper for IERC20;

    IERC20 public immutable oleV1;
    IERC20 public immutable oleV2;
    mapping(address => uint256) public swapLimits;
    event Swapped (address account, uint256 amount);
    event Increased (address account, uint256 beforeLimit, uint256 afterLimit);
    event Reduced (address account, uint256 beforeLimit, uint256 afterLimit);

    constructor (address payable _admin, IERC20 _oleV1, IERC20 _oleV2, address[] memory _accounts, uint256[] memory _swapLimits){
        require(_admin != address(0), "_admin address cannot be 0");
        admin = _admin;
        oleV1 = _oleV1;
        oleV2 = _oleV2;

        uint256 investorsLength = _accounts.length;
        require(investorsLength == _swapLimits.length, "Array length must be same");
        for (uint256 i = 0; i < investorsLength; i++) {
            swapLimits[_accounts[i]] = _swapLimits[i];
        }
    }

    function swap(uint256 _amount) external nonReentrant(){
        require(_amount <= swapLimits[msg.sender], "Exceed");

        uint256 oleV2BalanceBefore = oleV2.balanceOf(address(this));
        require(oleV2BalanceBefore >= _amount, 'NE');

        swapLimits[msg.sender] = swapLimits[msg.sender] - _amount;

        uint256 oleV1BalanceBefore = oleV1.balanceOf(address(this));
        oleV1.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 oleV1BalanceAfter = oleV1.balanceOf(address(this));
        require(oleV1BalanceAfter - oleV1BalanceBefore == _amount, "CKP1");

        oleV2.safeTransfer(msg.sender, _amount);
        uint256 oleV2BalanceAfter = oleV2.balanceOf(address(this));
        require(oleV2BalanceBefore - oleV2BalanceAfter == _amount, "CKP2");
        emit Swapped(msg.sender, _amount);
    }

    function recycle(address _account, uint256 _amount) external onlyAdmin {
        require(oleV2.balanceOf(address(this)) >= _amount, "NE");
        oleV2.safeTransfer(_account, _amount);
    }

    function increaseSwapLimit(address _account, uint256 _increaseAmount) external onlyAdmin {
        uint _before = swapLimits[_account];
        swapLimits[_account] = _before + _increaseAmount;
        emit Increased(_account, _before, swapLimits[_account]);
    }

    function reduceSwapLimit(address _account, uint256 _reduceAmount) external onlyAdmin {
        uint _before = swapLimits[_account];
        require(_reduceAmount <= _before, "Exceed");
        swapLimits[_account] = _before - _reduceAmount;
        emit Reduced(_account, _before, swapLimits[_account]);
    }

}