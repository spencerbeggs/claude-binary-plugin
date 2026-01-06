/**
 * Tests for OTEL attribute and metric name constants.
 *
 * @remarks
 * Stub test file for coverage tracking. Tests to be implemented for:
 * - SCOPE constant values
 * - EVENT_NAMES constant values
 * - CLAUDE_ATTRS attribute names
 * - PLUGIN_ATTRS attribute names
 * - METRIC_NAMES metric name patterns
 * - SPAN_NAMES span name patterns
 */

import { describe, expect, test } from "bun:test";
import { EVENT_NAMES, SCOPE } from "./constants.js";

describe("SCOPE", () => {
	test("SCOPE.NAME is defined", () => {
		expect(SCOPE.NAME).toBe("systems.savvyweb.claude_code.events");
	});
});

describe("EVENT_NAMES", () => {
	test("HOOK_EXECUTION event name is defined", () => {
		expect(EVENT_NAMES.HOOK_EXECUTION).toBe("claude_code.hook.execution");
	});

	test("SCHEMA_VALIDATION_ERROR event name is defined", () => {
		expect(EVENT_NAMES.SCHEMA_VALIDATION_ERROR).toBe("claude_code.hook.validation_error");
	});
});
