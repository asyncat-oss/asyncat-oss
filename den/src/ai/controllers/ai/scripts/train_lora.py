#!/usr/bin/env python3
"""
train_lora.py — Asyncat LoRA fine-tuning script.

Wraps Hugging Face transformers + peft + trl (CUDA/CPU) or mlx_lm.lora (Apple
Silicon).  Prints one JSON line per training step to stdout so the Node.js
trainingJobManager can stream progress to the frontend via SSE.

Usage (called by trainingJobManager.js, never by users directly):
    python train_lora.py \
        --model "unsloth/Qwen3-1.7B" \
        --dataset "/path/to/data.jsonl" \
        --output-dir "/path/to/output" \
        --backend cuda \
        --epochs 3 --lr 2e-4 --rank 16 --alpha 32 \
        --batch-size 4 --max-seq-len 2048

SIGTERM handling: on SIGTERM the script saves the current checkpoint and exits
cleanly so no work is lost.
"""

import argparse
import json
import os
import signal
import sys
import time


# ── Globals ──────────────────────────────────────────────────────────────────

_interrupted = False


def _sigterm_handler(signum, frame):
    """Set flag so the training loop can save a checkpoint before exiting."""
    global _interrupted
    _interrupted = True
    emit({"type": "signal", "message": "SIGTERM received — saving checkpoint and stopping…"})


signal.signal(signal.SIGTERM, _sigterm_handler)
if hasattr(signal, "SIGINT"):
    signal.signal(signal.SIGINT, _sigterm_handler)


# ── Output helpers ───────────────────────────────────────────────────────────

def emit(payload: dict):
    """Print a single JSON line to stdout (consumed by Node.js)."""
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def emit_progress(step: int, total_steps: int, loss: float = None,
                  epoch: float = None, lr: float = None):
    pct = round(step / max(total_steps, 1) * 100, 1)
    d = {"type": "progress", "step": step, "totalSteps": total_steps, "percent": pct}
    if loss is not None:
        d["loss"] = round(loss, 4)
    if epoch is not None:
        d["epoch"] = round(epoch, 2)
    if lr is not None:
        d["lr"] = lr
    emit(d)


def emit_error(message: str, code: str = "TRAINING_ERROR"):
    emit({"type": "error", "code": code, "message": message})


# ── Pre-flight checks ───────────────────────────────────────────────────────

def preflight_check(args):
    """Validate inputs before importing heavy libraries."""
    if not os.path.isfile(args.dataset):
        emit_error(f"Dataset file not found: {args.dataset}", "DATASET_MISSING")
        sys.exit(1)

    # Count lines to estimate training steps
    with open(args.dataset, "r", encoding="utf-8") as f:
        line_count = sum(1 for _ in f)
    if line_count < 1:
        emit_error("Dataset file is empty.", "DATASET_EMPTY")
        sys.exit(1)

    emit({
        "type": "preflight",
        "datasetRows": line_count,
        "model": args.model,
        "backend": args.backend,
        "epochs": args.epochs,
        "rank": args.rank,
        "alpha": args.alpha,
        "batchSize": args.batch_size,
        "maxSeqLen": args.max_seq_len,
    })
    return line_count


# ── MLX Training Path ───────────────────────────────────────────────────────

