import readline from "readline";
import { execFileSync, execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { ROOT } from "../lib/env.js";
import { log, ok, err, warn, info, col, spinner } from "../lib/colors.js";

const require = createRequire(import.meta.url);
const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";

function checkCmd(cmd) {
	try {
		if (cmd.startsWith("python")) {
			execSync(`${cmd} --version`, { stdio: "ignore" });
			return true;
		}
		const isWindows = process.platform === "win32";
		execSync(`${isWindows ? "where" : "command -v"} ${cmd}`, {
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
}

function llamaServerPaths() {
	const home = os.homedir();
	const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
	return [
		path.join(home, "AppData", "Local", "Microsoft", "WindowsApps", "llama-server.exe"),
		path.join(localAppData, "Microsoft", "WindowsApps", "llama-server.exe"),
		path.join(localAppData, "Microsoft", "WinGet", "Packages", "*", "llama-server.exe"),
		path.join(home, "AppData", "Local", "Programs", "Python", "Python*", "Scripts", "llama-server.exe"),
		path.join(home, "AppData", "Local", "Programs", "llama.cpp", "llama-server.exe"),
		path.join(localAppData, "Programs", "llama.cpp", "llama-server.exe"),
		path.join(home, ".local", "bin", "llama-server.exe"),
		path.join(home, ".unsloth", "llama.cpp", "build", "bin", "llama-server"),
		path.join(home, ".unsloth", "llama.cpp", "llama-server"),
		path.join(home, ".local", "bin", "llama-server"),
		path.join(home, "bin", "llama-server"),
		"/usr/local/bin/llama-server",
		"/usr/bin/llama-server",
		"/opt/homebrew/bin/llama-server",
	];
}

function pathExistsWithSimpleGlob(pattern) {
	if (!pattern.includes("*")) {
		try { return fs.statSync(pattern).isFile(); } catch { return false; }
	}

	const dir = path.dirname(pattern);
	const base = path.basename(pattern);
	const parent = path.dirname(dir);
	const dirPattern = path.basename(dir).replace("*", "");
	try {
		return fs.readdirSync(parent)
			.filter(entry => entry.startsWith(dirPattern))
			.some(entry => {
				try { return fs.statSync(path.join(parent, entry, base)).isFile(); }
				catch { return false; }
			});
	} catch {
		return false;
	}
}

function llamaServerFound() {
	return checkCmd(process.platform === "win32" ? "llama-server.exe" : "llama-server") ||
		checkCmd("llama-server") ||
		llamaServerPaths().some(pathExistsWithSimpleGlob);
}

function installLlamaCppWithWinget() {
	if (process.platform !== "win32" || !checkCmd("winget")) return false;
	const s = spinner("Installing llama.cpp local engine...");
	try {
		execSync("winget install llama.cpp --accept-package-agreements --accept-source-agreements --disable-interactivity", {
			stdio: "ignore",
			timeout: 180000,
		});
		s.stop("llama.cpp installed");
		return true;
	} catch (_) {
		s.fail("llama.cpp install failed");
		return false;
	}
}

function setupEnv(target, example) {
	const t = path.join(ROOT, target);
	const e = path.join(ROOT, example);
	if (!fs.existsSync(t)) {
		if (!fs.existsSync(e)) {
			warn(`Example file ${example} not found, skipping.`);
			return;
		}
		fs.copyFileSync(e, t);
		ok(`Created ${target}`);
		warn(
			`Edit ${col("white", target)} and set a strong JWT_SECRET before deploying.`,
		);
	} else {
		ok(`${target} exists`);
	}
}

function resolveFromWorkspace(pkg, workspaceDir) {
	let dir = workspaceDir;
	while (true) {
		if (fs.existsSync(path.join(dir, "node_modules", pkg, "package.json")))
			return true;
		const parent = path.dirname(dir);
		if (parent === dir) return false;
		dir = parent;
	}
}

function runWithSpinner(cmd, args, cwd, label) {
	return new Promise((resolve) => {
		const s = spinner(`Installing ${label} packages...`);
		const resolved = cmd === "npm" ? NPM_CMD : cmd;
		const isWin = process.platform === "win32";
		const proc = isWin
			? spawn(`${resolved} ${args.join(" ")}`, {
					cwd,
					stdio: "ignore",
					shell: true,
				})
			: spawn(resolved, args, { cwd, stdio: "ignore" });
		proc.on("exit", (code) => {
			if (code === 0) {
				s.stop(`${label} packages installed`);
				resolve(true);
			} else {
				const rel = path.relative(ROOT, cwd) || ".";
				s.fail(
					`Failed to install ${label} — try: cd ${rel} && npm install`,
				);
				resolve(false);
			}
		});
		proc.on("error", (e) => {
			const rel = path.relative(ROOT, cwd) || ".";
			s.fail(
				`Failed to install ${label} (${e.code || e.message}) — try: cd ${rel} && npm install`,
			);
			resolve(false);
		});
	});
}

function prompt(question) {
	return new Promise((resolve) => {
		const tmp = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		process.stdout.write(question);
		tmp.once("line", (ans) => {
			tmp.close();
			resolve(ans.trim());
		});
	});
}

export function ensureNativeRuntimeDeps() {
	const runtimeInstalls = [];
	const frontendDir = path.join(ROOT, "neko");

	const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";

	const pushInstall = (label, workspace, pkgs) => {
		const pkgList = pkgs.join(" ");
		runtimeInstalls.push({
			label,
			workspace,
			pkgs,
			cmd: `npm install --workspace ${workspace} --no-save --no-package-lock --legacy-peer-deps ${pkgList}`,
		});
	};

	if (process.platform === "darwin" && process.arch === "arm64") {
		if (!resolveFromWorkspace("@rollup/rollup-darwin-arm64", frontendDir)) {
			pushInstall("Rollup native runtime", "neko", [
				"@rollup/rollup-darwin-arm64",
			]);
		}
	} else if (process.platform === "win32" && process.arch === "x64") {
		if (!resolveFromWorkspace("lightningcss-win32-x64-msvc", frontendDir)) {
			pushInstall("LightningCSS native runtime", "neko", [
				"lightningcss-win32-x64-msvc",
			]);
		}

		if (!resolveFromWorkspace("@rollup/rollup-win32-x64-msvc", frontendDir)) {
			pushInstall("Rollup native runtime", "neko", [
				"@rollup/rollup-win32-x64-msvc",
			]);
		}

		if (
			!resolveFromWorkspace("@tailwindcss/oxide-win32-x64-msvc", frontendDir)
		) {
			pushInstall("Tailwind oxide native runtime", "neko", [
				"@tailwindcss/oxide-win32-x64-msvc",
			]);
		}
	}

	if (runtimeInstalls.length === 0) return;

	log("");
	log(col("bold", "  Repairing native runtime packages..."));
	log("");

	const isWin = process.platform === "win32";
	for (const install of runtimeInstalls) {
		info(`Installing ${install.label}...`);
		const args = [
			"install",
			"--workspace",
			install.workspace,
			"--no-save",
			"--no-package-lock",
			"--legacy-peer-deps",
			...install.pkgs,
		];
		try {
			if (isWin) {
				execSync(`${NPM_CMD} ${args.join(" ")}`, {
					cwd: ROOT,
					stdio: "ignore",
					shell: true,
					timeout: 30000, // 30 second timeout - fail fast
				});
			} else {
				execFileSync(NPM_CMD, args, { cwd: ROOT, stdio: "ignore", timeout: 30000 });
			}
			ok(`${install.label} installed`);
		} catch (e) {
			// Don't block startup - native runtimes are optional
			if (e.code === 'ETIMEDOUT' || e.message?.includes('timeout')) {
				info(`${install.label} install timed out (skipping - it's optional)`);
			} else {
				info(`${install.label} not available (skipping - it's optional)`);
			}
		}
	}
}

async function checkLlama(python) {
	const found = llamaServerFound();
	const pythonLlama =
		python &&
		(() => {
			try {
				execSync(`${python} -c "import llama_cpp"`, {
					stdio: "ignore",
				});
				return true;
			} catch {
				return false;
			}
		})();

	if (found) {
		ok("llama-server found");
		return;
	}
	if (pythonLlama) {
		ok("llama-cpp-python detected");
		return;
	}

	warn("llama-server not found — local AI models will not work without it.");
	log("");
	log(`  ${col("bold", "Install options:")}`);
	if (process.platform === "win32" && checkCmd("winget")) {
		log(`  ${col("cyan", "[1]")} Install llama.cpp with winget        ${col("dim", "(recommended on Windows)")}`);
		log(`  ${col("cyan", "[2]")} pip install llama-cpp-python[server]  ${col("dim", "(fallback)")}`);
	} else {
		log(`  ${col("cyan", "[1]")} pip install llama-cpp-python[server]  ${col("dim", "(fallback)")}`);
		log(`  ${col("cyan", "[2]")} Download pre-built binary              ${col("dim", "github.com/ggml-org/llama.cpp/releases")}`);
	}
	log(`  ${col("cyan", "[3]")} Skip — cloud AI providers still work`);
	log("");

	const choice = await prompt("  Choose [1/2/3]: ");
	const canWinget = process.platform === "win32" && checkCmd("winget");
	if (choice === "1" && canWinget) {
		if (installLlamaCppWithWinget() && llamaServerFound()) {
			ok("llama-server found");
		} else {
			warn("Install finished but llama-server was not detected. Restart your terminal and run install again.");
		}
	} else if (choice === "1" || (choice === "2" && canWinget)) {
		if (!python) {
			err("Python not found. Install Python 3.10+ first.");
			return;
		}
		const s = spinner("Installing llama-cpp-python...");
		try {
			execSync(`${python} -m pip install "llama-cpp-python[server]"`, {
				stdio: "ignore",
			});
			s.stop("llama-cpp-python installed");
		} catch (_) {
			s.fail(
				"Installation failed — run pip install manually and check output.",
			);
		}
	} else if (choice === "2") {
		info(`Download llama-server for ${os.platform()}-${os.arch()} from:`);
		info(col("cyan", "https://github.com/ggml-org/llama.cpp/releases"));
		info(
			`Place it at ${col("white", "~/.local/bin/llama-server")} and run ${col("dim", "chmod +x")} on it.`,
		);
	} else {
		info("Skipped — cloud AI (OpenAI, Anthropic, etc.) will still work.");
	}
}

export async function run() {
	log("");
	log(col("bold", "  Checking dependencies..."));
	log("");

	if (!checkCmd("node")) {
		err("Node.js not found — install from https://nodejs.org");
		return;
	}
	const nodeVer = execSync("node --version").toString().trim();
	const nodeMajor = parseInt(nodeVer.replace("v", "").split(".")[0], 10);
	if (nodeMajor < 20) {
		err(
			`Node.js ${nodeVer} found — version 20+ required. Install from https://nodejs.org`,
		);
		return;
	}
	ok(`Node.js ${nodeVer}`);

	if (!checkCmd("npm")) {
		err("npm not found.");
		return;
	}
	ok(`npm ${execSync("npm --version").toString().trim()}`);

	const python = ["python3", "python"].find(checkCmd);
	if (python)
		ok(
			`Python ${execSync(`${python} --version`).toString().trim().split(" ")[1]}`,
		);
	else
		warn(
			"Python not found — local AI models need a pre-built llama-server binary.",
		);

	log("");
	log(col("bold", "  Environment files..."));
	log("");
	setupEnv("den/.env", "den/.env.example");
	setupEnv("neko/.env", "neko/.env.example");

	log("");
	log(col("bold", "  Installing packages..."));
	log("");
	await runWithSpinner("npm", ["install"], ROOT, "root");
	await runWithSpinner("npm", ["install"], path.join(ROOT, "den"), "backend");
	await runWithSpinner(
		"npm",
		["install"],
		path.join(ROOT, "neko"),
		"frontend",
	);
	ensureNativeRuntimeDeps();

	log("");
	log(col("bold", "  Checking llama.cpp (local AI)..."));
	log("");
	await checkLlama(python);

	log("");
	ok(
		col("bold", "Setup complete!") +
			`  Type ${col("cyan", "start")} to launch asyncat.`,
	);
	log("");
}
