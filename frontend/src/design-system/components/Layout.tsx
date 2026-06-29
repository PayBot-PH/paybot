import React from 'react';

export function Container({ children }: { children: React.ReactNode }) {
  return <div className="max-w-7xl mx-auto px-6 py-10">{children}</div>;
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl md:text-4xl font-extrabold text-foreground">{title}</h1>
      {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Container>{children}</Container>
    </div>
  );
}
