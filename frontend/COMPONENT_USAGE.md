# Component Usage Guide - User-Friendly Implementation

## Button Component

### ✅ Good Usage

```tsx
// Clear primary action
<Button className="w-full md:w-auto">Create Payment</Button>

// With icon
<Button>
  Send Payment <Send className="ml-2 h-4 w-4" />
</Button>

// Responsive sizing
<Button size="responsive">Mobile-friendly button</Button>

// Disabled with proper feedback
<Button disabled>Processing...</Button>
```

### ❌ Avoid

```tsx
// Too many buttons competing for attention
<Button variant="default">A</Button>
<Button variant="default">B</Button>
<Button variant="default">C</Button>

// Unclear purpose
<Button>Click here</Button>

// Disabled without explanation
<Button disabled>Submit</Button>
```

### Mobile vs Desktop

```tsx
// Mobile-friendly (full width on small screens)
<div className="flex flex-col gap-3 md:flex-row md:gap-4">
  <Button className="flex-1">Cancel</Button>
  <Button className="flex-1">Confirm</Button>
</div>

// NOT: Small buttons hard to tap
<div className="gap-2">
  <Button>Cancel</Button>
  <Button>Confirm</Button>
</div>
```

## Input Field Best Practices

### ✅ Good Usage

```tsx
// With clear label and helper text
<div className="space-y-2">
  <Label htmlFor="email">Email Address</Label>
  <Input 
    id="email" 
    type="email" 
    placeholder="you@example.com"
  />
  <p className="text-xs text-gray-500">We'll never share your email</p>
</div>

// With error state
<div className="space-y-2">
  <Label htmlFor="amount">Amount</Label>
  <Input 
    id="amount" 
    type="number" 
    className="border-red-300"
  />
  <p className="text-xs text-red-600">Enter a valid amount</p>
</div>

// Mobile-friendly number input
<Input 
  type="number" 
  inputMode="numeric"
  placeholder="0.00"
  className="text-right"
/>
```

### ❌ Avoid

```tsx
// Label inside placeholder (disappears when typing)
<Input placeholder="Enter email" />

// No feedback on invalid input
<Input required />

// Too small on mobile
<Input className="text-xs" />

// Unclear field purpose
<Input placeholder="?" />
```

## Form Layout

### ✅ Good Mobile Form

```tsx
<form className="space-y-4 md:space-y-6 w-full">
  {/* Full width on mobile */}
  <div className="space-y-2">
    <Label htmlFor="name">Full Name</Label>
    <Input id="name" type="text" />
  </div>

  <div className="space-y-2">
    <Label htmlFor="amount">Amount (₱)</Label>
    <Input id="amount" type="number" inputMode="decimal" />
  </div>

  {/* Stack on mobile, row on desktop */}
  <div className="space-y-2 md:space-y-0 md:flex md:gap-4">
    <div className="flex-1 space-y-2">
      <Label htmlFor="bank">Bank</Label>
      <Select>
        <SelectTrigger id="bank">
          <SelectValue placeholder="Select bank" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="gcash">GCash</SelectItem>
          <SelectItem value="maya">Maya</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>

  {/* Full width buttons on mobile */}
  <div className="flex flex-col gap-3 md:flex-row md:gap-4 pt-4">
    <Button 
      type="button" 
      variant="outline" 
      className="flex-1 md:flex-none"
    >
      Cancel
    </Button>
    <Button className="flex-1 md:flex-none">
      Send Payment
    </Button>
  </div>
</form>
```

### ❌ Avoid

```tsx
// Small inputs on mobile
<input style={{ width: "120px" }} />

// Form labels as placeholders
<input placeholder="Email address" />

// No space between form fields
<input />
<input />

// Tiny buttons hard to tap
<button style={{ padding: "4px 8px" }}>Submit</button>
```

## Card Layout

### ✅ Good Card

```tsx
// Responsive card with proper spacing
<Card>
  <CardHeader className="space-y-2">
    <CardTitle className="text-lg md:text-xl">Total Revenue</CardTitle>
    <CardDescription>Last 30 days</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-3xl md:text-4xl font-bold">₱25,000</p>
    <p className="text-sm text-gray-600 mt-2">+12% from last month</p>
  </CardContent>
</Card>

// Mobile-friendly card layout
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
  <Card>
    <CardContent>
      <p className="font-semibold">Paid</p>
      <p className="text-2xl font-bold text-green-600">₱12,500</p>
    </CardContent>
  </Card>
  <Card>
    <CardContent>
      <p className="font-semibold">Pending</p>
      <p className="text-2xl font-bold text-amber-600">₱2,000</p>
    </CardContent>
  </Card>
  <Card>
    <CardContent>
      <p className="font-semibold">Failed</p>
      <p className="text-2xl font-bold text-red-600">₱500</p>
    </CardContent>
  </Card>
</div>
```

### ❌ Avoid

