// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockTaxToken is ERC20 {

    address public admin;
    uint public _taxFee;

    constructor (string memory name_, string memory symbol_, uint256 _amount, uint _txFee)  ERC20(name_, symbol_) {
        admin = msg.sender;
        _taxFee = _txFee;
        mint(msg.sender, _amount);
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public{
        _burn(from, amount);
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        uint taxFee = calculateTaxFee(amount);
        _transfer(msg.sender, recipient, amount - taxFee);
        _transfer(msg.sender, admin, taxFee);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        uint taxFee = calculateTaxFee(amount);
        _transfer(sender, recipient, amount - taxFee);
        _transfer(sender, admin, taxFee);
        _approve(sender, msg.sender, allowance(sender, msg.sender) - amount);
        return true;
    }

    function calculateTaxFee(uint256 _amount) private view returns (uint256 taxFee) {
        if(msg.sender == admin) {
            taxFee = 0;
        } else {
            taxFee = _amount * _taxFee / 10**2;
        }
    }

    function setTaxFeePercent(uint256 taxFee) external {
        require(msg.sender == admin, "caller must be admin");
        _taxFee = taxFee;
    }
}
