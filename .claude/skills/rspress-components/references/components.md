# RSPress Components Reference

## Badge

Display inline status badges:

```tsx
import { Badge } from 'rspress/theme';

<Badge type="info" text="Info" />
<Badge type="tip" text="Tip" />
<Badge type="warning" text="Warning" />
<Badge type="danger" text="Danger" />
```

## Tabs

Create tabbed content sections:

```tsx
import { Tabs, Tab } from 'rspress/theme';

<Tabs>
  <Tab label="JavaScript">
    ```javascript
    console.log('Hello');
    ```
  </Tab>
  <Tab label="TypeScript">
    ```typescript
    console.log('Hello');
    ```
  </Tab>
</Tabs>
```

## PackageManagerTabs

Special tabs for package manager commands:

```tsx
import { PackageManagerTabs } from 'rspress/theme';

<PackageManagerTabs command="install react" />
<PackageManagerTabs command="add -D typescript" />
```

## Steps

Create numbered step-by-step instructions:

```tsx
import { Steps } from 'rspress/theme';

<Steps>
### Step 1

First instruction.

### Step 2

Second instruction.
</Steps>
```

## NoSSR

Prevent server-side rendering for client-only components:

```tsx
import { NoSSR } from 'rspress/theme';

<NoSSR>
  <ClientOnlyComponent />
</NoSSR>
```

## Code Block Features

### Syntax Highlighting

````markdown
```typescript
const example: string = "code";
```
````

### Line Highlighting

````markdown
```typescript{2,4-6}
const a = 1;
const b = 2; // highlighted
const c = 3;
const d = 4; // highlighted
const e = 5; // highlighted
const f = 6; // highlighted
```
````

### Diff Highlighting

````markdown
```typescript
const old = 'remove'; // [!code --]
const new = 'add'; // [!code ++]
```
````

## Container Blocks

### Callouts

```markdown
:::tip
Helpful tip content
:::

:::info
Informational content
:::

:::warning
Warning content
:::

:::danger
Danger/error content
:::
```

### Details (Collapsible)

```markdown
:::details Summary text
Hidden content that can be expanded
:::
```

## MDX Features

### Importing Custom Components

```tsx
import CustomComponent from '../components/CustomComponent';

<CustomComponent prop="value" />
```

### Inline Expressions

```tsx
export const version = '1.0.0';

Current version: {version}
```

### Mixing Markdown and JSX

```tsx
<div className="custom-wrapper">

## Markdown heading

Regular markdown content works inside JSX.

</div>
```
