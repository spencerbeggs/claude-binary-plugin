/**
 * Shared template utilities for plugin and marketplace scaffolding.
 *
 * These generators produce file contents used by both single-plugin
 * and marketplace template generators.
 */

import type { ScaffoldConfig } from "../scaffold.js";

// =============================================================================
// STRING CONVERSION HELPERS
// =============================================================================

/** Convert a string to SCREAMING_SNAKE_CASE for environment variable prefixes. */
export function toScreamingSnake(name: string): string {
	return name
		.replace(/([a-z])([A-Z])/g, "$1_$2")
		.replace(/[\s\-.]+/g, "_")
		.toUpperCase();
}

/** Convert a string to kebab-case for file and package names. */
export function toKebabCase(name: string): string {
	return name
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/[\s_.]+/g, "-")
		.toLowerCase();
}

// =============================================================================
// HOOK TYPE → NAME/FILE MAPPING
// =============================================================================

/** Maps hook types to their default handler names and filenames. */
export const HOOK_NAME_MAP: Record<string, { name: string; file: string; tools?: string[] }> = {
	SessionStart: { name: "context", file: "context" },
	PreToolUse: { name: "security", file: "security", tools: ["Bash"] },
	PostToolUse: { name: "post-tool", file: "post-tool", tools: ["Bash"] },
	Stop: { name: "stop-guard", file: "stop-guard" },
	SubagentStop: { name: "subagent-guard", file: "subagent-guard" },
	UserPromptSubmit: { name: "prompt-filter", file: "prompt-filter" },
	Notification: { name: "notification", file: "notification" },
	PermissionRequest: { name: "permission", file: "permission" },
	SessionEnd: { name: "cleanup", file: "cleanup" },
	PreCompact: { name: "pre-compact", file: "pre-compact" },
};

// =============================================================================
// PROJECT FILE GENERATORS
// =============================================================================

/** Generate .claude-plugin/plugin.json manifest. */
export function generatePluginJson(config: ScaffoldConfig, pluginName?: string): string {
	const manifest: Record<string, unknown> = {
		name: pluginName ?? config.name,
		version: "0.1.0",
		description: config.description,
	};
	if (config.author.name || config.author.email) {
		manifest.author = config.author;
	}
	if (config.license) {
		manifest.license = config.license;
	}
	return `${JSON.stringify(manifest, null, "\t")}\n`;
}

/** Generate package.json for a plugin or workspace root. */
export function generatePackageJson(
	config: ScaffoldConfig,
	opts?: { workspace?: boolean; pluginName?: string },
): string {
	const name = opts?.pluginName ?? config.name;
	const scripts: Record<string, string> = {
		build: "claude-binary-plugin build",
		test: "bun test",
		lint: "biome check --write",
		typecheck: "tsgo --noEmit",
	};
	if (opts?.workspace) {
		scripts.validate = "claude plugin validate .";
	}
	if (config.includeLintStaged) {
		scripts.prepare = "husky";
	}
	const pkg: Record<string, unknown> = {
		name,
		version: "0.1.0",
		description: opts?.workspace ? "Example plugin" : config.description,
	};
	if (config.author.name || config.author.email) {
		pkg.author = config.author;
	}
	if (config.license) {
		pkg.license = config.license;
	}
	if (config.githubOwner) {
		pkg.repository = { type: "git", url: `git+https://github.com/${config.githubOwner}/${name}.git` };
		pkg.homepage = `https://github.com/${config.githubOwner}/${name}#readme`;
		pkg.bugs = { url: `https://github.com/${config.githubOwner}/${name}/issues` };
	}
	pkg.type = "module";
	pkg.scripts = scripts;
	pkg.dependencies = {
		"claude-binary-plugin": "^1.0.0",
	};
	pkg.peerDependencies = {
		zod: "^4.0.0",
	};
	const devDeps: Record<string, string> = {
		"@types/bun": "1.3.9",
		zod: "^4.3.0",
		...(opts?.workspace ? {} : { "@biomejs/biome": "^1.9.0", typescript: "^5.9.0" }),
	};
	if (config.includeLintStaged) devDeps["@savvy-web/lint-staged"] = "^0.4.6";
	if (config.includeCommitlint) devDeps["@savvy-web/commitlint"] = "^0.3.4";
	if (config.includeChangesets) devDeps["@savvy-web/changesets"] = "^0.1.2";
	pkg.devDependencies = devDeps;
	pkg.packageManager = "bun@1.3.9";
	pkg.engines = { bun: ">=1.3.9" };
	pkg.engineStrict = true;
	pkg.devEngines = {
		runtime: [{ name: "bun", version: "1.3.9", onFail: "ignore" }],
		packageManager: { name: "bun", version: "1.3.9", onFail: "ignore" },
	};
	return `${JSON.stringify(pkg, null, "\t")}\n`;
}

/** Generate tsconfig.json extending claude-binary-plugin preset. */
export function generateTsConfig(opts?: { extends?: string; composite?: boolean }): string {
	if (opts?.extends) {
		const tsconfig: Record<string, unknown> = {
			extends: opts.extends,
			compilerOptions: {
				composite: true,
				rootDir: ".",
				outDir: "dist",
			},
			include: ["**/*.ts", "**/*.tsx"],
			exclude: ["node_modules", "dist"],
		};
		return `${JSON.stringify(tsconfig, null, "\t")}\n`;
	}
	const tsconfig = {
		extends: ["claude-binary-plugin/tsconfig/root.json"],
	};
	return `${JSON.stringify(tsconfig, null, "\t")}\n`;
}

