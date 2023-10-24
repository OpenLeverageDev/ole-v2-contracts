// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "./common/Adminable.sol";
import "./common/DelegatorInterface.sol";

contract RewardVaultDelegator is DelegatorInterface, Adminable {

    constructor(
        address payable _admin,
        address _distributor,
        uint256 _trancheIdx,
        uint64 _defaultExpireDuration,
        address implementation_){
        admin = payable(msg.sender);
        // Creator of the contract is admin during initialization
        // First delegate gets to initialize the delegator (i.e. storage contract)
        delegateTo(implementation_, abi.encodeWithSignature("initialize(address,address,uint256,uint64)",
            _admin,
            _distributor,
            _trancheIdx,
            _defaultExpireDuration
            ));
        implementation = implementation_;
        // Set the proper admin now that initialization is done
        admin = _admin;
    }

    /**
     * Called by the admin to update the implementation of the delegator
     * @param implementation_ The address of the new implementation for delegation
     */
    function setImplementation(address implementation_) public override onlyAdmin {
        address oldImplementation = implementation;
        implementation = implementation_;
        emit NewImplementation(oldImplementation, implementation);
    }
}
