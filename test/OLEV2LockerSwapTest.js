const {toWei, toETH, equalBN, assertThrows} = require("./util/Util");
const m = require('mocha-logger');
const {advanceTime} = require("./util/EtheUtil");
const OLEV2LockerSwap = artifacts.require("OLEV2LockerSwap");
const TestToken = artifacts.require("MockToken");
contract("OleV2 Locker Swap", async accounts => {
    let oleV1;
    let oleV2;
    let swapContract;

    let admin = accounts[0];
    let acc1 = accounts[1];
    let acc2 = accounts[2];
    let acc3 = accounts[3];

    beforeEach(async () => {
        oleV1 = await TestToken.new('OleV1', 'OleV1', 0);
        oleV2 = await TestToken.new('OleV2', 'OleV2', toWei(100000));
        let _accounts = [acc1, acc2];
        let _swapLimits = [toWei(1000), toWei(5000)];
        swapContract = await OLEV2LockerSwap.new(admin, oleV1.address, oleV2.address, _accounts, _swapLimits);

        await oleV1.mint(acc1, toWei(10000));
        await oleV1.approve(swapContract.address, toWei(10000000), {from: acc1});

        await oleV1.mint(acc2, toWei(10000));
        await oleV1.approve(swapContract.address, toWei(10000000), {from: acc2});

        await oleV1.mint(acc3, toWei(10000));
        await oleV1.approve(swapContract.address, toWei(10000000), {from: acc3});
    });

    it("Swap success", async () => {
        await oleV2.transfer(swapContract.address, toWei(2000));

        equalBN(await swapContract.swapLimits(acc1), toWei(1000));
        let acc1OleV1Before = toETH(await oleV1.balanceOf(acc1));
        let acc1OleV2Before = toETH(await oleV2.balanceOf(acc1));
        await swapContract.swap(toWei(1000), {from: acc1});
        let acc1OleV1After = toETH(await oleV1.balanceOf(acc1));
        let acc1OleV2After = toETH(await oleV2.balanceOf(acc1));
        assert.equal(acc1OleV1Before - acc1OleV1After, 1000);
        assert.equal(acc1OleV2After - acc1OleV2Before, 1000);
        assert.equal(await swapContract.swapLimits(acc1), 0);
        m.log("acc1 take 1000 oleV1 swapped to 1000 oleV2");

        equalBN(await swapContract.swapLimits(acc2), toWei(5000));
        let acc2OleV1Before = toETH(await oleV1.balanceOf(acc2));
        let acc2OleV2Before = toETH(await oleV2.balanceOf(acc2));
        await swapContract.swap(toWei(1000), {from: acc2});
        let acc2OleV1After = toETH(await oleV1.balanceOf(acc2));
        let acc2OleV2After = toETH(await oleV2.balanceOf(acc2));
        assert.equal(acc2OleV1Before - acc2OleV1After, 1000);
        assert.equal(acc2OleV2After - acc2OleV2Before, 1000);
        equalBN(await swapContract.swapLimits(acc2), toWei(4000));
        m.log("acc2 take 1000 oleV1 swapped to 1000 oleV2");
    })

    it("Swap fail when acc3 no swap eligibility exists", async () => {
        assert.equal(await swapContract.swapLimits(acc3), 0);
        m.log("acc3 swap limit is zero");
        await assertThrows(swapContract.swap(toWei(20000), {from: acc3}), 'Exceed');
    })

    it("Swap fail when acc1 swap limit not enough", async () => {
        equalBN(await swapContract.swapLimits(acc1), toWei(1000));
        m.log("acc1 swap limit is 1000");
        await assertThrows(swapContract.swap(toWei(2000), {from: acc1}), 'Exceed');
        m.log("acc1 swap 2000 OleV2 fail");
    })

    it("Swap fail when acc1 OLEV1 balance is not enough", async () => {
        let acc1OleV1Balance = toETH(await oleV1.balanceOf(acc1));
        m.log("acc1 OleV1 balance is", acc1OleV1Balance);

        await swapContract.increaseSwapLimit(acc1, toWei(20000));
        m.log("increase acc1 20000 swap limit");

        await oleV2.transfer(swapContract.address, toWei(20000));

        await assertThrows(swapContract.swap(toWei(20000), {from: acc1}), 'TFF');
    })

    it("Swap fail when swap contract OLEV2 balance is not enough", async () => {
        let oleV2Balance = await oleV2.balanceOf(swapContract.address);
        assert.equal(oleV2Balance, 0);
        m.log("swap contract current ole balance is 0");
        await assertThrows(swapContract.swap(toWei(100), {from: acc1}), 'NE');
    })

    it("Recycle OLEV2 success", async () => {
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

    it("increase exist account swap limit success", async () => {
        await oleV2.transfer(swapContract.address, toWei(10000));

        equalBN(await swapContract.swapLimits(acc1), toWei(1000));
        m.log("acc1 swap limit is 1000");

        await assertThrows(swapContract.swap(toWei(10000), {from: acc1}), 'Exceed');
        m.log("acc1 swap 10000 oleV2 fail");

        m.log("admin increase acc1 swap limit 9000");
        let tx = await swapContract.increaseSwapLimit(acc1, toWei(9000));
        assert.equal(tx.logs[0].args.account, acc1);
        equalBN(tx.logs[0].args.beforeLimit, toWei(1000));
        equalBN(tx.logs[0].args.afterLimit, toWei(10000));
        equalBN(await swapContract.swapLimits(acc1), toWei(10000));
        m.log("acc1 swap limit change to 10000");

        let acc1OleV2Before = await oleV2.balanceOf(acc1);
        await swapContract.swap(toWei(10000), {from: acc1})
        let acc1OleV2After = toETH(await oleV2.balanceOf(acc1));
        equalBN(acc1OleV2After - acc1OleV2Before,10000);
        m.log("acc1 swap 10000 oleV2 success");
        assert.equal(await swapContract.swapLimits(acc1), 0);
        m.log("acc1 swap limit change to 0");
    })

    it("increase new account swap limit success", async () => {
        await oleV2.transfer(swapContract.address, toWei(10000));

        equalBN(await swapContract.swapLimits(acc3), toWei(0));
        m.log("acc3 swap limit is 0");

        m.log("admin increase acc3 swap limit 1000");
        let tx = await swapContract.increaseSwapLimit(acc3, toWei(1000));
        assert.equal(tx.logs[0].args.account, acc3);
        equalBN(tx.logs[0].args.beforeLimit, toWei(0));
        equalBN(tx.logs[0].args.afterLimit, toWei(1000));

        equalBN(await swapContract.swapLimits(acc3), toWei(1000));
        m.log("acc3 swap limit change to 1000");

        let acc3OleV2Before = await oleV2.balanceOf(acc3);
        await swapContract.swap(toWei(1000), {from: acc3})
        let acc3OleV2After = toETH(await oleV2.balanceOf(acc3));
        equalBN(acc3OleV2After - acc3OleV2Before, 1000);
        m.log("acc3 swap 1000 oleV2 success");
        assert.equal(await swapContract.swapLimits(acc3), 0);
        m.log("acc3 swap limit change to 0");
    })

    it("reduce account swap limit success", async () => {
        await oleV2.transfer(swapContract.address, toWei(10000));

        equalBN(await swapContract.swapLimits(acc2), toWei(5000));
        m.log("acc2 swap limit is 5000");

        m.log("admin reduce acc2 swap limit 1000");
        let tx = await swapContract.reduceSwapLimit(acc2, toWei(1000));
        assert.equal(tx.logs[0].args.account, acc2);
        equalBN(tx.logs[0].args.beforeLimit, toWei(5000));
        equalBN(tx.logs[0].args.afterLimit, toWei(4000));
        equalBN(await swapContract.swapLimits(acc2), toWei(4000));
        m.log("acc2 swap limit change to 4000");

        await assertThrows(swapContract.swap(toWei(5000), {from: acc2}), 'Exceed');
        m.log("acc2 swap 5000 oleV2 fail");

        let acc2OleV2Before = await oleV2.balanceOf(acc2);
        await swapContract.swap(toWei(4000), {from: acc2})
        let acc2OleV2After = toETH(await oleV2.balanceOf(acc2));
        equalBN(acc2OleV2After - acc2OleV2Before, 4000);
        m.log("acc2 swap 4000 oleV2 success");
        equalBN(await swapContract.swapLimits(acc2), 0);
        m.log("acc2 swap limit change to 0");
    })

    it("reduce swap limit fail when reduce amount more than current limit", async () => {
        equalBN(await swapContract.swapLimits(acc1), toWei(1000));
        m.log("acc1 swap limit is 1000");
        await assertThrows(swapContract.reduceSwapLimit(acc1, toWei(2000)), 'Exceed');
    })

    it("Recycle fail when the operator is not admin", async () => {
        await assertThrows(swapContract.recycle(acc1, toWei(10), {from: acc3}), 'caller must be admin');
    })

    it("Increase swap limit fail when the operator is not admin", async () => {
        await assertThrows(swapContract.increaseSwapLimit(acc1, toWei(10), {from: acc3}), 'caller must be admin');
    })

    it("reduce swap limit fail when the operator is not admin", async () => {
        await assertThrows(swapContract.reduceSwapLimit(acc1, toWei(10), {from: acc3}), 'caller must be admin');
    })

})