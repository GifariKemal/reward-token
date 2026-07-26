// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RewardToken} from "../src/RewardToken.sol";
import {BountyFactory} from "../src/BountyFactory.sol";
import {BountyEscrow} from "../src/BountyEscrow.sol";

// Tahap 2 Sesi 4: buat bounty via factory.createBounty(...) lalu danai.
// Butuh FACTORY_ADDRESS + REWARD_TOKEN di .env.
// forge script script/DeployBountyEscrow.s.sol:DeployBountyEscrow --rpc-url bsc_testnet --broadcast -vvvv --legacy
contract DeployBountyEscrow is Script {
    function run() external returns (BountyEscrow escrow) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        address tokenAddr = vm.envAddress("REWARD_TOKEN");

        uint256 reward = 100 ether;
        string memory metadataURI = "https://github.com/GifariKemal/wattsettle/blob/main/RULES.md";
        uint256 deadline = block.timestamp + 7 days;

        vm.startBroadcast(pk);
        escrow = BountyFactory(factoryAddr).createBounty(IERC20(tokenAddr), reward, metadataURI, deadline);
        RewardToken(tokenAddr).approve(address(escrow), reward);
        escrow.fund();
        vm.stopBroadcast();

        console.log("BountyEscrow:", address(escrow));
        console.log("didanai reward:", reward);
    }
}
