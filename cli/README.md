# Asyncat CLI

The command-line launcher for Asyncat.

> This thing gives a quantified baby model keys to your entire computer. What could go wrong?

## What it is

The CLI starts and stops the Web UI stack, manages local GGUF models,
switches AI providers, and exposes config, logs, and agent commands.

## Requirements

- Node.js 20+
- Python 3.x (optional, for local llama.cpp)
- A local model or API key

## Install

```bash
npm i -g @asyncat/asyncat
```

From repo:
```bash
npm install
```

Auto-creates `.env` files.

## Commands

```bash
asyncat start         # fire it up
asyncat stop         # kill it
asyncat status       # what's running
asyncat restart      # bounce
asyncat logs        # tail logs
asyncat doctor      # health check
asyncat config      # read/write env
asyncat agent       # run a one-shot agent task
asyncat chat        # terminal chat mode
asyncat version     # show versions
```

## Usage

```bash
asyncat start        # backend on 8716, frontend on 8717
asyncat stop        # kill both
asyncat status     # is it running?
asyncat doctor      # something's wrong, isn't it
asyncat logs       # tail -f the pain
```

## License

MIT
