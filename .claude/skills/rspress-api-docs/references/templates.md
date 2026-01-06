# API Documentation Templates

## Function Documentation Template

Create at `api/functions/{function-name}.mdx`:

```markdown
# functionName

Brief description of what the function does.

## Signature

\`\`\`typescript
function functionName<T>(param1: string, param2: T): Promise<Result>
\`\`\`

## Parameters

| Name   | Type   | Description              |
| ------ | ------ | ------------------------ |
| param1 | string | Description of parameter |
| param2 | T      | Generic parameter        |

## Returns

`Promise<Result>` - Description of return value

## Examples

\`\`\`typescript
const result = await functionName('value', { data: true });
console.log(result);
\`\`\`

## Throws

* `Error` - When validation fails
* `TypeError` - When parameters are invalid

## Related

* [RelatedType](../types/related-type.mdx)
* [Package Overview](../index.mdx)
```

## Type/Interface Documentation Template

Create at `api/types/{type-name}.mdx`:

```markdown
# TypeName

Brief description of what this type represents.

## Definition

\`\`\`typescript
interface TypeName {
  property1: string;
  property2?: number;
  method(): void;
}
\`\`\`

## Properties

| Property  | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| property1 | string | Yes      | Description of property |
| property2 | number | No       | Optional property       |

## Methods

### method()

Description of the method.

**Returns**: `void`

## Usage

\`\`\`typescript
const example: TypeName = {
  property1: 'value',
  method() {
    console.log('called');
  }
};
\`\`\`

## Related

* [relatedFunction](../functions/related-function.mdx)
```

## Class Documentation Template

Create at `api/classes/{class-name}.mdx`:

```markdown
# ClassName

Brief description of the class purpose.

## Constructor

\`\`\`typescript
constructor(param1: string, options?: Options)
\`\`\`

### Parameters

| Name    | Type    | Description        |
| ------- | ------- | ------------------ |
| param1  | string  | Required parameter |
| options | Options | Optional config    |

## Properties

| Property | Type   | Description        |
| -------- | ------ | ------------------ |
| name     | string | Read-only property |

## Methods

### methodName(param: Type): ReturnType

Description of what the method does.

**Example**:

\`\`\`typescript
const instance = new ClassName('value');
const result = instance.methodName(param);
\`\`\`

## Related

* [Options](../types/options.mdx)
```

## Grep Patterns for Finding Exports

**Find all exports**:

```bash
grep -r "^export " src/
```

**Find exported functions**:

```bash
grep -r "^export function " src/
```

**Find exported types**:

```bash
grep -r "^export (type|interface) " src/
```

**Find exported classes**:

```bash
grep -r "^export class " src/
```