/** Generate biome.jsonc for linting and formatting. */
export function generateBiomeConfig(opts?: { root?: boolean; lintStagedPreset?: boolean }): string {
	if (opts?.root === false) {
		return `${JSON.stringify({ extends: ["//"] }, null, "\t")}\n`;
	}
	if (opts?.lintStagedPreset) {
		const config = {
			$schema: "https://biomejs.dev/schemas/2.4.1/schema.json",
			extends: ["@savvy-web/lint-staged/biome/silk.jsonc"],
		};
		return `${JSON.stringify(config, null, "\t")}\n`;
	}
	const config = {
		$schema: "https://biomejs.dev/schemas/1.9.0/schema.json",
		organizeImports: {
			enabled: true,
		},
		formatter: {
			indentStyle: "tab",
			lineWidth: 120,
		},
		linter: {
			enabled: true,
			rules: {
				recommended: true,
			},
		},
	};
	return `${JSON.stringify(config, null, "\t")}\n`;
}

/** Generate bunfig.toml with test coverage configuration. */
export function generateBunfigToml(): string {
	return `[test]
coverage = true
coverageSkipTestFiles = true
coverageReporter = ["text", "lcov"]

[test.coverageThreshold]
line = 0.9
function = 0.9
statement = 0.9
perFile = true
`;
}

/** Generate .env.example showing available plugin options. */
export function generateEnvExample(config: ScaffoldConfig): string {
	const lines = [
		`# ${config.name} — Plugin Options`,
		`# Copy to .env.local and customize as needed.`,
		`#`,
		`# These environment variables are read by the plugin at startup`,
		`# and validated against the options schema in plugin.config.ts.`,
		"",
		`# Enable debug logging (default: false)`,
		`${config.prefix}_DEBUG=false`,
		"",
		`# Timeout for operations in milliseconds (default: 30000)`,
		`${config.prefix}_TIMEOUT_MS=30000`,
	];

	if (config.includeOtel) {
		lines.push(
			"",
			"# --- OTEL Telemetry ---",
			"",
			"# OTLP endpoint for sending telemetry (required to enable OTEL)",
			"# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318",
			"",
			"# Authentication headers for the OTLP endpoint",
			"# OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer YOUR_TOKEN",
		);
	}

	lines.push("");
	return lines.join("\n");
}

/** Generate .gitignore for plugin projects. */
export function generateGitignore(opts?: { marketplace?: boolean }): string {
	const lines = [
		"# Dependencies",
		"node_modules/",
		"",
		"# Plugin binary (platform-specific, built on each machine)",
		"*.plugin",
		"",
		"# Build artifacts",
		".plugin-entrypoint.ts",
		".build-lock/",
		"",
		"# Environment",
		".env.local",
		"",
		"# OS files",
		".DS_Store",
	];
	if (opts?.marketplace) {
		lines.push("", "# Turborepo", ".turbo/");
	}
	return `${lines.join("\n")}\n`;
}

/** Generate CLAUDE.md context file for the project. */
export function generateClaudeMd(config: ScaffoldConfig): string {
	const hooks = config.hooks.includes("SessionStart") ? config.hooks : ["SessionStart", ...config.hooks];

	const hookRows = hooks
		.map((hookType) => {
			const mapping = HOOK_NAME_MAP[hookType];
			if (!mapping) return null;
			return `| ${hookType}/${mapping.name} | hooks/${mapping.file}.hook.ts | ${hookType} handler |`;
		})
		.filter(Boolean)
		.join("\n");

	const commandSection = config.includeCommands
		? `\n## Commands\n\n| Command | File | Purpose |\n| ------- | ---- | ------- |\n| example | commands/example.cmd.ts | Example command |\n`
		: "";

	return `# ${config.name}

${config.description}

## Development

\`\`\`bash
# Build the plugin
claude-binary-plugin build

# Run tests
bun test

# Lint and format
bun run lint

# Type-check
bun run typecheck
\`\`\`

## Architecture

This plugin uses the \`claude-binary-plugin\` SDK to compile hooks and
commands into a single Bun executable.

## Hooks

| Hook | File | Purpose |
| ---- | ---- | ------- |
${hookRows}
${commandSection}
## Testing

Tests use the \`PluginTester\` fluent API from \`claude-binary-plugin\`.
Run \`bun test\` to execute all tests.

## Distribution

This plugin uses a proxy script for cross-platform distribution.
The compiled binary is platform-specific and \`.gitignore\`'d; it gets
built automatically on each machine at first use.

### What to commit

| File | Purpose |
| ---- | ------- |
| \`plugin.config.ts\` | Plugin source definition |
| \`hooks/hooks.json\` | Hook manifest (Claude Code discovery) |
| \`scripts/setup-proxy.sh\` | On-demand build trigger |
| \`bun.lock\` | Reproducible dependency installs |
| \`src/\`, \`hooks/\`, \`commands/\` | Source code |

### What NOT to commit (\`.gitignore\`'d)

| File | Reason |
| ---- | ------ |
| \`*.plugin\` | Platform-specific binary |
| \`node_modules/\` | Installed per-machine |
| \`.plugin-entrypoint.ts\` | Build artifact |
| \`.build-lock/\` | Build lock directory |

### How it works

1. \`claude-binary-plugin build\` compiles the binary and generates
   \`hooks/hooks.json\` and \`scripts/setup-proxy.sh\`
2. On a new machine, Claude Code fires SessionStart
3. \`hooks.json\` routes through the proxy script
4. The proxy detects the missing binary, runs \`bun install\` + build
5. Subsequent hooks run directly against the compiled binary
`;
}

