import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { MetricData } from "../../protocol.js";
import { MetricHandler } from "./MetricHandler.js";
import * as SidecarProvidersModule from "./SidecarProviders.js";

describe("MetricHandler", () => {
	test("can be instantiated", () => {
		// @ts-expect-error: Private constructor - testing for coverage
		const instance = new MetricHandler();
		expect(instance).toBeInstanceOf(MetricHandler);
	});

	let mockCounter: { add: ReturnType<typeof mock> };
	let mockUpDownCounter: { add: ReturnType<typeof mock> };
	let mockHistogram: { record: ReturnType<typeof mock> };
	let mockMeter: {
		createCounter: ReturnType<typeof mock>;
		createUpDownCounter: ReturnType<typeof mock>;
		createHistogram: ReturnType<typeof mock>;
	};

	beforeEach(() => {
		// Create mock instruments
		mockCounter = { add: mock(() => {}) };
		mockUpDownCounter = { add: mock(() => {}) };
		mockHistogram = { record: mock(() => {}) };

		// Create mock meter
		mockMeter = {
			createCounter: mock(() => mockCounter),
			createUpDownCounter: mock(() => mockUpDownCounter),
			createHistogram: mock(() => mockHistogram),
		};

		// Mock getMeter
		spyOn(SidecarProvidersModule.SidecarProviders, "getMeter").mockReturnValue(
			mockMeter as unknown as ReturnType<typeof SidecarProvidersModule.SidecarProviders.getMeter>,
		);

		// Clear caches before each test
		MetricHandler.clearCaches();
	});

	afterEach(() => {
		MetricHandler.clearCaches();
	});

	describe("counter metrics", () => {
		test("creates and records monotonic counter", () => {
			const data: MetricData = {
				name: "test.counter",
				description: "Test counter",
				unit: "1",
				type: { kind: "counter", value: 5 },
				attributes: { key: "value" },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			MetricHandler.handle(data);

			expect(mockMeter.createCounter).toHaveBeenCalledWith("test.counter", {
				description: "Test counter",
				unit: "1",
			});
			expect(mockCounter.add).toHaveBeenCalledWith(5, { key: "value" });
		});

		test("creates monotonic counter with explicit monotonic: true", () => {
			const data: MetricData = {
				name: "test.counter.explicit",
				type: { kind: "counter", value: 10, monotonic: true },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			MetricHandler.handle(data);

			expect(mockMeter.createCounter).toHaveBeenCalled();
			expect(mockCounter.add).toHaveBeenCalledWith(10, undefined);
		});

		test("reuses cached monotonic counter", () => {
			const data: MetricData = {
				name: "test.counter.cached",
				type: { kind: "counter", value: 1 },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			// First call
			MetricHandler.handle(data);
			// Second call with same name
			MetricHandler.handle({ ...data, type: { kind: "counter", value: 2 } });

			// Counter should only be created once
			expect(mockMeter.createCounter).toHaveBeenCalledTimes(1);
			// But add should be called twice
			expect(mockCounter.add).toHaveBeenCalledTimes(2);
		});

		test("creates and records non-monotonic counter (UpDownCounter)", () => {
			const data: MetricData = {
				name: "test.updown",
				description: "Test up-down counter",
				unit: "items",
				type: { kind: "counter", value: -3, monotonic: false },
				attributes: { env: "test" },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			MetricHandler.handle(data);

			expect(mockMeter.createUpDownCounter).toHaveBeenCalledWith("test.updown", {
				description: "Test up-down counter",
				unit: "items",
			});
			expect(mockUpDownCounter.add).toHaveBeenCalledWith(-3, { env: "test" });
		});

		test("reuses cached non-monotonic counter", () => {
			const data: MetricData = {
				name: "test.updown.cached",
				type: { kind: "counter", value: 1, monotonic: false },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			// First call
			MetricHandler.handle(data);
			// Second call with same name
			MetricHandler.handle({ ...data, type: { kind: "counter", value: -1, monotonic: false } });

			// UpDownCounter should only be created once
			expect(mockMeter.createUpDownCounter).toHaveBeenCalledTimes(1);
			// But add should be called twice
			expect(mockUpDownCounter.add).toHaveBeenCalledTimes(2);
		});
	});

	describe("gauge metrics", () => {
		test("creates and records gauge as UpDownCounter", () => {
			const data: MetricData = {
				name: "test.gauge",
				description: "Test gauge",
				unit: "percent",
				type: { kind: "gauge", value: 75.5 },
				attributes: { host: "localhost" },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			MetricHandler.handle(data);

			expect(mockMeter.createUpDownCounter).toHaveBeenCalledWith("test.gauge", {
				description: "Test gauge",
				unit: "percent",
			});
			expect(mockUpDownCounter.add).toHaveBeenCalledWith(75.5, { host: "localhost" });
		});

		test("reuses cached gauge", () => {
			const data: MetricData = {
				name: "test.gauge.cached",
				type: { kind: "gauge", value: 50 },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			// First call
			MetricHandler.handle(data);
			// Second call with same name
			MetricHandler.handle({ ...data, type: { kind: "gauge", value: 60 } });

			// UpDownCounter should only be created once
			expect(mockMeter.createUpDownCounter).toHaveBeenCalledTimes(1);
			// But add should be called twice
			expect(mockUpDownCounter.add).toHaveBeenCalledTimes(2);
		});
	});

	describe("histogram metrics", () => {
		test("creates and records histogram", () => {
			const data: MetricData = {
				name: "test.histogram",
				description: "Test histogram",
				unit: "ms",
				type: { kind: "histogram", value: 150.5 },
				attributes: { operation: "read" },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			MetricHandler.handle(data);

			expect(mockMeter.createHistogram).toHaveBeenCalledWith("test.histogram", {
				description: "Test histogram",
				unit: "ms",
			});
			expect(mockHistogram.record).toHaveBeenCalledWith(150.5, { operation: "read" });
		});

		test("reuses cached histogram", () => {
			const data: MetricData = {
				name: "test.histogram.cached",
				type: { kind: "histogram", value: 100 },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			// First call
			MetricHandler.handle(data);
			// Second call with same name
			MetricHandler.handle({ ...data, type: { kind: "histogram", value: 200 } });

			// Histogram should only be created once
			expect(mockMeter.createHistogram).toHaveBeenCalledTimes(1);
			// But record should be called twice
			expect(mockHistogram.record).toHaveBeenCalledTimes(2);
		});

		test("records histogram without optional fields", () => {
			const data: MetricData = {
				name: "test.histogram.minimal",
				type: { kind: "histogram", value: 42 },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			MetricHandler.handle(data);

			expect(mockMeter.createHistogram).toHaveBeenCalledWith("test.histogram.minimal", {
				description: undefined,
				unit: undefined,
			});
			expect(mockHistogram.record).toHaveBeenCalledWith(42, undefined);
		});
	});
});

describe("MetricHandler.clearCaches", () => {
	test("clears all caches", () => {
		const mockCounter = { add: mock(() => {}) };
		const mockMeter = {
			createCounter: mock(() => mockCounter),
			createUpDownCounter: mock(() => ({ add: mock(() => {}) })),
			createHistogram: mock(() => ({ record: mock(() => {}) })),
		};

		spyOn(SidecarProvidersModule.SidecarProviders, "getMeter").mockReturnValue(
			mockMeter as unknown as ReturnType<typeof SidecarProvidersModule.SidecarProviders.getMeter>,
		);

		// Create some cached instruments
		MetricHandler.handle({
			name: "cached.counter",
			type: { kind: "counter", value: 1 },
			timeNs: BigInt(Date.now() * 1_000_000),
		});

		// Clear caches
		MetricHandler.clearCaches();

		// Create same metric again - should create new instrument
		MetricHandler.handle({
			name: "cached.counter",
			type: { kind: "counter", value: 1 },
			timeNs: BigInt(Date.now() * 1_000_000),
		});

		// Counter should be created twice because cache was cleared
		expect(mockMeter.createCounter).toHaveBeenCalledTimes(2);
	});
});
