// services/oracle.ts = tangan juri: menuliskan putusan AI ke chain
// fulfillVerification hanya boleh dipanggil alamat oracle yang terdaftar di factory.

import type { Address } from "viem";
import { CONTRACTS } from "../config";
import { bountyEscrowAbi, bountyFactoryAbi } from "../contracts";
import { client } from "../lib/chain";
import { oracleWallet } from "../lib/wallet";

export const oracleOnchain = () =>
  client.readContract({ address: CONTRACTS.bountyFactory, abi: bountyFactoryAbi, functionName: "oracle" });

export const sendVerdict = async (escrow: Address, eligible: boolean) => {
  if (!oracleWallet) throw new Error("ORACLE_PK belum diisi");
  const hash = await oracleWallet.writeContract({
    address: escrow,
    abi: bountyEscrowAbi,
    functionName: "fulfillVerification",
    args: [eligible],
    gasPrice: await client.getGasPrice(),
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  return { hash, sukses: receipt.status === "success" };
};