// =============================================================================
// LICENSE FILE GENERATOR
// =============================================================================

/** Generate a LICENSE file based on the configured license identifier. */
export function generateLicenseFile(config: ScaffoldConfig): string {
	const year = new Date().getFullYear();
	const author = config.author.name || "the project contributors";

	switch (config.license) {
		case "MIT":
			return `MIT License

Copyright (c) ${year} ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

		case "Apache-2.0":
			return `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to the Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by the Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding any notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   Copyright ${year} ${author}

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
`;

		case "ISC":
			return `ISC License

Copyright (c) ${year} ${author}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
`;

		case "BSD-3-Clause":
			return `BSD 3-Clause License

Copyright (c) ${year} ${author}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`;

		case "GPL-3.0-only":
			return `This project is licensed under the GNU General Public License v3.0.

See https://www.gnu.org/licenses/gpl-3.0.txt for the full license text.
`;

		case "UNLICENSED":
			return `This project is proprietary and unlicensed.
`;

		default:
			return `License: ${config.license}\n`;
	}
}

// =============================================================================
// README GENERATOR
// =============================================================================

/** Generate a README.md for the project. */
export function generateReadme(config: ScaffoldConfig): string {
	const lines: string[] = [`# ${config.name}`, ""];

	if (config.description) {
		lines.push(config.description, "");
	}

	if (config.githubOwner && config.license) {
		lines.push(`![License](https://img.shields.io/github/license/${config.githubOwner}/${config.name})`, "");
	}

	lines.push("## Install", "");
	if (config.type === "marketplace") {
		lines.push("Clone this repository:", "");
		lines.push(
			"```bash",
			`git clone https://github.com/${config.githubOwner || "owner"}/${config.name}.git`,
			`cd ${config.name}`,
			"bun install",
			"```",
			"",
		);
	} else {
		lines.push("```bash", `bun add ${config.name}`, "```", "");
	}

	lines.push("## Development", "");
	lines.push("```bash", "# Build the plugin", "claude-binary-plugin build", "");
	lines.push("# Run tests", "bun test", "");
	lines.push("# Lint and format", "bun run lint", "");
	lines.push("# Type-check", "bun run typecheck", "```", "");

	if (config.type === "marketplace") {
		lines.push("## Workspace Structure", "");
		lines.push("```text", `${config.name}/`);
		lines.push("\u251c\u2500\u2500 plugins/           # Plugin packages");
		lines.push("\u251c\u2500\u2500 package.json       # Workspace root");
		lines.push("\u251c\u2500\u2500 turbo.json         # Task orchestration");
		lines.push("\u2514\u2500\u2500 tsconfig.json      # Root TypeScript config");
		lines.push("```", "");
		lines.push(
			"Add new plugins under `plugins/` and register them in",
			"`.claude-plugin/marketplace.json` and the root `tsconfig.json`.",
			"",
		);
	}

	if (config.license) {
		lines.push("## License", "");
		lines.push(
			`This project is licensed under the ${config.license} license. See the [LICENSE](./LICENSE) file for details.`,
			"",
		);
	}

	return lines.join("\n");
}

// =============================================================================
// PLUGIN CONFIG GENERATOR
// =============================================================================

/** Generate plugin.config.ts with typed hooks and optional commands. */
export function generatePluginConfig(config: ScaffoldConfig): string {
	const hooks = config.hooks.includes("SessionStart") ? config.hooks : ["SessionStart", ...config.hooks];

	// Build hook entries grouped by type
	const hookEntries = hooks
		.map((hookType) => {
			const mapping = HOOK_NAME_MAP[hookType];
			if (!mapping) return null;
			const toolsLine = mapping.tools ? `\n\t\t\t\ttools: ${JSON.stringify(mapping.tools)},` : "";
			return `\t\t${hookType}: [\n\t\t\t{\n\t\t\t\tname: "${mapping.name}",${toolsLine}\n\t\t\t\tpipeline: "./hooks/${mapping.file}.hook.ts",\n\t\t\t},\n\t\t],`;
		})
		.filter(Boolean)
		.join("\n\n");

	const commandsSection = config.includeCommands
		? `

\t// Commands — CLI tools exposed to Claude via skill markdown files.
\t// Invoked with: ./plugin --cmd=<name> [args...]
\tcommands: {
\t\texample: {
\t\t\tdescription: "Run an example command",
\t\t\targs: z.object({
\t\t\t\t_positionals: z.array(z.string()).optional().default([]),
\t\t\t}),
\t\t\tpipeline: "./commands/example.cmd.ts",
\t\t},
\t},`
		: "";

	return `/**
 * Plugin configuration for ${config.name}.
 *
 * This file defines the plugin's options schema, setup function, hooks,
 * and commands. It is the entry point for the build system.
 *
 * Build: claude-binary-plugin build
 * Test:  bun test
 */

import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import type { InferPluginCommands, InferPluginPipeline } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
\t// Environment variable prefix. All options below are read from
\t// env vars like ${config.prefix}_DEBUG, ${config.prefix}_TIMEOUT_MS, etc.
\tprefix: "${config.prefix}",

\t// Options schema — validated at startup from environment variables.
\t// Use z.string().default().transform() for booleans (env vars are strings),
\t// and z.coerce.number().default() for numeric values.
\toptions: z.object({
\t\t// Boolean option: env vars are strings, so parse to boolean
\t\tDEBUG: z
\t\t\t.string()
\t\t\t.default("false")
\t\t\t.transform((v) => v === "true"),

\t\t// Numeric option: coerced from string with a sensible default
\t\tTIMEOUT_MS: z.coerce.number().default(30000),
\t}),

\t// Setup function — runs once at SessionStart to compute derived state.
\t// The returned object is serialized and available in all subsequent
\t// hooks and commands as the \`state\` parameter.
\tsetup: async ({ cwd }) => {
\t\t// Detect project characteristics for use in hook handlers
\t\tconst hasPackageJson = await Bun.file(\`\${cwd}/package.json\`).exists();
\t\tconst hasTsConfig = await Bun.file(\`\${cwd}/tsconfig.json\`).exists();

\t\treturn {
\t\t\thasPackageJson,
\t\t\thasTsConfig,
\t\t};
\t},

\t// Hooks — intercept Claude Code lifecycle events.
\t// Each hook points to a handler file that receives typed context:
\t//   { input, options, state } for pipeline handlers
\thooks: {
${hookEntries}
\t},${commandsSection}
});

// Export inferred types for use in hook and command handler files.
// In your handlers, import these types:
//   import type { Pipeline } from "../plugin.config.js";
//   const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => { ... };
export type Pipeline = InferPluginPipeline<typeof plugin>;
export type Commands = InferPluginCommands<typeof plugin>;

export default plugin;
`;
}

// =============================================================================
// HOOK HANDLER GENERATORS
// =============================================================================

/** Generate a typed hook handler file for the given hook type. */
export function generateHookHandler(
	hookType: string,
	hookName: string,
	_prefix: string,
	opts?: { includeOtel?: boolean },
): string {
	const otel = opts?.includeOtel ?? false;
	switch (hookType) {
		case "SessionStart":
			return generateSessionStartHandler(hookName, otel);
		case "SessionEnd":
			return generateSessionEndHandler(hookName);
		case "PreToolUse":
			return generatePreToolUseHandler(hookName, otel);
		case "PostToolUse":
			return generatePostToolUseHandler(hookName, otel);
		case "Stop":
			return generateStopHandler(hookName);
		case "SubagentStop":
			return generateSubagentStopHandler(hookName);
		case "UserPromptSubmit":
			return generateUserPromptSubmitHandler(hookName);
		case "Notification":
			return generateNotificationHandler(hookName);
		case "PermissionRequest":
			return generatePermissionRequestHandler(hookName);
		case "PreCompact":
			return generatePreCompactHandler(hookName);
		default:
			return generateGenericHandler(hookType, hookName);
	}
}

function generateSessionStartHandler(_hookName: string, includeOtel: boolean): string {
	const otelImport = includeOtel ? '\nimport { OtelConfig } from "claude-binary-plugin";\n' : "";
	const otelContext = includeOtel
		? `
\tif (OtelConfig.isEnabled()) {
\t\tlines.push("- OTEL telemetry is enabled");
\t}
`
		: "";

	return `/**
 * SessionStart hook — "context"
 *
 * Runs once when Claude Code starts a new session. Use this to inject
 * project context that helps Claude understand your codebase.
 *
 * Handler type: Pipeline["SessionStart"]
 * Input:  { source: "startup" | "resume" | "clear" | "compact" }
 * Output: SessionStartPipelineOutput (action: "context" | "none")
 */

import type { Pipeline } from "../plugin.config.js";${otelImport}

const handler: Pipeline["SessionStart"] = ({ input, options, state }) => {
\t// Build context lines based on detected project characteristics
\tconst lines: string[] = ["# Project Context"];

\tif (state.hasPackageJson) {
\t\tlines.push("- This project uses Node.js/Bun with a package.json");
\t}

\tif (state.hasTsConfig) {
\t\tlines.push("- TypeScript is configured in this project");
\t}

\tif (options.DEBUG) {
\t\tlines.push(\`- Debug mode is enabled (timeout: \${options.TIMEOUT_MS}ms)\`);
\t}
${otelContext}
\t// Only inject context if we have something useful to say
\tif (lines.length <= 1) {
\t\treturn {
\t\t\tstatus: "executed",
\t\t\taction: "none",
\t\t\tsummary: "no project context to inject",
\t\t};
\t}

\treturn {
\t\tstatus: "executed",
\t\taction: "context",
\t\tsummary: \`injected \${lines.length - 1} context lines\`,
\t\tclaudeContext: lines.join("\\n"),
\t};
};

export default handler;
`;
}

function generateSessionEndHandler(_hookName: string): string {
	return `/**
 * SessionEnd hook — "cleanup"
 *
 * Runs when the Claude Code session ends. Use this for cleanup tasks
 * like flushing caches, closing connections, or logging session stats.
 *
 * Handler type: Pipeline["SessionEnd"]
 * Input:  { reason: "clear" | "logout" | "prompt_input_exit" | "other" }
 * Output: PassthroughPipelineOutput (action: "none" only)
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["SessionEnd"] = ({ input }) => {
\t// SessionEnd is passthrough-only — use for cleanup, not behavior changes.
\t// The reason tells you why the session ended:
\t//   "clear"  — user cleared the session
\t//   "logout" — user logged out
\t//   "prompt_input_exit" — user exited the prompt
\t//   "other"  — other reason
\treturn {
\t\tstatus: "executed",
\t\taction: "none",
\t\tsummary: \`session ended: \${input.reason}\`,
\t};
};

export default handler;
`;
}

function generatePreToolUseHandler(_hookName: string, _includeOtel: boolean): string {
	return `/**
 * PreToolUse hook — "security"
 *
 * Runs before Claude executes a tool. Use this to allow, deny, or
 * modify tool inputs before they run. This handler is filtered to
 * only fire for Bash tool invocations.
 *
 * Handler type: Pipeline["PreToolUse"]
 * Input:  { tool_name, tool_input: { command?: string }, tool_use_id }
 * Output: PreToolUsePipelineOutput (action: "allow" | "deny" | "ask" | "modify")
 */

import type { Pipeline } from "../plugin.config.js";

// Patterns considered dangerous — add your own as needed
const DANGEROUS_PATTERNS = [
\t/\\brm\\s+(-[a-zA-Z]*f|-[a-zA-Z]*r|--force|--recursive)/,
\t/\\bsudo\\s+rm\\b/,
\t/\\b(chmod|chown)\\s+(-R|--recursive)\\s+\\//,
\t/\\bdd\\s+.*of=\\/dev\\//,
\t/\\bmkfs\\b/,
];

const handler: Pipeline["PreToolUse"] = ({ input }) => {
\tconst command = (input.tool_input as { command?: string }).command ?? "";

\t// Check against dangerous patterns
\tfor (const pattern of DANGEROUS_PATTERNS) {
\t\tif (pattern.test(command)) {
\t\t\treturn {
\t\t\t\tstatus: "executed",
\t\t\t\taction: "deny",
\t\t\t\tsummary: "blocked dangerous command",
\t\t\t\treason: \`This command matches a dangerous pattern and has been blocked: \${command.slice(0, 80)}\`,
\t\t\t};
\t\t}
\t}

\t// Allow all other commands
\treturn {
\t\tstatus: "executed",
\t\taction: "allow",
\t\tsummary: "command allowed",
\t};
};

export default handler;
`;
}

function generatePostToolUseHandler(_hookName: string, _includeOtel: boolean): string {
	return `/**
 * PostToolUse hook — "post-tool"
 *
 * Runs after Claude executes a tool. Use this to add context based
 * on tool results, or to block continuation if something went wrong.
 *
 * Handler type: Pipeline["PostToolUse"]
 * Input:  { tool_name, tool_input, tool_response, tool_use_id }
 * Output: PostToolUsePipelineOutput (action: "block" | "continue" | "context" | "none")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PostToolUse"] = ({ input }) => {
\tconst response = input.tool_response as { output?: string } | undefined;
\tconst output = response?.output ?? "";

\t// Example: add context when test commands produce failures
\tif (output.includes("FAIL")) {
\t\treturn {
\t\t\tstatus: "executed",
\t\t\taction: "context",
\t\t\tsummary: "test failures detected",
\t\t\tclaudeContext:
\t\t\t\t"Test failures were detected in the output. " +
\t\t\t\t"Review the failing tests carefully and fix the root cause " +
\t\t\t\t"rather than modifying tests to pass.",
\t\t};
\t}

\t// No action needed for other tool results
\treturn {
\t\tstatus: "executed",
\t\taction: "none",
\t\tsummary: "no post-tool action",
\t};
};

export default handler;
`;
}

function generateStopHandler(_hookName: string): string {
	return `/**
 * Stop hook — "stop-guard"
 *
 * Runs when Claude is about to stop. Use this to block premature
 * stops and require the agent to finish its work.
 *
 * Handler type: Pipeline["Stop"]
 * Input:  { stop_hook_active: boolean }
 * Output: StopPipelineOutput (action: "block" | "continue")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["Stop"] = ({ input }) => {
\t// If the stop hook is already active (recursive), allow to prevent loops
\tif (input.stop_hook_active) {
\t\treturn {
\t\t\tstatus: "executed",
\t\t\taction: "continue",
\t\t\tsummary: "recursive stop — allowing",
\t\t};
\t}

\t// Allow the stop by default — customize this to block when needed.
\t// For example, check if tests are passing or if there are
\t// uncommitted changes that need attention.
\treturn {
\t\tstatus: "executed",
\t\taction: "continue",
\t\tsummary: "stop allowed",
\t};
};

export default handler;
`;
}

function generateSubagentStopHandler(_hookName: string): string {
	return `/**
 * SubagentStop hook — "subagent-guard"
 *
 * Runs when a subagent is about to stop. Similar to Stop but
 * specifically for subagent processes.
 *
 * Handler type: Pipeline["SubagentStop"]
 * Input:  { stop_hook_active: boolean }
 * Output: StopPipelineOutput (action: "block" | "continue")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["SubagentStop"] = ({ input }) => {
\tif (input.stop_hook_active) {
\t\treturn {
\t\t\tstatus: "executed",
\t\t\taction: "continue",
\t\t\tsummary: "recursive subagent stop — allowing",
\t\t};
\t}

\treturn {
\t\tstatus: "executed",
\t\taction: "continue",
\t\tsummary: "subagent stop allowed",
\t};
};

export default handler;
`;
}

function generateUserPromptSubmitHandler(_hookName: string): string {
	return `/**
 * UserPromptSubmit hook — "prompt-filter"
 *
 * Runs when the user submits a prompt. Use this to add context
 * or block submissions that match certain patterns.
 *
 * Handler type: Pipeline["UserPromptSubmit"]
 * Input:  { prompt: string }
 * Output: UserPromptSubmitPipelineOutput (action: "block" | "continue" | "context" | "none")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["UserPromptSubmit"] = ({ input }) => {
\tconst prompt = input.prompt ?? "";

\t// Example: add context when the user mentions deployment
\tif (/deploy|release|publish/i.test(prompt)) {
\t\treturn {
\t\t\tstatus: "executed",
\t\t\taction: "context",
\t\t\tsummary: "deployment context added",
\t\t\tclaudeContext:
\t\t\t\t"The user is asking about deployment. Ensure all tests pass " +
\t\t\t\t"and the build succeeds before proceeding with any deployment steps.",
\t\t};
\t}

\treturn {
\t\tstatus: "executed",
\t\taction: "none",
\t\tsummary: "prompt allowed",
\t};
};

export default handler;
`;
}

function generateNotificationHandler(_hookName: string): string {
	return `/**
 * Notification hook — "notification"
 *
 * Runs when Claude sends a notification. This is a passthrough-only
 * hook — use it for logging or observability, not for modifying behavior.
 *
 * Handler type: Pipeline["Notification"]
 * Input:  { message: string, notification_type: string }
 * Output: PassthroughPipelineOutput (action: "none" only)
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["Notification"] = () => {
\t// Notification hooks are passthrough-only.
\t// Use this for logging or metrics, not for changing behavior.
\treturn {
\t\tstatus: "executed",
\t\taction: "none",
\t\tsummary: "notification observed",
\t};
};

export default handler;
`;
}

function generatePermissionRequestHandler(_hookName: string): string {
	return `/**
 * PermissionRequest hook — "permission"
 *
 * Runs when Claude requests permission from the user. Use this to
 * auto-allow or auto-deny specific permission requests.
 *
 * Handler type: Pipeline["PermissionRequest"]
 * Input:  { message: string, notification_type: string }
 * Output: PermissionRequestPipelineOutput (action: "allow" | "deny")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PermissionRequest"] = () => {
\t// Example: auto-allow all permission requests.
\t// In practice, inspect the request and selectively
\t// allow or deny based on your security policy.
\treturn {
\t\tstatus: "executed",
\t\taction: "allow",
\t\tsummary: "permission auto-allowed",
\t};
};

export default handler;
`;
}

function generatePreCompactHandler(_hookName: string): string {
	return `/**
 * PreCompact hook — "pre-compact"
 *
 * Runs before Claude Code compacts the conversation context. Use this
 * to add custom instructions that should be included in the compacted
 * summary.
 *
 * Handler type: Pipeline["PreCompact"]
 * Input:  { trigger: "manual" | "auto", custom_instructions?: string }
 * Output: PassthroughPipelineOutput (action: "none" only)
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PreCompact"] = () => {
\t// PreCompact is passthrough-only — the primary use is to observe
\t// when compaction happens. Custom instructions can be added via
\t// the custom_instructions field in the input.
\treturn {
\t\tstatus: "executed",
\t\taction: "none",
\t\tsummary: "pre-compact observed",
\t};
};

export default handler;
`;
}

function generateGenericHandler(hookType: string, _hookName: string): string {
	return `/**
 * ${hookType} hook
 *
 * Handler type: Pipeline["${hookType}"]
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["${hookType}"] = () => {
\treturn {
\t\tstatus: "executed",
\t\taction: "none",
\t\tsummary: "hook executed",
\t};
};

export default handler;
`;
}

// =============================================================================
// COMMAND HANDLER GENERATORS
// =============================================================================

/** Generate a command handler file. */
export function generateCommandHandler(commandName: string, prefix: string, pluginName: string): string {
	return `/**
 * Command: ${commandName}
 *
 * Invoked by Claude via: $${prefix}_PLUGIN_DIR/${pluginName}.plugin --cmd=${commandName} [args...]
 * Claude learns about this command from the skill file at skills/${commandName}.md.
 *
 * Commands receive the same three-layer context as hooks:
 *   - args:    Validated CLI arguments (from Zod schema)
 *   - options: Plugin options (from env vars)
 *   - state:   Computed state (from setup function)
 *
 * Commands return markdown output for LLM consumption and an exit code.
 */

import type { CommandOutput } from "claude-binary-plugin";
import type { Commands } from "../plugin.config.js";

const handler: Commands["${commandName}"] = async ({ args, options, state }): Promise<CommandOutput> => {
\tconst positionals = args._positionals;
\tconst targetDesc = positionals.length > 0 ? positionals.join(", ") : "project root";

\tconst lines: string[] = [
\t\t"# Example Results",
\t\t"",
\t\t\`**Target:** \${targetDesc}\`,
\t\t\`**Project:** \${state.projectDir}\`,
\t\t"",
\t\t"## Summary",
\t\t"",
\t\t"Command executed successfully. Replace this handler with your",
\t\t"own logic — run linters, execute tests, generate reports, etc.",
\t];

\tif (options.DEBUG) {
\t\tlines.push("", "## Debug Info", "", \`- Timeout: \${options.TIMEOUT_MS}ms\`);
\t}

\treturn {
\t\texitCode: 0,
\t\toutput: lines.join("\\n"),
\t};
};

export default handler;
`;
}

/** Generate a skill markdown file for a command. */
export function generateSkillMd(commandName: string, prefix: string, pluginName: string): string {
	return `---
allowed-tools: Bash, Read, Edit, TodoWrite
description: Run the ${commandName} command
argument-hint: [path...]
---

# ${commandName.charAt(0).toUpperCase() + commandName.slice(1)} Command

Run the ${commandName} command to execute plugin logic.

## Usage

\`\`\`bash
$${prefix}_PLUGIN_DIR/${pluginName}.plugin --cmd=${commandName} $ARGUMENTS
\`\`\`

## Exit Codes

| Code | Meaning |
| ---- | ------- |
| 0 | Command executed successfully |
| 1 | Issues found (review output) |
| 2 | Script error (missing tools, config, etc.) |

## Process

1. **Run the command** with the target path(s)
2. **Review output** for any reported issues
3. **Fix issues** using Read/Edit tools
4. **Re-run until clean** to verify fixes
`;
}

// =============================================================================
// TEST FILE GENERATORS
// =============================================================================

/** Generate a test file for a hook handler. */
export function generateHookTest(hookType: string, hookName: string): string {
	switch (hookType) {
		case "SessionStart":
			return generateSessionStartTest(hookName);
		case "SessionEnd":
			return generateSessionEndTest(hookName);
		case "PreToolUse":
			return generatePreToolUseTest(hookName);
		case "PostToolUse":
			return generatePostToolUseTest(hookName);
		case "Stop":
			return generateStopTest("Stop", hookName);
		case "SubagentStop":
			return generateStopTest("SubagentStop", hookName);
		case "UserPromptSubmit":
			return generateUserPromptSubmitTest(hookName);
		case "Notification":
			return generateNotificationTest(hookName);
		case "PermissionRequest":
			return generatePermissionRequestTest(hookName);
		case "PreCompact":
			return generatePreCompactTest(hookName);
		default:
			return generateGenericTest(hookType, hookName);
	}
}

function generateSessionStartTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("SessionStart/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("injects context when project has package.json", async () => {
\t\tconst result = await ctx
\t\t\t.withSessionStartInput({ source: "startup" })
\t\t\t.runHook("SessionStart", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("context");
\t\texpect(result.context).toContain("package.json");
\t});

\ttest("returns none when no project characteristics detected", async () => {
\t\tctx.withState({ hasPackageJson: false, hasTsConfig: false });

\t\tconst result = await ctx
\t\t\t.withSessionStartInput({ source: "startup" })
\t\t\t.runHook("SessionStart", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("none");
\t});
});
`;
}

function generateSessionEndTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("SessionEnd/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("handles logout", async () => {
\t\tconst result = await ctx
\t\t\t.withSessionEndInput({ reason: "logout" })
\t\t\t.runHook("SessionEnd", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("none");
\t});

\ttest("handles clear", async () => {
\t\tconst result = await ctx
\t\t\t.withSessionEndInput({ reason: "clear" })
\t\t\t.runHook("SessionEnd", "${hookName}");

\t\texpect(result.action).toBe("none");
\t});
});
`;
}

function generatePreToolUseTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PreToolUse/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("allows safe commands", async () => {
\t\tconst result = await ctx
\t\t\t.withPreToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "git status" },
\t\t\t})
\t\t\t.runHook("PreToolUse", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("allow");
\t});

\ttest("blocks dangerous rm -rf commands", async () => {
\t\tconst result = await ctx
\t\t\t.withPreToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "rm -rf /" },
\t\t\t})
\t\t\t.runHook("PreToolUse", "${hookName}");

\t\texpect(result.action).toBe("deny");
\t\texpect(result.reason).toContain("dangerous");
\t});

\ttest("blocks sudo rm commands", async () => {
\t\tconst result = await ctx
\t\t\t.withPreToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "sudo rm /etc/hosts" },
\t\t\t})
\t\t\t.runHook("PreToolUse", "${hookName}");

\t\texpect(result.action).toBe("deny");
\t});

\ttest("allows normal file operations", async () => {
\t\tconst result = await ctx
\t\t\t.withPreToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "ls -la src/" },
\t\t\t})
\t\t\t.runHook("PreToolUse", "${hookName}");

\t\texpect(result.action).toBe("allow");
\t});
});
`;
}

function generatePostToolUseTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PostToolUse/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("adds context when test failures detected", async () => {
\t\tconst result = await ctx
\t\t\t.withPostToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "bun test" },
\t\t\t\ttool_response: { output: "FAIL src/index.test.ts" },
\t\t\t})
\t\t\t.runHook("PostToolUse", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("context");
\t\texpect(result.context).toContain("Test failures");
\t});

\ttest("takes no action for successful commands", async () => {
\t\tconst result = await ctx
\t\t\t.withPostToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "bun test" },
\t\t\t\ttool_response: { output: "All tests passed" },
\t\t\t})
\t\t\t.runHook("PostToolUse", "${hookName}");

\t\texpect(result.action).toBe("none");
\t});
});
`;
}

