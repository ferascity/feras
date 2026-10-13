use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
};

declare_id!("3UJi7D53Cbj5TLGbbxFCzqW9vE7Ji5N5KKEdbQMWFaFA");

const CONFIG_SEED: &[u8] = b"config";
const MARKET_SEED: &[u8] = b"market";
const POSITION_SEED: &[u8] = b"position";
const MAX_FEE_BASIS_POINTS: u16 = 1_000;
const BASIS_POINTS_DENOMINATOR: u128 = 10_000;
const USDC_DECIMALS: u8 = 6;
const MAX_CLAIM_WINDOW_SECONDS: i64 = 180 * 24 * 60 * 60;

#[program]
pub mod feras_market {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        settlement_authority: Pubkey,
        treasury_authority: Pubkey,
        fee_basis_points: u16,
        claim_window_seconds: i64,
    ) -> Result<()> {
        require!(
            fee_basis_points <= MAX_FEE_BASIS_POINTS,
            MarketError::FeeTooHigh
        );
        validate_authority_set(
            ctx.accounts.authority.key(),
            settlement_authority,
            treasury_authority,
        )?;
        require_eq!(
            ctx.accounts.accepted_mint.decimals,
            USDC_DECIMALS,
            MarketError::InvalidMintDecimals
        );
        validate_claim_window(claim_window_seconds)?;

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.pending_authority = Pubkey::default();
        config.settlement_authority = settlement_authority;
        config.treasury_authority = treasury_authority;
        config.accepted_mint = ctx.accounts.accepted_mint.key();
        config.treasury = ctx.accounts.treasury.key();
        config.fee_basis_points = fee_basis_points;
        config.claim_window_seconds = claim_window_seconds;
        config.paused = false;
        config.bump = ctx.bumps.config;
        config.market_count = 0;
        Ok(())
    }

    pub fn propose_authority(ctx: Context<ManageConfig>, new_authority: Pubkey) -> Result<()> {
        validate_authority_set(
            new_authority,
            ctx.accounts.config.settlement_authority,
            ctx.accounts.config.treasury_authority,
        )?;
        require_keys_neq!(
            new_authority,
            ctx.accounts.config.authority,
            MarketError::InvalidAuthority
        );

        ctx.accounts.config.pending_authority = new_authority;
        emit!(AuthorityTransferProposed {
            current_authority: ctx.accounts.authority.key(),
            pending_authority: new_authority,
        });
        Ok(())
    }

    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        let previous_authority = ctx.accounts.config.authority;
        let new_authority = ctx.accounts.pending_authority.key();
        ctx.accounts.config.authority = new_authority;
        ctx.accounts.config.pending_authority = Pubkey::default();
        emit!(PlatformAuthorityChanged {
            previous_authority,
            new_authority,
        });
        Ok(())
    }

    pub fn update_settlement_authority(
        ctx: Context<ManageConfig>,
        new_settlement_authority: Pubkey,
    ) -> Result<()> {
        validate_authority_set(
            ctx.accounts.config.authority,
            new_settlement_authority,
            ctx.accounts.config.treasury_authority,
        )?;
        let previous_authority = ctx.accounts.config.settlement_authority;
        ctx.accounts.config.settlement_authority = new_settlement_authority;
        emit!(SettlementAuthorityChanged {
            previous_authority,
            new_authority: new_settlement_authority,
        });
        Ok(())
    }

    pub fn update_treasury(
        ctx: Context<UpdateTreasury>,
        new_treasury_authority: Pubkey,
    ) -> Result<()> {
        validate_authority_set(
            ctx.accounts.config.authority,
            ctx.accounts.config.settlement_authority,
            new_treasury_authority,
        )?;
        let previous_treasury = ctx.accounts.config.treasury;
        let previous_authority = ctx.accounts.config.treasury_authority;
        ctx.accounts.config.treasury = ctx.accounts.new_treasury.key();
        ctx.accounts.config.treasury_authority = new_treasury_authority;
        emit!(TreasuryChanged {
            previous_treasury,
            new_treasury: ctx.accounts.new_treasury.key(),
            previous_authority,
            new_authority: new_treasury_authority,
        });
        Ok(())
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        match_id_hash: [u8; 32],
        lock_time: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(lock_time > now, MarketError::InvalidLockTime);
        require!(!ctx.accounts.config.paused, MarketError::PlatformPaused);

        let market = &mut ctx.accounts.market;
        market.config = ctx.accounts.config.key();
        market.match_id_hash = match_id_hash;
        market.creator = ctx.accounts.authority.key();
        market.vault = ctx.accounts.vault.key();
        market.lock_time = lock_time;
        market.status = MarketStatus::Open;
        market.result = None;
        market.pool_totals = [0; 3];
        market.total_pool = 0;
        market.settled_slot = 0;
        market.transcript_hash = [0; 32];
        market.fee_amount = 0;
        market.claimed_total = 0;
        market.claim_deadline = 0;
        market.remainder_swept = 0;
        market.bump = ctx.bumps.market;

        ctx.accounts.config.market_count = ctx
            .accounts
            .config
            .market_count
            .checked_add(1)
            .ok_or(MarketError::ArithmeticOverflow)?;

        emit!(MarketCreated {
            market: market.key(),
            match_id_hash,
            lock_time,
        });
        Ok(())
    }

    pub fn place_position(
        ctx: Context<PlacePosition>,
        outcome: MarketOutcome,
        amount: u64,
        client_nonce: u64,
    ) -> Result<()> {
        require!(amount > 0, MarketError::InvalidAmount);
        require!(!ctx.accounts.config.paused, MarketError::PlatformPaused);
        require!(
            ctx.accounts.market.status == MarketStatus::Open,
            MarketError::MarketNotOpen
        );
        require!(
            Clock::get()?.unix_timestamp < ctx.accounts.market.lock_time,
            MarketError::MarketLocked
        );

        let outcome_index = outcome.index();
        let next_outcome_total = ctx.accounts.market.pool_totals[outcome_index]
            .checked_add(amount)
            .ok_or(MarketError::ArithmeticOverflow)?;
        let next_total_pool = ctx
            .accounts
            .market
            .total_pool
            .checked_add(amount)
            .ok_or(MarketError::ArithmeticOverflow)?;

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.owner_token.to_account_info(),
            mint: ctx.accounts.accepted_mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
            amount,
            ctx.accounts.accepted_mint.decimals,
        )?;

        let market = &mut ctx.accounts.market;
        market.pool_totals[outcome_index] = next_outcome_total;
        market.total_pool = next_total_pool;

        let position = &mut ctx.accounts.position;
        position.market = market.key();
        position.owner = ctx.accounts.owner.key();
        position.outcome = outcome;
        position.amount = amount;
        position.client_nonce = client_nonce;
        position.claimed = false;
        position.refunded = false;
        position.bump = ctx.bumps.position;

        emit!(PositionPlaced {
            market: market.key(),
            position: position.key(),
            owner: position.owner,
            outcome,
            amount,
            client_nonce,
        });
        Ok(())
    }

    pub fn lock_market(ctx: Context<AdminMarket>) -> Result<()> {
        require!(
            ctx.accounts.market.status == MarketStatus::Open,
            MarketError::MarketNotOpen
        );
        ctx.accounts.market.status = MarketStatus::Locked;
        emit!(MarketLocked {
            market: ctx.accounts.market.key(),
        });
        Ok(())
    }

    pub fn settle_market(
        ctx: Context<SettleMarket>,
        result: MarketOutcome,
        transcript_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.market.status == MarketStatus::Locked,
            MarketError::MarketNotLocked
        );
        require!(
            transcript_hash != [0; 32],
            MarketError::InvalidTranscriptHash
        );
        require!(
            ctx.accounts.market.pool_totals[result.index()] > 0,
            MarketError::NoWinningPool
        );

        let fee_amount = calculate_fee(
            ctx.accounts.market.total_pool,
            ctx.accounts.config.fee_basis_points,
        )?;
        if fee_amount > 0 {
            transfer_from_vault(
                &ctx.accounts.market,
                &ctx.accounts.vault,
                &ctx.accounts.treasury,
                &ctx.accounts.accepted_mint,
                &ctx.accounts.token_program,
                fee_amount,
            )?;
        }

        let market = &mut ctx.accounts.market;
        market.status = MarketStatus::Settled;
        market.result = Some(result);
        market.transcript_hash = transcript_hash;
        let clock = Clock::get()?;
        market.settled_slot = clock.slot;
        market.claim_deadline = clock
            .unix_timestamp
            .checked_add(ctx.accounts.config.claim_window_seconds)
            .ok_or(MarketError::ArithmeticOverflow)?;
        market.fee_amount = fee_amount;

        emit!(MarketSettled {
            market: market.key(),
            result,
            transcript_hash,
            fee_amount,
            claim_deadline: market.claim_deadline,
        });
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        require!(
            ctx.accounts.market.status == MarketStatus::Settled,
            MarketError::MarketNotSettled
        );
        require!(
            Clock::get()?.unix_timestamp <= ctx.accounts.market.claim_deadline,
            MarketError::ClaimWindowClosed
        );
        require!(!ctx.accounts.position.claimed, MarketError::AlreadyClaimed);
        require!(
            !ctx.accounts.position.refunded,
            MarketError::AlreadyRefunded
        );

        let result = ctx
            .accounts
            .market
            .result
            .ok_or(MarketError::ResultMissing)?;
        require!(
            ctx.accounts.position.outcome == result,
            MarketError::PositionDidNotWin
        );

        let net_pool = ctx
            .accounts
            .market
            .total_pool
            .checked_sub(ctx.accounts.market.fee_amount)
            .ok_or(MarketError::ArithmeticOverflow)?;
        let winning_pool = ctx.accounts.market.pool_totals[result.index()];
        let payout = calculate_payout(ctx.accounts.position.amount, net_pool, winning_pool)?;

        transfer_from_vault(
            &ctx.accounts.market,
            &ctx.accounts.vault,
            &ctx.accounts.owner_token,
            &ctx.accounts.accepted_mint,
            &ctx.accounts.token_program,
            payout,
        )?;

        ctx.accounts.position.claimed = true;
        ctx.accounts.market.claimed_total = ctx
            .accounts
            .market
            .claimed_total
            .checked_add(payout)
            .ok_or(MarketError::ArithmeticOverflow)?;

        emit!(ClaimPaid {
            market: ctx.accounts.market.key(),
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.owner.key(),
            amount: payout,
        });
        Ok(())
    }

    pub fn cancel_market(ctx: Context<AdminMarket>) -> Result<()> {
        require!(
            matches!(
                ctx.accounts.market.status,
                MarketStatus::Open | MarketStatus::Locked
            ),
            MarketError::MarketCannotCancel
        );
        ctx.accounts.market.status = MarketStatus::Cancelled;
        emit!(MarketCancelled {
            market: ctx.accounts.market.key(),
        });
        Ok(())
    }

    pub fn claim_refund(ctx: Context<Claim>) -> Result<()> {
        require!(
            ctx.accounts.market.status == MarketStatus::Cancelled,
            MarketError::MarketNotCancelled
        );
        require!(!ctx.accounts.position.claimed, MarketError::AlreadyClaimed);
        require!(
            !ctx.accounts.position.refunded,
            MarketError::AlreadyRefunded
        );

        transfer_from_vault(
            &ctx.accounts.market,
            &ctx.accounts.vault,
            &ctx.accounts.owner_token,
            &ctx.accounts.accepted_mint,
            &ctx.accounts.token_program,
            ctx.accounts.position.amount,
        )?;

        ctx.accounts.position.refunded = true;
        emit!(RefundPaid {
            market: ctx.accounts.market.key(),
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.owner.key(),
            amount: ctx.accounts.position.amount,
        });
        Ok(())
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        emit!(PauseChanged { paused });
        Ok(())
    }

    pub fn sweep_remainder(ctx: Context<SweepRemainder>) -> Result<()> {
        require!(
            ctx.accounts.market.status == MarketStatus::Settled,
            MarketError::MarketNotSettled
        );
        require!(
            Clock::get()?.unix_timestamp > ctx.accounts.market.claim_deadline,
            MarketError::ClaimWindowOpen
        );

        let remainder = ctx.accounts.vault.amount;
        if remainder > 0 {
            transfer_from_vault(
                &ctx.accounts.market,
                &ctx.accounts.vault,
                &ctx.accounts.treasury,
                &ctx.accounts.accepted_mint,
                &ctx.accounts.token_program,
                remainder,
            )?;
        }

        let market = &mut ctx.accounts.market;
        market.status = MarketStatus::Closed;
        market.remainder_swept = remainder;

        emit!(RemainderSwept {
            market: market.key(),
            amount: remainder,
        });
        Ok(())
    }
}

