/**
 * IPC message serialization for OTEL sidecar communication.
 *
 * @remarks
 * Messages are sent as JSON Lines (newline-delimited JSON) over Unix sockets.
 * This format is simple, debuggable, and efficient for the expected message sizes.
 *
 * @example
 * ```typescript
 * import { SidecarMessage } from "claude-binary-plugin";
 *
 * // Serialize a message
 * const serialized = SidecarMessage.serialize({
 *   type: "ping",
 *   sessionId: "abc-123",
 *   config: { endpoint: "http://localhost:4318" }
 * });
 *
 * // Parse a message
 * const parsed = SidecarMessage.parse(line);
 * ```
 *
 * @public
 */

import type { SidecarMessage as SidecarMessageType } from "../protocol.js";

/**
 * IPC message serialization and parsing.
 *
 * @remarks
 * Provides static methods for serializing and parsing sidecar IPC messages.
 * Handles BigInt values which are common in OTEL timestamps.
 *
 * @example
 * ```typescript
 * // Serialize with BigInt support
 * const msg = {
 *   type: "event",
 *   sessionId: "abc",
 *   data: { name: "test", timeNs: BigInt("1234567890") }
 * };
 * const json = SidecarMessage.serialize(msg);
 *
 * // Parse with BigInt revival
 * const parsed = SidecarMessage.parse(json);
 * ```
 *
 * @public
 */
export class SidecarMessage {
	/**
	 * Serialize a message to JSON Line format.
	 *
	 * @remarks
	 * Uses a custom replacer to handle BigInt values, converting them
	 * to strings with an "n" suffix (e.g., "1234567890n").
	 *
	 * @param message - The sidecar message to serialize
	 * @returns JSON string with trailing newline
	 *
	 * @example
	 * ```typescript
	 * const json = SidecarMessage.serialize({
	 *   type: "metric",
	 *   sessionId: "abc",
	 *   data: { name: "hook.duration", timeNs: BigInt(Date.now()) * 1000000n }
	 * });
	 * socket.write(json);
	 * ```
	 *
	 * @public
	 */
	static serialize(message: SidecarMessageType): string {
		return `${JSON.stringify(message, SidecarMessage.bigIntReplacer)}\n`;
	}

	/**
	 * Parse a JSON Line message.
	 *
	 * @remarks
	 * Uses a custom reviver to handle BigInt values, converting strings
	 * ending in "n" back to BigInt.
	 *
	 * @param line - The JSON line to parse
	 * @returns Parsed message or null if parsing fails
	 *
	 * @example
	 * ```typescript
	 * const message = SidecarMessage.parse(line);
	 * if (message) {
	 *   switch (message.type) {
	 *     case "ping": // Handle ping
	 *     case "event": // Handle event
	 *   }
	 * }
	 * ```
	 *
	 * @public
	 */
	static parse(line: string): SidecarMessageType | null {
		try {
			const trimmed = line.trim();
			if (!trimmed) return null;
			return JSON.parse(trimmed, SidecarMessage.bigIntReviver) as SidecarMessageType;
		} catch {
			return null;
		}
	}

	/**
	 * JSON replacer for BigInt values.
	 * Converts BigInt to string with "n" suffix.
	 * @internal
	 */
	private static bigIntReplacer(_key: string, value: unknown): unknown {
		if (typeof value === "bigint") {
			return `${value.toString()}n`;
		}
		return value;
	}

	/**
	 * JSON reviver for BigInt values.
	 * Converts strings ending in "n" back to BigInt.
	 * @internal
	 */
	private static bigIntReviver(_key: string, value: unknown): unknown {
		if (typeof value === "string" && /^\d+n$/.test(value)) {
			return BigInt(value.slice(0, -1));
		}
		return value;
	}

	// Private constructor prevents instantiation
	private constructor() {}
}
