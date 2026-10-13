const anchor = require('@coral-xyz/anchor');
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} = require('@solana/spl-token');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { BN, web3 } = anchor;
const { Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, SystemProgram } = web3;

const CONFIG_SEED = Buffer.from('config');
const MARKET_SEED = Buffer.from('market');
const POSITION_SEED = Buffer.from('position');
const FEE_BASIS_POINTS = 250;
const CLAIM_WINDOW_SECONDS = 12;

const outcome = {
  white: { white: {} },
  draw: { draw: {} },
  black: { black: {} },
};

const hash = (value) => crypto.createHash('sha256').update(value).digest();
const nonceBytes = (value) => new BN(value).toArrayLike(Buffer, 'le', 8);
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('feras_market local validator', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FerasMarket;
  const payer = provider.wallet.payer;
  const [config] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    program.programId,
  );

  let mint;
  let wrongMint;
  let treasury;
  let userOne;
  let userTwo;
  let attacker;
  let settlementAuthority;
  let treasuryAuthority;
  let userOneToken;
  let userTwoToken;
  let attackerToken;
  let wrongMintToken;

  async function expectFailure(promise, expectedCode) {
    let thrown;
    try {
      await promise;
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown, `Expected transaction to fail with ${expectedCode}`);
    const details = [
      thrown.message,
      thrown.error?.errorCode?.code,
      ...(thrown.logs || []),
    ]
      .filter(Boolean)
      .join('\n');
    assert.match(details, new RegExp(expectedCode, 'i'));
  }

  async function fund(keypair) {
    const signature = await provider.connection.requestAirdrop(
      keypair.publicKey,
      3 * web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(signature, 'confirmed');
  }

  async function getChainUnixTimestamp() {
    const clock = await provider.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
    assert.ok(clock, 'Clock sysvar must exist');
    return Number(clock.data.readBigInt64LE(32));
  }

  async function waitUntilAfter(unixTimestamp) {
    const timeoutAt = Date.now() + 45_000;
    while ((await getChainUnixTimestamp()) <= unixTimestamp) {
      assert.ok(Date.now() < timeoutAt, 'Validator clock did not reach claim deadline');
      await sleep(500);
    }
  }

  async function waitUntilAtLeast(unixTimestamp) {
    const timeoutAt = Date.now() + 45_000;
    while ((await getChainUnixTimestamp()) < unixTimestamp) {
      assert.ok(Date.now() < timeoutAt, 'Validator clock did not reach lock time');
      await sleep(250);
    }
  }

  function marketAddresses(canonicalMatchId) {
    const matchIdHash = hash(canonicalMatchId);
    const [market] = PublicKey.findProgramAddressSync(
      [MARKET_SEED, matchIdHash],
      program.programId,
    );
    const vault = getAssociatedTokenAddressSync(mint, market, true);
    return { matchIdHash, market, vault };
  }

  function positionAddress(market, owner, clientNonce) {
    return PublicKey.findProgramAddressSync(
      [
        POSITION_SEED,
        market.toBuffer(),
        owner.toBuffer(),
        nonceBytes(clientNonce),
      ],
      program.programId,
    )[0];
  }

  async function createMarket(canonicalMatchId, requestedLockTime) {
    const addresses = marketAddresses(canonicalMatchId);
    const lockTime = new BN(
      requestedLockTime ?? (await getChainUnixTimestamp()) + 3_600,
    );

    await program.methods
      .createMarket(Array.from(addresses.matchIdHash), lockTime)
      .accountsStrict({
        config,
        market: addresses.market,
        vault: addresses.vault,
        acceptedMint: mint,
        authority: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { ...addresses, lockTime: lockTime.toNumber() };
  }

  async function placePosition({
    market,
    vault,
    owner,
    ownerToken,
    selectedOutcome,
    amount,
    clientNonce,
    acceptedMint = mint,
  }) {
    const position = positionAddress(market, owner.publicKey, clientNonce);
    await program.methods
      .placePosition(selectedOutcome, new BN(amount), new BN(clientNonce))
      .accountsStrict({
        config,
        market,
        position,
        ownerToken,
        vault,
        acceptedMint,
        owner: owner.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
    return position;
  }

  before(async function () {
    this.timeout(120_000);

    userOne = Keypair.generate();
    userTwo = Keypair.generate();
    attacker = Keypair.generate();
    settlementAuthority = Keypair.generate();
    treasuryAuthority = Keypair.generate();
    await Promise.all([fund(userOne), fund(userTwo), fund(attacker)]);

    wrongMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      5,
    );
    const wrongTreasury = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      wrongMint,
      treasuryAuthority.publicKey,
    );

    await expectFailure(
      program.methods
        .initializeConfig(
          settlementAuthority.publicKey,
          treasuryAuthority.publicKey,
          FEE_BASIS_POINTS,
          new BN(CLAIM_WINDOW_SECONDS),
        )
        .accountsStrict({
          config,
          authority: payer.publicKey,
          acceptedMint: wrongMint,
          treasury: wrongTreasury.address,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      'InvalidMintDecimals',
    );

    mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6,
    );
    const invalidTreasury = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      attacker.publicKey,
    );
    await expectFailure(
      program.methods
        .initializeConfig(
          settlementAuthority.publicKey,
          treasuryAuthority.publicKey,
          FEE_BASIS_POINTS,
          new BN(CLAIM_WINDOW_SECONDS),
        )
        .accountsStrict({
          config,
          authority: payer.publicKey,
          acceptedMint: mint,
          treasury: invalidTreasury.address,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      'InvalidTreasury',
    );

    const sharedRoleTreasury = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey,
    );
    await expectFailure(
      program.methods
        .initializeConfig(
          payer.publicKey,
          payer.publicKey,
          FEE_BASIS_POINTS,
          new BN(CLAIM_WINDOW_SECONDS),
        )
        .accountsStrict({
          config,
          authority: payer.publicKey,
          acceptedMint: mint,
          treasury: sharedRoleTreasury.address,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      'AuthoritiesNotSeparated',
    );

    treasury = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        treasuryAuthority.publicKey,
      )
    ).address;

    await program.methods
      .initializeConfig(
        settlementAuthority.publicKey,
        treasuryAuthority.publicKey,
        FEE_BASIS_POINTS,
        new BN(CLAIM_WINDOW_SECONDS),
      )
      .accountsStrict({
        config,
        authority: payer.publicKey,
        acceptedMint: mint,
        treasury,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    userOneToken = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        userOne.publicKey,
      )
    ).address;
    userTwoToken = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        userTwo.publicKey,
      )
    ).address;
    attackerToken = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        attacker.publicKey,
      )
    ).address;
    wrongMintToken = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        wrongMint,
        userOne.publicKey,
      )
    ).address;

    await mintTo(
      provider.connection,
      payer,
      mint,
      userOneToken,
      payer,
      1_000_000_000,
    );
    await mintTo(
      provider.connection,
      payer,
      mint,
      userTwoToken,
      payer,
      1_000_000_000,
    );
    await mintTo(
      provider.connection,
      payer,
      mint,
      attackerToken,
      payer,
      1_000_000_000,
    );
    await mintTo(
      provider.connection,
      payer,
      wrongMint,
      wrongMintToken,
      payer,
      10_000_000,
    );
  });

  it('rotates separated authorities without accepting substituted control', async () => {
    await expectFailure(
      program.methods
        .proposeAuthority(userOne.publicKey)
        .accountsStrict({ config, authority: attacker.publicKey })
        .signers([attacker])
        .rpc(),
      'InvalidAuthority',
    );

    await expectFailure(
      program.methods
        .proposeAuthority(settlementAuthority.publicKey)
        .accountsStrict({ config, authority: payer.publicKey })
        .rpc(),
      'AuthoritiesNotSeparated',
    );

    await program.methods
      .proposeAuthority(attacker.publicKey)
      .accountsStrict({ config, authority: payer.publicKey })
      .rpc();

    await expectFailure(
      program.methods
        .acceptAuthority()
        .accountsStrict({ config, pendingAuthority: userOne.publicKey })
        .signers([userOne])
        .rpc(),
      'InvalidAuthority',
    );

    await program.methods
      .acceptAuthority()
      .accountsStrict({ config, pendingAuthority: attacker.publicKey })
      .signers([attacker])
      .rpc();

    await expectFailure(
      program.methods
        .setPaused(true)
        .accountsStrict({ config, authority: payer.publicKey })
        .rpc(),
      'InvalidAuthority',
    );

    await expectFailure(
      program.methods
        .updateSettlementAuthority(userTwo.publicKey)
        .accountsStrict({ config, authority: payer.publicKey })
        .rpc(),
      'InvalidAuthority',
    );

    await program.methods
      .updateSettlementAuthority(userTwo.publicKey)
      .accountsStrict({ config, authority: attacker.publicKey })
      .signers([attacker])
      .rpc();
    await program.methods
      .updateSettlementAuthority(settlementAuthority.publicKey)
      .accountsStrict({ config, authority: attacker.publicKey })
      .signers([attacker])
      .rpc();

    await expectFailure(
      program.methods
        .updateTreasury(userOne.publicKey)
        .accountsStrict({
          config,
          acceptedMint: mint,
          newTreasury: attackerToken,
          authority: attacker.publicKey,
        })
        .signers([attacker])
        .rpc(),
      'InvalidTreasury',
    );

    await expectFailure(
      program.methods
        .updateTreasury(userOne.publicKey)
        .accountsStrict({
          config,
          acceptedMint: mint,
          newTreasury: userOneToken,
          authority: payer.publicKey,
        })
        .rpc(),
      'InvalidAuthority',
    );

    await program.methods
      .updateTreasury(userOne.publicKey)
      .accountsStrict({
        config,
        acceptedMint: mint,
        newTreasury: userOneToken,
        authority: attacker.publicKey,
      })
      .signers([attacker])
      .rpc();
    await program.methods
      .updateTreasury(treasuryAuthority.publicKey)
      .accountsStrict({
        config,
        acceptedMint: mint,
        newTreasury: treasury,
        authority: attacker.publicKey,
      })
      .signers([attacker])
      .rpc();

    await program.methods
      .proposeAuthority(payer.publicKey)
      .accountsStrict({ config, authority: attacker.publicKey })
      .signers([attacker])
      .rpc();
    await program.methods
      .acceptAuthority()
      .accountsStrict({ config, pendingAuthority: payer.publicKey })
      .rpc();

    const currentConfig = await program.account.platformConfig.fetch(config);
    assert.equal(currentConfig.authority.toBase58(), payer.publicKey.toBase58());
    assert.equal(
      currentConfig.pendingAuthority.toBase58(),
      PublicKey.default.toBase58(),
    );
    assert.equal(
      currentConfig.settlementAuthority.toBase58(),
      settlementAuthority.publicKey.toBase58(),
    );
    assert.equal(
      currentConfig.treasuryAuthority.toBase58(),
      treasuryAuthority.publicKey.toBase58(),
    );
    assert.equal(currentConfig.treasury.toBase58(), treasury.toBase58());
  });

  it('rejects substituted platform authority accounts', async () => {
    const { matchIdHash, market, vault } = marketAddresses(
      'feras/local/substituted-create-authority-v1',
    );
    const lockTime = new BN((await getChainUnixTimestamp()) + 3_600);

    await expectFailure(
      program.methods
        .createMarket(Array.from(matchIdHash), lockTime)
        .accountsStrict({
          config,
          market,
          vault,
          acceptedMint: mint,
          authority: attacker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc(),
      'InvalidAuthority',
    );

    await expectFailure(
      program.methods
        .setPaused(true)
        .accountsStrict({ config, authority: attacker.publicKey })
        .signers([attacker])
        .rpc(),
      'InvalidAuthority',
    );
  });

  it('settles a solvent market and rejects unsafe mutations', async () => {
    const { market, vault } = await createMarket(
      'feras/local/settled-market-v1',
    );
    const { vault: foreignVault } = await createMarket(
      'feras/local/foreign-vault-v1',
    );
    const userOnePosition = await placePosition({
      market,
      vault,
      owner: userOne,
      ownerToken: userOneToken,
      selectedOutcome: outcome.white,
      amount: 100_000_000,
      clientNonce: 1,
    });
    const userTwoPosition = await placePosition({
      market,
      vault,
      owner: userTwo,
      ownerToken: userTwoToken,
      selectedOutcome: outcome.black,
      amount: 200_000_000,
      clientNonce: 1,
    });

    const balanceBeforeDuplicate = (await getAccount(
      provider.connection,
      userOneToken,
    )).amount;
    await expectFailure(
      placePosition({
        market,
        vault: foreignVault,
        owner: userOne,
        ownerToken: userOneToken,
        selectedOutcome: outcome.draw,
        amount: 1_000_000,
        clientNonce: 2,
      }),
      'InvalidVault',
    );

    await expectFailure(
      placePosition({
        market,
        vault,
        owner: userOne,
        ownerToken: userOneToken,
        selectedOutcome: outcome.white,
        amount: 100_000_000,
        clientNonce: 1,
      }),
      'already in use',
    );
    assert.equal(
      (await getAccount(provider.connection, userOneToken)).amount,
      balanceBeforeDuplicate,
    );

    await expectFailure(
      placePosition({
        market,
        vault,
        owner: userOne,
        ownerToken: wrongMintToken,
        selectedOutcome: outcome.draw,
        amount: 1_000_000,
        clientNonce: 3,
        acceptedMint: wrongMint,
      }),
      'ConstraintTokenMint',
    );

    await program.methods
      .setPaused(true)
      .accountsStrict({ config, authority: payer.publicKey })
      .rpc();
    await expectFailure(
      placePosition({
        market,
        vault,
        owner: userOne,
        ownerToken: userOneToken,
        selectedOutcome: outcome.draw,
        amount: 1_000_000,
        clientNonce: 4,
      }),
      'PlatformPaused',
    );
    await program.methods
      .setPaused(false)
      .accountsStrict({ config, authority: payer.publicKey })
      .rpc();

    await expectFailure(
      program.methods
        .lockMarket()
        .accountsStrict({ config, market, authority: attacker.publicKey })
        .signers([attacker])
        .rpc(),
      'InvalidAuthority',
    );

    await program.methods
      .lockMarket()
      .accountsStrict({ config, market, authority: payer.publicKey })
      .rpc();

    await expectFailure(
      placePosition({
        market,
        vault,
        owner: userOne,
        ownerToken: userOneToken,
        selectedOutcome: outcome.draw,
        amount: 1_000_000,
        clientNonce: 5,
      }),
      'MarketNotOpen',
    );

    await expectFailure(
      program.methods
        .settleMarket(outcome.draw, Array.from(hash('empty-winner')))
        .accountsStrict({
          config,
          market,
          vault,
          treasury,
          acceptedMint: mint,
          settlementAuthority: settlementAuthority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([settlementAuthority])
        .rpc(),
      'NoWinningPool',
    );

    await expectFailure(
      program.methods
        .settleMarket(outcome.white, Array.from(hash('unauthorized-settlement')))
        .accountsStrict({
          config,
          market,
          vault,
          treasury,
          acceptedMint: mint,
          settlementAuthority: attacker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc(),
      'InvalidSettlementAuthority',
    );

    await expectFailure(
      program.methods
        .settleMarket(outcome.white, Array.from(hash('redirected-fee')))
        .accountsStrict({
          config,
          market,
          vault,
          treasury: attackerToken,
          acceptedMint: mint,
          settlementAuthority: settlementAuthority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([settlementAuthority])
        .rpc(),
      'InvalidTreasury',
    );

    await program.methods
      .settleMarket(outcome.white, Array.from(hash('valid-transcript')))
      .accountsStrict({
        config,
        market,
        vault,
        treasury,
        acceptedMint: mint,
        settlementAuthority: settlementAuthority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([settlementAuthority])
      .rpc();

    assert.equal((await getAccount(provider.connection, treasury)).amount, 7_500_000n);

    await expectFailure(
      program.methods
        .claim()
        .accountsStrict({
          config,
          market,
          position: userTwoPosition,
          ownerToken: userTwoToken,
          vault,
          acceptedMint: mint,
          owner: userTwo.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([userTwo])
        .rpc(),
      'PositionDidNotWin',
    );

    await expectFailure(
      program.methods
        .claim()
        .accountsStrict({
          config,
          market,
          position: userOnePosition,
          ownerToken: attackerToken,
          vault,
          acceptedMint: mint,
          owner: attacker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc(),
      'ConstraintSeeds',
    );

    await program.methods
      .claim()
      .accountsStrict({
        config,
        market,
        position: userOnePosition,
        ownerToken: userOneToken,
        vault,
        acceptedMint: mint,
        owner: userOne.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([userOne])
      .rpc();

    assert.equal(
      (await getAccount(provider.connection, userOneToken)).amount,
      1_192_500_000n,
    );
    assert.equal((await getAccount(provider.connection, vault)).amount, 0n);

    await expectFailure(
      program.methods
        .claim()
        .accountsStrict({
          config,
          market,
          position: userOnePosition,
          ownerToken: userOneToken,
          vault,
          acceptedMint: mint,
          owner: userOne.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([userOne])
        .rpc(),
      'AlreadyClaimed',
    );

    await expectFailure(
      program.methods
        .settleMarket(outcome.white, Array.from(hash('repeat-settlement')))
        .accountsStrict({
          config,
          market,
          vault,
          treasury,
          acceptedMint: mint,
          settlementAuthority: settlementAuthority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([settlementAuthority])
        .rpc(),
      'MarketNotLocked',
    );
  });

  it('returns every token when an open market is cancelled', async () => {
    const { market, vault } = await createMarket(
      'feras/local/cancelled-market-v1',
    );
    const userOneBefore = (await getAccount(
      provider.connection,
      userOneToken,
    )).amount;
    const userTwoBefore = (await getAccount(
      provider.connection,
      userTwoToken,
    )).amount;

    const userOnePosition = await placePosition({
      market,
      vault,
      owner: userOne,
      ownerToken: userOneToken,
      selectedOutcome: outcome.draw,
      amount: 50_000_000,
      clientNonce: 11,
    });
    const userTwoPosition = await placePosition({
      market,
      vault,
      owner: userTwo,
      ownerToken: userTwoToken,
      selectedOutcome: outcome.black,
      amount: 75_000_000,
      clientNonce: 12,
    });

    await expectFailure(
      program.methods
        .cancelMarket()
        .accountsStrict({ config, market, authority: attacker.publicKey })
        .signers([attacker])
        .rpc(),
      'InvalidAuthority',
    );

    await program.methods
      .cancelMarket()
      .accountsStrict({ config, market, authority: payer.publicKey })
      .rpc();

    await expectFailure(
      program.methods
        .claimRefund()
        .accountsStrict({
          config,
          market,
          position: userOnePosition,
          ownerToken: attackerToken,
          vault,
          acceptedMint: mint,
          owner: attacker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc(),
      'ConstraintSeeds',
    );

    for (const [owner, ownerToken, position] of [
      [userTwo, userTwoToken, userTwoPosition],
      [userOne, userOneToken, userOnePosition],
    ]) {
      await program.methods
        .claimRefund()
        .accountsStrict({
          config,
          market,
          position,
          ownerToken,
          vault,
          acceptedMint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
    }

    assert.equal(
      (await getAccount(provider.connection, userOneToken)).amount,
      userOneBefore,
    );
    assert.equal(
      (await getAccount(provider.connection, userTwoToken)).amount,
      userTwoBefore,
    );
    assert.equal((await getAccount(provider.connection, vault)).amount, 0n);

    await expectFailure(
      program.methods
        .claimRefund()
        .accountsStrict({
          config,
          market,
          position: userOnePosition,
          ownerToken: userOneToken,
          vault,
          acceptedMint: mint,
          owner: userOne.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([userOne])
        .rpc(),
      'AlreadyRefunded',
    );
  });

  it('enforces the chain-clock lock boundary', async () => {
    const currentChainTime = await getChainUnixTimestamp();
    await expectFailure(
      createMarket('feras/local/invalid-lock-boundary-v1', currentChainTime),
      'InvalidLockTime',
    );

    const acceptedLockTime = (await getChainUnixTimestamp()) + 6;
    const { market, vault, lockTime } = await createMarket(
      'feras/local/lock-boundary-v1',
      acceptedLockTime,
    );
    assert.equal(lockTime, acceptedLockTime);

    await waitUntilAtLeast(lockTime);
    assert.ok((await getChainUnixTimestamp()) >= lockTime);

    const balanceBefore = (await getAccount(
      provider.connection,
      userOneToken,
    )).amount;
    await expectFailure(
      placePosition({
        market,
        vault,
        owner: userOne,
        ownerToken: userOneToken,
        selectedOutcome: outcome.white,
        amount: 1_000_000,
        clientNonce: 31,
      }),
      'MarketLocked',
    );
    assert.equal(
      (await getAccount(provider.connection, userOneToken)).amount,
      balanceBefore,
    );

    const lockedByTimeMarket = await program.account.market.fetch(market);
    assert.deepEqual(lockedByTimeMarket.status, { open: {} });
  });

  it('closes claims and sweeps the deterministic rounding remainder', async () => {
    const { market, vault } = await createMarket(
      'feras/local/rounding-market-v1',
    );
    const treasuryBefore = (await getAccount(
      provider.connection,
      treasury,
    )).amount;

    const userOnePosition = await placePosition({
      market,
      vault,
      owner: userOne,
      ownerToken: userOneToken,
      selectedOutcome: outcome.white,
      amount: 1,
      clientNonce: 21,
    });
    const userTwoPosition = await placePosition({
      market,
      vault,
      owner: userTwo,
      ownerToken: userTwoToken,
      selectedOutcome: outcome.white,
      amount: 2,
      clientNonce: 22,
    });
    await placePosition({
      market,
      vault,
      owner: attacker,
      ownerToken: attackerToken,
      selectedOutcome: outcome.black,
      amount: 2,
      clientNonce: 23,
    });

    await program.methods
      .lockMarket()
      .accountsStrict({ config, market, authority: payer.publicKey })
      .rpc();
    await program.methods
      .settleMarket(outcome.white, Array.from(hash('rounding-transcript')))
      .accountsStrict({
        config,
        market,
        vault,
        treasury,
        acceptedMint: mint,
        settlementAuthority: settlementAuthority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([settlementAuthority])
      .rpc();

    await expectFailure(
      program.methods
        .sweepRemainder()
        .accountsStrict({
          config,
          market,
          vault,
          treasury,
          acceptedMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
      'ClaimWindowOpen',
    );

    for (const [owner, ownerToken, position] of [
      [userTwo, userTwoToken, userTwoPosition],
      [userOne, userOneToken, userOnePosition],
    ]) {
      await program.methods
        .claim()
        .accountsStrict({
          config,
          market,
          position,
          ownerToken,
          vault,
          acceptedMint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
    }

    assert.equal((await getAccount(provider.connection, vault)).amount, 1n);

    const settledMarket = await program.account.market.fetch(market);
    await waitUntilAfter(settledMarket.claimDeadline.toNumber());

    await expectFailure(
      program.methods
        .claim()
        .accountsStrict({
          config,
          market,
          position: userOnePosition,
          ownerToken: userOneToken,
          vault,
          acceptedMint: mint,
          owner: userOne.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([userOne])
        .rpc(),
      'ClaimWindowClosed',
    );

    await expectFailure(
      program.methods
        .sweepRemainder()
        .accountsStrict({
          config,
          market,
          vault,
          treasury: attackerToken,
          acceptedMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
      'InvalidTreasury',
    );

    await program.methods
      .sweepRemainder()
      .accountsStrict({
        config,
        market,
        vault,
        treasury,
        acceptedMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    assert.equal((await getAccount(provider.connection, vault)).amount, 0n);
    assert.equal(
      (await getAccount(provider.connection, treasury)).amount,
      treasuryBefore + 1n,
    );

    const closedMarket = await program.account.market.fetch(market);
    assert.deepEqual(closedMarket.status, { closed: {} });
    assert.equal(closedMarket.remainderSwept.toString(), '1');

    await expectFailure(
      program.methods
        .sweepRemainder()
        .accountsStrict({
          config,
          market,
          vault,
          treasury,
          acceptedMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
      'MarketNotSettled',
    );
  });
});
