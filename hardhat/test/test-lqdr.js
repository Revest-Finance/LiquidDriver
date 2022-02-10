// Run with `npx hardhat test test/revest-primary.js`

const chai = require("chai");
const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const { solidity } =  require("ethereum-waffle");
const { BigNumber } = require("ethers");
const { VE_ABI, DISTRO_ABI } = require("./utils/abi");

require('dotenv').config();

chai.use(solidity);

// Run with SKIP=true npx hardhat test test/revest-primary.js to skip tests
const skip = process.env.SKIP || false;

const separator = "\t-----------------------------------------";

// 31337 is the default hardhat forking network
const PROVIDERS = {
    1:'0xD721A90dd7e010c8C5E022cc0100c55aC78E0FC4',
    31337: "0xe0741aE6a8A6D87A68B7b36973d8740704Fd62B9",
    4:"0x21744C9A65608645E1b39a4596C39848078C2865",
    137:"0xC03bB46b3BFD42e6a2bf20aD6Fa660e4Bd3736F8",
    250:"0xe0741aE6a8A6D87A68B7b36973d8740704Fd62B9",
    43114:"0x64e12fEA089e52A06A7A76028C809159ba4c1b1a"
};

const WETH ={
    1:"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    31337: "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83",
    4:"0xc778417e063141139fce010982780140aa0cd5ab",
    137:"0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    250:"0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83",
    43114:"0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7"
};

const VOTING_ESCROW = "0x3Ae658656d1C526144db371FaEf2Fff7170654eE";
const DISTRIBUTOR = "0x095010A79B28c99B2906A8dc217FC33AEfb7Db93";
const LQDR_TOKEN = "0x10b620b2dbAC4Faa7D7FFD71Da486f5D44cd86f9";
const WFTM_TOKEN = "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83";

const N_COINS = 7;

const TEST_TOKEN = {
    1: "0x120a3879da835A5aF037bB2d1456beBd6B54d4bA", //RVST
    31337: "0x5cc61a78f164885776aa610fb0fe1257df78e59b",//SPIRIT
};

// Tooled for mainnet Ethereum
const REVEST = '0x0e29561C367e961A020A6d91486db28B5a48319f';
const revestABI = ['function withdrawFNFT(uint tokenUID, uint quantity) external'];

const HOUR = 3600;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365;


let owner;
let chainId;
let RevestLD;
let RevestContract;
let SmartWalletChecker;
let rvstTokenContract;
let wftm;
let fnftId;
let xLQDR;
let feeDistro;
const quantity = 1;

let whales = [
    "0x9EB52C04e420E40846f73D09bD47Ab5e25821445", // Holds a ton of RVST
    "0x0055d4369a59bc819f58a76ecc3709407204dbab", // Holds lots of LQDR
    "0x383ea12347e56932e08638767b8a2b3c18700493", // xLQDR admin
    "0xf4c5b06ff9cd8f685ddcc58202597e56f1c0faee", // feeDistributor admin
];
let whaleSigners = [];



// The ERC-20 Contract ABI, which is a common contract interface
// for tokens (this is the Human-Readable ABI format)
const abi = [
    // Some details about the token
    "function symbol() view returns (string)",

    // Get the account balance
    "function balanceOf(address) view returns (uint)",

    // Send some of your tokens to someone else
    "function transfer(address to, uint amount)",

    // An event triggered whenever anyone transfers to someone else
    "event Transfer(address indexed from, address indexed to, uint amount)",

    "function approve(address spender, uint256 amount) external returns (bool)",
];



