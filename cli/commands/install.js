import readline from "readline";
import { execFileSync, execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ROOT, readEnv, setKey } from "../lib/env.js";
import { log, ok, err, warn, info, col, spinner } from "../lib/colors.js";
import {
	LLAMA_RELEASES_URL,
	detectGpu,
	findExistingLlamaServer,
	gpuAdvice,
	installManagedLlamaServer,
	installPythonVenvFallback,
	managedLlamaBinaryPath,
	verifyBinary,
	writeLlamaBinaryEnv,
} from "../lib/localEngine.js";

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

function isWeakSecret(value) {
	if (!value) return true;
	const v = value.toLowerCase();
	return value === "change-this-to-a-long-random-string" ||
		value === "change_me_please" ||
		value === "your-secret-here" ||
		value === "changeme" ||
		v.includes("example") ||
		(v.includes("secret") && value.length < 32);
}

function hardenFirstRunEnv() {
	const envPath = path.join(ROOT, "den/.env");
	if (!fs.existsSync(envPath)) return;
	const env = readEnv("den/.env");
	if (isWeakSecret(env.JWT_SECRET || "")) {
		setKey("den/.env", "JWT_SECRET", crypto.randomBytes(32).toString("hex"));
		ok("Generated JWT_SECRET");
	}
	if (!env.LOCAL_PASSWORD || env.LOCAL_PASSWORD === "changeme") {
		const password = `${crypto.randomBytes(2).toString("hex")}-${crypto.randomBytes(2).toString("hex")}-${crypto.randomBytes(2).toString("hex")}`;
		setKey("den/.env", "LOCAL_PASSWORD", password);
		ok("Generated LOCAL_PASSWORD");
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

async function installManagedEngine() {
	const s = spinner("Installing managed llama.cpp local engine...");
	try {
		const result = await installManagedLlamaServer();
		s.stop(`llama.cpp installed from ${result.asset}`);
		ok(`LLAMA_BINARY_PATH=${result.binary}`);
		return true;
	} catch (e) {
		s.fail("Managed llama.cpp install failed");
		warn(e.message);
		info(`Manual releases: ${col("cyan", LLAMA_RELEASES_URL)}`);
		info(`Then run: ${col("cyan", "asyncat config set LLAMA_BINARY_PATH=/full/path/to/llama-server")}`);
		return false;
	}
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

function checkCxxCompiler() {
	const compilers = process.platform === "win32"
		? ["cl", "clang++", "g++"]
		: ["g++", "c++", "clang++"];
	for (const cmd of compilers) {
		try {
			execSync(`${cmd} --version`, { stdio: "ignore", timeout: 5000 });
			return cmd;
		} catch {}
	}
	return null;
}

function cxxInstallHint() {
	if (process.platform === "linux") {
		let id = "";
		try { id = fs.readFileSync("/etc/os-release", "utf8"); } catch {}
		if (/fedora|rhel|centos|rocky|alma/i.test(id)) return "sudo dnf install gcc-c++ make";
		return "sudo apt install build-essential";
	}
	if (process.platform === "darwin") return "xcode-select --install";
	return "Install Visual Studio Build Tools (C++ workload) from visualstudio.microsoft.com";
}

async function checkLlama(python, args = []) {
	const existing = findExistingLlamaServer();
	const gpu = detectGpu();
	const advice = gpuAdvice(gpu);

	if (existing.found) {
		if (args.includes("--local-engine") && !existing.isPython && !verifyBinary(existing.binary)) {
			warn(`Existing llama-server at ${existing.binary} failed verification; reinstalling managed engine.`);
			await installManagedEngine();
			return;
		}
		ok(`llama-server detected (${existing.source})`);
		if (!existing.isPython && path.isAbsolute(existing.binary)) {
			writeLlamaBinaryEnv(existing.binary);
			info(`LLAMA_BINARY_PATH=${col("white", existing.binary)}`);
		}
		if (advice) warn(advice);
		return;
	}

	if (args.includes("--skip-local-engine")) {
		info("Skipped local engine setup. Ollama, LM Studio, and cloud providers still work.");
		return;
	}

	warn("llama-server not found — local AI models will not work without it.");
	if (advice) warn(advice);

	if (args.includes("--local-engine")) {
		await installManagedEngine();
		return;
	}

	// Map detected GPU to a build profile for llama-cpp-python
	const gpuProfile = gpu?.vendor === "NVIDIA" ? "nvidia_gpu"
		: gpu?.vendor === "Apple" ? "apple_metal"
		: gpu?.vendor === "AMD" ? "amd_rocm"
		: null;

	// Managed llama.cpp GitHub releases have no CUDA binary for Linux x64,
	// so recommend the Python GPU build when NVIDIA is detected on Linux.
	const isNvidiaLinux = gpuProfile === "nvidia_gpu" && process.platform === "linux";

	const opt1Hint = isNvidiaLinux
		? col("dim", "(CPU only — no CUDA binary for Linux)")
		: col("dim", "(recommended)");
	const opt3Label = gpuProfile === "nvidia_gpu" ? "Build CUDA GPU runtime (llama-cpp-python)  "
		: gpuProfile === "apple_metal" ? "Build Metal GPU runtime (llama-cpp-python)  "
		: gpuProfile === "amd_rocm"    ? "Build ROCm GPU runtime (llama-cpp-python)   "
		: "Create Asyncat Python venv fallback       ";
	const opt3Hint = gpuProfile
		? (isNvidiaLinux ? col("dim", "(recommended — ~10-30 min compile)") : col("dim", "(~10-30 min compile)"))
		: col("dim", "(no global pip)");

	log("");
	log(`  ${col("bold", "Install options:")}`);
	log(`  ${col("cyan", "[1]")} Install managed llama.cpp binary       ${opt1Hint}`);
	log(`  ${col("cyan", "[2]")} Set custom LLAMA_BINARY_PATH`);
	log(`  ${col("cyan", "[3]")} ${opt3Label} ${opt3Hint}`);
	log(`  ${col("cyan", "[4]")} Skip — use Ollama, LM Studio, or cloud`);
	log("");

	if (!process.stdin.isTTY) {
		info(`Non-interactive shell detected. Run ${col("cyan", "asyncat install --local-engine")} to install the managed local engine.`);
		return;
	}

	const choice = await prompt("  Choose [1/2/3/4]: ");
	if (choice === "1") {
		await installManagedEngine();
	} else if (choice === "2") {
		const customPath = await prompt("  Full path to llama-server: ");
		if (!customPath) {
			info("Cancelled.");
			return;
		}
		if (!fs.existsSync(customPath)) {
			err(`Not found: ${customPath}`);
			return;
		}
		writeLlamaBinaryEnv(customPath);
		ok(`LLAMA_BINARY_PATH=${customPath}`);
	} else if (choice === "3") {
		if (!python) {
			err("Python not found. Install Python 3.10+ first, then rerun install.");
			return;
		}
		if (gpuProfile) {
			const cxx = checkCxxCompiler();
			if (!cxx) {
				const hint = cxxInstallHint();
				err("C++ compiler not found — required to compile llama-cpp-python with GPU support.");
				info(`Install it first: ${col("cyan", hint)}`);
				info(`Then rerun: ${col("cyan", "asyncat install")}`);
				return;
			}
			const gpuName = gpuProfile === "nvidia_gpu" ? "CUDA"
				: gpuProfile === "apple_metal" ? "Metal"
				: "ROCm";
			warn(`Building ${gpuName} runtime — compiles from source, may take 10-30 minutes.`);
		}
		const buildMsg = gpuProfile === "nvidia_gpu" ? "Compiling CUDA llama-cpp-python (10-30 min)..."
			: gpuProfile === "apple_metal" ? "Compiling Metal llama-cpp-python..."
			: gpuProfile === "amd_rocm"    ? "Compiling ROCm llama-cpp-python..."
			: "Creating Asyncat Python venv and installing llama-cpp-python...";
		const s = spinner(buildMsg);
		try {
			const venvPython = installPythonVenvFallback(python, { profile: gpuProfile || "cpu_safe" });
			s.stop("llama-cpp-python installed in Asyncat venv");
			info(`venv python: ${col("white", venvPython)}`);
			if (gpuProfile) {
				setKey("den/.env", "LLAMA_GPU_LAYERS", "-1");
				ok("LLAMA_GPU_LAYERS=-1 (all layers offloaded to GPU)");
			}
		} catch (e) {
			s.fail("Python venv build failed");
			warn(e.message);
			info("This did not touch system Python packages.");
		}
	} else {
		info("Skipped — Ollama, LM Studio, and cloud AI providers still work.");
		info(`Managed path when you are ready: ${col("white", managedLlamaBinaryPath())}`);
	}
}

export async function run(args = []) {
	const skipPackages = args.includes("--skip-packages");

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

	if (!checkCmd("git")) {
		err("git not found — install from https://git-scm.com and rerun install.");
		return;
	}
	ok(`git ${execSync("git --version").toString().trim().replace(/^git version /, "")}`);

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
	hardenFirstRunEnv();

	log("");
	log(col("bold", "  Installing packages..."));
	log("");
	if (skipPackages) {
		info("Packages already installed by bootstrap installer.");
	} else {
		await runWithSpinner("npm", ["install"], ROOT, "workspace");
	}
	ensureNativeRuntimeDeps();

	log("");
	log(col("bold", "  Checking llama.cpp (local AI)..."));
	log("");
	await checkLlama(python, args);

	log("");
	ok(
		col("bold", "Setup complete!") +
			`  Type ${col("cyan", "start")} to launch asyncat.`,
	);
	log("");
}
