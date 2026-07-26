// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RewardToken} from "../src/RewardToken.sol";
import {BountyEscrow} from "../src/BountyEscrow.sol";

// Tahap 2: deploy escrow pakai alamat token dari REWARD_TOKEN (.env), lalu langsung danai.
// forge script script/DeployBountyEscrow.s.sol:DeployBountyEscrow --rpc-url bsc_testnet --broadcast -vvvv --legacy
contract DeployBountyEscrow is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address tokenAddr = vm.envAddress("REWARD_TOKEN");

        uint256 reward = 100 ether;
        string memory metadataURI = "https://github.com/GifariKemal/wattsettle/blob/main/RULES.md";
        uint256 deadline = block.timestamp + 7 days;

        vm.startBroadcast(pk);
        BountyEscrow escrow = new BountyEscrow(IERC20(tokenAddr), reward, metadataURI, deadline);
        RewardToken(tokenAddr).approve(address(escrow), reward);
        escrow.fund();
        vm.stopBroadcast();

        console.log("BountyEscrow:", address(escrow));
        console.log("didanai reward:", reward);
    }
}
