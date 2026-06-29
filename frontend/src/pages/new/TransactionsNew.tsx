import React from 'react';
import { Layout, Card, Header } from '../../design-system';

export default function TransactionsNew() {
  return (
    <Layout>
      <Header title="Transactions" subtitle="All payments and settlements" />

      <Card>
        <table className="modern-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Reference</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2026-06-25</td>
              <td>Invoice</td>
              <td>inv-001</td>
              <td className="text-right">₱ 5,000</td>
            </tr>
            <tr>
              <td>2026-06-24</td>
              <td>QR</td>
              <td>qr-021</td>
              <td className="text-right">₱ 350</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </Layout>
  );
}
