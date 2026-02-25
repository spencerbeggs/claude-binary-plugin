export type {
	/**
	 * Create a type that represents the JSON-serialized version of `T`.
	 *
	 * @remarks
	 * Transforms a type to what it would look like after `JSON.parse(JSON.stringify(x))`.
	 * Handles Date → string, undefined removal, etc.
	 *
	 * @example
	 * ```typescript
	 * type Input = { date: Date; value: number };
	 * type Serialized = Jsonify<Input>;
	 * // { date: string; value: number }
	 * ```
	 *
	 * @public
	 */
	Jsonify,
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
	PartialDeep,
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
	ReadonlyDeep,
	/**
	 * Make all properties in `T` required recursively.
	 *
	 * @remarks
	 * The inverse of `PartialDeep`. Useful for ensuring all fields are
	 * present after merging partial configurations.
	 *
	 * @example
	 * ```typescript
	 * type Config = { nested?: { value?: number } };
	 * type FullConfig = RequiredDeep<Config>;
	 * // { nested: { value: number } }
	 * ```
	 *
	 * @public
	 */
	RequiredDeep,
	/**
	 * Create a tagged (branded) type.
	 *
	 * @remarks
	 * Tagged types are nominal types that prevent accidentally mixing up
	 * structurally identical values. The SDK uses this for `SessionId`,
	 * `ToolUseId`, etc.
	 *
	 * @example
	 * ```typescript
	 * type UserId = Tagged<string, "UserId">;
	 * type OrderId = Tagged<string, "OrderId">;
	 *
	 * function getUser(id: UserId) { }
	 *
	 * const userId = "123" as UserId;
	 * const orderId = "456" as OrderId;
	 *
	 * getUser(userId);  // OK
	 * getUser(orderId); // Error: types are incompatible
	 * ```
	 *
	 * @public
	 */
	Tagged,
	/**
	 * Make all properties in `T` writable recursively (remove readonly).
	 *
	 * @remarks
	 * The inverse of `ReadonlyDeep`. Useful when you need to build up an
	 * object that will later be frozen, or for test utilities.
	 *
	 * @example
	 * ```typescript
	 * type Immutable = ReadonlyDeep<{ value: number }>;
	 * type Mutable = WritableDeep<Immutable>;
	 *
	 * const obj: Mutable = { value: 1 };
	 * obj.value = 2; // OK
	 * ```
	 *
	 * @public
	 */
	WritableDeep,
} from "type-fest";
