import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { makeGitInfoTest } from "../../src/layers/GitInfoTest.js";
import { OtelProvidersLive } from "../../src/layers/OtelProvidersLive.js";
import type { ResourceConfig } from "../../src/services/OtelProviders.js";
import { OtelProviders } from "../../src/services/OtelProviders.js";

const { layer: GitInfoTestLayer } = makeGitInfoTest();

// =============================================================================
// Service Tag
// =============================================================================

describe("OtelProviders service tag", () => {
	test("is defined with correct tag identifier", () => {
		expect(OtelProviders.key).toBe("OtelProviders");
	});
});

// =============================================================================
// Layer provides the service
// =============================================================================

describe("OtelProvidersLive", () => {
	test("layer provides the OtelProviders service", async () => {
		const program = Effect.gen(function* () {
			const providers = yield* OtelProviders;
			expect(typeof providers.getTracer).toBe("function");
			expect(typeof providers.getMeter).toBe("function");
			expect(typeof providers.getLogger).toBe("function");
			expect(typeof providers.reinit).toBe("function");
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(OtelProvidersLive.pipe(Layer.provide(GitInfoTestLayer))))));
	});

	// =============================================================================
	// Pre-init behavior: global API returns no-op instances
	// =============================================================================

	test("getTracer returns an object before reinit", async () => {
		const program = Effect.gen(function* () {
			const providers = yield* OtelProviders;
			const tracer = providers.getTracer("test-tracer");
			expect(tracer).toBeDefined();
			expect(typeof tracer.startSpan).toBe("function");
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(OtelProvidersLive.pipe(Layer.provide(GitInfoTestLayer))))));
	});

	test("getMeter returns an object before reinit", async () => {
		const program = Effect.gen(function* () {
			const providers = yield* OtelProviders;
			const meter = providers.getMeter("test-meter");
			expect(meter).toBeDefined();
			expect(typeof meter.createCounter).toBe("function");
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(OtelProvidersLive.pipe(Layer.provide(GitInfoTestLayer))))));
	});

	test("getLogger returns an object before reinit", async () => {
		const program = Effect.gen(function* () {
			const providers = yield* OtelProviders;
			const logger = providers.getLogger("test-logger");
			expect(logger).toBeDefined();
			expect(typeof logger.emit).toBe("function");
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(OtelProvidersLive.pipe(Layer.provide(GitInfoTestLayer))))));
	});

	// =============================================================================
	// Config hash change detection
	// =============================================================================

	test("reinit with same config hash returns false on second call", async () => {
		const config: ResourceConfig = {
			endpoint: "http://localhost:4318",
			protocol: "http",
			serviceName: "test-service",
		};

		const program = Effect.gen(function* () {
			const providers = yield* OtelProviders;

			// First call should initialize (returns true)
			const first = yield* providers.reinit(config);
			expect(first).toBe(true);

			// Second call with same config should be no-op (returns false)
			const second = yield* providers.reinit(config);
			expect(second).toBe(false);
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(OtelProvidersLive.pipe(Layer.provide(GitInfoTestLayer))))));
	});

	test("reinit with different config returns true", async () => {
		const config1: ResourceConfig = {
			endpoint: "http://localhost:4318",
			serviceName: "service-a",
		};

		const config2: ResourceConfig = {
			endpoint: "http://localhost:4318",
			serviceName: "service-b",
		};

		const program = Effect.gen(function* () {
			const providers = yield* OtelProviders;

			const first = yield* providers.reinit(config1);
			expect(first).toBe(true);

			const second = yield* providers.reinit(config2);
			expect(second).toBe(true);
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(OtelProvidersLive.pipe(Layer.provide(GitInfoTestLayer))))));
	});

	// =============================================================================
	// Finalizer behavior
	// =============================================================================

	test("scope close completes without error after reinit", async () => {
		const config: ResourceConfig = {
			endpoint: "http://localhost:4318",
			serviceName: "finalizer-test",
		};

		// The scoped effect will run the finalizer when the scope closes.
		// If shutdown fails, the test would throw.
		const program = Effect.gen(function* () {
			const providers = yield* OtelProviders;
			yield* providers.reinit(config);
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(OtelProvidersLive.pipe(Layer.provide(GitInfoTestLayer))))));
	});

	test("scope close completes without error when no reinit was called", async () => {
		const program = Effect.gen(function* () {
			yield* OtelProviders;
			// Don't call reinit — providers stay null
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(OtelProvidersLive.pipe(Layer.provide(GitInfoTestLayer))))));
	});
});
