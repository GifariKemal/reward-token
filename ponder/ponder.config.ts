import { parseAbiItem } from "abitype";
import { createConfig, factory } from "ponder";

import { BountyEscrowAbi } from "./abis/BountyEscrowAbi";
import { BountyFactoryAbi } from "./abis/BountyFactoryAbi";

// Event yang di-emit factory saat createBounty (parameter "escrow" = alamat child)
const bountyCreatedEvent = parseAbiItem(
  "event BountyCreated(uint256 indexed bountyId, address indexed escrow, address indexed creator, uint256 rewardAmount)",
);

// Deployment workshop (2 Agu 2026, verified) - salin dari SmartContract/broadcast/run-latest.json
const FACTORY = "0xd5e8f3480448d165cbbcbde1036303855b883d09" as const;
const START_BLOCK = 121410684; // block deploy factory

export default createConfig({
  chains: {
    bscTestnet: {
      id: 97,
      // create-ponder convention: PONDER_RPC_URL_<chainId>
      rpc: process.env.PONDER_RPC_URL_97,
    },
  },
  contracts: {
    // Index factory sendiri (event BountyCreated)
    BountyFactory: {
      chain: "bscTestnet",
      abi: BountyFactoryAbi,
      address: FACTORY,
      startBlock: START_BLOCK,
    },
    // Index SEMUA escrow yang di-spawn factory (factory pattern)
    BountyEscrow: {
      chain: "bscTestnet",
      abi: BountyEscrowAbi,
      address: factory({
        address: FACTORY,
        event: bountyCreatedEvent,
        parameter: "escrow",
      }),
      startBlock: START_BLOCK,
    },
  },
});
