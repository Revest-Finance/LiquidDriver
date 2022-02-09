// SPDX-License-Identifier: GNU-GPL v3.0 or later

pragma solidity ^0.8.0;

import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IOutputReceiverV2.sol";
import "./interfaces/ITokenVault.sol";
import "./interfaces/IRevest.sol";
import "./interfaces/IFNFTHandler.sol";
import "./interfaces/ILockManager.sol";
import "./interfaces/IVotingEscrow.sol";
import "./interfaces/IFeeReporter.sol";
import "./interfaces/IDistributor.sol";
import "./VestedEscrowSmartWallet.sol";
import "./SmartWalletWhitelistV2.sol";

// OZ imports
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

// Uniswap imports
import "./lib/uniswap/IUniswapV2Factory.sol";
import "./lib/uniswap/IUniswapV2Pair.sol";
import "./lib/uniswap/IUniswapV2Router02.sol";

// Testing imports
import "hardhat/console.sol";

interface ITokenVaultTracker {
    function tokenTrackers(address token) external view returns (IRevest.TokenTracker memory);
}

/**
 * @title LiquidDriver <> Revest integration for tokenizing xLQDR positions
*  @author RobAnon
 * @dev 
 */

contract RevestLiquidDriver is IOutputReceiverV2, Ownable, ERC165, IFeeReporter {
    
    using SafeERC20 for IERC20;

    // Where to find the Revest address registry that contains info about what contracts live where
    address public addressRegistry;

    // Address of voting escrow contract
    address public immutable VOTING_ESCROW;

    // Token used for voting escrow
    address public immutable TOKEN;

    // Distributor for rewards address
    address public DISTRIBUTOR;

    address[] public REWARD_TOKENS;

    // Template address for VE wallets
    address public immutable TEMPLATE;

    // The file which tells our frontend how to visually represent such an FNFT
    string public constant METADATA = "https://revest.mypinata.cloud/ipfs/QmQm9nkwvfevS9hwvJxebo2qWji8H6cjbw9ZRKacXMLRGw";

    // Constant used for approval
    uint private constant MAX_INT = 2 ** 256 - 1;

    // For tracking if a given contract has approval for token
    mapping (address => mapping (address => bool)) private approvedContracts;

    // Initialize the contract with the needed valeus
    constructor(address _provider, address _vE, address _distro, uint N_COINS) {
        addressRegistry = _provider;
        VOTING_ESCROW = _vE;
        TOKEN = IVotingEscrow(_vE).token();
        VestedEscrowSmartWallet wallet = new VestedEscrowSmartWallet();
        TEMPLATE = address(wallet);
        DISTRIBUTOR = _distro;
        
        // Running loop here means we only have to do it once
        REWARD_TOKENS = new address[](N_COINS);
        for(uint i = 0; i < N_COINS; i++) {
            REWARD_TOKENS[i] = IDistributor(_distro).tokens(i);
        }
    }

    // Allows core Revest contracts to make sure this contract can do what is needed
    // Mandatory method
    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IOutputReceiver).interfaceId
            || interfaceId == type(IOutputReceiverV2).interfaceId
            || super.supportsInterface(interfaceId);
    }


    function lockLiquidDriverTokens(
        uint endTime,
        uint amountToLock
    ) external payable returns (uint fnftId) {    

        // Transfer the tokens from the user to this contract
        IERC20(TOKEN).safeTransferFrom(msg.sender, address(this), amountToLock);

        {
            // Initialize the Revest config object
            IRevest.FNFTConfig memory fnftConfig;

            // Use address zero because we're using TokenVault as placeholder storage
            fnftConfig.asset = address(0);

            // TODO: We will need to suppress the default UI for this
            // As we need a custom callback through this contract
            fnftConfig.maturityExtension = true;

            // Will result in the asset being sent back to this contract upon withdrawal
            // Results solely in a callback
            fnftConfig.pipeToContract = address(this);  

            // Set these two arrays according to Revest specifications to say
            // Who gets these FNFTs and how many copies of them we should create
            address[] memory recipients = new address[](1);
            recipients[0] = _msgSender();

            uint[] memory quantities = new uint[](1);
            quantities[0] = 1;

            address revest = IAddressRegistry(addressRegistry).getRevest();

            
            fnftId = IRevest(revest).mintTimeLock{value:msg.value}(endTime, recipients, quantities, fnftConfig);
        }

        address smartWallAdd;
        {
            // We deploy the smart wallet
            smartWallAdd = Clones.cloneDeterministic(TEMPLATE, keccak256(abi.encode(TOKEN, fnftId)));
            VestedEscrowSmartWallet wallet = VestedEscrowSmartWallet(smartWallAdd);

            // We use our admin powers on SmartWalletWhitelistV2 to approve the newly created smart wallet
            SmartWalletWhitelistV2(IVotingEscrow(VOTING_ESCROW).smart_wallet_checker()).approveWallet(smartWallAdd);
            
            // Here, check if the smart wallet has approval to spend tokens out of this entry point contract
            if(!approvedContracts[smartWallAdd][TOKEN]) {
                // If it doesn't, approve it
                IERC20(TOKEN).approve(smartWallAdd, MAX_INT);
                approvedContracts[smartWallAdd][TOKEN] = true;
            }

            // We deposit our funds into the wallet
            wallet.createLock(amountToLock, endTime, VOTING_ESCROW);
        }
    }


    function receiveRevestOutput(
        uint fnftId,
        address,
        address payable owner,
        uint
    ) external override  {
        
        // Security check to make sure the Revest vault is the only contract that can call this method
        address vault = IAddressRegistry(addressRegistry).getTokenVault();
        require(_msgSender() == vault, 'E016');

        address smartWallAdd = Clones.cloneDeterministic(TEMPLATE, keccak256(abi.encode(TOKEN, fnftId)));
        VestedEscrowSmartWallet wallet = VestedEscrowSmartWallet(smartWallAdd);

        wallet.withdraw(VOTING_ESCROW);
        uint balance = IERC20(TOKEN).balanceOf(address(this));
        IERC20(TOKEN).safeTransfer(owner, balance);

        // Clean up memory
        SmartWalletWhitelistV2(IVotingEscrow(VOTING_ESCROW).smart_wallet_checker()).revokeWallet(smartWallAdd);
    }

    // Not applicable, as these cannot be split
    // Why not? We don't enable it in IRevest.FNFTConfig
    function handleFNFTRemaps(uint, uint[] memory, address, bool) external pure override {
        require(false, 'Not applicable');
    }

    // Allows custom parameters to be passed during withdrawals
    // This and the proceeding method are both parts of the V2 output receiver interface
    // and not typically necessary. For the sake of demonstration, they are included
    function receiveSecondaryCallback(
        uint fnftId,
        address payable owner,
        uint quantity,
        IRevest.FNFTConfig memory config,
        bytes memory args
    ) external payable override {}

    function triggerOutputReceiverUpdate(
        uint fnftId,
        bytes memory args
    ) external override {
        // Lots to be done here
        IAddressRegistry reg = IAddressRegistry(addressRegistry);
        require(IFNFTHandler(reg.getRevestFNFT()).getBalance(_msgSender(), fnftId) > 0, 'E064');

        (uint methodForUpdate, uint value, uint unlockTime) = abi.decode(args, (uint, uint, uint));
        if(methodForUpdate == 0) {
            _depositAdditionalFunds(fnftId, value);
        } else if(methodForUpdate == 1) {
            _extendLockupPeriod(fnftId, unlockTime);
        } else if(methodForUpdate == 2) {
            _claimRewards(fnftId);
        }
    }

    // TODO: Will need a way to communicate necessity of setApprovalFor
    function _depositAdditionalFunds(uint fnftId, uint value) internal {
        IERC20(TOKEN).safeTransferFrom(msg.sender, address(this), value);
        address smartWallAdd = Clones.cloneDeterministic(TEMPLATE, keccak256(abi.encode(TOKEN, fnftId)));
        VestedEscrowSmartWallet wallet = VestedEscrowSmartWallet(smartWallAdd);
        wallet.increaseAmount(value, VOTING_ESCROW);
    }

    function _extendLockupPeriod(uint fnftId, uint unlockTime) internal {
        address smartWallAdd = Clones.cloneDeterministic(TEMPLATE, keccak256(abi.encode(TOKEN, fnftId)));
        VestedEscrowSmartWallet wallet = VestedEscrowSmartWallet(smartWallAdd);
        getRevest().extendFNFTMaturity(fnftId, unlockTime);
        wallet.increaseUnlockTime(unlockTime, VOTING_ESCROW);
    }        

    function _claimRewards(uint fnftId) internal {
        address smartWallAdd = Clones.cloneDeterministic(TEMPLATE, keccak256(abi.encode(TOKEN, fnftId)));
        VestedEscrowSmartWallet wallet = VestedEscrowSmartWallet(smartWallAdd);
        uint[] memory rewards = wallet.claimRewards(DISTRIBUTOR, VOTING_ESCROW, REWARD_TOKENS);
        for(uint i = 0; i < rewards.length; i++) {
            IERC20(REWARD_TOKENS[i]).transfer(msg.sender, rewards[i]);
        }
    }

    /// Admin Functions

    function setAddressRegistry(address addressRegistry_) external override onlyOwner {
        addressRegistry = addressRegistry_;
    }

    function setDistributor(address _distro) external onlyOwner {
        DISTRIBUTOR = _distro;
        uint nTokens = IDistributor(_distro).N_COINS();
        REWARD_TOKENS = new address[](nTokens);
        for(uint i = 0; i < nTokens; i++) {
            REWARD_TOKENS[i] = IDistributor(_distro).tokens(i);
        }
    }

    function getCustomMetadata(uint) external pure override returns (string memory) {
        return METADATA;
    }

    /// View Functions

    // TODO: Check this more thoroughly
    function getValue(uint fnftId) public view override returns (uint) {
        return IVotingEscrow(VOTING_ESCROW).balanceOf(Clones.predictDeterministicAddress(TEMPLATE, keccak256(abi.encode(TOKEN, fnftId))));
    }

    // Must always be in native token
    function getAsset(uint) external view override returns (address) {
        return TOKEN;
    }

    function getOutputDisplayValues(uint fnftId) external view override returns (bytes memory) {
        // TODO: Implement
    }

    function getAddressRegistry() external view override returns (address) {
        return addressRegistry;
    }

    function getRevest() internal view returns (IRevest) {
        return IRevest(IAddressRegistry(addressRegistry).getRevest());
    }

    function getFlatWeiFee(address) external pure override returns (uint) {
        return 3 ether;
    }

    function getERC20Fee(address) external pure override returns (uint) {
        return 0;
    }

    function getAddressForFNFT(uint fnftId) external view returns (address smartWallAdd) {
        smartWallAdd = Clones.predictDeterministicAddress(TEMPLATE, keccak256(abi.encode(TOKEN, fnftId)));
    }

    
}