describe("Revest", function () {
    before(async () => {
        return new Promise(async (resolve) => {
            // runs once before the first test in this block
            // Deploy needed contracts and set up necessary functions
            [owner] = await ethers.getSigners();
            const network = await ethers.provider.getNetwork();
            chainId = network.chainId;
            
            let PROVIDER_ADDRESS = PROVIDERS[chainId];
            
            
            console.log(separator);
            console.log("\tDeploying LD Test System");
            const RevestLiquidDriverFactory = await ethers.getContractFactory("RevestLiquidDriver");
            RevestLD = await RevestLiquidDriverFactory.deploy(PROVIDER_ADDRESS, VOTING_ESCROW, DISTRIBUTOR, N_COINS);
            await RevestLD.deployed();

            console.log("\tDeployed LD Test System!");

            const SmartWalletCheckerFactory = await ethers.getContractFactory("SmartWalletWhitelistV2");
            SmartWalletChecker = await SmartWalletCheckerFactory.deploy(owner.address);
            await SmartWalletChecker.deployed();

            await SmartWalletChecker.changeAdmin(RevestLD.address, true);

            RevestContract = new ethers.Contract(REVEST, revestABI, whaleSigners[1]);

            // The LQDR contract object
            rvstTokenContract = new ethers.Contract(LQDR_TOKEN, abi, owner);

            // WFTM contract
            wftm = new ethers.Contract(WFTM_TOKEN, abi, owner);

            // Load xLQDR and FeeDistributor objects
            xLQDR = new ethers.Contract(VOTING_ESCROW, VE_ABI, owner);
            feeDistro = new ethers.Contract(DISTRIBUTOR, DISTRO_ABI, owner);

            for (const whale of whales) {
                let signer = await ethers.provider.getSigner(whale);
                whaleSigners.push(signer);
                setupImpersonator(whale);
                await approveAll(signer, xLQDR.address);
                await approveAll(signer, feeDistro.address);
            }
            await approveAll(owner, RevestLD.address);

            await xLQDR.connect(whaleSigners[2]).commit_smart_wallet_checker(SmartWalletChecker.address);
            await xLQDR.connect(whaleSigners[2]).apply_smart_wallet_checker();

            resolve();
        });
    });

    
    it("Should test minting of an FNFT with this system", async function () {
        let recent = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(recent);
        let time = block.timestamp;

        // Outline the parameters that will govern the FNFT
        let expiration = time + (2 * 365 * 60 * 60 * 24); // Two years in future
        let fee = ethers.utils.parseEther('3');//FTM fee
        let amount = ethers.utils.parseEther('10'); //LQDR

        // Mint the FNFT
        await rvstTokenContract.connect(whaleSigners[1]).approve(RevestLD.address, ethers.constants.MaxInt256);
        fnftId = await RevestLD.connect(whaleSigners[1]).callStatic.lockLiquidDriverTokens(expiration, amount, {value:fee});
        let txn = await RevestLD.connect(whaleSigners[1]).lockLiquidDriverTokens(expiration, amount, {value:fee});
        await txn.wait();

        let expectedValue = await RevestLD.getValue(fnftId);
        console.log("\tValue should be slightly less than 10 eth: " + ethers.utils.formatEther(expectedValue).toString());

        let smartWalletAddress = await RevestLD.getAddressForFNFT(fnftId);
        console.log("\tSmart wallet address at: " + smartWalletAddress);

        // Mint a second FNFT to split the fees 50/50
        txn = await RevestLD.connect(whaleSigners[1]).lockLiquidDriverTokens(expiration, amount, {value:fee});
        await txn.wait();
    });

    it("Should accumulate fees", async () => {        
        // We start by transferring tokens to the Fee Distributor
        // In this case, WFTM and LQDR
        let amount = ethers.utils.parseEther('100'); //LQDR
        await rvstTokenContract.connect(whaleSigners[1]).transfer(DISTRIBUTOR, amount);
        await wftm.connect(whaleSigners[1]).transfer(DISTRIBUTOR, amount);

        // Fast forward time
        await timeTravel(2 * WEEK);
       
        let origBalLQDR = await rvstTokenContract.balanceOf(whales[1]);
        let origBalWFTM = await wftm.balanceOf(whales[1]);

        await RevestLD.connect(whaleSigners[1]).triggerOutputReceiverUpdate(fnftId, '0x0');

        let newBalLQDR = await rvstTokenContract.balanceOf(whales[1]);
        let newWFTM = await wftm.balanceOf(whales[1]);

        console.log("\n\tOriginal LQDR Balance: " + ethers.utils.formatEther(origBalLQDR).toString());
        console.log("\tNew LQDR Balance: " + ethers.utils.formatEther(newBalLQDR).toString());

        // There are other people in the farm, we can't predict with good precision how much any one user will get
        // Only that they will get more than a non-zero amount
        assert(newBalLQDR.gt(origBalLQDR));
        assert(newWFTM.gt(origBalWFTM));

    });

    it("Should deposit additional LQDR in the FNFT", async () => {

        await timeTravel(1 * YEAR);

        let curValue = await RevestLD.getValue(fnftId);

        // Will deposit as much as we did originally, should double our value
        let amount = ethers.utils.parseEther('10');

        await RevestContract.depositAdditionalToFNFT(fnftId, amount, 1);

        let newValue = await RevestLD.getValue(fnftId);

        console.log("\n\tOriginal value of xLQDR was: " + ethers.utils.formatEther(curValue).toString());
        console.log("\tCurrent value of xLQDR is: " + ethers.utils.formatEther(newValue).toString());

        // Allow for integer drift
        assert(newValue.sub(curValue.mul(2)).lt(ethers.utils.parseEther('0.0001')));

    });

    it("Should relock the xLQDR for maximum time period", async () => {

        let curValue = await RevestLD.getValue(fnftId);

        // Will deposit as much as we did originally, should double our value
        let recent = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(recent);
        let time = block.timestamp;
        let expiration = time + (2 * 365 * 60 * 60 * 24); // Two years in future

        await RevestContract.extendFNFTMaturity(fnftId, expiration);

        let newValue = await RevestLD.getValue(fnftId);

        console.log("\n\tOriginal value of xLQDR was: " + ethers.utils.formatEther(curValue).toString());
        console.log("\tCurrent value of xLQDR is: " + ethers.utils.formatEther(newValue).toString());

        // Allow for integer drift
        assert(newValue.sub(curValue.mul(2)).lt(ethers.utils.parseEther('0.0001')));

    });

    it("Should unlock and withdraw the FNFT", async () => {

        await timeTravel(2*YEAR + DAY);

        let curValueLQDR = await rvstTokenContract.balanceOf(whales[1]);

        await RevestContract.withdrawFNFT(fnftId, 1);

        let newValue = await rvstTokenContract.balanceOf(whales[1]);

        console.log("\n\tOriginal value of LQDR was: " + ethers.utils.formatEther(curValue).toString());
        console.log("\tCurrent value of LQDR is: " + ethers.utils.formatEther(newValue).toString());

        // Allow for integer drift
        assert(newValue.sub(curValueLQDR).eq(ethers.utils.parseEther('20')));

    });

    
});

async function setupImpersonator(addr) {
    const impersonateTx = await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [addr],
    });
}

async function timeTravel(time) {
    await network.provider.send("evm_increaseTime", [time]);
    await network.provider.send("evm_mine");
}

async function approveAll(signer, address) {
    let approval = await rvstTokenContract
        .connect(signer)
        .approve(address, ethers.constants.MaxInt256);
    let out = await approval.wait();
    
}

function getDefaultConfig(address, amount) {
    let config = {
        asset: address, // The token being stored
        depositAmount: amount, // How many tokens
        depositMul: ethers.BigNumber.from(0),// Deposit multiplier
        split: ethers.BigNumber.from(0),// Number of splits remaining
        maturityExtension: ethers.BigNumber.from(0),// Maturity extensions remaining
        pipeToContract: "0x0000000000000000000000000000000000000000", // Indicates if FNFT will pipe to another contract
        isStaking: false,
        isMulti: false,
        depositStopTime: ethers.BigNumber.from(0),
        whitelist: false
    };
    return config;
}

function encodeArguments(abi, args) {
    let abiCoder = ethers.utils.defaultAbiCoder;
    return abiCoder.encode(abi, args);
}

