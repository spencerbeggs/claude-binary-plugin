import { Effect, Layer } from "effect";
import { EnvFileParser } from "../services/EnvFileParser.js";

function escapeForBashDoubleQuotes(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

function parseEnvContent(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const nameMatch = trimmed.match(/^(?:export\s+)?(\w+)=/);
		if (!nameMatch) continue;

		const name = nameMatch[1]!;
		const rest = trimmed.slice(nameMatch[0].length);

		let value: string;
		if (rest.startsWith('"')) {
			let end = 1;
			while (end < rest.length) {
				if (rest[end] === '"' && rest[end - 1] !== "\\") break;
				end++;
			}
			value = rest.slice(1, end).replace(/\\"/g, '"');
		} else if (rest.startsWith("'")) {
			const endQuote = rest.indexOf("'", 1);
			value = endQuote > 0 ? rest.slice(1, endQuote) : rest.slice(1);
		} else {
			value = rest;
		}

		result[name] = value;
	}
	return result;
}

function formatEnvContent(vars: Record<string, string>): string {
	const lines = Object.entries(vars).map(([k, v]) => `export ${k}="${escapeForBashDoubleQuotes(v)}"`);
	return `${lines.join("\n")}\n`;
}

export const EnvFileParserLive = Layer.succeed(EnvFileParser, {
	parse: (content: string) => Effect.sync(() => parseEnvContent(content)),
	format: (vars: Record<string, string>) => Effect.sync(() => formatEnvContent(vars)),
	escapeForBash: (value: string) => Effect.sync(() => escapeForBashDoubleQuotes(value)),
});
