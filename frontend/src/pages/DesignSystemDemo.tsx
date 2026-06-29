import React from 'react';
import { Button, Card, Container, Header } from '../design-system';

export default function DesignSystemDemo() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[rgba(243,246,255,0.6)] to-transparent py-12">
      <Container>
        <Header title="Design System — Demo" subtitle="A minimal, modern fintech UI" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="col-span-2">
            <h2 className="text-xl font-bold mb-2">Welcome to the new design</h2>
            <p className="text-muted-foreground mb-4">This scaffold includes tokens, buttons, cards and a layout. Build from here.</p>
            <div className="flex gap-3">
              <Button variant="primary">Primary Action</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </Card>

          <Card>
            <h3 className="font-bold text-lg mb-2">Quick Stats</h3>
            <dl className="grid gap-2">
              <div className="flex justify-between"><dt className="text-sm text-muted-foreground">Revenue</dt><dd className="font-extrabold">₱128,430</dd></div>
              <div className="flex justify-between"><dt className="text-sm text-muted-foreground">Transactions</dt><dd className="font-extrabold">1,234</dd></div>
              <div className="flex justify-between"><dt className="text-sm text-muted-foreground">Active Users</dt><dd className="font-extrabold">342</dd></div>
            </dl>
          </Card>
        </div>
      </Container>
    </div>
  );
}
