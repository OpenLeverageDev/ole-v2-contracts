// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "./MockERC20.sol";

contract MockDeflationToken is MockERC20 {

    address public admin;
    uint public rate;
    uint256 public constant internalDecimals = 10**24;

    constructor (string memory name_, string memory symbol_, uint256 _amount, uint _rate) MockERC20(name_, symbol_) {
        admin = msg.sender;
        rate = _rate;
        mint(msg.sender, _amount);
    }

    function burn(address from, uint256 amount) public{
        _burn(from, amount);
    }

    function balanceOf(address addr) public view override returns (uint256){
        return calculateDeflationBalance(_balances[addr]);
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        uint actualAmount = calculateActualBalance(amount);
        _transfer(msg.sender, recipient, actualAmount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        uint actualAmount = calculateActualBalance(amount);
        _transfer(sender, recipient, actualAmount);
        _approve(sender, msg.sender, allowance(sender, msg.sender) - amount);
        return true;
    }

    function calculateDeflationBalance(uint256 _amount) private view returns (uint256) {
        if (_amount == 0 || rate == 0){
            return 0;
        } else {
            return _amount * rate / internalDecimals;
        }
    }

    function calculateActualBalance(uint256 _amount) private view returns (uint256) {
        if (_amount == 0 || rate == 0){
            return 0;
        } else {
            return _amount * internalDecimals / rate;
        }
    }

    function setRate(uint256 _rate) external {
        require(msg.sender == admin, "caller must be admin");
        rate = _rate;
    }
}
