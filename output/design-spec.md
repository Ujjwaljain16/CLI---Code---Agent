# Design Specification for Scaler Website Clone

## Phase 1: Design Tokens
- **Background Color**: `rgb(255, 255, 255)`
- **Text Color**: `rgb(0, 0, 0)`
- **Accent Color**: `rgb(0, 76, 229)` (derived from primary button background)
- **Accent Hover Color**: `rgb(0, 64, 194)` (darkened by ~15%)
- **Muted Text Color**: `rgb(0, 85, 255)`
- **Section Alternate Background**: `rgb(0, 35, 110)`
- **Button Border Radius**: `0px`
- **Card Border Radius**: `12px` (common practice)
- **Primary Border**: `1px solid rgb(1, 26, 83)`
- **Spacing Scale**: `8px, 12px` (detected). Expanded to `8, 12, 16, 24, 32, 48, 64px` for comprehensive use.
- **Section Paddings**: Not explicitly detected, will use `var(--space-6)` (64px) for vertical padding and `var(--space-4)` (32px) for horizontal within container.

## Phase 2: Typography Hierarchy
- **Display Font**: `clashGrotesk, "clashGrotesk Fallback", ui-serif, Georgia, "Times New Roman", serif`
- **Body Font**: `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`
- **H1**: `90px` (fontWeight: `500`, lineHeight: `90px`, color: `rgb(1, 24, 69)`) - `clashGrotesk`
- **H2**: `40px` (fontWeight: `500`) - `clashGrotesk`
- **H3**: Not explicitly detected, will derive from H2 (e.g., 32px, 500w) - `clashGrotesk`
- **Body Text**: `18px` (color: `rgb(33, 33, 33)`) - `ui-sans-serif`
- **Button Text**: `14px` (fontWeight: `600`) - `ui-sans-serif`
- **Nav Link Text**: Not explicitly detected, will use `16px` (fontWeight: `500`) - `ui-sans-serif`

## Phase 3: Component Inventory
- **Header**: Not sticky, no blur, height `116px`. No explicit logo or nav links in summary, will read from full design system. CTA buttons: `Login` (secondary style), `Request A Callback` (primary style).
- **Hero Section**: Left-aligned (`textAlign: start`).
  - **H1**: "Become the Professional Built for the Next Decade in AI."
  - **Paragraph**: "The investment that compounds. Strong technical foundations, AI integrated at every stage, and a curriculum that evolves as the market does"
  - **Buttons**: `REQUEST A CALLBACK` (primary style), `BOOK FREE LIVE CLASS` (secondary style with primary border).
  - **Background**: Transparent, no image detected in summary.
- **Buttons**: 
  - **Primary**: `rgb(0, 76, 229)` background, `rgb(255, 255, 255)` text, `0px` border-radius, `0px 40px` padding, `14px` font size, `600` font weight.
  - **Secondary**: `rgb(255, 255, 255)` background, `rgb(1, 26, 83)` text, `0px` border-radius, `0px 40px` padding, `14px` font size, `600` font weight, `1px solid rgb(1, 26, 83)` border.
- **Footer**: `rgb(250, 250, 250)` background. Logo, columns, copyright, social links will be extracted from the full design system.

## Phase 4: Layout Architecture
- **Container Max-Width**: `997px`.
- **Header**: Standard block layout.
- **Hero**: Flexbox for content alignment, likely `flex-direction: column` for text and buttons, then potentially `flex-direction: row` for image if present.
- **General Layout**: Use flexbox and grid for responsive layouts. Apply `max-width: var(--container-width)` and `margin: 0 auto` to main content areas.
- **Responsive Breakpoints**: `1024px`, `768px`, `480px`.