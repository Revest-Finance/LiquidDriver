// SPDX-License-Identifier: MIT

import "./interfaces/IVotingEscrow.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


pragma solidity ^0.8.0;

/// @author RobAnon
contract VestedEscrowSmartWallet {

    using SafeERC20 for IERC20;

    uint private constant MAX_INT = 2 ** 256 - 1;

    address private immutable MASTER;

    mapping (address => mapping(address => bool)) private approved;

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
        if(!approved[votingEscrow][token]) {
            IERC20(token).approve(votingEscrow, MAX_INT);
            approved[votingEscrow][token] = true;
        }
        // Create the lock
        IVotingEscrow(votingEscrow).create_lock(value, unlockTime);
    }

    function increaseAmount(uint value, address votingEscrow) external onlyMaster {
        address token = IVotingEscrow(votingEscrow).token();
        IERC20(token).safeTransferFrom(MASTER, address(this), value);
        IVotingEscrow(votingEscrow).increase_amount(value);
    }

    function increaseUnlockTime(uint unlockTime, address votingEscrow) external onlyMaster {
        IVotingEscrow(votingEscrow).increase_unlock_time(unlockTime);
    }

    function withdraw(address votingEscrow) external onlyMaster {
        address token = IVotingEscrow(votingEscrow).token();
        IVotingEscrow(votingEscrow).withdraw();
        uint bal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(MASTER, bal);
    }

    function cleanMemory() external onlyMaster {
        selfdestruct(payable(MASTER));
    }

    // View functions

    // Purely exists for convenience, just as easily to call through MASTER
    function getLockEnd(address votingEscrow) external view returns (uint lockEnd) {
        lockEnd = IVotingEscrow(votingEscrow).locked__end(address(this));
    }

    

}