def train_mlx(args, dataset_rows):
    """LoRA fine-tuning using mlx_lm on Apple Silicon."""
    try:
        import mlx_lm
    except ImportError:
        emit_error("mlx_lm is not installed. Run the training environment installer first.", "MLX_MISSING")
        sys.exit(1)

    emit({"type": "status", "message": "Starting MLX LoRA training…"})

    os.makedirs(args.output_dir, exist_ok=True)

    # mlx_lm.lora expects a YAML config or CLI args
    from mlx_lm import lora as mlx_lora

    lora_args = [
        "--model", args.model,
        "--train",
        "--data", os.path.dirname(args.dataset),
        "--adapter-path", args.output_dir,
        "--batch-size", str(args.batch_size),
        "--lora-layers", str(args.rank),
        "--iters", str(int(dataset_rows / args.batch_size * args.epochs)),
        "--learning-rate", str(args.lr),
    ]

    # mlx_lm.lora.main() parses sys.argv
    original_argv = sys.argv
    sys.argv = ["mlx_lm.lora"] + lora_args

    try:
        mlx_lora.main()
        emit({"type": "complete", "outputDir": args.output_dir, "message": "MLX LoRA training completed."})
    except Exception as e:
        emit_error(str(e), "MLX_TRAINING_ERROR")
        sys.exit(1)
    finally:
        sys.argv = original_argv


# ── CUDA / CPU Training Path ────────────────────────────────────────────────

