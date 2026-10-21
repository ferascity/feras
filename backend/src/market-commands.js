class ManualReviewSigner {
  async submit(command) {
    return {
      status: 'AWAITING_SIGNATURE',
      error: `Manual Devnet review required for ${command.command_type}; no authority key is stored by this service.`,
    };
  }
}

class MarketCommandWorker {
  constructor({ repository, signer = new ManualReviewSigner(), logger = console }) {
    this.repository = repository;
    this.signer = signer;
    this.logger = logger;
  }

  async runOnce() {
    const command = await this.repository.claimNextMarketCommand();
    if (!command) return false;
    try {
      const result = await this.signer.submit(command);
      await this.repository.updateMarketCommand(command.id, result.status, result);
    } catch (error) {
      this.logger.error('market command failed', { id: command.id, error: error.message });
      await this.repository.updateMarketCommand(command.id, 'FAILED', { error: error.message });
    }
    return true;
  }
}

module.exports = { ManualReviewSigner, MarketCommandWorker };
