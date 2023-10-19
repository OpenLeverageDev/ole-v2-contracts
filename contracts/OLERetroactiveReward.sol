// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./libraries/TransferHelper.sol";
import "./common/Adminable.sol";
import "./common/ReentrancyGuard.sol";
import "./interface/IXOLE.sol";
import "./interface/IDexRouter.sol";

contract OLERetroactiveReward is Adminable, ReentrancyGuard{
    using TransferHelper for IERC20;

    struct Epoch {
        bytes32 merkleRoot;
        uint256 total;
        uint256 vested;
        uint256 penalty;
        uint256 expireWithdrew;
        uint256 penaltyWithdrew;
        uint256 startTime; // vest start time
        uint256 expireTime; // vest expire time
        uint256 vestDuration;
        uint16 exitPenaltyBase;
        uint16 exitPenaltyAdd;
    }

    struct Config {
        address token1;  // token1 of lp
        address xole;
        address lpToken;
        address dexRouter;
        uint256 minXOLELockTime;
        uint256 defaultVestDuration;  // default vest duration
        uint16 defaultExitPenaltyBase;  // exit penalty base percentage, 2000 => 20%
        uint16 defaultExitPenaltyAdd;  //  exit penalty add percentage, 6000 => 60%
    }

    struct Reward {
        uint256 reward;
        uint256 withdraw;
        uint256 penalty;
        uint256 vestTime;
        uint256 withdrawTime;
        bool converted;
        bool exited;
    }

    uint256 internal constant PERCENT_DIVISOR = 10000;
    uint256 internal constant MAX_SLIPPAGE = 9000;
    IERC20 public oleToken;
    Config public config;
    uint256 public epochIdx;
    mapping(uint256 => mapping(address => Reward)) public rewards; // Mapping of epoch to user's rewards
    mapping(uint256 => Epoch) public epochs;  // Mapping of epoch info
    mapping(uint256 => mapping(address => bool)) public vested; // Mapping of epoch to user's vests

    constructor(address _oleToken, Config memory _config) {
        oleToken = IERC20(_oleToken);
        config = _config;
        admin = payable(msg.sender);
    }

    event Vested(uint256 epochId, address account, uint256 balance, uint256 vestTime);
    event RewardWithdrew(uint256 epochId, address account, uint withdraw);
    event RewardExited(uint256 epochId, address account, uint penalty);
    event RewardConverted(uint256 epochId, address account, uint convert);

    event EpochAdded(uint256 epochId, bytes32 merkleRoot, uint256 total, uint256 startTime, uint256 expireTime, uint256 vestDuration, uint16 unlockPenaltyBase, uint16 unlockPenaltyAdd);
    event ExpiredWithdrew(uint256 epochId, uint expire);
    event PenaltyWithdrew(uint256 epochId, uint penalty);


    function vests(address account, uint256[] calldata _epochIds, uint256[] calldata _balances, bytes32[][] calldata _merkleProofs) external nonReentrant{
        uint256 len = _epochIds.length;
        require(len == _balances.length && len == _merkleProofs.length, "Mismatching inputs");
        for (uint256 i = 0; i < len; i ++) {
            vest(account, _epochIds[i], _balances[i], _merkleProofs[i]);
        }
    }

    function vest(address account, uint256 _epochId, uint256 _balance, bytes32[] calldata _merkleProof) public nonReentrant {
        require(_balance > 0, "Empty Balance");
        require(_epochId < epochIdx, "Incorrect EpochId");
        require(epochs[_epochId].startTime < block.timestamp, "Not Start");
        require(epochs[_epochId].expireTime > block.timestamp, "Expire");
        require(!vested[_epochId][account], "Already vested");
        require(_verifyVest(account, epochs[_epochId].merkleRoot, _balance, _merkleProof), "Incorrect merkle proof");
        vested[_epochId][account] = true;
        epochs[_epochId].vested = epochs[_epochId].vested + _balance;
        rewards[_epochId][account] = Reward(_balance, 0, 0, block.timestamp, block.timestamp, false, false);
        emit Vested(_epochId, account, _balance, block.timestamp);
    }

    function withdrawRewards(uint256[] calldata _epochIds, bool exit) external nonReentrant {
        uint256 totalWithdraw;
        for (uint256 i = 0; i < _epochIds.length; i++) {
            Reward storage reward = rewards[_epochIds[i]][msg.sender];
            totalWithdraw += _withdrawReward(reward, _epochIds[i], exit);
        }
        oleToken.safeTransfer(msg.sender, totalWithdraw);
    }

    function withdrawReward(uint256 epochId, bool exit) external nonReentrant {
        Reward storage reward = rewards[epochId][msg.sender];
        uint256 withdraw = _withdrawReward(reward, epochId, exit);
        oleToken.safeTransfer(msg.sender, withdraw);
    }

    function convertToXOLEs(uint256[] calldata _epochIds, uint256 token1Amount, uint256 slippage, uint256 unlockTime) external nonReentrant {
        uint256 totalConversion;
        for (uint256 i = 0; i < _epochIds.length; i++) {
            totalConversion += _getConvertOLE(_epochIds[i], rewards[_epochIds[i]][msg.sender]);
        }
        _convertToXOLE(totalConversion, token1Amount, slippage, unlockTime);
    }

    /// @param token1Amount, The token1Amount of lp token1 for add liquidity
    /// @param slippage, The slippage for token1 when adding liquidity
    /// @param unlockTime, The unlock time for the XOLE lock
    function convertToXOLE(uint256 epochId, uint256 token1Amount, uint256 slippage, uint256 unlockTime) external nonReentrant{
        uint256 conversion = _getConvertOLE(epochId, rewards[epochId][msg.sender]);
        _convertToXOLE(conversion, token1Amount, slippage, unlockTime);
    }

    function verifyVest(address account, uint256 _epochId, uint256 _balance, bytes32[] calldata _merkleProof) external view returns (bool valid){
        return _verifyVest(account, epochs[_epochId].merkleRoot, _balance, _merkleProof);
    }

    function calWithdrawAndPenalty(address account, uint256 _epochId, bool _exit) external view returns (uint256 withdraw, uint256 penalty){
        Reward memory reward = rewards[_epochId][account];
        return _calWithdrawAndPenalty(reward, _epochId, _exit);
    }

    /*** Admin Functions ***/
    function newEpoch(bytes32 merkleRoot, uint256 total, uint256 startTime, uint256 expireTime) external onlyAdmin {
        require(expireTime > block.timestamp, 'Incorrect expireTime');
        uint epochId = epochIdx;
        epochs[epochId] = Epoch(merkleRoot, total, 0, 0, 0, 0, startTime, expireTime, config.defaultVestDuration, config.defaultExitPenaltyBase, config.defaultExitPenaltyAdd);
        epochIdx = ++ epochIdx;
        emit EpochAdded(epochId, merkleRoot, total, startTime, expireTime, config.defaultVestDuration, config.defaultExitPenaltyBase, config.defaultExitPenaltyAdd);
    }

    function withdrawExpired(uint256[] calldata _epochIds) external onlyAdmin {
        uint256 expire;
        for (uint256 i = 0; i < _epochIds.length; i++) {
            Epoch storage epoch = epochs[_epochIds[i]];
            require(block.timestamp > epoch.expireTime, 'Not Expire');
            uint256 withdraw = epoch.total - epoch.vested - epoch.expireWithdrew;
            if (withdraw == 0){
                continue;
            }
            expire += withdraw;
            epoch.expireWithdrew += withdraw;
            emit ExpiredWithdrew(_epochIds[i], withdraw);
        }
        if (expire > 0) {
            oleToken.safeTransfer(admin, expire);
        }
    }

    function withdrawPenalties(uint256[] calldata _epochIds) external onlyAdmin {
        uint256 penalty;
        for (uint256 i = 0; i < _epochIds.length; i++) {
            Epoch storage epoch = epochs[_epochIds[i]];
            uint256 withdraw = epoch.penalty - epoch.penaltyWithdrew;
            if (withdraw == 0){
                continue;
            }
            penalty += withdraw;
            epoch.penaltyWithdrew += withdraw;
            emit PenaltyWithdrew(_epochIds[i], withdraw);
        }
        if (penalty > 0) {
            oleToken.safeTransfer(admin, penalty);
        }
    }

    function setConfig(Config memory _config) external onlyAdmin {
        config = _config;
    }

    function _verifyVest(address account, bytes32 root, uint256 _balance, bytes32[] memory _merkleProof) internal pure returns (bool valid) {
        bytes32 leaf = keccak256(abi.encodePacked(account, _balance));
        return MerkleProof.verify(_merkleProof, root, leaf);
    }

    function _withdrawReward(Reward storage reward, uint256 epochId, bool exit) internal rewardCheck(reward) returns (uint256){
        (uint256 withdraw, uint256 penalty) = _calWithdrawAndPenalty(reward, epochId, exit);
        require(withdraw > 0, "Withdraw Zero");
        reward.withdrawTime = block.timestamp;
        reward.withdraw += withdraw;
        if (exit) {
            reward.exited = true;
            reward.penalty = penalty;
            epochs[epochId].penalty += penalty;
            emit RewardExited(epochId, msg.sender, penalty);
        }
        emit RewardWithdrew(epochId, msg.sender, withdraw);
        return withdraw;
    }

    function _calWithdrawAndPenalty(Reward memory reward, uint256 epochId, bool exit) internal view returns (uint256 withdraw, uint256 penalty) {
        if (reward.converted || reward.exited) {
            return (0, 0);
        }
        Epoch memory epoch = epochs[epochId];
        uint256 endTime = reward.vestTime + epoch.vestDuration;
        uint256 calTime = block.timestamp > endTime ? endTime : block.timestamp;
        withdraw = (calTime - reward.withdrawTime) * reward.reward / epoch.vestDuration;
        if(exit && block.timestamp < endTime){
            uint256 penaltyFactor = (endTime - block.timestamp) * epoch.exitPenaltyAdd / epoch.vestDuration + epoch.exitPenaltyBase;
            uint256 lock = (endTime - block.timestamp) * reward.reward / epoch.vestDuration;
            penalty = (lock * penaltyFactor) / PERCENT_DIVISOR;
            withdraw += lock - penalty;
        }
    }

    function _getConvertOLE(uint256 epochId, Reward storage reward) internal rewardCheck(reward) returns (uint256) {
        uint oleAmount = reward.reward - reward.withdraw;
        reward.converted = true;
        emit RewardConverted(epochId, msg.sender, oleAmount);
        return oleAmount;
    }

    /// @param slippage 9900 is 1%
    function _convertToXOLE(uint oleAmount, uint256 token1Amount, uint256 slippage, uint256 unlockTime) internal {
        require(oleAmount > 0 && token1Amount > 0, "Empty Amount");
        require(slippage > MAX_SLIPPAGE, "Slip Too High");
        (uint256 amount, uint256 end) = IXOLE(config.xole).locked(msg.sender);
        if(amount > 0){
            unlockTime = end;
        }
        require(unlockTime >= block.timestamp + config.minXOLELockTime, "Lock Time ERR");
        uint256 liquidity = getLp(oleAmount, token1Amount, slippage);
        if (amount > 0){
            IXOLE(config.xole).increase_amount_for(msg.sender, liquidity);
        } else {
            IXOLE(config.xole).create_lock_for(msg.sender, liquidity, unlockTime);
        }
    }

    function getLp(uint oleAmount, uint256 token1Amount, uint256 slippage) internal returns (uint256 liquidity){
        uint256 max = token1Amount * PERCENT_DIVISOR / slippage;
        uint256 min = token1Amount * slippage / PERCENT_DIVISOR;
        IERC20(config.token1).safeTransferFrom(msg.sender, address(this), max);
        oleToken.safeApprove(config.dexRouter, oleAmount);
        IERC20(config.token1).safeApprove(config.dexRouter, max);
        uint256 amountA;
        uint256 amountB;
        (amountA, amountB, liquidity) = IDexRouter(config.dexRouter).addLiquidity(address(oleToken), config.token1, oleAmount, max, oleAmount, min, address(this), block.timestamp);
        oleToken.safeApprove(config.dexRouter, 0);
        IERC20(config.token1).safeApprove(config.dexRouter, 0);
        // return remain token1 fund to msg.sender
        uint remain = max - amountB;
        if(remain > 0) {
            IERC20(config.token1).safeTransfer(msg.sender, remain);
        }
    }

    modifier rewardCheck(Reward memory reward) {
        require(!reward.converted, "Converted");
        require(!reward.exited, "Exited");
        require(reward.reward - reward.withdraw > 0, "Empty Withdraw");
        _;
    }

}