def train_transformers(args, dataset_rows):
    """LoRA/QLoRA fine-tuning using transformers + peft + trl."""
    global _interrupted

    emit({"type": "status", "message": "Importing training libraries…"})

    try:
        import torch
        from transformers import (
            AutoTokenizer,
            AutoModelForCausalLM,
            TrainingArguments,
            BitsAndBytesConfig,
        )
        from peft import LoraConfig, get_peft_model, TaskType
        from trl import SFTTrainer, SFTConfig
        from datasets import load_dataset
    except ImportError as e:
        emit_error(f"Missing training library: {e}. Run the training environment installer.", "IMPORT_ERROR")
        sys.exit(1)

    # ── Detect hardware ──────────────────────────────────────────────────────
    use_cuda = args.backend == "cuda" and torch.cuda.is_available()
    device_map = "auto" if use_cuda else "cpu"

    emit({
        "type": "status",
        "message": f"Using {'CUDA GPU' if use_cuda else 'CPU'} for training.",
        "cudaAvailable": torch.cuda.is_available(),
        "gpuName": torch.cuda.get_device_name(0) if use_cuda else None,
        "vramGb": round(torch.cuda.get_device_properties(0).total_mem / 1e9, 1) if use_cuda else None,
    })

    # ── Try Unsloth first (CUDA only) ────────────────────────────────────────
    use_unsloth = False
    if use_cuda:
        try:
            from unsloth import FastLanguageModel
            use_unsloth = True
            emit({"type": "status", "message": "Unsloth detected — using fast LoRA path."})
        except ImportError:
            emit({"type": "status", "message": "Unsloth not available — using standard transformers + peft."})

    # ── Load model ───────────────────────────────────────────────────────────
    emit({"type": "status", "message": f"Loading model: {args.model}…"})

    try:
        if use_unsloth:
            model, tokenizer = FastLanguageModel.from_pretrained(
                model_name=args.model,
                max_seq_length=args.max_seq_len,
                dtype=None,  # auto
                load_in_4bit=use_cuda,
            )
            model = FastLanguageModel.get_peft_model(
                model,
                r=args.rank,
                lora_alpha=args.alpha,
                target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                                "gate_proj", "up_proj", "down_proj"],
                lora_dropout=0.05,
                bias="none",
                use_gradient_checkpointing="unsloth",
            )
        else:
            quantization_config = None
            if use_cuda:
                try:
                    quantization_config = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_quant_type="nf4",
                        bnb_4bit_compute_dtype=torch.bfloat16,
                        bnb_4bit_use_double_quant=True,
                    )
                except Exception:
                    emit({"type": "status", "message": "bitsandbytes 4-bit not available, loading in full precision."})

            tokenizer = AutoTokenizer.from_pretrained(
                args.model, trust_remote_code=True
            )
            if not tokenizer.pad_token:
                tokenizer.pad_token = tokenizer.eos_token

            model = AutoModelForCausalLM.from_pretrained(
                args.model,
                quantization_config=quantization_config,
                device_map=device_map,
                torch_dtype=torch.bfloat16 if use_cuda else torch.float32,
                trust_remote_code=True,
            )

            lora_config = LoraConfig(
                r=args.rank,
                lora_alpha=args.alpha,
                target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                                "gate_proj", "up_proj", "down_proj"],
                lora_dropout=0.05,
                bias="none",
                task_type=TaskType.CAUSAL_LM,
            )
            model = get_peft_model(model, lora_config)

    except torch.cuda.OutOfMemoryError:
        emit_error(
            "Out of GPU memory loading model. Try a smaller model or lower rank.",
            "OOM"
        )
        sys.exit(1)
    except Exception as e:
        emit_error(f"Failed to load model: {e}", "MODEL_LOAD_ERROR")
        sys.exit(1)

    # Print trainable parameters
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    emit({
        "type": "status",
        "message": f"Model loaded. Trainable params: {trainable:,} / {total:,} ({100*trainable/max(total,1):.2f}%)",
        "trainableParams": trainable,
        "totalParams": total,
    })

    # ── Load dataset ─────────────────────────────────────────────────────────
    emit({"type": "status", "message": f"Loading dataset: {args.dataset}…"})

    try:
        dataset = load_dataset("json", data_files=args.dataset, split="train")
    except Exception as e:
        emit_error(f"Failed to load dataset: {e}", "DATASET_LOAD_ERROR")
        sys.exit(1)

    emit({"type": "status", "message": f"Dataset loaded: {len(dataset)} rows."})

    # ── Determine formatting ─────────────────────────────────────────────────
    columns = dataset.column_names

    def format_sample(sample):
        """Auto-detect format: Alpaca, ChatML/ShareGPT, or raw text."""
        # ChatML/ShareGPT: conversations field
        if "conversations" in sample and isinstance(sample["conversations"], list):
            parts = []
            for turn in sample["conversations"]:
                role = turn.get("role", turn.get("from", "user"))
                content = turn.get("content", turn.get("value", ""))
                parts.append(f"<|{role}|>\n{content}")
            parts.append("<|end|>")
            return tokenizer.eos_token.join(["".join(parts)])

        # Alpaca: instruction/input/output
        if "instruction" in sample:
            instruction = sample.get("instruction", "")
            inp = sample.get("input", "")
            output = sample.get("output", "")
            if inp:
                return f"### Instruction:\n{instruction}\n\n### Input:\n{inp}\n\n### Response:\n{output}{tokenizer.eos_token}"
            return f"### Instruction:\n{instruction}\n\n### Response:\n{output}{tokenizer.eos_token}"

        # Simple prompt/completion
        if "prompt" in sample and ("completion" in sample or "response" in sample):
            completion = sample.get("completion", sample.get("response", ""))
            return f"{sample['prompt']}\n{completion}{tokenizer.eos_token}"

        # Raw text
        if "text" in sample:
            return sample["text"]

        # Last resort: concatenate all string fields
        parts = [str(v) for v in sample.values() if isinstance(v, str) and v.strip()]
        return "\n".join(parts) if parts else ""

    # ── Calculate total steps ────────────────────────────────────────────────
    steps_per_epoch = max(1, len(dataset) // args.batch_size)
    total_steps = steps_per_epoch * args.epochs

    emit({"type": "status", "message": f"Training plan: {args.epochs} epochs × {steps_per_epoch} steps/epoch = {total_steps} total steps"})

    # ── Custom callback for JSON progress ────────────────────────────────────
    from transformers import TrainerCallback

    class ProgressCallback(TrainerCallback):
        def __init__(self):
            self.last_emit_step = -1

        def on_log(self, callback_args, state, control, logs=None, **kwargs):
            if _interrupted:
                control.should_save = True
                control.should_training_stop = True
                return

            step = state.global_step
            # Batch: emit every 10 steps or on the first/last step
            if step - self.last_emit_step >= 10 or step <= 1 or step >= total_steps - 1:
                self.last_emit_step = step
                emit_progress(
                    step=step,
                    total_steps=total_steps,
                    loss=logs.get("loss") if logs else None,
                    epoch=state.epoch,
                    lr=logs.get("learning_rate") if logs else None,
                )

        def on_step_end(self, callback_args, state, control, **kwargs):
            if _interrupted:
                control.should_save = True
                control.should_training_stop = True

    # ── Training ─────────────────────────────────────────────────────────────
    os.makedirs(args.output_dir, exist_ok=True)

    try:
        training_args = SFTConfig(
            output_dir=args.output_dir,
            num_train_epochs=args.epochs,
            per_device_train_batch_size=args.batch_size,
            gradient_accumulation_steps=max(1, 4 // args.batch_size),
            learning_rate=args.lr,
            lr_scheduler_type="cosine",
            warmup_ratio=0.1,
            weight_decay=0.01,
            logging_steps=1,
            save_strategy="steps",
            save_steps=max(50, total_steps // 10),
            save_total_limit=3,
            max_seq_length=args.max_seq_len,
            fp16=use_cuda and not torch.cuda.is_bf16_supported(),
            bf16=use_cuda and torch.cuda.is_bf16_supported(),
            optim="adamw_8bit" if use_cuda else "adamw_torch",
            gradient_checkpointing=use_cuda,
            gradient_checkpointing_kwargs={"use_reentrant": False} if use_cuda else None,
            report_to="none",
            seed=42,
            dataset_text_field="text",
        )

        # Preprocess dataset: add 'text' column if not present
        if "text" not in dataset.column_names:
            dataset = dataset.map(lambda x: {"text": format_sample(x)}, remove_columns=columns)

        trainer = SFTTrainer(
            model=model,
            tokenizer=tokenizer,
            train_dataset=dataset,
            args=training_args,
            callbacks=[ProgressCallback()],
        )

        emit({"type": "status", "message": "Training started…"})
        trainer.train()

        if _interrupted:
            # Save final checkpoint on graceful stop
            checkpoint_dir = os.path.join(args.output_dir, "checkpoint-interrupted")
            trainer.save_model(checkpoint_dir)
            emit({
                "type": "stopped",
                "message": "Training stopped gracefully. Checkpoint saved.",
                "checkpointDir": checkpoint_dir,
                "step": trainer.state.global_step,
                "totalSteps": total_steps,
            })
            sys.exit(0)

        # Save final adapter
        final_dir = os.path.join(args.output_dir, "final-adapter")
        model.save_pretrained(final_dir)
        tokenizer.save_pretrained(final_dir)

        emit({
            "type": "complete",
            "message": "Training completed successfully.",
            "outputDir": final_dir,
            "totalSteps": total_steps,
            "finalStep": trainer.state.global_step,
        })

    except torch.cuda.OutOfMemoryError:
        emit_error(
            "Out of GPU memory during training. Try: smaller batch_size (1), lower rank (8), smaller max_seq_len (512), or a smaller model.",
            "OOM"
        )
        sys.exit(1)
    except Exception as e:
        emit_error(f"Training failed: {e}", "TRAINING_ERROR")
        sys.exit(1)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Asyncat LoRA fine-tuning")
    parser.add_argument("--model", required=True, help="HF model name or local path")
    parser.add_argument("--dataset", required=True, help="Path to JSONL dataset")
    parser.add_argument("--output-dir", required=True, help="Output directory for adapter weights")
    parser.add_argument("--backend", choices=["cuda", "mlx", "cpu"], default="cuda")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--rank", type=int, default=16, help="LoRA rank (r)")
    parser.add_argument("--alpha", type=int, default=32, help="LoRA alpha")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--max-seq-len", type=int, default=2048)

    args = parser.parse_args()

    dataset_rows = preflight_check(args)

    if args.backend == "mlx":
        train_mlx(args, dataset_rows)
    else:
        train_transformers(args, dataset_rows)


if __name__ == "__main__":
    main()