fn transfer_from_vault<'info>(
    market: &Account<'info, Market>,
    vault: &Account<'info, TokenAccount>,
    destination: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    let bump = [market.bump];
    let signer_seeds: &[&[u8]] = &[MARKET_SEED, market.match_id_hash.as_ref(), bump.as_ref()];
    let signer = &[signer_seeds];
    let cpi_accounts = TransferChecked {
        from: vault.to_account_info(),
        mint: mint.to_account_info(),
        to: destination.to_account_info(),
        authority: market.to_account_info(),
    };
    token::transfer_checked(
        CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signer),
        amount,
        mint.decimals,
    )
}

pub fn calculate_fee(total_pool: u64, fee_basis_points: u16) -> Result<u64> {
    require!(
        fee_basis_points <= MAX_FEE_BASIS_POINTS,
        MarketError::FeeTooHigh
    );
    let fee = (total_pool as u128)
        .checked_mul(fee_basis_points as u128)
        .ok_or(MarketError::ArithmeticOverflow)?
        .checked_div(BASIS_POINTS_DENOMINATOR)
        .ok_or(MarketError::ArithmeticOverflow)?;
    u64::try_from(fee).map_err(|_| error!(MarketError::ArithmeticOverflow))
}

pub fn validate_claim_window(claim_window_seconds: i64) -> Result<()> {
    require!(
        claim_window_seconds > 0 && claim_window_seconds <= MAX_CLAIM_WINDOW_SECONDS,
        MarketError::InvalidClaimWindow
    );
    Ok(())
}

