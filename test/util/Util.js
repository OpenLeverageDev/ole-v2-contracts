const {toBN} = require("./EtheUtil");

const m = require('mocha-logger');
const timeMachine = require("ganache-time-traveler");

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

exports.advanceMultipleBlocksAndAssignTime = async (total,time) => {
    let remain = total;
    while (remain > 0) {
        if (remain % 1000 == 0) {
            m.log("Advancing", total - remain, "/", total, "blocks ...");
        }
        await timeMachine.advanceTimeAndBlock(time);
        remain--;
    }
}
exports.approxPrecisionAssertPrint = (expected, value, precision) => {
    let expectedNum = Number(expected);
    let valueNum = Number(value);
    let diff = expectedNum > valueNum ? expectedNum - valueNum : valueNum - expectedNum;
    let diffLimit = Math.pow(0.1, precision);
    m.log("approxPrecisionAssertPrint expectedNum, valueNum, diff/expectedNum, diffLimit", expectedNum, valueNum, (diff / expectedNum), diffLimit);
    assert((diff / expectedNum) < diffLimit, "Diff is too big. expectedNum=" + expectedNum + " valueNum=" + valueNum + " " +
        "diff=" + diff + " diff/expectedNum=" + diff / expectedNum+ " diffLimit=" + diffLimit);
}

exports.equalBN = (expected, actual) => {
    assert.equal(expected.toString(), actual.toString());
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

