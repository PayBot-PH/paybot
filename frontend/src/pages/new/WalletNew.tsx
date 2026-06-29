import React from 'react';
import { Layout, Card, Header } from '../../design-system';

export default function WalletNew() {
  return (
    <Layout>
      <Header title="Wallet" subtitle="Account balances and quick actions" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-sm text-muted-foreground">Available Balance</h3>
          <div className="text-3xl font-extrabold mt-3">₱ 12,750.00</div>
          <div className="mt-4 flex gap-3">
            <button className="px-4 py-2 rounded-xl bg-[hsl(var(--brand-blue-500))] text-white font-semibold">Top up</button>
            <button className="px-4 py-2 rounded-xl bg-muted text-muted-foreground">Withdraw</button>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm text-muted-foreground">Recent Activity</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>+₱5,000 — inv-002 — 2026-06-20</li>
            <li>-₱2,000 — disb-010 — 2026-06-18</li>
          </ul>
        </Card>
      </div>
    </Layout>
  );
}
