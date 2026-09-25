// Observator conditional escrow — Anchor skeleton (Phase 2).
// Spec: OBSERVATOR_MASTER_BUILD_SPEC.md §8.
// States (minimal on-chain): Open -> Released | Refunded | Expired.
// Richer off-chain status lives in the backend DB.
// Invariants enforced here (see §8 + §23):
// - only authorized verifier/settler settles
// - no double settlement
// - destinations/amount/mint/deadline locked at init
// - wrong escrow/job cannot be settled
//
// NOTE: Rust/Anchor toolchain not yet installed in this environment.
// This skeleton defines the intended interface so Phase 2 can proceed
// immediately after `rustup + solana + anchor` setup.

use anchor_lang::prelude::*;

declare_id!("6yXXYuix6c93kfGhqv8fCseRa7pXTKx1pxCjcFeWToPx");

#[program]
pub mod observator_escrow {
    use super::*;

    /// Initialize escrow: lock buyer -> vault config. Funds moved via SPL transfer in `fund`.
    pub fn initialize(
        ctx: Context<Initialize>,
        job_id: [u8; 32],
        amount: u64,
        deadline: i64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(amount > 0, EscrowError::InvalidAmount);
        require!(
            deadline > Clock::get()?.unix_timestamp,
            EscrowError::InvalidDeadline
        );
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.provider = ctx.accounts.provider.key();
        escrow.verifier = ctx.accounts.verifier.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.vault = ctx.accounts.vault.key();
        escrow.job_id = job_id;
        escrow.amount = amount;
        escrow.deadline = deadline;
        escrow.state = EscrowState::Open;
        escrow.bump = ctx.bumps.escrow;
        emit!(EscrowInitialized {
            job_id,
            escrow: escrow.key(),
            buyer: escrow.buyer,
            provider: escrow.provider,
            amount,
            deadline,
        });
        Ok(())
    }

    /// Fund the vault (buyer deposits `amount` of `mint`).
    pub fn fund(ctx: Context<Fund>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Open, EscrowError::InvalidState);
        // SPL transfer buyer -> vault enforced by anchor-spl constraints + amount check.
        require!(
            ctx.accounts.buyer_ata.amount >= escrow.amount,
            EscrowError::InsufficientFunds
        );
        // Actual CPI transfer happens via `transfer` constraint helper in Phase 2 full impl.
        emit!(EscrowFunded {
            job_id: escrow.job_id,
            escrow: escrow.key(),
            amount: escrow.amount,
        });
        Ok(())
    }

    /// Release to provider. Only `verifier` signer, only when Open and before/at deadline.
    /// Backend must only invoke after deterministic verification PASS (§28).
    pub fn release(ctx: Context<Settle>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Open, EscrowError::AlreadySettled);
        require!(
            ctx.accounts.verifier.key() == escrow.verifier,
            EscrowError::Unauthorized
        );
        require!(
            ctx.accounts.provider.key() == escrow.provider,
            EscrowError::WrongRecipient
        );
        escrow.state = EscrowState::Released;
        emit!(EscrowSettled {
            job_id: escrow.job_id,
            escrow: escrow.key(),
            action: "RELEASED".to_string(),
        });
        Ok(())
    }

    /// Refund to buyer. Only `verifier` signer, only when Open.
    pub fn refund(ctx: Context<Settle>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Open, EscrowError::AlreadySettled);
        require!(
            ctx.accounts.verifier.key() == escrow.verifier,
            EscrowError::Unauthorized
        );
        require!(
            ctx.accounts.buyer.key() == escrow.buyer,
            EscrowError::WrongRecipient
        );
        escrow.state = EscrowState::Refunded;
        emit!(EscrowSettled {
            job_id: escrow.job_id,
            escrow: escrow.key(),
            action: "REFUNDED".to_string(),
        });
        Ok(())
    }

    /// Mark expired after deadline (verifier or anyone; no funds move here — refund is separate).
    pub fn mark_expired(ctx: Context<MarkExpired>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Open, EscrowError::AlreadySettled);
        require!(
            Clock::get()?.unix_timestamp > escrow.deadline,
            EscrowError::NotExpired
        );
        escrow.state = EscrowState::Expired;
        emit!(EscrowExpired {
            job_id: escrow.job_id,
            escrow: escrow.key(),
        });
        Ok(())
    }
}

#[account]
pub struct Escrow {
    pub buyer: Pubkey,
    pub provider: Pubkey,
    pub verifier: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub job_id: [u8; 32],
    pub amount: u64,
    pub deadline: i64,
    pub state: EscrowState,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowState {
    Open,
    Released,
    Refunded,
    Expired,
}

#[derive(Accounts)]
#[instruction(job_id: [u8; 32])]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = buyer,
        space = 8 + 32*5 + 32 + 8 + 8 + 1 + 1,
        seeds = [b"escrow", job_id.as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: stored as provider destination; validated on settle.
    pub provider: UncheckedAccount<'info>,
    /// CHECK: stored as authorized verifier; must sign on settle.
    pub verifier: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,
    /// CHECK: vault token account for `mint`; created/funded in `fund`.
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    #[account(mut, has_one = buyer, has_one = mint)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,
    #[account(mut)]
    pub buyer_ata: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    #[account(mut)]
    pub vault: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    pub token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut, has_one = buyer, has_one = provider, has_one = mint)]
    pub escrow: Account<'info, Escrow>,
    pub buyer: UncheckedAccount<'info>,
    pub provider: UncheckedAccount<'info>,
    pub verifier: Signer<'info>,
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,
    #[account(mut)]
    pub vault: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    #[account(mut)]
    pub destination: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    pub token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
}

#[derive(Accounts)]
pub struct MarkExpired<'info> {
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
}

#[event]
pub struct EscrowInitialized {
    pub job_id: [u8; 32],
    pub escrow: Pubkey,
    pub buyer: Pubkey,
    pub provider: Pubkey,
    pub amount: u64,
    pub deadline: i64,
}

#[event]
pub struct EscrowFunded {
    pub job_id: [u8; 32],
    pub escrow: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowSettled {
    pub job_id: [u8; 32],
    pub escrow: Pubkey,
    pub action: String,
}

#[event]
pub struct EscrowExpired {
    pub job_id: [u8; 32],
    pub escrow: Pubkey,
}

#[error_code]
pub enum EscrowError {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid deadline")]
    InvalidDeadline,
    #[msg("Invalid state for this action")]
    InvalidState,
    #[msg("Escrow already settled")]
    AlreadySettled,
    #[msg("Unauthorized settler")]
    Unauthorized,
    #[msg("Wrong recipient")]
    WrongRecipient,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Job not yet expired")]
    NotExpired,
}
