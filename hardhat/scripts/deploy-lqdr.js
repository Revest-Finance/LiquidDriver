const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require('fs');

const seperator = "\t-----------------------------------------"

async function main() {

    let RevestLD;
    let RevestContract;
    let SmartWalletChecker;

    const REVEST = '0x0e29561C367e961A020A6d91486db28B5a48319f';
    const revestABI = ['function modifyWhitelist(address contra, bool listed) external'];

    const PROVIDERS = {
        1:'0xD721A90dd7e010c8C5E022cc0100c55aC78E0FC4',
        4:"0x21744C9A65608645E1b39a4596C39848078C2865",
        137:"0xC03bB46b3BFD42e6a2bf20aD6Fa660e4Bd3736F8",
        250:"0xe0741aE6a8A6D87A68B7b36973d8740704Fd62B9",
        43114:"0x64e12fEA089e52A06A7A76028C809159ba4c1b1a"
    };

    const WETH ={
        1:"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        4:"0xc778417e063141139fce010982780140aa0cd5ab",
        137:"0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
        250:"0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83",
        43114:"0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7"
    };

    const UNISWAP = {
        1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        4: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        137: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", //QuickSwap
        250: "0x16327E3FbDaCA3bcF7E38F5Af2599D2DDc33aE52", //SpiritSwap
        43114: "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106"//Pangolin
    }

    const signers = await ethers.getSigners();
    const owner = signers[0];
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId;

    let PROVIDER_ADDRESS = PROVIDERS[chainId];
    let UNISWAP_ADDRESS = UNISWAP[chainId];

    const VOTING_ESCROW = "0x3Ae658656d1C526144db371FaEf2Fff7170654eE";
    const DISTRIBUTOR = "0x095010A79B28c99B2906A8dc217FC33AEfb7Db93";
    const LQDR_TOKEN = "0x10b620b2dbAC4Faa7D7FFD71Da486f5D44cd86f9";
    const WFTM_TOKEN = "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83";
    const N_COINS = 7;
    const OLD_APPROVAL = "0x814c66594a22404e101FEcfECac1012D8d75C156";


    const CURRENT_WALLET_ADMIN = "0x383ea12347e56932e08638767b8a2b3c18700493";
    
    console.log(seperator);
    console.log("\tDeploying Liquid Driver <> Revest Integration");

    console.log(seperator);
    console.log("\tDeploying RevestLiquidDriver");
    const RevestLiquidDriverFactory = await ethers.getContractFactory("RevestLiquidDriver");
    RevestLD = await RevestLiquidDriverFactory.deploy(PROVIDER_ADDRESS, VOTING_ESCROW, DISTRIBUTOR, N_COINS);
    await RevestLD.deployed();
    console.log("\tRevestLiquidDriver Deployed at: " + RevestLD.address);
    
    RevestContract = new ethers.Contract(REVEST, revestABI, owner);
    let tx = await RevestContract.modifyWhitelist(RevestLD.address, true);
    await tx.wait();

    /*
    console.log(seperator);
    console.log("\tDeploying Upgraded SmartWallet");
    const SmartWalletCheckerFactory = await ethers.getContractFactory("SmartWalletWhitelistV2");
    SmartWalletChecker = await SmartWalletCheckerFactory.deploy(owner.address);
    await SmartWalletChecker.deployed();
    console.log("\tSmartWalletChecker Deployed at: " + SmartWalletChecker.address);

    
    let tx = await SmartWalletChecker.changeAdmin(RevestLD.address, true);
    await tx.wait();
    tx = await SmartWalletChecker.changeAdmin(CURRENT_WALLET_ADMIN, true);
    await tx.wait();
    tx = await SmartWalletChecker.approveWallet(OLD_APPROVAL);
    await tx.wait();*/

    console.log("\tSuccessfull deployed contracts!");

}



main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.log("Deployment Error.\n\n----------------------------------------------\n");
        console.error(error);
        process.exit(1);
    })
