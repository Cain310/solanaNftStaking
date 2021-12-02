import * as anchor from "@project-serum/anchor";
import { expectTX } from "@saberhq/chai-solana";
import type { Provider } from "@saberhq/solana-contrib";
import {
  createInitMintInstructions,
  // createMint,
  // getMintInfo,
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
  const DAILY_REWARDS_RATE = new BN(1_000 * web3.LAMPORTS_PER_SOL);
  const ANNUAL_REWARDS_RATE = DAILY_REWARDS_RATE.mul(new BN(365));

  // authority over the mint and filter for quarry
  // let stakedMintAuthority: anchor.web3.Keypair;
  // let stakeTokenMint: anchor.web3.PublicKey;
  // let stakeToken: Token;

  let sdk: QuarrySDK;
  let provider: Provider;
  let mintWrapper: MintWrapper;
  let mine: MineWrapper;
  let nonFungibleMint: Keypair;
  let mintAuthority: PublicKey;
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
      // stakedMintAuthority = web3.Keypair.generate();
      // not sure if this works with nft's as it uses solana spl-token progran
      // stakeTokenMint = await createMint(
      //   provider,
      //   stakedMintAuthority.publicKey,
      //   DEFAULT_DECIMALS
      // );
    });
    // Loads a token from a Mint
    // stakeToken = Token.fromMint(stakeTokenMint, DEFAULT_DECIMALS, {
    //   name: "stake token",
    // });
  });

  before("Create nonfunigble token", async () => {
    await assert.doesNotReject(async () => {
      nonFungibleMint = web3.Keypair.generate();
      mintAuthority = nonFungibleMint.publicKey;
      const tx = await mintNFT(provider, nonFungibleMint);
      // Generate a new random keypair
      await tx.send();
      await tx.confirm();
      stakeNonfungibleToken = Token.fromMint(nonFungibleMint.publicKey, 0);
      console.log(stakeNonfungibleToken.toString());
      nonFungibleMintAnother = web3.Keypair.generate();
      const tx2 = await mintNFT(provider, nonFungibleMintAnother);
      await tx2.send();
      await tx2.confirm();
      stakeAnotherNonfungibleToken = Token.fromMint(
        nonFungibleMintAnother.publicKey,
        0
      );
      // const mintInfo = await getMintInfo(provider, nonFungibleMint.publicKey);
      // const mintInfo2 = await getMintInfo(
      //   provider,
      //   nonFungibleMintAnother.publicKey
      // );

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
    token = Token.fromMint(rewardsMint, DEFAULT_DECIMALS);
    hardCap = TokenAmount.parse(token, DEFAULT_HARD_CAP.toString());
    // newWrapper takes a mint and returns a mintWrapper keypair
    const { tx, mintWrapper: wrapperKey } = await mintWrapper.newWrapper({
      hardcap: hardCap.toU64(),
      tokenMint: rewardsMint,
    });
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
      // console.log("theReward÷erKey", theRewarderKey, tx);
      await expectTX(tx, "Create new rewarder").to.be.fulfilled;
      rewarderKey = theRewarderKey;
      rewarder = await mine.loadRewarderWrapper(rewarderKey);
      await expectTX(
        await rewarder.setAndSyncAnnualRewards(ANNUAL_REWARDS_RATE, [])
      ).to.be.fulfilled;
      console.log("stakeNonfungibleToken", stakeNonfungibleToken);
      const { quarry, tx: quarryTx } = await rewarder.createQuarry({
        mintAuthority, // the mint
      });
      quarryKey = quarry;

      // console.log(
      //   "quarryKey1",
      //   JSON.stringify(quarryKey, null, 4),
      //   typeof quarryKey
      // );
      // console.log("quarryTx", quarryTx, typeof quarryTx);

      await expectTX(quarryTx, "Create new quarry").to.be.fulfilled;

      console.log("quarryKey", quarryKey);
    });

    beforeEach("Create miner", async () => {
      quarry = await rewarder.getQuarry(provider.wallet.publicKey); // passing the expected "collection value"
      console.log("quarryyyyyy", quarry);
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
      // console.log("miner", miner);
      const minerAccountInfo = await provider.connection.getAccountInfo(miner);
      // console.log("minerAccountInfo", minerAccountInfo);
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
  });
});
