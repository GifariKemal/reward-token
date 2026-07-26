// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {BountyFactory} from "../src/BountyFactory.sol";

// Tahap 1 Sesi 4: deploy BountyFactory. Kalau ORACLE_ADDRESS diisi di .env, langsung setOracle.
// forge script script/DeployBountyFactory.s.sol:DeployBountyFactory --rpc-url bsc_testnet --broadcast -vvvv --legacy
contract DeployBountyFactory is Script {
    function run() external returns (BountyFactory factory) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address oracle = vm.envOr("ORACLE_ADDRESS", address(0));

        vm.startBroadcast(pk);
        factory = new BountyFactory(deployer);
        if (oracle != address(0)) {
            factory.setOracle(oracle);
        }
        vm.stopBroadcast();

        console.log("BountyFactory:", address(factory));
        console.log("Owner:", deployer);
        console.log("Oracle:", oracle);
    }
}
