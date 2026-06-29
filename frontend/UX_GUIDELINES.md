# User Experience (UX) Guidelines - xend

## Design Principles

### 1. **Mobile-First, Desktop-Enhanced**
- Design for mobile first (smallest screens)
- Enhance for desktop without losing simplicity
- Tablet gets best of both worlds

### 2. **Clear Visual Hierarchy**
- Important actions should be prominent
- Secondary actions should be less prominent
- Group related actions together

### 3. **Intuitive Interactions**
- Familiar patterns users already know
- Clear feedback for every action
- Obvious what can/can't be clicked

### 4. **Fast & Responsive**
- Instant visual feedback on interactions
- No loading states without feedback
- Skeleton screens for data loading

### 5. **Accessible to Everyone**
- Color isn't the only indicator
- Large enough text and touch targets
- Keyboard navigation support

## Mobile UX Best Practices

### Navigation
✅ **Mobile**
- Hamburger menu for secondary navigation
- Bottom tab bar for main actions (mobile pattern)
- Sticky header with key info
- Single column layout

✅ **Desktop**
- Visible sidebar navigation
- Top navigation bar
- Multi-column layouts
- More whitespace

### Forms
✅ **Mobile**
- One input per row
- Large, touchable labels
- Clear error messages below fields
- Full-width buttons
- Mobile keyboard-aware (number pad for numbers)

✅ **Desktop**
- Can use 2-column layouts if needed
- Clear label-input relationships
- Inline error messages
- Reasonably-sized buttons

### Cards & Content
✅ **Mobile**
- Full-width cards with padding
- Stacked vertical layout
- Large, readable text
- Minimal decoration

✅ **Desktop**
- Multi-column grid layouts
- Compact density options
- Decorative elements can shine
- Hover states for interactivity

### Buttons & Actions
✅ **Mobile**
- Minimum 44x44px touch target
- Large, clear labels
- One primary action per screen
- Secondary actions less prominent

✅ **Desktop**
- Can be slightly smaller
- Hover states important
- Multiple action visibility OK
- Context menus for advanced options

## Dashboard UX

### Key Metrics Section
- **Mobile**: Stack vertically, one per row
- **Desktop**: Show 3-4 metrics in one row
- **Both**: Clear labels, easy to scan

### Quick Actions
- **Mobile**: 2 primary actions visible, others in menu
- **Desktop**: 4-6 actions visible at once
- **Both**: Clear icons + text labels

### Data Tables/Lists
- **Mobile**: Vertical card layout (no horizontal scroll)
- **Desktop**: Traditional table layout (horizontal OK)
- **Both**: Sortable, filterable, paginated if needed

### Transactions/Activity
- **Mobile**: Simplified view (key info only)
- **Desktop**: Full details with side-by-side comparisons
- **Both**: Status indicators (badges, colors, icons)

## Form UX

### Input Fields
- **Label above field** (not inside)
- **Clear placeholder text** (example: "john@example.com")
- **Error messages below field** in red
- **Helper text** for guidance
- **Validation feedback** (✓ for valid inputs)

### Buttons
- **Primary action**: Blue, prominent
- **Secondary action**: Outline style
- **Destructive action**: Red warning
- **Disabled state**: Clearly disabled, no hover
- **Loading state**: Spinner + disabled

### Modal/Dialog
- **Mobile**: Full screen or slide-up drawer
- **Desktop**: Centered modal (60-80% max-width)
- **Both**: Clear close button, escape key support

## Navigation UX

### Mobile Navigation
- **Primary nav**: Hamburger menu or bottom tabs
- **Secondary nav**: Drawer menu (slide from left)
- **Back button**: Always visible on sub-pages
- **Current page**: Clearly highlighted

### Desktop Navigation
- **Sidebar**: Permanent, collapsible
- **Breadcrumbs**: Show current page hierarchy
- **Active state**: Highlighted with icon + text color
- **Hover states**: Highlight on hover

## Color & Feedback

### Visual Feedback
- ✅ **Success**: Green badge + checkmark
- ⚠️ **Warning**: Yellow/amber badge
- ❌ **Error**: Red badge + clear error message
- ℹ️ **Info**: Blue badge
- ⏳ **Loading**: Spinner or skeleton

### Interactive Feedback
- **Hover**: Subtle background color change
- **Active**: Color + highlight
- **Disabled**: Reduced opacity + no cursor change
- **Focus**: Ring outline for accessibility
- **Press**: Slight scale down

## Text & Readability

### Font Sizes
- **Mobile**: 14px-16px for body, 18px-20px for headings
- **Desktop**: 16px body, 20px-24px for headings
- **Never below**: 12px for important content

### Line Length
- **Optimal**: 50-75 characters per line
- **Maximum**: Never exceed 100 characters
- **Use**: Max-width containers to enforce

