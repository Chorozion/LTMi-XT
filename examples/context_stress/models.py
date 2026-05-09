"""Adapters for autoregressive model backends.

All adapters expose the same interface:
    .name                      -> str
    .params_b                  -> float (params in billions)
    .vram_gb                   -> float (peak GPU mem if loaded, else 0)
    .can_lora                  -> bool
    .generate(prompt, max_new=N) -> str

Backends:
- HFModel: HuggingFace transformers (Phi-3, Llama, SmolLM, etc.)
- GGUFModel: llama-cpp-python (Gemma 4 abliterated, any GGUF)
"""
from __future__ import annotations
import os, time
from pathlib import Path
from dataclasses import dataclass

os.environ.setdefault("HF_HOME", "D:/hf_cache")
os.environ.setdefault("HF_HUB_CACHE", "D:/hf_cache")

import torch


class HFModel:
    """HuggingFace transformers AR model wrapper."""

    def __init__(self, repo_id: str, *, dtype=torch.float16, device: str = "cuda"):
        from transformers import AutoModelForCausalLM, AutoTokenizer
        self.name = repo_id
        self.device = device
        self.tok = AutoTokenizer.from_pretrained(repo_id, cache_dir="D:/hf_cache")
        if self.tok.pad_token_id is None:
            self.tok.pad_token = self.tok.eos_token
        self.model = AutoModelForCausalLM.from_pretrained(
            repo_id, cache_dir="D:/hf_cache", dtype=dtype, device_map=device,
        )
        self.model.eval()
        self._params = sum(p.numel() for p in self.model.parameters())
        self._dtype = dtype
        self.can_lora = True

    @property
    def params_b(self) -> float:
        return self._params / 1e9

    @property
    def vram_gb(self) -> float:
        return torch.cuda.memory_allocated() / 1e9 if torch.cuda.is_available() else 0.0

    def chat(self, user_message: str, system: str | None = None) -> str:
        """Apply chat template if present; fall back to raw prompt format."""
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.append({"role": "user", "content": user_message})
        try:
            return self.tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        except Exception:
            sys_part = f"<|system|>\n{system}<|end|>\n" if system else ""
            return f"{sys_part}<|user|>\n{user_message}<|end|>\n<|assistant|>\n"

    @torch.no_grad()
    def generate(self, full_prompt: str, *, max_new: int = 128, temperature: float = 0.0) -> str:
        ids = self.tok(full_prompt, return_tensors="pt").to(self.device)
        out = self.model.generate(
            **ids,
            max_new_tokens=max_new,
            do_sample=temperature > 0,
            temperature=max(temperature, 1e-4),
            pad_token_id=self.tok.eos_token_id,
        )
        return self.tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True)

    def unload(self):
        del self.model
        torch.cuda.empty_cache()


class GGUFModel:
    """llama-cpp-python wrapper for GGUF files (quantized models)."""

    def __init__(self, path: str | Path, *, n_ctx: int = 4096, n_gpu_layers: int = 0):
        from llama_cpp import Llama
        self.path = Path(path)
        self.name = self.path.name
        self.llm = Llama(
            model_path=str(self.path),
            n_ctx=n_ctx,
            n_gpu_layers=n_gpu_layers,
            verbose=False,
        )
        # Try to read params from metadata (if available)
        size_label = self.llm.metadata.get("general.size_label", "?")
        try:
            self._params_b = float(size_label.replace("B", "").replace("b", "").strip())
        except Exception:
            self._params_b = 0.0
        self.can_lora = False

    @property
    def params_b(self) -> float:
        return self._params_b

    @property
    def vram_gb(self) -> float:
        return torch.cuda.memory_allocated() / 1e9 if torch.cuda.is_available() else 0.0

    def chat(self, user_message: str, system: str | None = None) -> str:
        """Build a Gemma-style prompt manually (works for most GGUFs)."""
        if system:
            return f"<start_of_turn>user\n{system}\n\n{user_message}<end_of_turn>\n<start_of_turn>model\n"
        return f"<start_of_turn>user\n{user_message}<end_of_turn>\n<start_of_turn>model\n"

    def generate(self, full_prompt: str, *, max_new: int = 128, temperature: float = 0.0) -> str:
        out = self.llm(
            full_prompt,
            max_tokens=max_new,
            temperature=max(temperature, 0.0),
            echo=False,
            stop=["<end_of_turn>", "<|end|>", "<|eot_id|>", "</s>"],
        )
        return out["choices"][0]["text"]

    def unload(self):
        del self.llm
