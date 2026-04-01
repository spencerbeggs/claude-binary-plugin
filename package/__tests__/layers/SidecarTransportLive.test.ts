import { describe, expect, test } from "bun:test";
import { Effect, Ref } from "effect";
import { makeSidecarTransportLive } from "../../src/layers/SidecarTransportLive.js";
import { SidecarTransport } from "../../src/services/SidecarTransport.js";

// =============================================================================
// Service tag
// =============================================================================

describe("SidecarTransport service tag", () => {
	test("is defined with correct tag key", () => {
		expect(SidecarTransport.key).toBe("SidecarTransport");
	});
});

// =============================================================================
// Layer construction
// =============================================================================

describe("makeSidecarTransportLive", () => {
	test("accepts Ref<number> and returns a Layer", () => {
		const ref = Effect.runSync(Ref.make(Date.now()));
		const layer = makeSidecarTransportLive(ref);
		// Verify it's a Layer (duck-type check — Layer has a pipe method)
		expect(typeof layer.pipe).toBe("function");
	});
});
