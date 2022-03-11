const hre = require("hardhat");
const ethers = hre.ethers;

const PROVIDERS = {
    1:'0xD721A90dd7e010c8C5E022cc0100c55aC78E0FC4',
    4:"0x21744C9A65608645E1b39a4596C39848078C2865",
    137:"0xC03bB46b3BFD42e6a2bf20aD6Fa660e4Bd3736F8",
    250:"0xe0741aE6a8A6D87A68B7b36973d8740704Fd62B9",
    43114:"0x64e12fEA089e52A06A7A76028C809159ba4c1b1a"
};

const UNISWAP = {
    1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    4: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    137: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", //QuickSwap
    250: "0x16327E3FbDaCA3bcF7E38F5Af2599D2DDc33aE52", //SpiritSwap
    43114: "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106"//Pangolin
}


// Current is Fantom Opera deployment



async function main() {

    //let SMART_WALL_CHECKER = "0xBaDD93032BAb44A4F32C9cf70239f752F9907c4F";
    let REVEST_LIQUID_DRIVER = "0xb80f5a586BC247D993E6dbaCD8ADD211ec6b0cA5";

    const DEPLOYER = "0x9EB52C04e420E40846f73D09bD47Ab5e25821445";
    const VOTING_ESCROW = "0x3Ae658656d1C526144db371FaEf2Fff7170654eE";
    const DISTRIBUTOR = "0x095010A79B28c99B2906A8dc217FC33AEfb7Db93";
    const LQDR_TOKEN = "0x10b620b2dbAC4Faa7D7FFD71Da486f5D44cd86f9";
    const WFTM_TOKEN = "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83";
    const N_COINS = 7;


    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId;

    await run("verify:verify", {
        address: REVEST_LIQUID_DRIVER,
        constructorArguments: [
            PROVIDERS[chainId],
            VOTING_ESCROW, 
            DISTRIBUTOR, 
            N_COINS
        ],
    });
    /*
    await run("verify:verify", {
        address: SMART_WALL_CHECKER,
        constructorArguments: [
            DEPLOYER
        ],
    });*/


}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
