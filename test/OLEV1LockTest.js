const {toWei, assertThrows, toETH} = require("./util/Util");
const m = require('mocha-logger');
const OLEV1Lock = artifacts.require("OLEV1Lock");
const TestToken = artifacts.require("MockToken");
contract("OleV1 lock", async accounts => {
    let ole;
    let lockContract;
    let user = accounts[1];

    beforeEach(async () => {
        ole = await TestToken.new('Ole', 'Ole', 0);
        await ole.mint(user, toWei(1000));

        let lastBlock = await web3.eth.getBlock('latest');
        lockContract = await OLEV1Lock.new(ole.address, lastBlock.timestamp + 86400);
        await ole.approve(lockContract.address, toWei(10000000), {from: user});
    });

    it("Lock success", async () => {
        let userOleBefore = toETH(await ole.balanceOf(user));
        await lockContract.lock(toWei(100), {from: user});
        m.log("user lock 100 ole");
        let userOleAfter = toETH(await ole.balanceOf(user));
        assert.equal(userOleBefore - userOleAfter, 100);
    })

    it("Lock fail when time is expired", async () => {
        await advanceTime(864000);
        m.log("advancing 10 days, time is expired");
        await assertThrows(lockContract.lock(toWei(100), {from: user}), 'Expired');
    })

    it("Lock fail when user balance is not enough", async () => {
        await assertThrows(lockContract.lock(toWei(10000), {from: user}), 'TFF');
    })

})