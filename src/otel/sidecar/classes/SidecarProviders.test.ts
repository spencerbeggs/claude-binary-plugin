/**
 * Tests for SidecarProviders.
 *
 * @remarks
 * Stub test file for coverage tracking. Tests to be implemented for:
 * - SidecarProviders.init() initialization
 * - SidecarProviders.getTracer() tracer access
 * - SidecarProviders.getMeter() meter access
 * - SidecarProviders.getLogger() logger access
 * - SidecarProviders.shutdown() cleanup
 * - Singleton behavior
 * - Config change detection
 */

import { describe, expect, test } from "bun:test";
import { SidecarProviders } from "./SidecarProviders.js";

describe("SidecarProviders", () => {
	test("SidecarProviders is exported", () => {
		expect(SidecarProviders).toBeDefined();
	});

	test("init is a static method", () => {
		expect(typeof SidecarProviders.init).toBe("function");
	});

	test("getTracer is a static method", () => {
		expect(typeof SidecarProviders.getTracer).toBe("function");
	});

	test("getMeter is a static method", () => {
		expect(typeof SidecarProviders.getMeter).toBe("function");
	});

	test("getLogger is a static method", () => {
		expect(typeof SidecarProviders.getLogger).toBe("function");
	});

	test("shutdown is a static method", () => {
		expect(typeof SidecarProviders.shutdown).toBe("function");
	});
});
