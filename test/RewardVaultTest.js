const {utils} = require("ethers");
const {MerkleTree} = require("merkletreejs");
const keccak256 = require("keccak256");
const RewardVault = artifacts.require("RewardVault");
const TestToken = artifacts.require("MockToken");
const MockTaxToken = artifacts.require("MockTaxToken");
const MockDeflationToken = artifacts.require("MockDeflationToken");
const {toWei, approxPrecisionAssertPrint, lastBlockTime, assertThrows} = require("./util/Util");
const {advanceMultipleBlocksAndAssignTime} = require("./util/EtheUtil");

const m = require('mocha-logger');

contract("RewardVault", async accounts => {
    const users = [
        {address: accounts[3], amount: toWei(10).toString()},
        {address: accounts[4], amount: toWei(10).toString()},
        {address: accounts[5], amount: toWei(20).toString()}
    ];
    const leaves = users.map((x) =>
        utils.solidityKeccak256(["address", "uint256"], [x.address, x.amount])
    );

    let token;
    let token2;
    let rewardVault;
    let admin = accounts[0];
    let provider = accounts[1];
    let distributor = accounts[2];
    let initSupply = toWei(1000000000);
    let initRewardAmount = toWei(100);
    let oneDaySeconds = 86400;
    let initRuleFlag= 100000000000000000;
    let noMerkleRoot = "0x0000000000000000000000000000000000000000000000000000000000000001";

    beforeEach(async () => {
        token = await TestToken.new("T", "T", initSupply);
        await token.transfer(provider, initSupply, {from: admin});
        token2 = await TestToken.new("T2", "T2", initSupply);
        await token2.transfer(provider, initSupply, {from: admin});
        // set default expire duration for 90 days
        rewardVault = await RewardVault.new(admin, distributor, 0, oneDaySeconds * 90);
        await token.approve(rewardVault.address, initSupply, {from: provider});
        await token2.approve(rewardVault.address, initSupply, {from: provider});
    });

    async function newTranche(tokenAddress, rewardAmount, _value ) {
        let blockTime = await lastBlockTime();
        let startTime = blockTime + oneDaySeconds;
        let endTime = startTime + oneDaySeconds;
        await rewardVault.newTranche(rewardAmount, tokenAddress, startTime, endTime, initRuleFlag.toString(), {from : provider, value : _value});
        m.log("Add tranche", rewardAmount, "token addr:", tokenAddress, "native token amount:", _value, "startTime:", startTime, "endTime", endTime);
    }

    // ---------- add tranche check -----------
    it("Adding new tranche success with correct info", async () => {
        let blockTime = await lastBlockTime();
        let providerBeforeBalance = await token.balanceOf(provider);
        let contractBeforeBalance = await token.balanceOf(rewardVault.address);
        let startTime = blockTime + oneDaySeconds;
        let endTime = startTime + oneDaySeconds;

        await rewardVault.newTranche(toWei(100), token.address, startTime, endTime, initRuleFlag.toString(), {from : provider});
        m.log("---- set tranche info finished ----");

        let providerAfterBalance = await token.balanceOf(provider);
        let contractAfterBalance = await token.balanceOf(rewardVault.address);
        assert.equal(providerBeforeBalance - providerAfterBalance, 100000000079942390000);
        assert.equal(contractAfterBalance - contractBeforeBalance, toWei(100).toString());
        m.log("balance check passed");

        let tranche = await rewardVault.tranches(1);
        assert.equal(tranche.total, toWei(100).toString());
        assert.equal(tranche.provider.toString(), provider);
        assert.equal(tranche.startTime, startTime);
        assert.equal(tranche.endTime, endTime);
        assert.equal(tranche.expireTime.toString(), endTime + oneDaySeconds * 90);
        m.log("tranche info check passed");
    });

    it("Adding tranche should fail when start time is before current block time", async () => {
        let blockTime = await lastBlockTime();
        let startTime = blockTime - 1;
        let endTime = startTime + oneDaySeconds;
        await assertThrows(rewardVault.newTranche(toWei(100), token.address, startTime, endTime, initRuleFlag.toString(), {from : provider}), 'Incorrect inputs');
    });

    it("Adding tranche should fail when end time is before start time", async () => {
        let blockTime = await lastBlockTime();
        let startTime = blockTime +  oneDaySeconds;
        let endTime = startTime - 1;
        await assertThrows(rewardVault.newTranche(toWei(100), token.address, startTime, endTime, initRuleFlag.toString(), {from : provider}), 'Incorrect inputs');
    });

    it("Adding tranche should fail when rule flag is missing", async () => {
        let blockTime = await lastBlockTime();
        let startTime = blockTime +  oneDaySeconds;
        let endTime = startTime + oneDaySeconds;
        await assertThrows(rewardVault.newTranche(toWei(100), token.address, startTime, endTime, 0, {from : provider}), 'Incorrect inputs');
    });

    //  ---------- update tranche info check -----------
    it("Update tranche info success", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        let tranche = await rewardVault.tranches(1);
        let modifiedStartTime = tranche.startTime - 1;
        let modifiedEndTime = tranche.endTime + 1;
        let modifiedExpireTime = Number(modifiedEndTime) + oneDaySeconds * 90;
        await rewardVault.updateTranche(1, modifiedStartTime, modifiedEndTime, 0, {from : provider});
        tranche = await rewardVault.tranches(1);
        assert.equal(tranche.total, toWei(100).toString());
        assert.equal(tranche.startTime, modifiedStartTime);
        assert.equal(tranche.endTime, modifiedEndTime);
        assert.equal(tranche.expireTime.toString(), modifiedExpireTime);
        m.log("---- update tranche time info success ----");

        let secondModifiedEndTime = Number(modifiedEndTime) + 1;
        await rewardVault.updateTranche(1, modifiedStartTime, secondModifiedEndTime, toWei(10), {from : provider});
        tranche = await rewardVault.tranches(1);
        assert.equal(tranche.total, toWei(110).toString());
        assert.equal(tranche.startTime, modifiedStartTime);
        assert.equal(tranche.endTime, secondModifiedEndTime);
        assert.equal(tranche.expireTime.toString(), secondModifiedEndTime + oneDaySeconds * 90);
        m.log("---- update tranche time and amount info success ----");
    });

    it("Updating tranche info should fail if msg.sender is not reward provider", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        let tranche = await rewardVault.tranches(1);
        await assertThrows(rewardVault.updateTranche(1, tranche.startTime, tranche.endTime, 0, {from : admin}), 'No permission');
    });

    it("Updating tranche info should fail when tranche has been already started", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        let tranche = await rewardVault.tranches(1);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds);
        await assertThrows(rewardVault.updateTranche(1, tranche.startTime, tranche.endTime, 0, {from : provider}), 'Already started');
    });

    it("Updating tranche info should fail when start time is before the current block time", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await rewardVault.tranches(1);
        let blockTime = await lastBlockTime();
        let startTime = blockTime - 1;
        await assertThrows(rewardVault.updateTranche(1, startTime, startTime + oneDaySeconds, 0, {from : provider}), 'Incorrect inputs');
    });

    it("Updating tranche info should fail when end time is before start time", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        let tranche = await rewardVault.tranches(1);
        await assertThrows(rewardVault.updateTranche(1, tranche.startTime, tranche.startTime, 0, {from : provider}), 'Incorrect inputs');
    });

    //  ---------- recycle check -----------
    it("Recycling undistributed reward and expire reward success by provider", async () => {
        // recycle by twice
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await rewardVault.setTrancheTree(1, toWei(59), toWei(40), toWei(1), root, {from : distributor});
        m.log("set merkle tree finished");
        let providerBeforeBalance = await token.balanceOf(provider);
        await rewardVault.recyclingReward(1, {from : provider});
        let providerAfterBalance = await token.balanceOf(provider);
        assert.equal(providerAfterBalance - providerBeforeBalance, 59000000104890370000);
        let tranche = await rewardVault.tranches(1);
        assert.equal(tranche.recycled.toString(), toWei(59).toString());
        m.log("recycle undistributed reward success");

        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 90 + 1);
        m.log("tranche is expire");
        providerBeforeBalance = await token.balanceOf(provider);
        await rewardVault.recyclingReward(1, {from : provider});
        providerAfterBalance = await token.balanceOf(provider);
        assert.equal(providerAfterBalance - providerBeforeBalance, 39999999922025790000);
        tranche = await rewardVault.tranches(1);
        assert.equal(tranche.recycled.toString(), toWei(99).toString());
        m.log("recycle expire reward success");
        m.log("recycle success by twice");
        await assertThrows(rewardVault.recyclingReward(1, {from : provider}), 'Invalid amount');
        m.log("can not recycle when reward has been recycled");

        // recycle by once
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche2 is end");
        await rewardVault.setTrancheTree(2, toWei(99), 0, toWei(1), noMerkleRoot, {from : distributor});
        m.log("set tree finished");
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 90 + 1);
        m.log("tranche2 is expire");
        providerBeforeBalance = await token.balanceOf(provider);
        await rewardVault.recyclingReward(2, {from : provider});
        providerAfterBalance = await token.balanceOf(provider);
        assert.equal(providerAfterBalance - providerBeforeBalance, 99000000026916160000);
        tranche = await rewardVault.tranches(1);
        assert.equal(tranche.recycled.toString(), toWei(99).toString());
        m.log("recycle undistribute and expire reward success by once");
        await assertThrows(rewardVault.recyclingReward(2, {from : provider}), 'Invalid amount');
        m.log("can not recycle when reward has been recycled");
    });

    it("Recycling reward for multiple tranches success", async () => {
        await newTranche(token.address, toWei(310), 0);
        await newTranche(token2.address, toWei(430), 0);
        await newTranche(token.address, toWei(540), 0);
        await newTranche(token.address, "888888888888888888888", 0);
        await rewardVault.setExpireDuration(oneDaySeconds * 120, {from : admin});
        m.log("changed expireDuration from 90 days to 120 days");
        await newTranche(token2.address, "999999999999999999999", 0);

        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("Tranches have ended. setting merkle tree result");

        await rewardVault.setTrancheTree(1, toWei(307), 0, toWei(3), noMerkleRoot, {from : distributor});
        await rewardVault.setTrancheTree(2, toWei(426), 0, toWei(4), noMerkleRoot, {from : distributor});
        await rewardVault.setTrancheTree(3, toWei(535), 0, toWei(5), noMerkleRoot, {from : distributor});
        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await rewardVault.setTrancheTree(4, "840888888888888888888", toWei(40), toWei(8), root, {from : distributor});
        await rewardVault.setTrancheTree(5, "950999999999999999999", toWei(40), toWei(9), root, {from : distributor});
        m.log("set tree1、tree2、tree3、tree4、tree5 finished");

        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 90 + 1);
        m.log("time added 90 days ----");
        m.log("tree1、tree2、tree3、tree4 is expired, unClaimed reward can be recycling");
        m.log("tree5 is not expire, unClaimed reward can not be recycling");

        let providerBeforeBalance = await token.balanceOf(provider);
        let providerToken2BeforeBalance = await token2.balanceOf(provider);
        await rewardVault.recyclingRewards([1, 2, 3, 4, 5], {from : provider});
        let providerAfterBalance = await token.balanceOf(provider);
        let providerToken2AfterBalance = await token2.balanceOf(provider);
        assert.equal(providerAfterBalance - providerBeforeBalance, 1722888888819738700000);
        assert.equal(providerToken2AfterBalance - providerToken2BeforeBalance, 1376999999899590200000);
        m.log("provider balance check passed");

        let tranche1 = await rewardVault.tranches(1);
        assert.equal(tranche1.recycled.toString(), toWei(307).toString());
        let tranche2 = await rewardVault.tranches(2);
        assert.equal(tranche2.recycled.toString(), toWei(426).toString());
        let tranche3 = await rewardVault.tranches(3);
        assert.equal(tranche3.recycled.toString(), toWei(535).toString());
        let tranche4 = await rewardVault.tranches(4);
        assert.equal(tranche4.recycled.toString(), 880888888888888888888);
        let tranche5 = await rewardVault.tranches(5);
        assert.equal(tranche5.recycled.toString(), 950999999999999999999);
        m.log("tranche info check passed");
        m.log("recycles reward success");

        await assertThrows(rewardVault.recyclingRewards([1, 2, 3, 4, 5], {from : provider}), 'Invalid amount');
        m.log("can not recycles when reward has been recycled");
    });

    it("recycle reward fail when reward is empty", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        await rewardVault.setTrancheTree(1, 0, toWei(100), 0, noMerkleRoot, {from : distributor});
        m.log("set tree finished");
        await assertThrows(rewardVault.recyclingReward(1, {from : provider}), 'Invalid amount');
    });

    it("recycle reward fail when sender is not provider", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        await rewardVault.setTrancheTree(1, toWei(99), 0, toWei(1), noMerkleRoot, {from : distributor});
        m.log("set tree finished");
        await assertThrows(rewardVault.recyclingReward(1, {from : admin}), 'No permission');
    });

    it("recycle reward fail when admin not set merkle root", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        await assertThrows(rewardVault.recyclingReward(1, {from : provider}), 'Not start');
    });

    //  ---------- claim check -----------
    it("claim success when proof is valid", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await rewardVault.setTrancheTree(1, toWei(59), toWei(40), toWei(1), root, {from : distributor});
        m.log("set tree finished");

        let user1Index = 0;
        let user1 = users[user1Index].address;
        await rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user1Index]), {from : user1});
        assert.equal((await token.balanceOf(user1)).toString(), toWei(10).toString());
        let tranche = await rewardVault.tranches(1);
        assert.equal(tranche.claimed.toString(), toWei(10).toString());
        m.log("user1 claim success");

        let user2Index = 1;
        let user2 = users[user2Index].address;
        await rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user2Index]), {from : user2});
        assert.equal((await token.balanceOf(user2)).toString(), toWei(10).toString());
        tranche = await rewardVault.tranches(1);
        assert.equal(tranche.claimed.toString(), toWei(20).toString());
        m.log("user2 claim success");

        let user3Index = 2;
        let user3 = users[user3Index].address;
        await rewardVault.claim(1, toWei(20), merkleTree.getHexProof(leaves[user3Index]), {from : user3});
        assert.equal((await token.balanceOf(user3)).toString(), toWei(20).toString());
        tranche = await rewardVault.tranches(1);
        assert.equal(tranche.claimed.toString(), toWei(40).toString());
        m.log("user3 claim success");

        await assertThrows(rewardVault.claim(1, toWei(20), merkleTree.getHexProof(leaves[user3Index]), {from : user3}), 'Already claimed');
        m.log("claim fail when reward has been claimed");
    });

    it("batch claim success", async () => {
        await newTranche(token.address, toWei(310), 0);
        await newTranche(token2.address, toWei(430), 0);
        await newTranche(token.address, toWei(540), 0);
        await newTranche(token.address, "888888888888888888888", 0);
        await newTranche(token2.address, "999999999999999999999", 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await rewardVault.setTrancheTree(1, toWei(269), toWei(40), toWei(1), root, {from : distributor});
        await rewardVault.setTrancheTree(2, toWei(389), toWei(40), toWei(1), root, {from : distributor});
        await rewardVault.setTrancheTree(3, toWei(499), toWei(40), toWei(1), root, {from : distributor});

        const users2 = [
            {address: accounts[3], amount: "8888888888888888888"},
            {address: accounts[4], amount: toWei(10).toString()},
            {address: accounts[5], amount: toWei(20).toString()}
        ];
        const leaves2 = users2.map((x) =>
            utils.solidityKeccak256(["address", "uint256"], [x.address, x.amount])
        );
        const merkleTree2 = new MerkleTree(leaves2, keccak256, {sort: true});
        const root2 = merkleTree2.getHexRoot();
        await rewardVault.setTrancheTree(4, toWei(849), "38888888888888888888", toWei(1), root2, {from : distributor});

        const users3 = [
            {address: accounts[3], amount: toWei(10).toString()},
            {address: accounts[4], amount: toWei(10).toString()},
            {address: accounts[5], amount: "9999999999999999999"}
        ];
        const leaves3 = users3.map((x) =>
            utils.solidityKeccak256(["address", "uint256"], [x.address, x.amount])
        );
        const merkleTree3 = new MerkleTree(leaves3, keccak256, {sort: true});
        const root3 = merkleTree3.getHexRoot();
        await rewardVault.setTrancheTree(5, toWei(969), "29999999999999999999", toWei(1), root3, {from : distributor});
        m.log("set tree1、tree2、tree3、tree4、tree5 finished");

        let user1Index = 0;
        let user1 = users[user1Index].address;
        await rewardVault.claims([1, 2, 3, 4, 5], [toWei(10), toWei(10), toWei(10), "8888888888888888888", toWei(10)],
            [merkleTree.getHexProof(leaves[user1Index]), merkleTree.getHexProof(leaves[user1Index]), merkleTree.getHexProof(leaves[user1Index]),
                merkleTree2.getHexProof(leaves2[user1Index]), merkleTree3.getHexProof(leaves3[user1Index])], {from : user1});
        assert.equal((await token.balanceOf(user1)).toString(), 28888888888888888888);
        assert.equal((await token2.balanceOf(user1)).toString(), toWei(20).toString());

        let user3Index = 2;
        let user3 = users[user3Index].address;
        await rewardVault.claims([1, 2, 3, 4, 5], [toWei(20), toWei(20), toWei(20), toWei(20), "9999999999999999999"],
            [merkleTree.getHexProof(leaves[user3Index]), merkleTree.getHexProof(leaves[user3Index]), merkleTree.getHexProof(leaves[user3Index]),
                merkleTree2.getHexProof(leaves2[user3Index]), merkleTree3.getHexProof(leaves3[user3Index])], {from : user3});
        assert.equal((await token.balanceOf(user3)).toString(), toWei(60).toString());
        assert.equal((await token2.balanceOf(user3)).toString(), 29999999999999999999);
        m.log("user balance check passed");

        let tranche1 = await rewardVault.tranches(1);
        assert.equal(tranche1.claimed.toString(), toWei(30).toString());
        let tranche2 = await rewardVault.tranches(2);
        assert.equal(tranche2.claimed.toString(), toWei(30).toString());
        let tranche3 = await rewardVault.tranches(3);
        assert.equal(tranche3.claimed.toString(), toWei(30).toString());
        let tranche4 = await rewardVault.tranches(4);
        assert.equal(tranche4.claimed.toString(), 28888888888888888888);
        let tranche5 = await rewardVault.tranches(5);
        assert.equal(tranche5.claimed.toString(), 19999999999999999999);
        m.log("tranche info check passed");
        m.log("claims reward success");

        await assertThrows(rewardVault.claims([1, 2, 3, 4, 5], [toWei(20), toWei(20), toWei(20), toWei(20), "9999999999999999999"],
            [merkleTree.getHexProof(leaves[user3Index]), merkleTree.getHexProof(leaves[user3Index]), merkleTree.getHexProof(leaves[user3Index]),
                merkleTree2.getHexProof(leaves2[user3Index]), merkleTree3.getHexProof(leaves3[user3Index])], {from : user3}), 'Already claimed');
        m.log("claims fail when reward has been claimed");
    });

    it("claim fail when proof is invalid", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await rewardVault.setTrancheTree(1, toWei(59), toWei(40), toWei(1), root, {from : distributor});
        m.log("set tree finished");
        let user1Index = 0;
        let user1 = users[user1Index].address;
        await assertThrows(rewardVault.claim(1, toWei(20), merkleTree.getHexProof(leaves[user1Index]), {from : user1}), 'Incorrect merkle proof');
    });

    it("claim fail when claim amount more than distributed", async () => {
        await newTranche(token.address, toWei(5), 0);
        m.log("add new tranche finished, supply total amount is", toWei(5));
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await rewardVault.setTrancheTree(1, toWei(2), toWei(2), toWei(1), root, {from : distributor});
        m.log("set tree finished, set distribute amount is", toWei(2));
        let user1Index = 0;
        let user1 = users[user1Index].address;
        m.log("claim amount is", toWei(10));
        await assertThrows(rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user1Index]), {from : user1}), 'Invalid amount');
    });

    it("claim fail when admin not set merkle root", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        let user1Index = 0;
        let user1 = users[user1Index].address;
        await assertThrows(rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user1Index]), {from : user1}), 'Not start');
    });

    it("claim fail when tranche no reward", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        await rewardVault.setTrancheTree(1, toWei(99), 0, toWei(1), noMerkleRoot, {from : distributor});
        m.log("set tree finished");
        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        let user1Index = 0;
        let user1 = users[user1Index].address;
        await assertThrows(rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user1Index]), {from : user1}), 'No Reward');
    });

    it("claim fail when reward has been expired", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await rewardVault.setTrancheTree(1, toWei(59), toWei(40), toWei(1), root, {from : distributor});
        m.log("set tree finished");
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 90 + 1);
        m.log("tranche is expire");
        let user1Index = 0;
        let user1 = users[user1Index].address;
        await assertThrows(rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user1Index]), {from : user1}), 'Expired');
    });

    //  ---------- withdraw tax check -----------
    it("withdraw success by admin", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        await rewardVault.setTrancheTree(1, toWei(99), 0, toWei(1), noMerkleRoot, {from : distributor});
        await rewardVault.setTrancheTree(2, toWei(99), 0, toWei(1), noMerkleRoot, {from : distributor});
        m.log("set tree1 and tree2 finished");
        await rewardVault.withdrawTaxFund(token.address, accounts[2], {from : admin});
        assert.equal((await token.balanceOf(accounts[2])).toString(), toWei(2).toString());
        await assertThrows(rewardVault.withdrawTaxFund(token.address, accounts[2], {from : admin}), 'Not enough');
        m.log("withdraw fail when tax fund has been withdrawn");
    });

    it("batch withdraw success by admin", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await newTranche(token2.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        await rewardVault.setTrancheTree(1, toWei(99), 0, toWei(1), noMerkleRoot, {from : distributor});
        await rewardVault.setTrancheTree(2, toWei(99), 0, toWei(1), noMerkleRoot, {from : distributor});
        m.log("set tree1 and tree2 finished");
        await rewardVault.withdrawTaxFunds([token.address, token2.address], accounts[2], {from : admin});
        assert.equal((await token.balanceOf(accounts[2])).toString(), toWei(1).toString());
        assert.equal((await token2.balanceOf(accounts[2])).toString(), toWei(1).toString());
    });

    it("withdraw fail when sender is not admin", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        await rewardVault.setTrancheTree(1, toWei(99), 0, toWei(1), noMerkleRoot, {from : distributor});
        m.log("set tree finished");
        await assertThrows(rewardVault.withdrawTaxFund(token.address, accounts[2], {from : accounts[2]}), 'caller must be admin');
    });

    //  ---------- admin set check -----------
    it("only amin can set expire duration, and expire duration must > 0", async () => {
        await assertThrows(rewardVault.setExpireDuration(oneDaySeconds, {from : accounts[2]}), 'caller must be admin');
        await assertThrows(rewardVault.setExpireDuration(0, {from : admin}), 'Incorrect inputs');
        await rewardVault.setExpireDuration(oneDaySeconds, {from : admin});
        await newTranche(token.address, initRewardAmount, 0);
        let tranche = await rewardVault.tranches(1);
        assert.equal(tranche.expireTime - tranche.endTime, oneDaySeconds);
    });

    it("only distributor can set tranche Tree", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");
        await assertThrows(rewardVault.setTrancheTree(1, toWei(99), 0, toWei(1), noMerkleRoot, {from : accounts[3]}), 'caller must be distributor');
        await rewardVault.setTrancheTree(1, toWei(99), 0, toWei(1), noMerkleRoot, {from : distributor});
        let tranche = await rewardVault.tranches(1);
        assert.equal(tranche.tax.toString(), toWei(1).toString());
        assert.equal(tranche.unDistribute.toString(), toWei(99).toString());
        assert.equal(tranche.merkleRoot, noMerkleRoot);
    });

    it("Set tranche Tree should fail when the campaign is not ended", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await assertThrows(rewardVault.setTrancheTree(1, toWei(99), 0, toWei(1), noMerkleRoot, {from : distributor}), 'Not end');
    });

    it("Set tranche Tree fail when undistribute plus tax plus distribute not equals total", async () => {
        await newTranche(token.address, initRewardAmount, 0);
        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await assertThrows(rewardVault.setTrancheTree(1, "99000000000000000000", 1, "1000000000000000000", root, {from : distributor}), 'Incorrect inputs');
        await assertThrows(rewardVault.setTrancheTree(1, "98000000000000000000", 1, "1000000000000000000", root, {from : distributor}), 'Incorrect inputs');
    });

    it("only admin can set distributor", async () => {
        await assertThrows(rewardVault.setDistributor(accounts[3], {from : distributor}), 'caller must be admin');
        await rewardVault.setDistributor(accounts[3], {from : admin});
        m.log("admin change distributor success");
        await rewardVault.tranches(1);
        assert.equal((await rewardVault.distributor()).toString(), accounts[3]);
    });

    //  ---------- token full process test -----------
    it("Deflation token test", async () => {
        let deflationToken = await MockDeflationToken.new('TT', 'TT', toWei(400), toWei(900000));
        await deflationToken.transfer(provider, toWei(100));
        await deflationToken.approve(rewardVault.address, initSupply, {from: provider});
        m.log("provider init deflation token balance ---", await deflationToken.balanceOf(provider));

        await newTranche(deflationToken.address, initRewardAmount, 0);
        let contractCurrentBalance = await deflationToken.balanceOf(rewardVault.address);
        m.log("rewardVault contract deflation token balance after tranche add---", contractCurrentBalance);
        assert.equal(contractCurrentBalance.toString(), 99999999999999999999);

        let tranche = await rewardVault.tranches(1);
        assert.equal(tranche.total.toString(), 99999999999999999999);
        m.log("tranche total is right");

        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");

        await deflationToken.setRate(toWei(800000));
        assert.equal((await deflationToken.rate()).toString(), toWei(800000).toString());
        m.log("change token deflation rate from 90% to 80%");
        contractCurrentBalance = await deflationToken.balanceOf(rewardVault.address);
        assert.equal(contractCurrentBalance.toString(), 88888888888888888888);
        m.log("rewardVault contract deflation token balance change from 99999999999999999999 to 88888888888888888888");

        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await rewardVault.setTrancheTree(1, "58999999999999999999", toWei(40), toWei(1), root, {from : distributor});
        m.log("admin set tree success");

        let user1Index = 0;
        let user1 = users[user1Index].address;
        let user1BalanceBefore = await deflationToken.balanceOf(user1);
        await rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user1Index]), {from : user1});
        let user1BalanceAfter = await deflationToken.balanceOf(user1);
        assert.equal(user1BalanceAfter - user1BalanceBefore, 8888888888888888888);
        m.log("user1 claim success");

        let user2Index = 1;
        let user2 = users[user2Index].address;
        let user2BalanceBefore = await deflationToken.balanceOf(user2);
        await rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user2Index]), {from : user2});
        let user2BalanceAfter = await deflationToken.balanceOf(user2);
        assert.equal(user2BalanceAfter - user2BalanceBefore, 8888888888888888888);
        m.log("user2 claim success");
        await assertThrows(rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user2Index]), {from : user2}), 'Already claimed');
        m.log("user2 claim again fail");

        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 90 + 1);
        m.log("tranche is expire");

        let receiverBalanceBefore = await deflationToken.balanceOf(accounts[2]);
        await rewardVault.withdrawTaxFund(deflationToken.address, accounts[2], {from : admin});
        let receiverBalanceAfter = await deflationToken.balanceOf(accounts[2]);
        assert.equal(receiverBalanceAfter - receiverBalanceBefore, 888888888888888888);
        m.log("admin withdraw tax fund success");

        let providerBalanceBefore = await deflationToken.balanceOf(provider);
        await rewardVault.recyclingReward(1, {from : provider});
        let providerBalanceAfter = await deflationToken.balanceOf(provider);
        assert.equal(providerBalanceAfter - providerBalanceBefore, 70222222222222220000);
        m.log("provider recycle undistribute and expire reward success");

        tranche = await rewardVault.tranches(1);
        assert.equal(tranche.claimed.toString(), toWei(20).toString());
        assert.equal(tranche.tax.toString(), toWei(1).toString());
        assert.equal(tranche.unDistribute.toString(), 58999999999999999999);
        assert.equal(tranche.recycled.toString(), 78999999999999999999);
        assert.equal((await deflationToken.balanceOf(rewardVault.address)).toString(), 0);
        m.log("deflation token full process test success, rewardVault contract token balance change to zero---");
    });

    it("Tax token test", async () => {
        let taxToken = await MockTaxToken.new('TT', 'TT', initSupply, 5);
        await taxToken.transfer(provider, initSupply);
        await taxToken.approve(rewardVault.address, initSupply, {from: provider});
        m.log("provider init tax token balance ---", await taxToken.balanceOf(provider));

        await newTranche(taxToken.address, initRewardAmount, 0);
        let contractCurrentBalance = await taxToken.balanceOf(rewardVault.address);
        m.log("rewardVault contract tax token balance after tranche add---", contractCurrentBalance)
        assert.equal(contractCurrentBalance.toString(), toWei(95).toString());

        let tranche = await rewardVault.tranches(1);
        assert.equal(tranche.total.toString(), toWei(95).toString());
        m.log("tranche total is right");

        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");

        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await rewardVault.setTrancheTree(1, toWei(54), toWei(40), toWei(1), root, {from : distributor});
        m.log("admin set tree success");

        let user1Index = 0;
        let user1 = users[user1Index].address;
        let user1BalanceBefore = await taxToken.balanceOf(user1);
        await rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user1Index]), {from : user1});
        let user1BalanceAfter = await taxToken.balanceOf(user1);
        assert.equal(user1BalanceAfter - user1BalanceBefore, 9500000000000000000);
        m.log("user1 claim success");

        let user2Index = 1;
        let user2 = users[user2Index].address;
        let user2BalanceBefore = await taxToken.balanceOf(user2);
        await rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user2Index]), {from : user2});
        let user2BalanceAfter = await taxToken.balanceOf(user2);
        assert.equal(user2BalanceAfter - user2BalanceBefore, 9500000000000000000);
        m.log("user2 claim success");
        await assertThrows(rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user2Index]), {from : user2}), 'Already claimed');
        m.log("user2 claim again fail");

        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 90 + 1);
        m.log("tranche is expire");

        let receiverBalanceBefore = await taxToken.balanceOf(accounts[2]);

        await rewardVault.withdrawTaxFund(taxToken.address, accounts[2], {from : admin});
        let receiverBalanceAfter = await taxToken.balanceOf(accounts[2]);
        assert.equal(receiverBalanceAfter - receiverBalanceBefore, 950000000000000000);
        m.log("admin withdraw tax fund success");

        let providerBalanceBefore = await taxToken.balanceOf(provider);
        await rewardVault.recyclingReward(1, {from : provider});
        let providerBalanceAfter = await taxToken.balanceOf(provider);
        assert.equal(providerBalanceAfter - providerBalanceBefore, 70300000099355330000);
        m.log("provider recycle undistribute and expire reward success");

        tranche = await rewardVault.tranches(1);
        assert.equal(tranche.claimed.toString(), toWei(20).toString());
        assert.equal(tranche.tax.toString(), toWei(1).toString());
        assert.equal(tranche.unDistribute.toString(), toWei(54).toString());
        assert.equal(tranche.recycled.toString(), toWei(74).toString());
        contractCurrentBalance = await taxToken.balanceOf(rewardVault.address);
        assert.equal(contractCurrentBalance.toString(), 0);
        m.log("tax token full process test success, rewardVault contract token balance change to zero---");
    });

    it("Chain native token test", async () => {
        let tokenAddress = "0x0000000000000000000000000000000000000000";
        await newTranche(tokenAddress, initRewardAmount, toWei(100));
        let contractCurrentBalance = await web3.eth.getBalance(rewardVault.address);
        m.log("rewardVault contract eth balance after tranche add---", contractCurrentBalance);
        assert.equal(contractCurrentBalance, toWei(100).toString());

        let trancheTree = await rewardVault.tranches(1);
        assert.equal(trancheTree.total, toWei(100).toString());
        m.log("tranche total is right");

        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 2 + 1);
        m.log("tranche is end");

        const merkleTree = new MerkleTree(leaves, keccak256, {sort: true});
        const root = merkleTree.getHexRoot();
        await rewardVault.setTrancheTree(1, toWei(59), toWei(40), toWei(1), root, {from : distributor});
        m.log("admin set tree success");

        let user1Index = 0;
        let user1 = users[user1Index].address;
        let user1EthBalanceBefore = await web3.eth.getBalance(user1);
        let user1ClaimTx = await rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user1Index]), {from : user1});
        let user1EthBalanceAfter = await web3.eth.getBalance(user1);
        let user1GasUsed = user1ClaimTx.receipt.gasUsed;
        approxPrecisionAssertPrint(user1EthBalanceAfter - user1EthBalanceBefore + user1GasUsed, 9999784792498983000, 4);
        m.log("user1 claim success");

        let user2Index = 1;
        let user2 = users[user2Index].address;
        let user2EthBalanceBefore = await web3.eth.getBalance(user2);
        let user2ClaimTx = await rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user2Index]), {from : user2});
        let user2EthBalanceAfter = await web3.eth.getBalance(user2);
        let user2GasUsed = user2ClaimTx.receipt.gasUsed;
        approxPrecisionAssertPrint(user2EthBalanceAfter - user2EthBalanceBefore + user2GasUsed,9999825569998508000, 4);
        m.log("user2 claim success");
        await assertThrows(rewardVault.claim(1, toWei(10), merkleTree.getHexProof(leaves[user2Index]), {from : user2}), 'Already claimed');
        m.log("user2 claim again fail");

        await advanceMultipleBlocksAndAssignTime( 1, oneDaySeconds * 90 + 1);
        m.log("tranche is expire");

        let receiverEthBalanceBefore = await web3.eth.getBalance(accounts[2]);
        await rewardVault.withdrawTaxFund(tokenAddress, accounts[2], {from : admin});
        let receiverEthBalanceAfter = await web3.eth.getBalance(accounts[2]);
        approxPrecisionAssertPrint(receiverEthBalanceAfter - receiverEthBalanceBefore, toWei(1), 5);
        m.log("admin withdraw tax fund success");

        let providerEthBalanceBefore = await web3.eth.getBalance(provider);
        let recycleTax = await rewardVault.recyclingReward(1, {from : provider});
        let providerEthBalanceAfter = await web3.eth.getBalance(provider);
        let recycleGasUsed = recycleTax.receipt.gasUsed;
        approxPrecisionAssertPrint(providerEthBalanceAfter - providerEthBalanceBefore + recycleGasUsed, toWei(79), 5);
        m.log("provider recycle undistribute and expire reward success");

        let tranche = await rewardVault.tranches(1);
        assert.equal(tranche.claimed.toString(), toWei(20).toString());
        assert.equal(tranche.tax.toString(), toWei(1).toString());
        assert.equal(tranche.unDistribute.toString(), toWei(59).toString());
        assert.equal(tranche.recycled.toString(), toWei(79).toString());
        contractCurrentBalance = await web3.eth.getBalance(rewardVault.address);
        assert.equal(contractCurrentBalance, 0);
        m.log("eth full process test success, rewardVault contract balance change to zero---");
    });

})