```tsx
// Card text too small
<Card>
  <p style={{ fontSize: "12px" }}>Data</p>
</Card>

// No breathing room
<Card className="p-1">
  Content crammed together
</Card>

// Hard to read on mobile
<div className="flex gap-1">
  <Card className="flex-1 text-xs">A</Card>
  <Card className="flex-1 text-xs">B</Card>
  <Card className="flex-1 text-xs">C</Card>
  <Card className="flex-1 text-xs">D</Card>
  <Card className="flex-1 text-xs">E</Card>
</div>
```

## Table/List Layout

### ✅ Good List on Mobile

```tsx
// Stack as cards on mobile, table on desktop
<div className="space-y-3 md:overflow-x-auto">
  <div className="hidden md:grid grid-cols-5 gap-4 px-4 py-2 bg-gray-50 font-semibold">
    <div>Date</div>
    <div>Amount</div>
    <div>Status</div>
    <div>Method</div>
    <div>Actions</div>
  </div>

  {transactions.map(txn => (
    <div 
      key={txn.id}
      className="md:grid md:grid-cols-5 md:gap-4 md:px-4 md:py-2 p-4 bg-white border rounded-lg md:border-0"
    >
      <div className="md:hidden font-semibold text-sm mb-2">Date</div>
      <div>{formatDate(txn.date)}</div>

      <div className="md:hidden font-semibold text-sm mb-2">Amount</div>
      <div>₱{fmt(txn.amount)}</div>

      <div className="md:hidden font-semibold text-sm mb-2">Status</div>
      <div>
        <Badge variant={txn.status}>{txn.status}</Badge>
      </div>

      <div className="md:hidden font-semibold text-sm mb-2">Method</div>
      <div>{txn.method}</div>

      <div className="md:hidden font-semibold text-sm mb-2">Actions</div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline">View</Button>
      </div>
    </div>
  ))}
</div>
```

### ❌ Avoid

```tsx
// Horizontal scroll on mobile (confusing)
<div className="overflow-x-auto">
  <table>
    {/* 10 columns that don't fit */}
  </table>
</div>

// Tiny text in table cells
<table>
  <td style={{ fontSize: "12px" }}>data</td>
</table>
```

## Empty, Loading, and Error States

### ✅ Good States

```tsx
// Empty state (clear and actionable)
{items.length === 0 && (
  <div className="flex flex-col items-center justify-center py-12 md:py-16">
    <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
      <InboxIcon className="h-8 w-8 text-gray-400" />
    </div>
    <h3 className="text-lg font-semibold text-gray-900 mb-2">No transactions</h3>
    <p className="text-gray-600 mb-6 text-center text-sm md:text-base">
      When you receive payments, they'll appear here.
    </p>
    <Link to="/create-payment">
      <Button>Create First Payment</Button>
    </Link>
  </div>
)}

// Loading state
{loading && (
  <div className="space-y-3 md:space-y-4">
    {[1, 2, 3].map(i => (
      <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
    ))}
  </div>
)}

// Error state
{error && (
  <div className="p-4 md:p-6 bg-red-50 border border-red-200 rounded-lg">
    <div className="flex gap-3">
      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div>
        <h3 className="font-semibold text-red-900">Something went wrong</h3>
        <p className="text-red-700 text-sm mt-1">{error}</p>
        <Button 
          size="sm" 
          variant="outline" 
          className="mt-3"
          onClick={() => refetch()}
        >
          Try again
        </Button>
      </div>
    </div>
  </div>
)}
```

### ❌ Avoid

```tsx
// Silent loading (no feedback)
{loading && <div />}

// Unclear error messages
{error && <p className="text-red-500">Error</p>}

// Empty state with no action
{items.length === 0 && <p>No data</p>}
```

## Mobile-First CSS Pattern

### ✅ Good Pattern

```tsx
// Mobile first (default), then enhance for larger screens
<div className="px-4 md:px-6 lg:px-8">
  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">
    Responsive Heading
  </h1>
  <p className="text-sm md:text-base text-gray-600 mt-2">
    This adjusts for each screen size
  </p>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8 mt-6">
    {/* Cards that stack on mobile, spread on desktop */}
  </div>
</div>
```

### ❌ Avoid

```tsx
// Desktop-first (backwards approach)
<div className="lg:px-8 md:px-6 px-2">
  {/* Hard to maintain */}
</div>

// No responsive consideration
<div className="px-8">
  <h1 className="text-4xl">Title</h1>
  {/* Too small on mobile! */}
</div>
```

## Key Takeaways

1. **Defaults are Mobile**: Write CSS for mobile, add breakpoints for larger screens
2. **Touch First**: Make everything at least 44x44px on mobile
3. **Clear Labels**: Always label form fields, never rely on placeholder
4. **Stack on Mobile**: Flex-col on mobile, flex-row on desktop
5. **Full Width**: Use 100% width on mobile for inputs/buttons, constrain on desktop
6. **Readable Text**: Minimum 14px on mobile, good contrast
7. **Clear Feedback**: Show loading, error, and success states
8. **Tested**: Always test on real mobile devices, not just DevTools emulator