pub fn validate_authority_set(
    platform_authority: Pubkey,
    settlement_authority: Pubkey,
    treasury_authority: Pubkey,
) -> Result<()> {
    let default = Pubkey::default();
    require!(
        platform_authority != default
            && settlement_authority != default
            && treasury_authority != default
            && platform_authority != settlement_authority
            && platform_authority != treasury_authority
            && settlement_authority != treasury_authority,
        MarketError::AuthoritiesNotSeparated
    );
    Ok(())
}

pub fn calculate_payout(stake: u64, net_pool: u64, winning_pool: u64) -> Result<u64> {
    require!(stake > 0, MarketError::InvalidAmount);
    require!(winning_pool > 0, MarketError::NoWinningPool);
    require!(stake <= winning_pool, MarketError::InvalidWinningStake);

    let payout = (stake as u128)
        .checked_mul(net_pool as u128)
        .ok_or(MarketError::ArithmeticOverflow)?
        .checked_div(winning_pool as u128)
        .ok_or(MarketError::ArithmeticOverflow)?;
    u64::try_from(payout).map_err(|_| error!(MarketError::ArithmeticOverflow))
}

#[derive(Accounts)]
#[instruction(settlement_authority: Pubkey, treasury_authority: Pubkey)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PlatformConfig::LEN,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub accepted_mint: Account<'info, Mint>,
    #[account(
        token::mint = accepted_mint,
        constraint = treasury.owner == treasury_authority @ MarketError::InvalidTreasury
    )]
    pub treasury: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageConfig<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ MarketError::InvalidAuthority
    )]
    pub config: Account<'info, PlatformConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = pending_authority @ MarketError::InvalidAuthority
    )]
    pub config: Account<'info, PlatformConfig>,
    pub pending_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(new_treasury_authority: Pubkey)]
