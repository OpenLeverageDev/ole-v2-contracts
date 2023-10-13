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


## Getting Started
get started with the OLE Token upgrade project:
git clone https://github.com/OpenLeverageDev/ole-v2-contracts.git


## Build and Test
We use Hardhat as the development environment for compiling, deploying, and testing.

`npx hardhat test`
