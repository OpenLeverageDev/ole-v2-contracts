const {toWei, equalBN, assertThrows, lastBlockTime, advanceMultipleBlocksAndAssignTime, approxPrecisionAssertPrint} = require("./util/Util");
const {utils} = require("ethers");
const m = require('mocha-logger');
const {MerkleTree} = require("merkletreejs");
const keccak256 = require("keccak256");
const RewardDistributor = artifacts.require("RewardDistributor");
const MockToken = artifacts.require("MockToken");
const MockXOLE = artifacts.require("MockXOLE");
const MockDexRouter = artifacts.require("MockDexRouter");

contract("OLE reward distributor", async accounts => {
    let ole;
    let usd;
    let lpToken;
    let xole;
    let dexRouter;
    let contract;
    let day = Number(86400);
    let blockTime;
    let defaultVestDuration = 90 * day;
    let defaultExitPenaltyBase = 2000;
    let defaultExitPenaltyAdd = 6000;

    // merkle tree const=
    let admin = accounts[0];
    let user1 = accounts[1];
    let user2 = accounts[2];
    let user3 = accounts[3];
    let defaultReward = toWei(10);
    const total = toWei(60).toString();
    const users = [
        {address: user1, amount: defaultReward.toString()},
        {address: user2, amount: toWei(20).toString()},
        {address: user3, amount: toWei(30).toString()}
    ];
    const leaves = users.map((x) =>
        utils.solidityKeccak256(["address", "uint256"], [x.address, x.amount])
    );
    const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
    const merkleRoot = merkleTree.getHexRoot();

    beforeEach(async () => {
        m.log();
        ole = await MockToken.new('Ole', 'Ole', 0);
        usd = await MockToken.new('Usd', 'Usd', 0);
        lpToken = await MockToken.new('LpToken', 'LpToken', 0);
        xole = await MockXOLE.new(lpToken.address);
        dexRouter =  await MockDexRouter.new(lpToken.address);
        let config = [
            usd.address,
            xole.address,
            lpToken.address,
            dexRouter.address,
            30 * day,
            defaultVestDuration,
            defaultExitPenaltyBase,
            defaultExitPenaltyAdd
        ]
        contract = await RewardDistributor.new(ole.address, config);
        await ole.mint(contract.address, total);
        await ole.mint(dexRouter.address, toWei(10000));
        await usd.mint(dexRouter.address, toWei(10000));
        await usd.mint(user1, defaultReward);
        blockTime = await lastBlockTime();
    });

    // ------  admin add epoch test  ------
    it("Add epoch success", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime, blockTime + day);
        let epoch = await contract.epochs(1);
        assert.equal(epoch.merkleRoot, merkleRoot);
        equalBN(epoch.total, total);
        assert.equal(epoch.startTime, blockTime);
        assert.equal(epoch.expireTime, blockTime + day);
        assert.equal(epoch.vestDuration, defaultVestDuration);
        assert.equal(epoch.exitPenaltyBase, defaultExitPenaltyBase);
        assert.equal(epoch.exitPenaltyAdd, defaultExitPenaltyAdd);
        m.log("add epoch success");

        let tx = await contract.newEpoch(merkleRoot, total, blockTime, blockTime + 2 * day);
        let epoch2 = await contract.epochs(2);
        assert.equal(epoch2.expireTime, blockTime + 2 * day);
        let epochIdx = await contract.epochIdx();
        assert.equal(epochIdx, 2);
        m.log("add second epoch success");

        m.log("start to check event ---");
        assert.equal(tx.logs[0].args.epochId, 2);
        assert.equal(tx.logs[0].args.merkleRoot, merkleRoot);
        equalBN(tx.logs[0].args.total, total);
        assert.equal(tx.logs[0].args.startTime, blockTime);
        equalBN(tx.logs[0].args.expireTime, blockTime + 2 * day);
        assert.equal(tx.logs[0].args.vestDuration, defaultVestDuration);
        assert.equal(tx.logs[0].args.unlockPenaltyBase, defaultExitPenaltyBase);
        assert.equal(tx.logs[0].args.unlockPenaltyAdd, defaultExitPenaltyAdd);
    })

    it("Add epoch fail when start time before expire time", async () => {
        await assertThrows(contract.newEpoch(merkleRoot, total, blockTime * day, blockTime * day - 1), 'Incorrect Time');
    })

    it("Add epoch fail when expire time before current block time", async () => {
        await assertThrows(contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime), 'Incorrect Time');
    })

    // ------  user vest test  ------
    it("User vest success", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        m.log("user1 ole reward is", defaultReward);
        let tx = await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        let amount = (await contract.rewards(1, user1)).reward;
        m.log("user1 vest amount is", defaultReward);
        equalBN(defaultReward, amount);
        assert.equal(await contract.vested(1, user1), true);

        m.log("start to check event ---");
        assert.equal(tx.logs[0].args.epochId, 1);
        assert.equal(tx.logs[0].args.account, user1);
        equalBN(tx.logs[0].args.balance, defaultReward);
    })

    it("User vest fail when duplicate vest", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        m.log("user1 vest reward success");
        m.log("user1 start duplicate vest ---");
        await assertThrows(contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0])), 'Already vested');
    })

    it("User vest fail when the reward is zero", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await assertThrows(contract.vest(user1, 1, 0, merkleTree.getHexProof(leaves[0])), 'Empty Balance');
    })

    it("User vest fail when time not start", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime + day, blockTime + 2 *day);
        m.log("set epoch vest start time to one day later");
        await assertThrows(contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0])), 'Not Start');
    })

    it("User vest fail when time is expire", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await advanceMultipleBlocksAndAssignTime(1, day);
        m.log("set block time to one day later");
        await assertThrows(contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0])), 'Expired');
    })

    it("User vest fail when verify merkle proof fail", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        m.log("user1 epoch reward is", defaultReward);
        m.log("user1 start vest amount is", toWei(11));
        await assertThrows(contract.vest(user1, 1, toWei(11), merkleTree.getHexProof(leaves[0])), 'Incorrect merkle proof');
    })

    it("User vest multiple epoch reward at once success", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        m.log("set Epoch1 reward finished");
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        m.log("set Epoch2 reward finished");
        await contract.vests(user1, [1, 2], [defaultReward, defaultReward], [merkleTree.getHexProof(leaves[0]), merkleTree.getHexProof(leaves[0])]);
        let amount1 = (await contract.rewards(1, user1)).reward;
        equalBN(defaultReward, amount1);
        let amount2 = (await contract.rewards(2, user1)).reward;
        equalBN(defaultReward, amount2);
        m.log("batch vest success");
    })

    it("User vest multiple epoch reward at once fail when input not match", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await assertThrows(contract.vests(user1, [1, 2], [defaultReward], [merkleTree.getHexProof(leaves[0]), merkleTree.getHexProof(leaves[0])]), "Mismatching inputs");
    })

    it("User vest multiple epoch reward at once fail when repeated vest in a block", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await assertThrows(contract.vests(user1, [1, 1], [defaultReward, defaultReward], [merkleTree.getHexProof(leaves[0]), merkleTree.getHexProof(leaves[0])]), "Already vested");
    })

    // ------  user withdraw and exit test  ------
    it("User withdraw released reward success", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        m.log("user vest reward success, vest duration is 90 days, reward amount is", (await contract.rewards(1, user1)).reward);

        await advanceMultipleBlocksAndAssignTime(1,30 * day);
        m.log("it's been 30 days since vest");
        m.log("current available reward for withdrawal are", (await contract.calWithdrawsAndPenalties(user1, [1], false))[0].withdraw);
        let tx = await contract.withdrawReward(1, false, {from: user1});
        let balance = await ole.balanceOf(user1);
        m.log("after withdraw, user1 current ole balance is", balance);
        approxPrecisionAssertPrint(balance, 3333334619341563786, 5);

        m.log("start to check event ---");
        assert.equal(tx.logs[0].args.epochId, 1);
        assert.equal(tx.logs[0].args.account, user1);
        approxPrecisionAssertPrint(tx.logs[0].args.withdraw, 3333333333333333333, 5);

        await advanceMultipleBlocksAndAssignTime(1,30 * day);
        m.log("it's been 60 days since vest");
        m.log("current available reward for withdrawal are", (await contract.calWithdrawsAndPenalties(user1, [1], false))[0].withdraw);
        await contract.withdrawReward(1, false, {from: user1});
        balance = await ole.balanceOf(user1);
        m.log("after withdraw, user1 current ole balance is", balance);
        approxPrecisionAssertPrint(balance, 6666669238683127572, 5);

        await advanceMultipleBlocksAndAssignTime(1,30 * day);
        m.log("it's been 90 days since vest");
        m.log("current available reward for withdrawal are", (await contract.calWithdrawsAndPenalties(user1, [1], false))[0].withdraw);
        await contract.withdrawReward(1, false, {from: user1});
        balance = await ole.balanceOf(user1);
        m.log("after withdraw, user1 current ole balance is", balance);
        equalBN(balance, 10000000000000000000);
        equalBN((await contract.rewards(1, user1)).withdraw, 10000000000000000000);

        await advanceMultipleBlocksAndAssignTime(1, day);
        m.log("it's been 91 days since vest");

        let withDrawInfo = (await contract.calWithdrawsAndPenalties(user1, [1], false))[0];
        m.log("current available reward for withdrawal are", withDrawInfo.withdraw);
        equalBN(withDrawInfo.withdraw, 0);
        await assertThrows(contract.withdrawReward(1, false, {from: user1}), "Empty Withdraw");
    })

    it("Use exit success on the first day", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        m.log("user vest reward success, vest duration is 90 days, reward amount is", (await contract.rewards(1, user1)).reward);

        await advanceMultipleBlocksAndAssignTime(1, 1);
        let withDrawInfo = (await contract.calWithdrawsAndPenalties(user1, [1], true))[0];
        m.log("current available reward for exit are", withDrawInfo.withdraw);
        m.log("current penalty for exit are", withDrawInfo.penalty);

        let tx = await contract.withdrawReward(1, true, {from: user1});
        let reward = await contract.rewards(1, user1);
        m.log("after exit, record penalty is", reward.penalty);
        m.log("after exit, record withdraw is", reward.withdraw);
        approxPrecisionAssertPrint(reward.penalty, 7998997942644032922, 5);
        approxPrecisionAssertPrint(reward.withdraw, 2001002057355967078, 5);
        m.log("after exit, user1 current ole balance is", await ole.balanceOf(user1));

        m.log("start to check event ---");
        assert.equal(tx.logs[0].args.epochId, 1);
        assert.equal(tx.logs[0].args.account, user1);
        approxPrecisionAssertPrint(tx.logs[0].args.penalty, 7998997942644032922, 5);
    })

    it("Use exit success on the mid-term", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));

        await advanceMultipleBlocksAndAssignTime(1, 45 * day);
        let withDrawInfo = (await contract.calWithdrawsAndPenalties(user1, [1], true))[0];
        m.log("current available reward for exit are", withDrawInfo.withdraw);
        m.log("current penalty for exit are", withDrawInfo.penalty);

        await contract.withdrawReward(1, true, {from: user1});
        let reward = await contract.rewards(1, user1);
        m.log("after exit, record penalty is", reward.penalty);
        m.log("after exit, record withdraw is", reward.withdraw);
        approxPrecisionAssertPrint(reward.penalty, 2499499357124485597, 5);
        approxPrecisionAssertPrint(reward.withdraw, 7500500642875514403, 5);
        m.log("after exit, user1 current ole balance is", await ole.balanceOf(user1));
    })

    it("Use exit success on the last day", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));

        await advanceMultipleBlocksAndAssignTime(1, 89 * day);
        let withDrawInfo = (await contract.calWithdrawsAndPenalties(user1, [1], true))[0];
        m.log("current available reward for exit are", withDrawInfo.withdraw);
        m.log("current penalty for exit are", withDrawInfo.penalty);

        await contract.withdrawReward(1, true, {from: user1});
        let reward = await contract.rewards(1, user1);
        m.log("after exit, record penalty is", reward.penalty);
        m.log("after exit, record withdraw is", reward.withdraw);
        approxPrecisionAssertPrint(reward.penalty, 22955289866255144, 5);
        approxPrecisionAssertPrint(reward.withdraw, 9977044710133744856, 5);
        m.log("after exit, user1 current ole balance is", await ole.balanceOf(user1));
    })

    it("Use exit success when part of the reward has been withdrawn", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));

        await advanceMultipleBlocksAndAssignTime(1,30 * day);
        m.log("it's been 30 days since vest");
        await contract.withdrawReward(1, false, {from: user1});
        let withdraw = (await contract.rewards(1, user1)).withdraw;
        m.log("user1 withdraw unlocked reward", withdraw);
        approxPrecisionAssertPrint(withdraw, 3333334619341563786, 5);

        m.log("user1 start to exit");
        await contract.withdrawReward(1, true, {from: user1});
        let reward = await contract.rewards(1, user1);
        m.log("after exit, record penalty is", reward.penalty);
        m.log("after exit, record withdraw is", reward.withdraw);
        approxPrecisionAssertPrint(reward.penalty, 3999331790380658436, 5);
        approxPrecisionAssertPrint(reward.withdraw, 6000668209619341564, 5);
        m.log("after exit, user1 current ole balance is", await ole.balanceOf(user1));
    })

    it("User withdraw fail when the reward already converted", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await usd.approve(contract.address, defaultReward, {from: user1});
        await contract.convertToXOLE(1, defaultReward, 10000, blockTime + 150 * day, {from: user1});
        m.log("user1 converted reward to XOLE");
        await assertThrows(contract.withdrawReward(1, false, {from: user1}), "Converted");
    })

    it("User withdraw fail when the reward already exited", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await contract.withdrawReward(1, true, {from: user1});
        m.log("user1 exited");
        await assertThrows(contract.withdrawReward(1, false, {from: user1}), "Exited");
    })

    it("User withdraw fail when all rewards have been withdrawn", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await advanceMultipleBlocksAndAssignTime(1,90 * day);
        await contract.withdrawReward(1, false, {from: user1});
        m.log("user1 withdraw all");
        let balance = await ole.balanceOf(user1);
        m.log("user1 current ole balance is", balance);
        equalBN(balance, defaultReward);
        await assertThrows(contract.withdrawReward(1, false, {from: user1}), "Empty Withdraw");
    })

    it("User withdraw multiple epoch reward at once success", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vests(user1, [1, 2], [defaultReward, defaultReward], [merkleTree.getHexProof(leaves[0]), merkleTree.getHexProof(leaves[0])]);
        m.log("user1 vest epoch1 and epoch2 success");

        await advanceMultipleBlocksAndAssignTime(1,90 * day);
        await contract.withdrawRewards([1, 2], false, {from: user1});
        let balance = await ole.balanceOf(user1);
        m.log("user1 current ole balance is", balance);
        equalBN(balance, toWei(20));
    })

    it("User withdraw multiple epoch reward at once fail when repeated withdraw in a block", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await advanceMultipleBlocksAndAssignTime(1, day);
        await assertThrows(contract.withdrawRewards([1, 1], false, {from: user1}), "Withdraw Zero");
    })

    // ------  user convert reward to xole test  ------
    it("User convert reward to xole success when the rewards are all released", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await advanceMultipleBlocksAndAssignTime(1,90 * day);
        m.log("it's been 90 days since vest, rewards are all released");

        let usdBalanceBefore = await usd.balanceOf(user1);
        m.log("before convert, user1 usd balance is", usdBalanceBefore);
        let withDrawInfo = (await contract.calWithdrawsAndPenalties(user1, [1], true))[0];
        m.log("before convert, user1 ole reward of not yet withdrawn is", withDrawInfo.withdraw);
        m.log("current ole price is", Number(await usd.balanceOf(dexRouter.address)) / Number(await ole.balanceOf(dexRouter.address)));
        m.log("start to convert ole to XOLE");

        await usd.approve(contract.address, defaultReward, {from: user1});
        m.log("user1 approve contract usd spend, amount is", await usd.allowance(user1, contract.address));
        let tx = await contract.convertToXOLE(1, defaultReward, 10000, blockTime + 150 * day, {from: user1});

        assert.equal((await contract.rewards(1, user1)).converted, true);
        let usdBalanceAfter = await usd.balanceOf(user1);
        m.log("after convert, user1 usd balance is", usdBalanceAfter);
        assert.equal(usdBalanceAfter, 0);
        withDrawInfo = (await contract.calWithdrawsAndPenalties(user1, [1], true))[0];
        m.log("after convert, user1 ole reward of not yet withdrawn change to", withDrawInfo.withdraw);
        assert.equal(withDrawInfo.withdraw, 0);
        let xoleBalance = await xole.balanceOf(user1);
        m.log("user xole balance is", xoleBalance);
        approxPrecisionAssertPrint(xoleBalance, 10000000000000000000, 5);
        // check event
        assert.equal(tx.logs[0].args.epochId, 1);
        assert.equal(tx.logs[0].args.account, user1);
        equalBN(tx.logs[0].args.convert, defaultReward);
    })

    it("User convert reward to xole success when the rewards are part released", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await advanceMultipleBlocksAndAssignTime(1,30 * day);
        m.log("it's been 30 days since vest");
        await contract.withdrawReward(1, false, {from: user1});
        let reward = await contract.rewards(1, user1);
        let canConvert = reward.reward - reward.withdraw;
        m.log("user1 start withdraw, total reward is", reward.reward);
        m.log("user1 withdraw amount is", reward.withdraw);
        let usdBalanceBefore = await usd.balanceOf(user1);
        m.log("before convert, user1 usd balance is", usdBalanceBefore);
        m.log("start to convert ole to XOLE");

        await usd.approve(contract.address, defaultReward, {from: user1});
        await contract.convertToXOLE(1, canConvert.toString(), 9900, blockTime + 150 * day, {from: user1});

        assert.equal((await contract.rewards(1, user1)).converted, true);
        let usdBalanceAfter = await usd.balanceOf(user1);
        m.log("after convert, user1 usd balance is", usdBalanceAfter);
        equalBN(usdBalanceAfter, reward.withdraw);
        let withDrawInfo = (await contract.calWithdrawsAndPenalties(user1, [1], true))[0];
        m.log("after convert, user1 ole reward of not yet withdrawn change to", withDrawInfo.withdraw);
        assert.equal(withDrawInfo.withdraw, 0);
        let xoleBalance = await xole.balanceOf(user1);
        m.log("user xole balance is", xoleBalance);
        approxPrecisionAssertPrint(xoleBalance, 6666665380658435214, 5);
    })

    it("User convert reward to xole success when user already has a xole lock", async () => {
        await lpToken.mint(user1, toWei(10));
        await lpToken.approve(xole.address, toWei(10), {from: user1});
        await xole.create_lock_for(user1, toWei(10), blockTime + 5 * 7 * 86400, {from: user1});
        let lockInfoBefore = await xole.locked(user1);
        m.log("create user1 xole lock finished");
        m.log("current user xole amount is", lockInfoBefore.amount);
        m.log("current user xole end is", lockInfoBefore.end);

        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await usd.approve(contract.address, defaultReward, {from: user1});
        m.log("user1 start convert reward to XOLE");
        await contract.convertToXOLE(1, defaultReward, 10000, 0, {from: user1});
        let lockInfoAfter = await xole.locked(user1);
        m.log("user1 convert reward to XOLE finished");
        m.log("current user xole amount is", lockInfoAfter.amount);
        m.log("current user xole end is", lockInfoAfter.end);
        approxPrecisionAssertPrint(lockInfoAfter.amount, toWei(20), 5);
        equalBN(lockInfoBefore.end, lockInfoAfter.end);
    })

    it("User convert reward to xole fail when ole price change too high more than slippage limit", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await usd.mint(dexRouter.address, toWei(500));
        m.log("change ole price from 1 to", Number(await usd.balanceOf(dexRouter.address)) / Number(await ole.balanceOf(dexRouter.address)));
        await usd.mint(user1, toWei(10));
        await usd.approve(contract.address, toWei(20), {from: user1});
        let slippage = 9600;
        await assertThrows(contract.convertToXOLE(1, defaultReward, slippage, blockTime + 150 * day, {from: user1}), "PancakeRouter: INSUFFICIENT_A_AMOUNT");
        m.log("convert revert when slippage is", (10000 - slippage) / 10000);
        slippage = 9400;
        await contract.convertToXOLE(1, defaultReward, slippage, blockTime + 150 * day, {from: user1});
        m.log("convert success when change slippage to", (10000 - slippage) / 10000);
    })

    it("User convert reward to xole fail when ole price change too low more than slippage limit", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await ole.mint(dexRouter.address, toWei(500));
        m.log("change ole price from 1 to", Number(await usd.balanceOf(dexRouter.address)) / Number(await ole.balanceOf(dexRouter.address)));
        await usd.mint(user1, toWei(10));
        await usd.approve(contract.address, toWei(20), {from: user1});
        let slippage = 9600;
        await assertThrows(contract.convertToXOLE(1, defaultReward, slippage, blockTime + 150 * day, {from: user1}), "PancakeRouter: INSUFFICIENT_B_AMOUNT");
        m.log("convert revert when slippage is", (10000 - slippage) / 10000);
        slippage = 9400;
        await contract.convertToXOLE(1, defaultReward, slippage, blockTime + 150 * day, {from: user1});
        m.log("convert success when change slippage to", (10000 - slippage) / 10000);
    })

    it("User convert reward to xole fail when user approve token1 amount is not enough", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await usd.mint(user1, toWei(20));
        await usd.approve(contract.address, defaultReward, {from: user1});
        await assertThrows(contract.convertToXOLE(1, defaultReward, 9900, blockTime + 150 * day, {from: user1}), "TFF");
    })

    it("User convert reward to xole fail when the reward already converted", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await usd.approve(contract.address, defaultReward, {from: user1});
        await contract.convertToXOLE(1, defaultReward, 10000, blockTime + 150 * day, {from: user1});
        m.log("user1 convert epoch 1 reward success");
        m.log("user1 start to duplicate convert epoch 1 reward");
        await assertThrows(contract.convertToXOLE(1, defaultReward, 10000, blockTime + 150 * day, {from: user1}), "Converted");
    })

    it("User convert reward to xole fail when the reward already exited", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await contract.withdrawReward(1, true, {from: user1});
        m.log("user1 exit epoch 1 reward success");
        m.log("user1 start to convert epoch 1 reward");
        await assertThrows(contract.convertToXOLE(1, defaultReward, 10000, blockTime + 150 * day, {from: user1}), "Exited");
    })

    it("User convert reward to xole fail when all rewards have been withdrawn", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await advanceMultipleBlocksAndAssignTime(1,90 * day);
        await contract.withdrawReward(1, false, {from: user1});
        assert.equal((await contract.calWithdrawsAndPenalties(user1, [1], true))[0].withdraw, 0);
        m.log("user1 withdraw epoch 1 all reward");
        m.log("user1 start to convert epoch 1 reward");
        await assertThrows(contract.convertToXOLE(1, defaultReward, 10000, blockTime + 150 * day, {from: user1}), "Empty Withdraw");
    })

    it("User convert reward to xole fail when token1 amount is zero", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        m.log("start to convert with token1 amount is zero");
        await assertThrows(contract.convertToXOLE(1, 0, 10000, blockTime + 150 * day, {from: user1}), "Empty Amount");
    })

    it("User convert reward to xole fail when slippage param is error", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        let slippage = 8999;
        m.log("start to convert with slippage is", slippage);
        await assertThrows(contract.convertToXOLE(1, defaultReward, slippage, blockTime + 150 * day, {from: user1}), "Slip ERR");
        slippage = 10001;
        m.log("start to convert with slippage is", slippage)
        await assertThrows(contract.convertToXOLE(1, defaultReward, slippage, blockTime + 150 * day, {from: user1}), "Slip ERR");
    })

    it("User convert reward to xole fail when create lock and unlock time is too short", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await usd.approve(contract.address, defaultReward, {from: user1});
        m.log("start to convert with unlock time is 20 days later");
        await assertThrows(contract.convertToXOLE(1, defaultReward, 10000, blockTime + 20 * day, {from: user1}), "Lock Time ERR");
    })

    it("User convert reward to xole fail when create lock and unlock time long more than 4 years", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await usd.approve(contract.address, defaultReward, {from: user1});
        m.log("start to convert with unlock time is 5 years later");
        await assertThrows(contract.convertToXOLE(1, defaultReward, 10000, blockTime + 5 * 365 * day, {from: user1}), "Voting lock can be 4 years max");
    })

    it("User convert reward to xole fail when increase lock amount and unlock time is too short", async () => {
        await lpToken.mint(user1, toWei(10));
        await lpToken.approve(xole.address, toWei(10), {from: user1});
        await xole.create_lock_for(user1, toWei(10), blockTime + 3 * 7 * 86400, {from: user1});
        await xole.locked(user1);
        m.log("create user1 xole lock finished");
        m.log("current end is 21 days");
        m.log("convert min unlock time require is 30 days");
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await usd.approve(contract.address, defaultReward, {from: user1});
        m.log("start to convert with exist xole lock");
        await assertThrows(contract.convertToXOLE(1, defaultReward, 10000, 0, {from: user1}), "Lock Time ERR");
    })

    it("User convert multiple epoch reward to xole at once success", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vests(user1, [1, 2], [defaultReward, defaultReward], [merkleTree.getHexProof(leaves[0]), merkleTree.getHexProof(leaves[0])]);
        m.log("user1 vest epoch1 and epoch2 success");
        await usd.mint(user1, defaultReward);
        await usd.approve(contract.address, toWei(20), {from: user1});
        await contract.convertToXOLEs([1,2], toWei(20), 10000, blockTime + 40 * day, {from: user1});
        let xoleBalance = await xole.balanceOf(user1);
        m.log("convert multiple epoch reward success, current user1 xole balance is", xoleBalance);
        approxPrecisionAssertPrint(xoleBalance, toWei(20), 5);
    })

    it("User convert multiple epoch reward to xole at once fail when repeated convert in a block", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await usd.approve(contract.address, toWei(20), {from: user1});
        await assertThrows(contract.convertToXOLEs([1,1], toWei(20), 10000, blockTime + 40 * day, {from: user1}), "Converted");
    })

    // ------  admin competence test  ------
    it("Admin withdraw expire amount success", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await advanceMultipleBlocksAndAssignTime(1,31 * day);
        m.log("it's been 31 days since vest, none vest, reward is expire");
        let before = await ole.balanceOf(admin);
        await contract.withdrawExpires([1]);
        let after = await ole.balanceOf(admin);
        m.log("admin withdraw expire amount is", after - before);
        approxPrecisionAssertPrint(total, after - before, 5);
        m.log("start to duplicate withdraw");
        await contract.withdrawExpires([1]);
        let again = await ole.balanceOf(admin);
        m.log("admin ole balance not change");
        equalBN(after, again);
    })

    it("Withdraw expire amount fail when the operator is not admin", async () => {
        await assertThrows(contract.withdrawExpires([1], {from : user1}), 'caller must be admin');
    })

    it("Admin withdraw penalty amount success", async () => {
        await contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day);
        await contract.vest(user1, 1, defaultReward, merkleTree.getHexProof(leaves[0]));
        await contract.withdrawReward(1, true, {from: user1});
        let penalty = (await contract.epochs(1)).penalty;
        m.log("user exit epoch, penalty amount is", penalty);
        let before = await ole.balanceOf(admin);
        await contract.withdrawPenalties([1]);
        let after = await ole.balanceOf(admin);
        m.log("admin withdraw penalty amount is", after - before);
        approxPrecisionAssertPrint(penalty, after - before, 5);
        equalBN(penalty, (await contract.epochs(1)).penaltyWithdrew)
        m.log("start to duplicate withdraw");
        await contract.withdrawPenalties([1]);
        let again = await ole.balanceOf(admin);
        m.log("admin ole balance not change");
        equalBN(after, again);
    })

    it("Withdraw penalty amount when the operator is not admin", async () => {
        await assertThrows(contract.withdrawPenalties([1], {from : user1}), 'caller must be admin');
    })

    it("Set config Success", async () => {
        let token1AddrBefore = (await contract.config()).token1;
        m.log("before config modify, token1 address is", token1AddrBefore);
        let newUsd = await MockToken.new('NewUsd', 'NewUsd', 0);
        m.log("deploy new token1 address is", newUsd.address);
        await contract.setConfig([
            newUsd.address,
            xole.address,
            lpToken.address,
            dexRouter.address,
            30 * day,
            defaultVestDuration,
            defaultExitPenaltyBase,
            defaultExitPenaltyAdd
        ]);
        let token1AddrAfter = (await contract.config()).token1;
        m.log("after config modify, token1 address is", token1AddrAfter);
        assert.equal(newUsd.address, token1AddrAfter);
    })

    it("Set config when the operator is not admin", async () => {
        await assertThrows(contract.setConfig([
            usd.address,
            xole.address,
            lpToken.address,
            dexRouter.address,
            30 * day,
            defaultVestDuration,
            defaultExitPenaltyBase,
            defaultExitPenaltyAdd
        ], {from : user1}), 'caller must be admin');
    })

    it("Add epoch fail when the operator is not admin", async () => {
        await assertThrows(contract.newEpoch(merkleRoot, total, blockTime - 1, blockTime + day, {from : user1}), 'caller must be admin');
    })

})
