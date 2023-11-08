# OpenLeverage OLE V2

This repository contains the Solidity project for upgrading the OLEV1 Token to the OLEV2 Token, which implements LayerZero's OFT token standard. This upgrade allows users to perform cross-chain operations seamlessly.

## Overview

The OpenLeverage OLE Token V2 project is designed to transition from the OLEV1 Token to the OLEV2 Token, which adheres to the OFT token standard. This new standard enhances the token's functionality and interoperability with other blockchain platforms.

### OpenLeverageOFT Features

- **OFT Token Standard**: The OpenLeverage OLE Token adheres to LayerZero's OFT token standard, ensuring compatibility with various LayerZero-based projects and cross-chain operations.

- **Pausable**: The contract inherits the pausable feature from LayerZero's PausableOFT, allowing the owner to pause and unpause token transfers when needed, enhancing security and compliance.

- **Burn Function**: Users can burn (destroy) their tokens using the `burn` function, reducing their token balance.

### OLEV1Lock Contract

The `OLEV1Lock` contract plays a crucial role in this project. It was developed to address the lack of LayerZero support on KCC chains, allowing users on KCC chains to lock their OLEV1 Tokens. In return, the OLEV2 Tokens will be issued on the Arbitrum chain, ensuring a smooth transition. Here's an accurate description of the contract:

- **OLEV1Lock Contract**: This contract is specifically designed to assist users on KCC chains in locking their OLEV1 Tokens. The  OLEV2 Tokens will be issued on the Arbitrum chain as part of the upgrade process.

- **Functionality**: Users can lock a specified amount of their OLEV1 Tokens using the `lock` function within this contract. This action is vital for the upgrade process, especially for those operating on KCC chains.

- **Expiration**: The contract includes an expiration time (as set during deployment) to ensure that only active transitions are allowed.

- **Events**: The contract emits a `Locked` event whenever a user locks their tokens, providing transparency and traceability during the upgrade.

### OLEV2Swap Contract

The `OLEV2Swap` contract is a key component of the OLE Token upgrade project. It facilitates the swapping of OLEV1 Tokens to the OLEV2 Tokens. Here's a brief description of the contract:

- **OLEV2Swap Contract**: This contract is responsible for the seamless transition of OLEV1 Tokens to the OLEV2 Tokens during the upgrade process.

- **Functionality**: Users can initiate the swap using the `swap` function, converting their OLEV1 Tokens to the OLEV2 Tokens. The contract ensures the proper handling of tokens and checks for the expiration time.

- **Expiration Time**: The contract includes an expiration time (as set during deployment) to prevent swaps after the specified date.

- **Events**: The contract emits a `Swapped` event when a user successfully swaps their tokens, providing transparency and traceability.

### RewardVault Contract

The `RewardVault` contract  is a versatile infrastructure that allows users and projects to supply rewards in the form of tokens to incentivize trading, lending, and borrowing activities. Users can claim these rewards, and the contract supports multiple tokens and campaigns in a single transaction.

- **Adding Tranches**: Users or projects can create reward tranches by supplying tokens. Tranches are defined by start and end times, the total amount of tokens to be distributed is specified when adding a tranche.

- **Updating Tranches**: The provider of a tranche can update its start and end times, as well as add more tokens before the distribution begins.

- **Recycling Rewards**: Tranche providers can recycle undistributed and unclaimed rewards. If rewards expire and are unclaimed, they can be recycled.

- **Claiming Rewards**: Users can claim their rewards from tranches using Merkle tree proofs, ensuring that they received their entitled share of rewards.

### RewardDistributor Contract

The `RewardDistributor` contract is a part of the OpenLeverage protocol. It is responsible for distributing rewards to users for each epoch of Ole reward issuance. Users can vest their rewards, withdraw them, or convert them into XOLE tokens. The contract also enforces vesting time, exit penalties, and supports advanced features such as early reward conversion.

- **Vest**: Users can vest their rewards for a specific epoch. This is done using the `vest` function, where they specify the epoch, balance, and provide a valid Merkle proof.

- **Withdraw Rewards**: Users can withdraw their vested rewards using the `withdraw` or `withdrawMul` function. They can also choose to exit early with a penalty using the `earlyExit` function.

- **Convert to XOLE**: Users can convert their rewards into XOLE tokens using the `convertToNewXole` or `convertAndIncreaseXoleAmount` function, provided they meet certain conditions. Users can also transfer xole to other addresses at the same time as conversion using the `convertToNewXoleForOthers` or `convertAndIncreaseXoleAmountForOthers` function.


## Audits
- [PeckShield Nov 2023](/audits/PeckShield-Audit-Report-OLEv2-v1.0.pdf)

## Getting Started
get started with the OLE Token upgrade project:
git clone https://github.com/OpenLeverageDev/ole-v2-contracts.git

## Build and Test
We use Hardhat as the development environment for compiling, deploying, and testing.

`npx hardhat test`