function generateStopTest(hookType: string, hookName: string): string {
	const inputMethod = hookType === "SubagentStop" ? "withSubagentStopInput" : "withStopInput";
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("${hookType}/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("allows stop by default", async () => {
\t\tconst result = await ctx
\t\t\t.${inputMethod}({ stop_hook_active: false })
\t\t\t.runHook("${hookType}", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("continue");
\t});

\ttest("allows recursive stop", async () => {
\t\tconst result = await ctx
\t\t\t.${inputMethod}({ stop_hook_active: true })
\t\t\t.runHook("${hookType}", "${hookName}");

\t\texpect(result.action).toBe("continue");
\t});
});
`;
}

function generateUserPromptSubmitTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("UserPromptSubmit/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("adds context for deployment-related prompts", async () => {
\t\tconst result = await ctx
\t\t\t.withUserPromptSubmitInput({ prompt: "Deploy to production" })
\t\t\t.runHook("UserPromptSubmit", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("context");
\t\texpect(result.context).toContain("deployment");
\t});

\ttest("allows normal prompts without action", async () => {
\t\tconst result = await ctx
\t\t\t.withUserPromptSubmitInput({ prompt: "Help me fix this bug" })
\t\t\t.runHook("UserPromptSubmit", "${hookName}");

\t\texpect(result.action).toBe("none");
\t});
});
`;
}

function generateNotificationTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("Notification/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("observes notifications without action", async () => {
\t\tconst result = await ctx
\t\t\t.withNotificationInput({
\t\t\t\tmessage: "Build completed",
\t\t\t\tnotification_type: "info",
\t\t\t})
\t\t\t.runHook("Notification", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("none");
\t});
});
`;
}

function generatePermissionRequestTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PermissionRequest/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("auto-allows permission requests", async () => {
\t\tconst result = await ctx
\t\t\t.withPermissionRequestInput({
\t\t\t\tmessage: "Allow filesystem access?",
\t\t\t\tnotification_type: "permission",
\t\t\t})
\t\t\t.runHook("PermissionRequest", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("allow");
\t});
});
`;
}

function generatePreCompactTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PreCompact/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("observes auto compaction", async () => {
\t\tconst result = await ctx
\t\t\t.withPreCompactInput({ trigger: "auto" })
\t\t\t.runHook("PreCompact", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("none");
\t});

\ttest("observes manual compaction", async () => {
\t\tconst result = await ctx
\t\t\t.withPreCompactInput({ trigger: "manual" })
\t\t\t.runHook("PreCompact", "${hookName}");

\t\texpect(result.action).toBe("none");
\t});
});
`;
}

function generateGenericTest(hookType: string, hookName: string): string {
	const inputMethod = getTestInputMethod(hookType);
	const inputArgs = getTestInputArgs(hookType);

	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("${hookType}/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("executes successfully", async () => {
\t\tconst result = await ctx
\t\t\t.${inputMethod}(${inputArgs})
\t\t\t.runHook("${hookType}", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t});
});
`;
}

