exports.up = function(knex) {
  return knex.schema
    // Wallets table: stores merchant/user account balances
    .createTable('wallets', table => {
      table.increments('id').primary();
      table.bigInteger('user_id').notNullable().unique(); // Telegram user ID
      table.bigInteger('available_balance').defaultTo(0); // Centavos, unlocked funds
      table.bigInteger('pending_balance').defaultTo(0);   // Centavos, T+1 settlement pending
      table.timestamps(true, true);
      table.index('user_id');
    })
    // Transactions table: immutable ledger of all movements
    .createTable('transactions', table => {
      table.increments('id').primary();
      table.integer('wallet_id').notNullable().references('wallets.id');
      table.enum('type', [
        'CARD_DEPOSIT_PENDING',
        'QR_DEPOSIT_INSTANT',
        'WITHDRAWAL_OUT',
        'CARD_BALANCE_CLEARED',
        'REFUND'
      ]).notNullable();
      table.enum('status', ['PENDING', 'SUCCESS', 'FAILED']).defaultTo('PENDING');
      table.bigInteger('amount_centavos').notNullable();
      table.string('external_reference', 100); // Maya transaction ID or withdrawal reference
      table.text('metadata').nullable(); // JSON metadata for disputes/audits
      table.timestamps(true, true);
      table.index('wallet_id');
      table.index('status');
      table.index('created_at');
    })
    // Withdrawals table: tracks disbursement requests
    .createTable('withdrawals', table => {
      table.increments('id').primary();
      table.integer('wallet_id').notNullable().references('wallets.id');
      table.bigInteger('amount_centavos').notNullable();
      table.string('bank_code', 10).notNullable();
      table.string('account_number', 50).notNullable();
      table.string('account_name', 100).notNullable();
      table.string('reference_no', 50).notNullable().unique();
      table.enum('status', ['PENDING', 'SUCCESS', 'FAILED']).defaultTo('PENDING');
      table.text('error_reason').nullable();
      table.timestamps(true, true);
      table.index('wallet_id');
      table.index('status');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('withdrawals')
    .dropTableIfExists('transactions')
    .dropTableIfExists('wallets');
};