pub struct UpdateTreasury<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ MarketError::InvalidAuthority
    )]
    pub config: Account<'info, PlatformConfig>,
    #[account(address = config.accepted_mint @ MarketError::InvalidMint)]
    pub accepted_mint: Account<'info, Mint>,
    #[account(
        token::mint = accepted_mint,
        constraint = new_treasury.owner == new_treasury_authority @ MarketError::InvalidTreasury
    )]
    pub new_treasury: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(match_id_hash: [u8; 32])]
pub struct CreateMarket<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ MarketError::InvalidAuthority
    )]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + Market::LEN,
        seeds = [MARKET_SEED, match_id_hash.as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = accepted_mint,
        associated_token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(address = config.accepted_mint @ MarketError::InvalidMint)]
    pub accepted_mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome: MarketOutcome, amount: u64, client_nonce: u64)]
pub struct PlacePosition<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        mut,
        has_one = config @ MarketError::InvalidConfig,
        has_one = vault @ MarketError::InvalidVault,
        seeds = [MARKET_SEED, market.match_id_hash.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = owner,
        space = 8 + Position::LEN,
        seeds = [
            POSITION_SEED,
            market.key().as_ref(),
            owner.key().as_ref(),
            client_nonce.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = owner
    )]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = market.vault @ MarketError::InvalidVault,
        token::mint = accepted_mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(address = config.accepted_mint @ MarketError::InvalidMint)]
    pub accepted_mint: Account<'info, Mint>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminMarket<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ MarketError::InvalidAuthority
    )]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        mut,
        has_one = config @ MarketError::InvalidConfig,
        seeds = [MARKET_SEED, market.match_id_hash.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = settlement_authority @ MarketError::InvalidSettlementAuthority,
        has_one = treasury @ MarketError::InvalidTreasury
    )]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        mut,
        has_one = config @ MarketError::InvalidConfig,
        has_one = vault @ MarketError::InvalidVault,
        seeds = [MARKET_SEED, market.match_id_hash.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        address = market.vault @ MarketError::InvalidVault,
        token::mint = accepted_mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = config.treasury @ MarketError::InvalidTreasury,
        token::mint = accepted_mint
    )]
    pub treasury: Account<'info, TokenAccount>,
    #[account(address = config.accepted_mint @ MarketError::InvalidMint)]
    pub accepted_mint: Account<'info, Mint>,
    pub settlement_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        mut,
        has_one = config @ MarketError::InvalidConfig,
        has_one = vault @ MarketError::InvalidVault,
        seeds = [MARKET_SEED, market.match_id_hash.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = market @ MarketError::InvalidMarket,
        has_one = owner @ MarketError::InvalidOwner,
        seeds = [
            POSITION_SEED,
            market.key().as_ref(),
            owner.key().as_ref(),
            position.client_nonce.to_le_bytes().as_ref()
        ],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = owner
    )]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = market.vault @ MarketError::InvalidVault,
        token::mint = accepted_mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(address = config.accepted_mint @ MarketError::InvalidMint)]
    pub accepted_mint: Account<'info, Mint>,
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ MarketError::InvalidAuthority
    )]
    pub config: Account<'info, PlatformConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SweepRemainder<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = treasury @ MarketError::InvalidTreasury
    )]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        mut,
        has_one = config @ MarketError::InvalidConfig,
        has_one = vault @ MarketError::InvalidVault,
        seeds = [MARKET_SEED, market.match_id_hash.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        address = market.vault @ MarketError::InvalidVault,
        token::mint = accepted_mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = config.treasury @ MarketError::InvalidTreasury,
        token::mint = accepted_mint
    )]
    pub treasury: Account<'info, TokenAccount>,
    #[account(address = config.accepted_mint @ MarketError::InvalidMint)]
    pub accepted_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct PlatformConfig {
    pub authority: Pubkey,
    pub pending_authority: Pubkey,
    pub settlement_authority: Pubkey,
    pub treasury_authority: Pubkey,
    pub accepted_mint: Pubkey,
    pub treasury: Pubkey,
    pub fee_basis_points: u16,
    pub claim_window_seconds: i64,
    pub paused: bool,
    pub bump: u8,
    pub market_count: u64,
}

