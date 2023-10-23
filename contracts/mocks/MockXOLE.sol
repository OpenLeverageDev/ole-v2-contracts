// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interface/IXOLE.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../libraries/TransferHelper.sol";

contract MockXOLE is IXOLE {
    using TransferHelper for IERC20;

    uint256 constant WEEK = 7 * 86400;  // all future times are rounded by week
    uint256 constant MAXTIME = 4 * 365 * 86400;  // 4 years

    IERC20 public oleLpStakeToken;
    mapping(address => uint256) private _balances;
    mapping(address => LockedBalance) public locked;

    struct LockedBalance {
        uint256 amount;
        uint256 end;
    }

    constructor(address _oleLpStakeToken) {
        oleLpStakeToken = IERC20(_oleLpStakeToken);
    }

    function mint(uint amount) external {
        _balances[msg.sender] += amount;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function create_lock_for(address to, uint256 _value, uint256 _unlock_time) external override {
        uint256 unlock_time = create_lock_check(to, _value, _unlock_time);
        _deposit_for(to, _value, unlock_time, locked[to]);
    }

    function increase_amount_for(address to, uint256 _value) external override{
        LockedBalance memory _locked = increase_amount_check(to, _value);
        _deposit_for(to, _value, 0, _locked);
    }

    function increase_amount_check(address to, uint256 _value) internal view returns (LockedBalance memory _locked) {
        _locked = locked[to];
        require(_value > 0, "need non - zero value");
        require(_locked.amount > 0, "No existing lock found");
        require(_locked.end > block.timestamp, "Cannot add to expired lock. Withdraw");
    }

    function create_lock_check(address to, uint256 _value, uint256 _unlock_time) internal view returns (uint unlock_time) {
        // Locktime is rounded down to weeks
        unlock_time = _unlock_time / WEEK * WEEK;
        LockedBalance memory _locked = locked[to];
        require(_value > 0, "Non zero value");
        require(_locked.amount == 0, "Withdraw old tokens first");
        require(unlock_time >= block.timestamp + (2 * WEEK), "Can only lock until time in the future");
        require(unlock_time <= block.timestamp + MAXTIME, "Voting lock can be 4 years max");
    }

    function _deposit_for(address _addr, uint256 _value, uint256 unlock_time, LockedBalance memory _locked) internal {
        _locked.amount = _locked.amount + _value;
        if (unlock_time != 0) {
            _locked.end = unlock_time;
        }
        locked[_addr] = _locked;
        if (_value != 0) {
            oleLpStakeToken.safeTransferFrom(msg.sender, address(this), _value);
            _balances[_addr] = _balances[_addr] + _value;
        }
    }

}
