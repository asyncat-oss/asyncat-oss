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
		const proc = spawn(cmd === "npm" ? NPM_CMD : cmd, args, {
			cwd,
			stdio: "ignore",
			shell: process.platform === "win32",
		});
		proc.on("exit", (code) => {
			if (code === 0) {
				s.stop(`${label} packages installed`);
				resolve(true);
			} else {
				s.fail(
					`Failed to install ${label} — try: cd ${path.relative(ROOT, cwd)} && npm install`,
				);
				resolve(false);
			}
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

function ensureNativeRuntimeDeps() {
	const runtimeInstalls = [];
	const frontendDir = path.join(ROOT, "neko");
	const backendDir = path.join(ROOT, "den");

	const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";

	const pushInstall = (label, workspace, pkgs) => {
		const pkgList = pkgs.join(" ");
		runtimeInstalls.push({
			label,
			workspace,
			pkgs,
			cmd: `npm install --workspace ${workspace} --no-save --legacy-peer-deps ${pkgList}`,
		});
	};

	if (process.platform === "darwin" && process.arch === "arm64") {
		if (!resolveFromWorkspace("@rollup/rollup-darwin-arm64", frontendDir)) {
			pushInstall("Rollup native runtime", "neko", [
				"@rollup/rollup-darwin-arm64",
			]);
		}

		const hasSharpRuntime = resolveFromWorkspace(
			"@img/sharp-darwin-arm64",
			backendDir,
		);
		const hasSharpLibvips = resolveFromWorkspace(
			"@img/sharp-libvips-darwin-arm64",
			backendDir,
		);
		if (!hasSharpRuntime || !hasSharpLibvips) {
			pushInstall("Sharp native runtime", "den", [
				"@img/sharp-darwin-arm64",
				"@img/sharp-libvips-darwin-arm64",
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

		if (!resolveFromWorkspace("@img/sharp-win32-x64", backendDir)) {
			pushInstall("Sharp native runtime", "den", ["@img/sharp-win32-x64"]);
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
			"--legacy-peer-deps",
			...install.pkgs,
		];
		try {
			if (isWin) {
				execSync(`${NPM_CMD} ${args.join(" ")}`, {
					cwd: ROOT,
					stdio: "ignore",
					shell: true,
				});
			} else {
				execFileSync(NPM_CMD, args, { cwd: ROOT, stdio: "ignore" });
			}
			ok(`${install.label} installed`);
		} catch (e) {
			warn(
				`Could not install ${install.label} (${e.code || e.message}). If startup fails, rerun ${col("dim", install.cmd)} from the repo root.`,
			);
		}
	}
}

async function checkLlama(python) {
	const paths = [
		path.join(os.homedir(), ".unsloth/llama.cpp/build/bin/llama-server"),
		path.join(os.homedir(), ".unsloth/llama.cpp/llama-server"),
		path.join(os.homedir(), ".local/bin/llama-server"),
		path.join(os.homedir(), "bin/llama-server"),
		"/usr/local/bin/llama-server",
		"/usr/bin/llama-server",
		"/opt/homebrew/bin/llama-server",
	];

	const found =
		checkCmd("llama-server") ||
		paths.some((p) => {
			try {
				return fs.statSync(p).isFile();
			} catch {
				return false;
			}
		});
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
	log(
		`  ${col("cyan", "[1]")} pip install llama-cpp-python[server]  ${col("dim", "(easiest)")}`,
	);
	log(
		`  ${col("cyan", "[2]")} Download pre-built binary              ${col("dim", "github.com/ggml-org/llama.cpp/releases")}`,
	);
	log(`  ${col("cyan", "[3]")} Skip — cloud AI providers still work`);
	log("");

	const choice = await prompt("  Choose [1/2/3]: ");
	if (choice === "1") {
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