### Spacing
- **Mobile**: 12px-16px gutters
- **Desktop**: 16px-24px gutters
- **Between sections**: 24px-32px

## Common Patterns

### Empty State
```
[Large icon]
"No transactions yet"
"When you receive payments, they'll appear here."
[CTA: "Create Payment" button]
```

### Loading State
```
[Skeleton card]
[Skeleton card]
[Skeleton card]
```

### Error State
```
[Error icon]
"Something went wrong"
"We couldn't load your data. Please try again."
[Retry button]
```

### Success State
```
[Checkmark icon, green]
"Payment received!"
"₱1,500 from John Doe"
[View details link]
```

## Interaction Tips

### Touch-Friendly (Mobile)
- Minimum 44x44px targets
- Adequate spacing between clickables
- Swipe gestures for navigation
- Clear visual feedback
- No hover states (they don't exist!)

### Mouse-Friendly (Desktop)
- Hover states show interactivity
- Right-click context menus
- Keyboard shortcuts
- Cursor changes indicate action type
- Focus states for keyboard nav

## Performance UX

### Loading States
- Show immediately on action
- Don't remove too quickly (avoid flashing)
- Show progress for long operations
- Allow cancel on long operations

### Data Updates
- Real-time updates (sockets) when possible
- Refresh button always visible
- Polling fallback for compatibility
- Clear "last updated" timestamp

### Error Handling
- User-friendly error messages (not technical)
- Specific error descriptions
- Clear next steps ("Try again" button)
- Support link if user needs help

## Mobile-Specific Patterns

### Tab Bar (Bottom Navigation)
- 3-5 items only
- Icons + labels
- Current tab highlighted
- Badge for notifications

### Drawer Menu
- Slide from left or right
- Scrim overlay (semi-transparent)
- Easy to close (tap scrim, X button, swipe back)
- Smooth animation

### Action Sheet
- Slides up from bottom
- Cancel button at top
- Destructive actions at bottom (usually red)
- Large touch targets

## Desktop-Specific Patterns

### Sidebar Navigation
- 240-280px width
- Collapsible for more space
- Active item highlighted
- Hover highlights next item
- Smooth collapse animation

### Hover Cards
- Show more info on hover
- Don't cover important content
- Fade in smoothly
- Auto-dismiss on mouse leave

### Keyboard Shortcuts
- Show hints in tooltips
- Common shortcuts: S (search), ? (help), etc.
- Don't override browser shortcuts
- Document all shortcuts

## Accessibility (A11y)

### Requirements
- ✅ Color isn't only indicator (use icons, text too)
- ✅ All interactive elements keyboard accessible
- ✅ Focus visible (ring outline)
- ✅ Alt text on all images
- ✅ Semantic HTML (buttons not divs)
- ✅ Proper heading hierarchy (h1 → h2 → h3)
- ✅ Form labels associated with inputs
- ✅ Error messages linked to fields
- ✅ ARIA labels where needed

## Testing Checklist

### Mobile (iPhone SE, iPhone 12)
- [ ] All text readable without zoom
- [ ] All buttons tappable (44x44px+)
- [ ] No horizontal scrolling
- [ ] Forms easy to fill
- [ ] Navigation clear and accessible
- [ ] Images properly scaled
- [ ] Landscape mode works

### Tablet (iPad)
- [ ] Uses tablet-optimized layout
- [ ] Not just stretched phone view
- [ ] Navigation makes sense for screen size
- [ ] Touch targets still comfortable

### Desktop (1920x1080)
- [ ] Content doesn't feel cramped
- [ ] Sidebar readable
- [ ] Multi-column layouts work
- [ ] Hover effects visible
- [ ] Keyboard navigation works

### Screen Readers (NVDA, JAWS, VoiceOver)
- [ ] Page structure makes sense
- [ ] All buttons labeled
- [ ] Forms properly marked
- [ ] No content hidden from screen readers
- [ ] Focus order logical

## Common Mistakes to Avoid

❌ **Mobile**
- Too small text (< 14px)
- Tiny touch targets (< 44x44px)
- Horizontal scrolling required
- Unreadable colors/contrast
- Too much animation/distraction

❌ **Both**
- Unclear CTAs
- No loading/error states
- Inconsistent design
- Poor color contrast
- Too many fonts

❌ **Desktop**
- Hover states that block content
- Tiny icons
- No keyboard support
- Context menus hard to find
- Overwhelming UI

## Future Enhancements

- [ ] Voice commands support
- [ ] Gesture support (swipe, pinch)
- [ ] Dark mode optimizations
- [ ] Offline functionality
- [ ] Progressive enhancement
- [ ] Web animations (page transitions)
- [ ] Advanced keyboard shortcuts
- [ ] Customizable dashboard layouts
- [ ] Mobile app (native)
- [ ] Accessibility improvements (WCAG AA compliance)
