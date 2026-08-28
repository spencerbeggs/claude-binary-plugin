export type { Jsonify } from "./json.js";

/**
 * Make all properties in `T` readonly recursively.
 *
 * @remarks
 * This is used internally by `HandlerContext` to make handler parameters
 * immutable. You can use it for your own types that should be deeply frozen.
 *
 * @example
 * ```typescript
 * type Config = { nested: { value: number } };
 * type ImmutableConfig = ReadonlyDeep<Config>;
 *
 * const config: ImmutableConfig = { nested: { value: 1 } };
 * // config.nested.value = 2; // Error: readonly
 * ```
 *
 * @public
 */
export type ReadonlyDeep<T> = T extends (...args: unknown[]) => unknown
	? T
	: T extends ReadonlyMap<infer K, infer V>
		? ReadonlyMap<ReadonlyDeep<K>, ReadonlyDeep<V>>
		: T extends ReadonlySet<infer V>
			? ReadonlySet<ReadonlyDeep<V>>
			: T extends readonly (infer U)[]
				? readonly ReadonlyDeep<U>[]
				: T extends object
					? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
					: T;

/**
 * Make all properties in `T` optional recursively.
 *
 * @remarks
 * This is used by `PluginTester.withOptions()` and `withState()` to allow
 * partial test configurations. You can use it for your own partial types.
 *
 * @example
 * ```typescript
 * type Config = { nested: { a: number; b: string } };
 * type PartialConfig = PartialDeep<Config>;
 *
 * // Only specify what you need
 * const partial: PartialConfig = { nested: { a: 1 } };
 * ```
 *
 * @public
 */
export type PartialDeep<T> = T extends (...args: unknown[]) => unknown
	? T
	: T extends ReadonlyMap<infer K, infer V>
		? ReadonlyMap<PartialDeep<K>, PartialDeep<V>>
		: T extends ReadonlySet<infer V>
			? ReadonlySet<PartialDeep<V>>
			: T extends readonly (infer U)[]
				? readonly PartialDeep<U>[]
				: T extends object
					? { [K in keyof T]?: PartialDeep<T[K]> }
					: T;
