import { describe, expect, test } from "bun:test";
import { generateProxyScript } from "./proxy-template.js";

describe("generateProxyScript", () => {
	test("generates valid bash script with shebang", () => {
		const script = generateProxyScript({ binaryName: "workflow.plugin" });

		expect(script).toStartWith("#!/usr/bin/env bash");
	});

	test("substitutes binary name", () => {
		const script = generateProxyScript({ binaryName: "my-plugin.plugin" });

		expect(script).toContain('BINARY_NAME="my-plugin.plugin"');
	});

	test("substitutes config file", () => {
		const script = generateProxyScript({
			binaryName: "test.plugin",
			configFile: "custom.config.ts",
		});

		expect(script).toContain('CONFIG_FILE="custom.config.ts"');
	});

	test("uses default config file of plugin.config.ts", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		expect(script).toContain('CONFIG_FILE="plugin.config.ts"');
	});

	test("substitutes plugin name", () => {
		const script = generateProxyScript({
			binaryName: "workflow.plugin",
			pluginName: "workflow",
		});

		expect(script).toContain('PLUGIN_NAME="workflow"');
	});

	test("derives plugin name from binary name when not provided", () => {
		const script = generateProxyScript({ binaryName: "my-tool.plugin" });

		expect(script).toContain('PLUGIN_NAME="my-tool"');
	});

	test("contains exec fast-path", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		// biome-ignore lint/suspicious/noTemplateCurlyInString: Testing bash variable substitution in generated script
		expect(script).toContain('exec "${BINARY_PATH}" "$@"');
	});

	test("contains lock acquisition", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		expect(script).toContain("acquire_lock");
		expect(script).toContain("LOCK_DIR=");
		expect(script).toContain("mkdir");
	});

	test("contains bun install command", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		expect(script).toContain("bun install --frozen-lockfile");
	});

	test("contains bun build command", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		expect(script).toContain("bun x claude-binary-plugin build");
		expect(script).toContain("--no-persist");
	});

	test("contains error handler that emits valid JSON", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		expect(script).toContain("emit_error");
		expect(script).toContain("echo '{}' >&1");
	});

	test("contains stale lock detection", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		expect(script).toContain("LOCK_STALE_SECONDS=300");
	});

	test("contains stdin buffering for slow path", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		expect(script).toContain('STDIN_BUFFER="$(cat)"');
	});

	test("contains portable stat fallback", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		// macOS stat
		expect(script).toContain("stat -f %m");
		// GNU/Linux stat fallback
		expect(script).toContain("stat -c %Y");
	});

	test("uses set -euo pipefail for safety", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		expect(script).toContain("set -euo pipefail");
	});

	test("fast-path checks both binary and node_modules", () => {
		const script = generateProxyScript({ binaryName: "test.plugin" });

		// biome-ignore lint/suspicious/noTemplateCurlyInString: Testing bash variable substitution in generated script
		expect(script).toContain('-x "${BINARY_PATH}"');
		// biome-ignore lint/suspicious/noTemplateCurlyInString: Testing bash variable substitution in generated script
		expect(script).toContain('-d "${PLUGIN_DIR}/node_modules"');
	});
});
