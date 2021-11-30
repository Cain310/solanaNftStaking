import * as anchor from "@project-serum/anchor";
import { expectTX } from "@saberhq/chai-solana";
import type { Provider } from "@saberhq/solana-contrib";
import {
  createInitMintInstructions,
  createMint,
  getMintInfo,
  getTokenAccount,
  mintNFT,
  Token,
  TokenAmount,
} from "@saberhq/token-utils";
import type { PublicKey } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import * as assert from "assert";
import { BN } from "bn.js";
import { expect } from "chai";
import invariant from "tiny-invariant";

import type {
  MinerData,
  MineWrapper,
  MintWrapper,
  QuarryData,
  QuarrySDK,
  QuarryWrapper,
  RewarderWrapper,
} from "../src";
import {
  DEFAULT_DECIMALS,
  DEFAULT_HARD_CAP,
  // newUserStakeTokenAccount,
} from "./utils";
import { makeSDK } from "./workspace";

const ZERO = new BN(0);

// GOAL: change mine/quarry filter param from mint to stakedMintAuthority

// mocha cli.js --grep mine
describe("Mine", () => {
  const { web3, BN } = anchor;
  // console.log("web3", web3, BN);
  // console.log("web3.keypair", web3.Keypair, BN);
  const DAILY_REWARDS_RATE = new BN(1_000 * web3.LAMPORTS_PER_SOL);
  const ANNUAL_REWARDS_RATE = DAILY_REWARDS_RATE.mul(new BN(365));
  // console.log("DAILY_REWARDS_RATE", DAILY_REWARDS_RATE);
  // console.log("ANNUAL_REWARDS_RATE", ANNUAL_REWARDS_RATE);

  // authority over the mint and filter for quarry
  let stakedMintAuthority: anchor.web3.Keypair;
  let stakeTokenMint: anchor.web3.PublicKey;
  let stakeToken: Token;

  let sdk: QuarrySDK;
  let provider: Provider;
  let mintWrapper: MintWrapper;
  let mine: MineWrapper;
  let nonFungibleMint: Keypair;
  let stakeNonfungibleToken: Token;
  let nonFungibleMintAnother: Keypair;
  let stakeAnotherNonfungibleToken: Token;
  let freezeAuthority: PublicKey;

  before("Initialize SDK", () => {
    sdk = makeSDK();
    // solana provider _rpcEndpoint: 'http://localhost:8899' etc...
    provider = sdk.provider;
    // specify the mintWrapper program to test/use
    mintWrapper = sdk.mintWrapper;
    // specify the mine program to test/use
    mine = sdk.mine;
  });

  before(async () => {
    await assert.doesNotReject(async () => {
      // Generate a new random keypair
      stakedMintAuthority = web3.Keypair.generate();
      // console.log("stakedMintAuthority", stakedMintAuthority);
      // not sure if this works with nft's as it uses solana spl-token progran
      stakeTokenMint = await createMint(
        provider,
        stakedMintAuthority.publicKey,
        DEFAULT_DECIMALS
      );
      console.log("stakeTokenMint", stakeTokenMint);
    });
    // Loads a token from a Mint
    stakeToken = Token.fromMint(stakeTokenMint, DEFAULT_DECIMALS, {
      name: "stake token",
    });
    console.log("stakeToken", stakeToken);
  });

  before("Create nonfunigble token", async () => {
    await assert.doesNotReject(async () => {
      nonFungibleMint = web3.Keypair.generate();
      const tx = await mintNFT(provider, nonFungibleMint);
      // Generate a new random keypair
      await tx.send();
      await tx.confirm();
      stakeNonfungibleToken = Token.fromMint(nonFungibleMint.publicKey, 0);
      // console.log(stakeNonfungibleToken.toString());

      nonFungibleMintAnother = web3.Keypair.generate();
      const tx2 = await mintNFT(provider, nonFungibleMintAnother);
      await tx2.send();
      await tx2.confirm();
      stakeAnotherNonfungibleToken = Token.fromMint(
        nonFungibleMintAnother.publicKey,
        0
      );
      const mintInfo = await getMintInfo(provider, nonFungibleMint.publicKey);
      console.log(mintInfo);
      const mintInfo2 = await getMintInfo(
        provider,
        nonFungibleMintAnother.publicKey
      );
      console.log(mintInfo2);

      freezeAuthority = provider.wallet.publicKey; // simulating collection
      console.log("freezeAuthority", freezeAuthority);
    });
  });

  let rewardsMint: PublicKey;
  let token: Token;
  let mintWrapperKey: PublicKey;
  let hardCap: TokenAmount;

  beforeEach("Initialize mint", async () => {
    const rewardsMintKP = Keypair.generate();
    rewardsMint = rewardsMintKP.publicKey;
    // console.log("rewardsMint", rewardsMint);
    token = Token.fromMint(rewardsMint, DEFAULT_DECIMALS);
    // console.log("token", token);
    hardCap = TokenAmount.parse(token, DEFAULT_HARD_CAP.toString());
    // console.log("hardCap", hardCap);
    // newWrapper takes a mint and returns a mintWrapper keypair
    const { tx, mintWrapper: wrapperKey } = await mintWrapper.newWrapper({
      hardcap: hardCap.toU64(),
      tokenMint: rewardsMint,
    });
    // console.log("wrapperKey", wrapperKey.toBase58());
    await expectTX(
      await createInitMintInstructions({
        provider,
        mintKP: rewardsMintKP,
        decimals: DEFAULT_DECIMALS,
        mintAuthority: wrapperKey,
        freezeAuthority: wrapperKey,
      })
    ).to.be.fulfilled;

    mintWrapperKey = wrapperKey;
    // console.log("line 105 mintWrapper", mintWrapperKey);
    await expectTX(tx, "Initialize mint").to.be.fulfilled;
  });

  describe("Nonfungible Miner", () => {
    let rewarderKey: anchor.web3.PublicKey;
    let rewarder: RewarderWrapper;
    let quarry: QuarryWrapper;
    let quarryKey: PublicKey;

    beforeEach(async () => {
      const { tx, key: theRewarderKey } = await mine.createRewarder({
        mintWrapper: mintWrapperKey,
        authority: provider.wallet.publicKey,
      });
      await expectTX(tx, "Create new rewarder").to.be.fulfilled;
      rewarderKey = theRewarderKey;
      rewarder = await mine.loadRewarderWrapper(rewarderKey);
      await expectTX(
        await rewarder.setAndSyncAnnualRewards(ANNUAL_REWARDS_RATE, [])
      ).to.be.fulfilled;

      const { quarry, tx: quarryTx } = await rewarder.createQuarry({
        stakeNonfungibleToken, // the mint
      });

      quarryKey = quarry;

      await expectTX(quarryTx, "Create new quarry").to.be.fulfilled;
    });

    beforeEach("Create miner", async () => {
      quarry = await rewarder.getQuarry(provider.wallet.publicKey); // passing the expected "collection value"
      expect(quarry).to.exist;

      // create the miner
      await expectTX(
        (
          await quarry.createMiner({
            nonFungibleMint: nonFungibleMint.publicKey,
          })
        ).tx,
        "create miner"
      ).to.be.fulfilled;

      // create another miner for the next nft
      await expectTX(
        (
          await quarry.createMiner({
            nonFungibleMint: nonFungibleMintAnother.publicKey,
          })
        ).tx,
        "create another miner"
      ).to.be.fulfilled;
    });

    it("Valid miner", async () => {
      const miner = await quarry.getMinerAddress(
        provider.wallet.publicKey,
        nonFungibleMint.publicKey
      );
      const minerAccountInfo = await provider.connection.getAccountInfo(miner);
      expect(minerAccountInfo?.owner).to.eqAddress(mine.program.programId);
      assert.ok(minerAccountInfo?.data);
      const minerData = mine.program.coder.accounts.decode<MinerData>(
        "Miner",
        minerAccountInfo.data
      );
      expect(minerData.authority).to.eqAddress(provider.wallet.publicKey);
      assert.strictEqual(minerData.quarryKey.toBase58(), quarry.key.toBase58());
      const minerBalance = await getTokenAccount(
        provider,
        minerData.tokenVaultKey
      );
      expect(minerBalance.amount).to.bignumber.eq(ZERO);
    });

    it("Stake and withdraw multiple nfts", async () => {
      // mint test tokens
      const amount = 1;

      // already minted nft
      // const userStakeTokenAccount = await newUserStakeTokenAccount(
      //   sdk,
      //   quarry,
      //   stakeNonfungibleToken,
      //   stakedMintAuthority,
      //   0
      // );

      // stake into the quarry
      const minerActions = await quarry.getMinerActions(
        nonFungibleMint.publicKey,
        provider.wallet.publicKey
      );

      const createATA = await minerActions.createATAIfNotExists(
        nonFungibleMint.publicKey
      );
      if (createATA) {
        await expectTX(createATA, "create ATA").to.be.fulfilled;
      }
      // nft staked account
      const userStakeTokenAccount = minerActions.stakedTokenATA;

      await expectTX(
        minerActions.stake(new TokenAmount(stakeNonfungibleToken, amount)),
        "Stake into the quarry"
      ).to.be.fulfilled;

      let miner = await quarry.getMiner(
        provider.wallet.publicKey,
        nonFungibleMint.publicKey
      );
      invariant(miner, "miner must exist");

      const minerBalance = await getTokenAccount(provider, miner.tokenVaultKey);
      expect(minerBalance.amount).to.bignumber.eq(new BN(amount));
      let minerVaultInfo = await getTokenAccount(provider, miner.tokenVaultKey);
      expect(minerVaultInfo.amount).to.bignumber.eq(new BN(amount));
      let userStakeTokenAccountInfo = await getTokenAccount(
        provider,
        userStakeTokenAccount
      );
      expect(userStakeTokenAccountInfo.amount).to.bignumber.eq(ZERO);

      // stake another nft
      const anotherMinerActions = await quarry.getMinerActions(
        nonFungibleMintAnother.publicKey,
        provider.wallet.publicKey
      );

      await expectTX(
        anotherMinerActions.stake(
          new TokenAmount(stakeAnotherNonfungibleToken, amount)
        ),
        "Stake another into the quarry"
      ).to.be.fulfilled;

      let anotherMiner = await quarry.getMiner(
        provider.wallet.publicKey,
        nonFungibleMintAnother.publicKey
      );
      invariant(anotherMiner, "miner must exist");

      const anotherMinerBalance = await getTokenAccount(
        provider,
        anotherMiner.tokenVaultKey
      );
      expect(anotherMinerBalance.amount).to.bignumber.eq(new BN(amount));

      /*
        withdraw from the quarry
      */
      await expectTX(
        minerActions.withdraw(new TokenAmount(stakeNonfungibleToken, amount)),
        "Withdraw from the quarry"
      ).to.be.fulfilled;
      miner = await quarry.getMiner(
        provider.wallet.publicKey,
        nonFungibleMint.publicKey
      );
      invariant(miner, "miner must exist");

      const endMinerBalance = await getTokenAccount(
        provider,
        miner.tokenVaultKey
      );
      expect(endMinerBalance.amount).to.bignumber.eq(ZERO);
      minerVaultInfo = await getTokenAccount(provider, miner.tokenVaultKey);
      expect(minerVaultInfo.amount.toNumber()).to.eq(ZERO.toNumber());
      userStakeTokenAccountInfo = await getTokenAccount(
        provider,
        userStakeTokenAccount
      );
      expect(userStakeTokenAccountInfo.amount.toNumber()).to.eq(amount);

      // withdraw another nft from the quarry
      await expectTX(
        anotherMinerActions.withdraw(
          new TokenAmount(stakeAnotherNonfungibleToken, amount)
        ),
        "Withdraw anther from the quarry"
      ).to.be.fulfilled;
      anotherMiner = await quarry.getMiner(
        provider.wallet.publicKey,
        nonFungibleMintAnother.publicKey
      );
      invariant(anotherMiner, "miner must exist");

      const anotherEndMinerBalance = await getTokenAccount(
        provider,
        anotherMiner.tokenVaultKey
      );
      expect(anotherEndMinerBalance.amount).to.bignumber.eq(ZERO);

      minerVaultInfo = await getTokenAccount(
        provider,
        anotherMiner.tokenVaultKey
      );
      expect(minerVaultInfo.amount.toNumber()).to.eq(ZERO.toNumber());
      userStakeTokenAccountInfo = await getTokenAccount(
        provider,
        userStakeTokenAccount
      );
      expect(userStakeTokenAccountInfo.amount.toNumber()).to.eq(amount);

      // make sure quarry miners is being updated
      const quarryInfo = await provider.connection.getAccountInfo(quarryKey);
      assert.ok(quarryInfo);
      const quarryData = mine.program.coder.accounts.decode<QuarryData>(
        "Quarry",
        quarryInfo?.data
      );

      assert.strictEqual(quarryData.numMiners.toString(), "2");
    });

    // describe("Rewarder", () => {
    //   let rewarderKey: PublicKey;

    //   beforeEach("rewarder", async () => {
    //     const { tx, key: rewarder } = await mine.createRewarder({
    //       mintWrapper: mintWrapperKey,
    //       authority: provider.wallet.publicKey,
    //     });
    //     await expectTX(tx, "Create new rewarder").to.be.fulfilled;
    //     rewarderKey = rewarder;
    //   });

    //   describe("DAO fees", () => {
    //     it("anyone can claim", async () => {
    //       const claimFeeTokenAccount = await getATAAddress({
    //         mint: rewardsMint,
    //         owner: rewarderKey,
    //       });
    //       const ata = await getOrCreateATA({
    //         owner: QUARRY_FEE_TO,
    //         mint: rewardsMint,
    //         provider,
    //       });

    //       assert.ok(ata.instruction);
    //       await expectTX(new TransactionEnvelope(provider, [ata.instruction])).to
    //         .be.fulfilled;
    //       await expect(
    //         mine.program.rpc.extractFees({
    //           accounts: {
    //             rewarder: rewarderKey,
    //             claimFeeTokenAccount,
    //             feeToTokenAccount: ata.address,
    //             tokenProgram: TOKEN_PROGRAM_ID,
    //           },
    //         })
    //       ).to.be.fulfilled;
    //     });

    //     it("fail if token account does not exist", async () => {
    //       const claimFeeTokenAccount = await getATAAddress({
    //         mint: rewardsMint,
    //         owner: rewarderKey,
    //       });
    //       const ata = await getOrCreateATA({
    //         owner: QUARRY_FEE_TO,
    //         mint: rewardsMint,
    //         provider,
    //       });
    //       try {
    //         await mine.program.rpc.extractFees({
    //           accounts: {
    //             rewarder: rewarderKey,
    //             claimFeeTokenAccount,
    //             feeToTokenAccount: ata.address,
    //             tokenProgram: TOKEN_PROGRAM_ID,
    //           },
    //         });
    //         assert.fail("passed");
    //       } catch (e) {
    //         console.error(e);
    //       }
    //     });

    //     it("fail if not fee to", async () => {
    //       const claimFeeTokenAccount = await getATAAddress({
    //         mint: rewardsMint,
    //         owner: rewarderKey,
    //       });
    //       const ata = await getOrCreateATA({
    //         owner: Keypair.generate().publicKey,
    //         mint: rewardsMint,
    //         provider,
    //       });
    //       assert.ok(ata.instruction);
    //       await expectTX(new TransactionEnvelope(provider, [ata.instruction])).to
    //         .be.fulfilled;
    //       try {
    //         await mine.program.rpc.extractFees({
    //           accounts: {
    //             rewarder: rewarderKey,
    //             claimFeeTokenAccount,
    //             feeToTokenAccount: ata.address,
    //             tokenProgram: TOKEN_PROGRAM_ID,
    //           },
    //         });
    //         assert.fail("passed");
    //       } catch (e) {
    //         console.error(e);
    //       }
    //     });
    //   });

    //   it("Is initialized!", async () => {
    //     const rewarder = await mine.program.account.rewarder.fetch(rewarderKey);
    //     expect(rewarder.authority).to.eqAddress(provider.wallet.publicKey);
    //     expect(rewarder.annualRewardsRate.toString()).to.eql(ZERO.toString());
    //     expect(rewarder.numQuarries).to.eq(ZERO.toNumber());
    //     expect(rewarder.totalRewardsShares.toString()).to.bignumber.eq(
    //       ZERO.toString()
    //     );
    //   });

    //   it("Set daily rewards rate", async () => {
    //     await assert.doesNotReject(async () => {
    //       await mine.program.rpc.setAnnualRewards(ANNUAL_REWARDS_RATE, {
    //         accounts: {
    //           auth: {
    //             authority: provider.wallet.publicKey,
    //             rewarder: rewarderKey,
    //           },
    //         },
    //       });
    //     });

    //     const rewarder = await mine.program.account.rewarder.fetch(rewarderKey);
    //     expect(rewarder.annualRewardsRate).bignumber.to.eq(ANNUAL_REWARDS_RATE);
    //   });

    //   it("Transfer authority and accept authority", async () => {
    //     const newAuthority = web3.Keypair.generate();

    //     await assert.doesNotReject(async () => {
    //       await mine.program.rpc.transferAuthority(newAuthority.publicKey, {
    //         accounts: {
    //           authority: provider.wallet.publicKey,
    //           rewarder: rewarderKey,
    //         },
    //       });
    //     });

    //     let rewarder = await mine.program.account.rewarder.fetch(rewarderKey);
    //     expect(rewarder.authority).to.eqAddress(provider.wallet.publicKey);
    //     expect(rewarder.pendingAuthority).to.eqAddress(newAuthority.publicKey);

    //     const ix = mine.program.instruction.acceptAuthority({
    //       accounts: {
    //         authority: newAuthority.publicKey,
    //         rewarder: rewarderKey,
    //       },
    //     });
    //     let tx = sdk.newTx([ix], [newAuthority]);
    //     await expectTX(tx, "accept authority").to.be.fulfilled;
    //     rewarder = await mine.program.account.rewarder.fetch(rewarderKey);
    //     expect(rewarder.authority).to.eqAddress(newAuthority.publicKey);
    //     expect(rewarder.pendingAuthority).to.eqAddress(web3.PublicKey.default);

    //     // Transfer back
    //     const instructions = [];
    //     instructions.push(
    //       mine.program.instruction.transferAuthority(provider.wallet.publicKey, {
    //         accounts: {
    //           authority: newAuthority.publicKey,
    //           rewarder: rewarderKey,
    //         },
    //       })
    //     );
    //     instructions.push(
    //       mine.program.instruction.acceptAuthority({
    //         accounts: {
    //           authority: provider.wallet.publicKey,
    //           rewarder: rewarderKey,
    //         },
    //       })
    //     );

    //     tx = sdk.newTx(instructions, [newAuthority]);
    //     await expectTX(tx, "transfer authority back to original authority").to.be
    //       .fulfilled;

    //     rewarder = await mine.program.account.rewarder.fetch(rewarderKey);
    //     expect(rewarder.authority).to.eqAddress(provider.wallet.publicKey);
    //     expect(rewarder.pendingAuthority).to.eqAddress(web3.PublicKey.default);
    //   });
    // });

    // describe("Quarry", () => {
    //   const quarryRewardsShare = ANNUAL_REWARDS_RATE.div(new BN(10));
    //   let quarryData: QuarryData;
    //   let quarryKey: anchor.web3.PublicKey;
    //   let rewarderKey: anchor.web3.PublicKey;
    //   let rewarder: RewarderWrapper;

    //   beforeEach(async () => {
    //     const { tx, key: theRewarderKey } = await mine.createRewarder({
    //       mintWrapper: mintWrapperKey,
    //       authority: provider.wallet.publicKey,
    //     });
    //     // console.log("tx, theRewarderKey", tx, theRewarderKey);
    //     await expectTX(tx, "Create new rewarder").to.be.fulfilled;
    //     rewarderKey = theRewarderKey;
    //     rewarder = await mine.loadRewarderWrapper(rewarderKey);
    //     await expectTX(
    //       await rewarder.setAndSyncAnnualRewards(ANNUAL_REWARDS_RATE, []),
    //       "set annual rewards"
    //     );
    //     console.log("hereeeee");
    //   });

    //   describe("Single quarry", () => {
    //     beforeEach("Create a new quarry", async () => {
    //       console.log(
    //         "stakedMintAuthority.publicKey",
    //         stakedMintAuthority.publicKey
    //       );
    //       const { quarry, tx } = await rewarder.createQuarry({
    //         token: stakeToken,
    //         nftMintUpdateAuthority: stakedMintAuthority.publicKey,
    //       });
    //       console.log("quarry, tx", quarry, tx.instructions[0]);
    //       await expectTX(tx, "Create new quarry").to.be.fulfilled;

    //       const rewarderData = await mine.program.account.rewarder.fetch(
    //         rewarderKey
    //       );
    //       console.log("rewarderData", rewarderData);
    //       assert.strictEqual(rewarderData.numQuarries, 1);
    //       const quarryAccountInfo = await provider.connection.getAccountInfo(
    //         quarry
    //       );
    //       // console.log("Quarry account info", quarryAccountInfo);
    //       expect(quarryAccountInfo?.owner).to.eqAddress(mine.program.programId);

    //       assert.ok(quarryAccountInfo);
    //       quarryData = mine.program.coder.accounts.decode<QuarryData>(
    //         "Quarry",
    //         quarryAccountInfo.data
    //       );
    //       // console.log("Quarry data", quarryData);
    //       assert.strictEqual(
    //         quarryData.famineTs.toString(),
    //         "9223372036854775807"
    //       );

    //       // console.log("quarryData", quarryData);
    //       // console.log("stakeTokenMint", stakeTokenMint);
    //       assert.strictEqual(
    //         quarryData.tokenMintKey.toBase58(),
    //         stakeTokenMint.toBase58()
    //       );
    //       // console.log(
    //       //   "quarryData.annualRewardsRate",
    //       //   quarryData.annualRewardsRate
    //       // );
    //       // console.log("ZERO.toString()", ZERO.toString());
    //       assert.strictEqual(
    //         quarryData.annualRewardsRate.toString(),
    //         ZERO.toString()
    //       );
    //       // console.log("quarryData.rewardsShare", quarryData.rewardsShare);
    //       assert.strictEqual(quarryData.rewardsShare.toString(), ZERO.toString());
    //       quarryKey = quarry;
    //     });

    //     it("Set rewards share", async () => {
    //       const currentTime = Math.floor(new Date().getTime() / 1000);

    //       await assert.doesNotReject(async () => {
    //         await mine.program.rpc.setRewardsShare(quarryRewardsShare, {
    //           accounts: {
    //             auth: {
    //               authority: provider.wallet.publicKey,
    //               rewarder: rewarderKey,
    //             },
    //             quarry: quarryKey,
    //           },
    //         });
    //       });

    //       const rewarderData = await mine.program.account.rewarder.fetch(
    //         rewarderKey
    //       );
    //       expect(rewarderData.totalRewardsShares.toString()).to.equal(
    //         quarryRewardsShare.toString()
    //       );
    //       // console.log("Set rewards share stakeToken", stakeToken);
    //       const quarry = await rewarder.getQuarry(stakeToken);
    //       expect(quarry.key).to.eqAddress(quarryKey);
    //       expect(
    //         quarry.quarryData.lastUpdateTs
    //           .sub(new BN(currentTime))
    //           .abs()
    //           .lte(new BN(1))
    //       ).to.be.true;
    //       const expectedRewardsRate = quarry.computeAnnualRewardsRate();
    //       expect(quarry.quarryData.annualRewardsRate.toString()).to.equal(
    //         expectedRewardsRate.toString()
    //       );
    //       expect(quarry.quarryData.rewardsShare.toString()).to.eq(
    //         quarryRewardsShare.toString()
    //       );
    //     });

    //     it("Set famine", async () => {
    //       const now = new BN(Date.now());
    //       await assert.doesNotReject(async () => {
    //         await mine.program.rpc.setFamine(now, {
    //           accounts: {
    //             auth: {
    //               authority: provider.wallet.publicKey,
    //               rewarder: rewarderKey,
    //             },
    //             quarry: quarryKey,
    //           },
    //         });
    //       });
    //       const quarryAccountInfo = await provider.connection.getAccountInfo(
    //         quarryKey
    //       );
    //       assert.ok(quarryAccountInfo);
    //       const quarryData = mine.program.coder.accounts.decode<QuarryData>(
    //         "Quarry",
    //         quarryAccountInfo?.data
    //       );
    //       assert.strictEqual(quarryData.famineTs.toString(), now.toString());

    //       await assert.doesNotReject(async () => {
    //         await mine.program.rpc.setFamine(quarryData.famineTs, {
    //           accounts: {
    //             auth: {
    //               authority: provider.wallet.publicKey,
    //               rewarder: rewarderKey,
    //             },
    //             quarry: quarryKey,
    //           },
    //         });
    //       });
    //     });

    //     it("Unauthorized", async () => {
    //       const fakeAuthority = web3.Keypair.generate();
    //       const nextMint = await createMint(
    //         provider,
    //         provider.wallet.publicKey,
    //         DEFAULT_DECIMALS
    //       );
    //       const [quarryKey, bump] = await findQuarryAddress(
    //         rewarderKey,
    //         nextMint
    //       );
    //       await assert.rejects(
    //         async () => {
    //           await mine.program.rpc.createQuarry(bump, {
    //             accounts: {
    //               quarry: quarryKey,
    //               auth: {
    //                 authority: fakeAuthority.publicKey,
    //                 rewarder: rewarderKey,
    //               },
    //               tokenMint: nextMint,
    //               payer: fakeAuthority.publicKey,
    //               unusedClock: web3.SYSVAR_CLOCK_PUBKEY,
    //               systemProgram: web3.SystemProgram.programId,
    //             },
    //             signers: [fakeAuthority],
    //           });
    //         },
    //         (err: Error) => {
    //           console.error(err);
    //           expect(err.message).to.include("custom program error: 0x1"); // mut constraint
    //           return true;
    //         }
    //       );
    //     });

    //     it("Invalid PDA", async () => {
    //       await assert.rejects(async () => {
    //         const [quarryKey, bump] = await findQuarryAddress(
    //           rewarderKey,
    //           Keypair.generate().publicKey
    //         );
    //         await mine.program.rpc.createQuarry(bump, {
    //           accounts: {
    //             quarry: quarryKey,
    //             auth: {
    //               authority: provider.wallet.publicKey,
    //               rewarder: rewarderKey,
    //             },
    //             tokenMint: stakeTokenMint,
    //             payer: provider.wallet.publicKey,
    //             unusedClock: web3.SYSVAR_CLOCK_PUBKEY,
    //             systemProgram: web3.SystemProgram.programId,
    //           },
    //         });
    //       });
    //     });
    //   });

    //   describe("Multiple quarries", () => {
    //     const tokens: Token[] = [];

    //     beforeEach("Create quarries", async () => {
    //       let totalRewardsShare = ZERO;
    //       const numQuarries = 5;
    //       for (let i = 0; i < numQuarries; i++) {
    //         const mint = await createMint(provider);
    //         const token = Token.fromMint(mint, DEFAULT_DECIMALS, {
    //           name: "stake token",
    //         });

    //         tokens.push(token);
    //         const rewardsShare = new BN(i + 1);
    //         const { tx } = await rewarder.createQuarry({
    //           token,
    //         });
    //         await expectTX(tx, "create quarry").to.be.fulfilled;

    //         const quarry = await rewarder.getQuarry(token);
    //         await expectTX(quarry.setRewardsShare(rewardsShare)).to.be.fulfilled;
    //         totalRewardsShare = totalRewardsShare.add(rewardsShare);
    //       }

    //       const rewarderData = await mine.program.account.rewarder.fetch(
    //         rewarderKey
    //       );
    //       expect(rewarderData.numQuarries).to.eq(numQuarries);
    //       expect(rewarderData.totalRewardsShares).to.bignumber.eq(
    //         totalRewardsShare
    //       );

    //       const mints = tokens.map((tok) => tok.mintAccount);
    //       const tx = await rewarder.syncQuarryRewards(mints);
    //       await expectTX(tx, "sync quarries").to.be.fulfilled;
    //     });

    //     it("Set annual rewards and make sure quarries update", async () => {
    //       const multiplier = new BN(10);
    //       let rewarderData = await mine.program.account.rewarder.fetch(
    //         rewarderKey
    //       );
    //       const nextAnnualRewardsRate = ANNUAL_REWARDS_RATE.mul(multiplier);
    //       const prevRates = await Promise.all(
    //         tokens.map(async (t) => {
    //           const quarry = await rewarder.getQuarry(t);
    //           return { token: t, rate: quarry.quarryData.annualRewardsRate };
    //         })
    //       );

    //       const tx = await rewarder.setAndSyncAnnualRewards(
    //         nextAnnualRewardsRate,
    //         tokens.map((t) => t.mintAccount)
    //       );
    //       console.log(await tx.simulate());
    //       await expectTX(tx, "set annual rewards and update quarry rewards").to.be
    //         .fulfilled;

    //       rewarderData = await mine.program.account.rewarder.fetch(rewarderKey);
    //       expect(rewarderData.annualRewardsRate).to.bignumber.eq(
    //         nextAnnualRewardsRate
    //       );

    //       let sumRewardsPerAnnum = new BN(0);
    //       for (const token of tokens) {
    //         const nextRate = (await rewarder.getQuarry(token)).quarryData
    //           .annualRewardsRate;
    //         sumRewardsPerAnnum = sumRewardsPerAnnum.add(nextRate);
    //         const prevRate = prevRates.find((r) => r.token.equals(token))?.rate;
    //         invariant(
    //           prevRate,
    //           `prev rate not found for token ${token.toString()}`
    //         );

    //         // Epsilon is 10
    //         // check to see difference is less than 10
    //         const expectedRate = prevRate.mul(multiplier);
    //         expect(
    //           nextRate,
    //           `mul rate: ${multiplier.toString()}; expected: ${expectedRate.toString()}; got: ${nextRate.toString()}`
    //         ).to.bignumber.closeTo(expectedRate, "10");
    //       }
    //       // Check on day multiple
    //       expect(
    //         sumRewardsPerAnnum,
    //         "rewards rate within one day multiple"
    //       ).bignumber.closeTo(
    //         nextAnnualRewardsRate,
    //         new BN(2) // precision lost
    //       );

    //       // Restore daily rewards rate
    //       const txRestore = await rewarder.setAndSyncAnnualRewards(
    //         ANNUAL_REWARDS_RATE,
    //         tokens.map((t) => t.mintAccount)
    //       );
    //       await expectTX(txRestore, "revert daily rewards to previous amount").to
    //         .be.fulfilled;

    //       for (const token of tokens) {
    //         const lastRate = (
    //           await rewarder.getQuarry(token)
    //         ).computeAnnualRewardsRate();
    //         const prevRate = prevRates.find((r) => r.token.equals(token))?.rate;
    //         invariant(
    //           prevRate,
    //           `prev rate not found for token ${token.toString()}`
    //         );
    //         expect(lastRate, `revert rate ${token.toString()}`).bignumber.to.eq(
    //           prevRate
    //         );
    //       }
    //     });
    //   });
    // });

    // describe("Miner", () => {
    //   let rewarderKey: anchor.web3.PublicKey;
    //   let rewarder: RewarderWrapper;
    //   let quarry: QuarryWrapper;

    //   beforeEach(async () => {
    //     const { tx, key: theRewarderKey } = await mine.createRewarder({
    //       mintWrapper: mintWrapperKey,
    //       authority: provider.wallet.publicKey,
    //     });
    //     await expectTX(tx, "Create new rewarder").to.be.fulfilled;
    //     rewarderKey = theRewarderKey;
    //     rewarder = await mine.loadRewarderWrapper(rewarderKey);
    //     await expectTX(
    //       await rewarder.setAndSyncAnnualRewards(ANNUAL_REWARDS_RATE, [])
    //     ).to.be.fulfilled;

    //     const { tx: quarryTx } = await rewarder.createQuarry({
    //       token: stakeToken,
    //     });
    //     await expectTX(quarryTx, "Create new quarry").to.be.fulfilled;
    //   });

    //   beforeEach("Create miner", async () => {
    //     quarry = await rewarder.getQuarry(stakeToken);
    //     expect(quarry).to.exist;

    //     // create the miner
    //     await expectTX((await quarry.createMiner()).tx, "create miner").to.be
    //       .fulfilled;
    //   });

    //   it("Valid miner", async () => {
    //     const miner = await quarry.getMinerAddress(provider.wallet.publicKey);
    //     const minerAccountInfo = await provider.connection.getAccountInfo(miner);
    //     expect(minerAccountInfo?.owner).to.eqAddress(mine.program.programId);
    //     assert.ok(minerAccountInfo?.data);
    //     const minerData = mine.program.coder.accounts.decode<MinerData>(
    //       "Miner",
    //       minerAccountInfo.data
    //     );
    //     expect(minerData.authority).to.eqAddress(provider.wallet.publicKey);
    //     assert.strictEqual(minerData.quarryKey.toBase58(), quarry.key.toBase58());

    //     const minerBalance = await getTokenAccount(
    //       provider,
    //       minerData.tokenVaultKey
    //     );
    //     expect(minerBalance.amount).to.bignumber.eq(ZERO);
    //   });

    //   it("Stake and withdraw", async () => {
    //     // mint test tokens
    //     const amount = 1_000_000000;
    //     const userStakeTokenAccount = await newUserStakeTokenAccount(
    //       sdk,
    //       quarry,
    //       stakeToken,
    //       stakedMintAuthority,
    //       amount
    //     );

    //     // stake into the quarry
    //     const minerActions = await quarry.getMinerActions(
    //       provider.wallet.publicKey
    //     );
    //     await expectTX(
    //       minerActions.stake(new TokenAmount(stakeToken, amount)),
    //       "Stake into the quarry"
    //     ).to.be.fulfilled;

    //     let miner = await quarry.getMiner(provider.wallet.publicKey);
    //     invariant(miner, "miner must exist");

    //     const minerBalance = await getTokenAccount(provider, miner.tokenVaultKey);
    //     expect(minerBalance.amount).to.bignumber.eq(new BN(amount));

    //     let minerVaultInfo = await getTokenAccount(provider, miner.tokenVaultKey);
    //     expect(minerVaultInfo.amount).to.bignumber.eq(new BN(amount));
    //     let userStakeTokenAccountInfo = await getTokenAccount(
    //       provider,
    //       userStakeTokenAccount
    //     );
    //     expect(userStakeTokenAccountInfo.amount).to.bignumber.eq(ZERO);

    //     // withdraw from the quarry
    //     await expectTX(
    //       minerActions.withdraw(new TokenAmount(stakeToken, amount)),
    //       "Withdraw from the quarry"
    //     ).to.be.fulfilled;
    //     miner = await quarry.getMiner(provider.wallet.publicKey);
    //     invariant(miner, "miner must exist");

    //     const endMinerBalance = await getTokenAccount(
    //       provider,
    //       miner.tokenVaultKey
    //     );
    //     expect(endMinerBalance.amount).to.bignumber.eq(ZERO);

    //     minerVaultInfo = await getTokenAccount(provider, miner.tokenVaultKey);
    //     expect(minerVaultInfo.amount.toNumber()).to.eq(ZERO.toNumber());
    //     userStakeTokenAccountInfo = await getTokenAccount(
    //       provider,
    //       userStakeTokenAccount
    //     );
    //     expect(userStakeTokenAccountInfo.amount.toNumber()).to.eq(amount);
    //   });
  });
});
