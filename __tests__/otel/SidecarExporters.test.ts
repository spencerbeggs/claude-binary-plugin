import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { createLogsExporter, createMetricsExporter, createTraceExporter } from "../../src/otel/SidecarExporters.js";

describe("SidecarExporters", () => {
	let originalEnv: Record<string, string | undefined>;

	beforeEach(() => {
		originalEnv = { ...process.env };
	});

	afterEach(() => {
		// Restore original env vars
		for (const key of Object.keys(process.env)) {
			if (!(key in originalEnv)) {
				delete process.env[key];
			}
		}
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value !== undefined) {
				process.env[key] = value;
			}
		}
	});

	describe("createTraceExporter", () => {
		test("returns OTLPTraceExporter by default", () => {
			const exporter = createTraceExporter({});

			expect(exporter).toBeInstanceOf(OTLPTraceExporter);
		});

		test("returns ConsoleSpanExporter when OTEL_TRACES_EXPORTER=console", () => {
			process.env.OTEL_TRACES_EXPORTER = "console";

			const exporter = createTraceExporter({});

			expect(exporter).toBeInstanceOf(ConsoleSpanExporter);
		});

		test("returns null when OTEL_TRACES_EXPORTER=none", () => {
			process.env.OTEL_TRACES_EXPORTER = "none";

			const exporter = createTraceExporter({});

			expect(exporter).toBeNull();
		});

		test("uses custom endpoint from config", () => {
			const exporter = createTraceExporter({
				endpoint: "http://custom:4318",
			});

			expect(exporter).toBeInstanceOf(OTLPTraceExporter);
			// Can't easily check the URL without accessing private properties
		});

		test("uses default endpoint when not specified", () => {
			const exporter = createTraceExporter({});

			expect(exporter).toBeInstanceOf(OTLPTraceExporter);
		});
	});

	describe("createMetricsExporter", () => {
		test("returns OTLPMetricExporter by default", () => {
			const exporter = createMetricsExporter({});

			expect(exporter).toBeInstanceOf(OTLPMetricExporter);
		});

		test("returns null when OTEL_METRICS_EXPORTER=none", () => {
			process.env.OTEL_METRICS_EXPORTER = "none";

			const exporter = createMetricsExporter({});

			expect(exporter).toBeNull();
		});

		test("uses custom endpoint from config", () => {
			const exporter = createMetricsExporter({
				endpoint: "http://custom:4318",
			});

			expect(exporter).toBeInstanceOf(OTLPMetricExporter);
		});
	});

	describe("createLogsExporter", () => {
		test("returns OTLPLogExporter by default", () => {
			const exporter = createLogsExporter({});

			expect(exporter).toBeInstanceOf(OTLPLogExporter);
		});

		test("returns null when OTEL_LOGS_EXPORTER=none", () => {
			process.env.OTEL_LOGS_EXPORTER = "none";

			const exporter = createLogsExporter({});

			expect(exporter).toBeNull();
		});

		test("uses custom endpoint from config", () => {
			const exporter = createLogsExporter({
				endpoint: "http://custom:4318",
			});

			expect(exporter).toBeInstanceOf(OTLPLogExporter);
		});
	});
});
