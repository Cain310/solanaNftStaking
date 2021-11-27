import type { AnchorTypes } from "@saberhq/anchor-contrib";
import type { PublicKey } from "@solana/web3.js";

import type { UquarryUmergeUmineIDL } from "../idls/quarry_merge_mine";

export * from "../idls/quarry_merge_mine";

export type QuarryMergeMineTypes = AnchorTypes<
UquarryUmergeUmineIDL,
  {
    mergePool: MergePoolData;
    mergeMiner: MergeMinerData;
  }
>;

type Accounts = QuarryMergeMineTypes["Accounts"];
export type MergePoolData = Accounts["MergePool"];
export type MergeMinerData = Accounts["MergeMiner"];

export type QuarryMergeMineError = QuarryMergeMineTypes["Error"];
export type QuarryMergeMineProgram = QuarryMergeMineTypes["Program"];

export type QuarryStakeAccounts = {
  [A in keyof Parameters<
    QuarryMergeMineProgram["instruction"]["stakePrimaryMiner"]["accounts"]
  >[0]["stake"]]: PublicKey;
};