impl PlatformConfig {
    pub const LEN: usize = 224;
}

#[account]
pub struct Market {
    pub config: Pubkey,
    pub match_id_hash: [u8; 32],
    pub creator: Pubkey,
    pub vault: Pubkey,
    pub lock_time: i64,
    pub status: MarketStatus,
    pub result: Option<MarketOutcome>,
    pub pool_totals: [u64; 3],
    pub total_pool: u64,
    pub settled_slot: u64,
    pub transcript_hash: [u8; 32],
    pub fee_amount: u64,
    pub claimed_total: u64,
    pub claim_deadline: i64,
    pub remainder_swept: u64,
    pub bump: u8,
}

impl Market {
    pub const LEN: usize = 256;
}

#[account]
pub struct Position {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub outcome: MarketOutcome,
    pub amount: u64,
    pub client_nonce: u64,
    pub claimed: bool,
    pub refunded: bool,
    pub bump: u8,
}

impl Position {
    pub const LEN: usize = 112;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum MarketOutcome {
    White,
    Draw,
    Black,
}

impl MarketOutcome {
    pub fn index(self) -> usize {
        match self {
            Self::White => 0,
            Self::Draw => 1,
            Self::Black => 2,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum MarketStatus {
    Open,
    Locked,
    Settled,
    Cancelled,
    Closed,
}

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub match_id_hash: [u8; 32],
    pub lock_time: i64,
}

#[event]
pub struct PositionPlaced {
    pub market: Pubkey,
    pub position: Pubkey,
    pub owner: Pubkey,
    pub outcome: MarketOutcome,
    pub amount: u64,
    pub client_nonce: u64,
}

#[event]
pub struct MarketLocked {
    pub market: Pubkey,
}

#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub result: MarketOutcome,
    pub transcript_hash: [u8; 32],
    pub fee_amount: u64,
    pub claim_deadline: i64,
}

#[event]
pub struct ClaimPaid {
    pub market: Pubkey,
    pub position: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RefundPaid {
    pub market: Pubkey,
    pub position: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MarketCancelled {
    pub market: Pubkey,
}

#[event]
pub struct PauseChanged {
    pub paused: bool,
}

#[event]
pub struct AuthorityTransferProposed {
    pub current_authority: Pubkey,
    pub pending_authority: Pubkey,
}

#[event]
pub struct PlatformAuthorityChanged {
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct SettlementAuthorityChanged {
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct TreasuryChanged {
    pub previous_treasury: Pubkey,
    pub new_treasury: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct RemainderSwept {
    pub market: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum MarketError {
    #[msg("The platform is paused")]
    PlatformPaused,
    #[msg("The configured fee exceeds the 10% safety cap")]
    FeeTooHigh,
    #[msg("The authority is invalid")]
    InvalidAuthority,
    #[msg("Platform, settlement, and treasury authorities must be nonzero and distinct")]
    AuthoritiesNotSeparated,
    #[msg("The settlement authority is invalid")]
    InvalidSettlementAuthority,
    #[msg("The treasury token account is invalid")]
    InvalidTreasury,
    #[msg("The accepted mint is invalid")]
    InvalidMint,
    #[msg("The accepted mint must use six decimal places")]
    InvalidMintDecimals,
    #[msg("The claim window must be between one second and 180 days")]
    InvalidClaimWindow,
    #[msg("The platform configuration is invalid")]
    InvalidConfig,
    #[msg("The market is invalid")]
    InvalidMarket,
    #[msg("The market vault is invalid")]
    InvalidVault,
    #[msg("The position owner is invalid")]
    InvalidOwner,
    #[msg("The lock time must be in the future")]
    InvalidLockTime,
    #[msg("The position amount must be greater than zero")]
    InvalidAmount,
    #[msg("The market is not open")]
    MarketNotOpen,
    #[msg("The market is locked")]
    MarketLocked,
    #[msg("The market is not locked")]
    MarketNotLocked,
    #[msg("The market is not settled")]
    MarketNotSettled,
    #[msg("The market cannot be cancelled in its current state")]
    MarketCannotCancel,
    #[msg("The market is not cancelled")]
    MarketNotCancelled,
    #[msg("The transcript hash cannot be empty")]
    InvalidTranscriptHash,
    #[msg("The winning outcome has no positions")]
    NoWinningPool,
    #[msg("The winning stake is inconsistent with the winning pool")]
    InvalidWinningStake,
    #[msg("The settlement result is missing")]
    ResultMissing,
    #[msg("This position did not win")]
    PositionDidNotWin,
    #[msg("This position has already claimed")]
    AlreadyClaimed,
    #[msg("This position has already been refunded")]
    AlreadyRefunded,
    #[msg("The claim window has closed")]
    ClaimWindowClosed,
    #[msg("The claim window is still open")]
    ClaimWindowOpen,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    struct DeterministicRng(u64);

    impl DeterministicRng {
        fn next(&mut self) -> u64 {
            self.0 = self
                .0
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            self.0
        }

        fn below(&mut self, upper: u64) -> u64 {
            self.next() % upper
        }

        fn shuffle(&mut self, values: &mut [usize]) {
            for index in (1..values.len()).rev() {
                let swap_with = self.below((index + 1) as u64) as usize;
                values.swap(index, swap_with);
            }
        }
    }

    fn payout_sum(stakes: &[u64], order: &[usize], net_pool: u64) -> u64 {
        let winning_pool = stakes
            .iter()
            .try_fold(0_u64, |total, stake| total.checked_add(*stake));
        let winning_pool = winning_pool.unwrap();

        order.iter().fold(0_u64, |total, index| {
            total
                .checked_add(calculate_payout(stakes[*index], net_pool, winning_pool).unwrap())
                .unwrap()
        })
    }

    #[test]
    fn fee_rounds_down_in_token_base_units() {
        assert_eq!(calculate_fee(1_000_001, 250).unwrap(), 25_000);
    }

    #[test]
    fn fee_cap_is_enforced() {
        assert!(calculate_fee(1_000_000, 1_001).is_err());
    }

    #[test]
    fn pari_mutuel_payout_is_proportional() {
        let net_pool = 975_000;
        assert_eq!(
            calculate_payout(100_000, net_pool, 300_000).unwrap(),
            325_000
        );
        assert_eq!(
            calculate_payout(200_000, net_pool, 300_000).unwrap(),
            650_000
        );
    }

    #[test]
    fn aggregate_payouts_never_exceed_net_pool() {
        for total_pool in [1_u64, 10, 1_000, 1_000_003, u32::MAX as u64] {
            for fee_bps in [0_u16, 1, 250, 1_000] {
                let fee = calculate_fee(total_pool, fee_bps).unwrap();
                let net_pool = total_pool - fee;
                for winning_pool in 1..=total_pool.min(64) {
                    let mut paid = 0_u64;
                    for _ in 0..winning_pool {
                        paid = paid
                            .checked_add(calculate_payout(1, net_pool, winning_pool).unwrap())
                            .unwrap();
                    }
                    assert!(paid <= net_pool);
                }
            }
        }
    }

    #[test]
    fn rejects_zero_and_impossible_winning_stakes() {
        assert!(calculate_payout(0, 100, 100).is_err());
        assert!(calculate_payout(101, 100, 100).is_err());
        assert!(calculate_payout(1, 100, 0).is_err());
    }

    #[test]
    fn claim_window_bounds_are_enforced() {
        assert!(validate_claim_window(0).is_err());
        assert!(validate_claim_window(-1).is_err());
        assert!(validate_claim_window(1).is_ok());
        assert!(validate_claim_window(MAX_CLAIM_WINDOW_SECONDS).is_ok());
        assert!(validate_claim_window(MAX_CLAIM_WINDOW_SECONDS + 1).is_err());
    }

    #[test]
    fn authority_roles_must_be_nonzero_and_distinct() {
        let platform = Pubkey::new_unique();
        let settlement = Pubkey::new_unique();
        let treasury = Pubkey::new_unique();

        assert!(validate_authority_set(platform, settlement, treasury).is_ok());
        assert!(validate_authority_set(Pubkey::default(), settlement, treasury).is_err());
        assert!(validate_authority_set(platform, platform, treasury).is_err());
        assert!(validate_authority_set(platform, settlement, settlement).is_err());
        assert!(validate_authority_set(platform, treasury, treasury).is_err());
    }

    #[test]
    fn claim_order_does_not_change_rounding_remainder() {
        let stakes = [1_u64, 2];
        let net_pool = 5_u64;
        let winning_pool = 3_u64;

        for order in [[0_usize, 1], [1_usize, 0]] {
            let paid = order.into_iter().try_fold(0_u64, |total, index| {
                total
                    .checked_add(calculate_payout(stakes[index], net_pool, winning_pool)?)
                    .ok_or_else(|| error!(MarketError::ArithmeticOverflow))
            });
            let paid = paid.unwrap();
            assert_eq!(paid, 4);
            assert_eq!(net_pool - paid, 1);
        }
    }

    #[test]
    fn generated_pools_remain_solvent_for_arbitrary_claim_orders() {
        let mut rng = DeterministicRng(0x4645_5241_535f_4d4b);

        for _ in 0..5_000 {
            let winner_count = (rng.below(64) + 1) as usize;
            let stakes: Vec<u64> = (0..winner_count)
                .map(|_| rng.below(1_000_000_000_000) + 1)
                .collect();
            let winning_pool = stakes.iter().copied().sum::<u64>();
            let losing_pool = rng.below(1_000_000_000_000_000);
            let total_pool = winning_pool.checked_add(losing_pool).unwrap();
            let fee_basis_points = rng.below((MAX_FEE_BASIS_POINTS + 1) as u64) as u16;
            let net_pool = total_pool - calculate_fee(total_pool, fee_basis_points).unwrap();

            let natural: Vec<usize> = (0..winner_count).collect();
            let mut reverse = natural.clone();
            reverse.reverse();
            let mut shuffled = natural.clone();
            rng.shuffle(&mut shuffled);

            let expected_paid = payout_sum(&stakes, &natural, net_pool);
            assert_eq!(payout_sum(&stakes, &reverse, net_pool), expected_paid);
            assert_eq!(payout_sum(&stakes, &shuffled, net_pool), expected_paid);
            assert!(expected_paid <= net_pool);
            assert!(net_pool - expected_paid < winner_count as u64);
        }
    }

    #[test]
    fn payout_math_handles_near_u64_limits() {
        let stakes = [u64::MAX / 3, u64::MAX / 3, u64::MAX - 2 * (u64::MAX / 3)];
        let orders = [[0_usize, 1, 2], [2_usize, 0, 1], [1_usize, 2, 0]];

        let expected_paid = payout_sum(&stakes, &orders[0], u64::MAX);
        for order in orders {
            assert_eq!(payout_sum(&stakes, &order, u64::MAX), expected_paid);
        }
        assert!(expected_paid <= u64::MAX);
        assert!(u64::MAX - expected_paid < stakes.len() as u64);
    }
}
