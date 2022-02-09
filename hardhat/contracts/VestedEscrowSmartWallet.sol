// SPDX-License-Identifier: GNU-GPL v3.0 or later

import "./interfaces/IVotingEscrow.sol";
import "./interfaces/IDistributor.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


pragma solidity ^0.8.0;

/// @author RobAnon
contract VestedEscrowSmartWallet {

    using SafeERC20 for IERC20;

    uint private constant MAX_INT = 2 ** 256 - 1;

    address private immutable MASTER;

    constructor() {
        MASTER = msg.sender;
    }

    modifier onlyMaster() {
        require(msg.sender == MASTER, 'Unauthorized!');
        _;
    }

    function createLock(uint value, uint unlockTime, address votingEscrow) external onlyMaster {
        // Only callable from the parent contract, transfer tokens from user -> parent, parent -> VE
        address token = IVotingEscrow(votingEscrow).token();
        // Pull value into this contract
        IERC20(token).safeTransferFrom(MASTER, address(this), value);
        // Single-use approval system
        if(IERC20(token).allowance(address(this), votingEscrow) != MAX_INT) {
            IERC20(token).approve(votingEscrow, MAX_INT);
        }
        // Create the lock
        IVotingEscrow(votingEscrow).create_lock(value, unlockTime);
        cleanMemory();
    }

    function increaseAmount(uint value, address votingEscrow) external onlyMaster {
        address token = IVotingEscrow(votingEscrow).token();
        IERC20(token).safeTransferFrom(MASTER, address(this), value);
        IVotingEscrow(votingEscrow).increase_amount(value);
        cleanMemory();
    }

    function increaseUnlockTime(uint unlockTime, address votingEscrow) external onlyMaster {
        IVotingEscrow(votingEscrow).increase_unlock_time(unlockTime);
        cleanMemory();
    }

    function withdraw(address votingEscrow) external onlyMaster {
        address token = IVotingEscrow(votingEscrow).token();
        IVotingEscrow(votingEscrow).withdraw();
        uint bal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(MASTER, bal);
        cleanMemory();
    }

    function claimRewards(address distributor, address votingEscrow, address[] memory tokens) external onlyMaster returns (uint[] memory balances) {
        balances = new uint[](tokens.length);
        bool exitFlag;
        while(!exitFlag) {
            IDistributor(distributor).claim();
            exitFlag = IDistributor(distributor).user_epoch_of(address(this)) + 50 >= IVotingEscrow(votingEscrow).user_point_epoch(address(this));
        }   
        for(uint i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint bal = IERC20(token).balanceOf(address(this));
            balances[i] = bal;
            IERC20(token).safeTransfer(MASTER, bal);
        }
        cleanMemory();
    }

    /// Proxy function to send arbitrary messages. Useful for delegating votes and similar activities
    function proxyExecute(
        address destination,
        bytes memory data
    ) external payable onlyMaster {
        (bool success, )= destination.call{value:msg.value}(data);
        require(success, 'Proxy call failed!');
    }

    /// Credit to doublesharp for the brilliant gas-saving concept
    /// Self-destructing clone pattern
    function cleanMemory() internal {
        selfdestruct(payable(MASTER));
    }

}
