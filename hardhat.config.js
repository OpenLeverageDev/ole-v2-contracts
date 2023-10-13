/** @type import('hardhat/config').HardhatUserConfig */
require('@nomiclabs/hardhat-truffle5');
require('solidity-coverage')
require("hardhat-gas-reporter");

module.exports = {
    solidity: {
        version: "0.8.17",
        settings: {
            optimizer: {
                enabled: true
            },
        },
    },
    gasReporter: {
        enabled: true
    },

};
