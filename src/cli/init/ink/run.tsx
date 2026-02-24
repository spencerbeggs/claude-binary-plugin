import { render } from "ink";
import type { ScaffoldConfig } from "../scaffold.js";
import { App } from "./App.js";

export async function runInkWizard(defaults: Partial<ScaffoldConfig>): Promise<void> {
	return new Promise<void>((resolve) => {
		const instance = render(<App defaults={defaults} onComplete={() => instance.unmount()} />);
		instance.waitUntilExit().then(resolve);
	});
}
