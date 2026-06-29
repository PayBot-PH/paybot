import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export default function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold transition active:scale-95';
  const styles = {
    primary: 'bg-[hsl(var(--brand-blue-500))] text-white shadow-md',
    secondary: 'bg-muted text-muted-foreground border border-border',
    ghost: 'bg-transparent text-foreground ring-1 ring-border',
  } as const;

  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
