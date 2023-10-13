const {toWei, toETH, assertThrows} = require("./util/Util");
const m = require('mocha-logger');
const {advanceTime} = require("./util/EtheUtil");
const OLEV2Swap = artifacts.require("OLEV2Swap");
const TestToken = artifacts.require("MockToken");
contract("OleV2 swap", async accounts => {
    let oleV1;
    let oleV2;
    let swapContract;

    let admin = accounts[0];
    let user = accounts[1];

    beforeEach(async () => {
        oleV1 = await TestToken.new('OleV1', 'OleV1', 0);
        await oleV1.mint(user, toWei(1000));
        oleV2 = await TestToken.new('OleV2', 'OleV2', toWei(100000));
        let lastBlock = await web3.eth.getBlock('latest');
        swapContract = await OLEV2Swap.new(oleV1.address, oleV2.address, lastBlock.timestamp + 86400);
        await oleV1.approve(swapContract.address, toWei(10000000), {from: user});
    });

    it("Swap success", async () => {
        let userOleV1Before = toETH(await oleV1.balanceOf(user));
        let userOleV2Before = toETH(await oleV2.balanceOf(user));

        await oleV2.transfer(swapContract.address, toWei(100));
        m.log("admin transfer 100 oleV2 to swap contract");
        await swapContract.swap(toWei(100), {from: user});

        let userOleV1After = toETH(await oleV1.balanceOf(user));
        let userOleV2After = toETH(await oleV2.balanceOf(user));

        assert.equal(userOleV1Before - userOleV1After, 100);
        assert.equal(userOleV2After - userOleV2Before, 100);
        m.log("user take 100 oleV1 swapd to 100 oleV2");
    })

    it("Swap fail when time is expired", async () => {
        await advanceTime(864000);
        m.log("advancing 10 days, time is expired");
        await assertThrows(swapContract.swap(toWei(100), {from: user}), 'Expired');
    })

    it("Swap fail when user balance is not enough", async () => {
        let userOleV1Balance = toETH(await oleV1.balanceOf(user));
        m.log("user OleV1 balance is", userOleV1Balance);

        await oleV2.transfer(swapContract.address, toWei(10000));
        m.log("admin transfer 10000 oleV2 to swap contract");
        m.log("user ready to swap 10000 amount 0leV2");
        await assertThrows(swapContract.swap(toWei(10000), {from: user}), 'TFF');
    })

    it("Swap fail when contract balance is not enough", async () => {
        await assertThrows(swapContract.swap(toWei(100), {from: user}), 'NE');
    })

    it("Recycle success when the operator is admin", async () => {
        await oleV2.transfer(swapContract.address, toWei(100));
        m.log("admin transfer 100 oleV2 to swap Contract");
        let adminOleV2Before = toETH(await oleV2.balanceOf(admin));
        m.log("admin oleV2 amount before the recycle is", adminOleV2Before);

        m.log("admin start recycle 10 oleV2 amount");
        await swapContract.recycle(admin, toWei(10));
        let adminOleV2After = toETH(await oleV2.balanceOf(admin));
        m.log("after recycle, admin oleV2 balance is", adminOleV2After);
        assert.equal(adminOleV2After - adminOleV2Before, 10);
    })

    it("Recycle fail when the operator is not admin", async () => {
        await assertThrows(swapContract.recycle(user, toWei(10), {from: user}), 'caller must be admin');
    })

})