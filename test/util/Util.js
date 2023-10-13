const {toBN} = require("./EtheUtil");

const m = require('mocha-logger');

let toWei = exports.toWei = (amount) => {
    return toBN(1e18).mul(toBN(amount));
}
exports.toETH = (amount) => {
    return toBN(amount).div(toBN(1e18));
}
exports.maxUint = () => {
    let max = toBN(2).pow(toBN(255));
    return max;
}

exports.lastBlockTime = async () => {
    let blockNum = await web3.eth.getBlockNumber();
    return (await web3.eth.getBlock(blockNum)).timestamp;
}

exports.assertPrint = (desc, expected, value) => {
    m.log(desc, ":", value);
    assert.equal(expected.toString(), value.toString());
}

exports.assertThrows = async (promise, reason) => {
    try {
        await promise;
    } catch (error) {
        assert(
            error.message.search(reason) >= 0,
            'Expected throw, got \'' + error + '\' instead',
        );
        m.log("Received expected error: ", error.message);
        return;
    }
    assert.fail('Expected throw not received');
}