/** Generate a test file for a command handler. */
export function generateCommandTest(commandName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("${commandName} command", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withPluginRoot(import.meta.dir + "/..")
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("executes successfully with default args", async () => {
\t\tconst result = await ctx.runCommand("${commandName}", {});

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.stdout).toContain("Example Results");
\t});

\ttest("accepts positional arguments", async () => {
\t\tconst result = await ctx.runCommand("${commandName}", {
\t\t\t_positionals: ["src/"],
\t\t});

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.stdout).toContain("src/");
\t});

\ttest("includes debug info when DEBUG is enabled", async () => {
\t\tctx.withOptions({ DEBUG: "true", TIMEOUT_MS: "5000" });

\t\tconst result = await ctx.runCommand("${commandName}", {});

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.stdout).toContain("Debug Info");
\t\texpect(result.stdout).toContain("5000");
\t});
});
`;
}

// =============================================================================
// HELPERS
// =============================================================================

function getTestInputMethod(hookType: string): string {
	const map: Record<string, string> = {
		SessionStart: "withSessionStartInput",
		PreToolUse: "withPreToolUseInput",
		PostToolUse: "withPostToolUseInput",
		Stop: "withStopInput",
		SubagentStop: "withSubagentStopInput",
		UserPromptSubmit: "withUserPromptSubmitInput",
		Notification: "withNotificationInput",
		PermissionRequest: "withPermissionRequestInput",
		PreCompact: "withPreCompactInput",
		SessionEnd: "withSessionEndInput",
	};
	return map[hookType] ?? "withSessionStartInput";
}

function getTestInputArgs(hookType: string): string {
	const map: Record<string, string> = {
		SessionStart: '{ source: "startup" }',
		PreToolUse: '{ tool_name: "Bash", tool_input: { command: "git status" } }',
		PostToolUse: '{ tool_name: "Bash", tool_input: { command: "git status" }, tool_response: { output: "clean" } }',
		Stop: "{ stop_hook_active: false }",
		SubagentStop: "{ stop_hook_active: false }",
		UserPromptSubmit: '{ prompt: "test prompt" }',
		Notification: '{ message: "test", notification_type: "info" }',
		PermissionRequest: '{ message: "test", notification_type: "permission" }',
		PreCompact: '{ trigger: "auto" }',
		SessionEnd: '{ reason: "logout" }',
	};
	return map[hookType] ?? '{ source: "startup" }';
}
