import React from 'react';
import { Layout, Card, Header } from '../../design-system';

export default function DashboardNew() {
  return (
    <Layout>
      <Header title="Dashboard" subtitle="Overview of recent activity" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <h2 className="text-sm font-semibold text-muted-foreground">Total Revenue</h2>
          <div className="text-2xl font-extrabold mt-2">₱ 1,234,567</div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-muted-foreground">Transactions</h2>
          <div className="text-2xl font-extrabold mt-2">4,321</div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-muted-foreground">Active Merchants</h2>
          <div className="text-2xl font-extrabold mt-2">128</div>
        </Card>
      </div>

      <div className="mt-8">
          <Card>
          <h2 className="font-bold text-lg mb-3">Recent Transactions</h2>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2026-06-25</td>
                <td>inv-001</td>
                <td className="text-right font-bold">₱ 5,000</td>
              </tr>
              <tr>
                <td>2026-06-24</td>
                <td>qr-021</td>
                <td className="text-right font-bold">₱ 350</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>
    </Layout>
  );
}
