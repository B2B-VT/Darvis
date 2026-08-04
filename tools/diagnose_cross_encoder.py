from __future__ import annotations

import argparse
import json
import math
import os
import resource
import time
from pathlib import Path
from typing import Any

import torch
from huggingface_hub import scan_cache_dir
from sentence_transformers import CrossEncoder
from transformers import AutoModelForSequenceClassification, AutoTokenizer


QUERY = "I’m a CS student interested in artificial intelligence and machine learning."
DOCUMENTS = [
    "CS 4824 Machine Learning. Covers supervised learning, classification, regression, model evaluation, and predictive methods.",
    "BIT 3414 Operations and Supply Chain Management. Covers business processes and operational planning.",
    "BCHM 4115 Biochemical Methods. Covers laboratory methods in biochemical analysis.",
]


def finite_status_tensor(tensor: torch.Tensor) -> dict[str, Any]:
    detached = tensor.detach()
    finite = torch.isfinite(detached)
    out: dict[str, Any] = {
        "shape": list(detached.shape),
        "dtype": str(detached.dtype),
        "all_finite": bool(finite.all().item()),
        "nan_count": int(torch.isnan(detached).sum().item()),
        "inf_count": int(torch.isinf(detached).sum().item()),
    }
    if detached.numel() and bool(finite.any().item()):
        finite_values = detached[finite].float()
        out["min"] = float(finite_values.min().item())
        out["max"] = float(finite_values.max().item())
        out["mean"] = float(finite_values.mean().item())
    return out


def finite_status_scores(scores) -> dict[str, Any]:
    values = [float(x) for x in scores]
    return {
        "scores": values,
        "all_finite": all(math.isfinite(x) for x in values),
        "order": sorted(range(len(values)), key=lambda i: (-values[i], i)),
    }


def first_parameter_status(model) -> dict[str, Any]:
    name, param = next(model.named_parameters())
    return {"name": name, **finite_status_tensor(param)}


def all_parameter_status(model) -> dict[str, Any]:
    total = 0
    bad = []
    for name, param in model.named_parameters():
        total += param.numel()
        finite = torch.isfinite(param.detach())
        if not bool(finite.all().item()):
            bad.append({
                "name": name,
                "shape": list(param.shape),
                "nan_count": int(torch.isnan(param.detach()).sum().item()),
                "inf_count": int(torch.isinf(param.detach()).sum().item()),
            })
    return {"parameter_count": total, "bad_parameter_count": len(bad), "bad_parameters": bad[:20]}


def cache_info(model_name: str) -> dict[str, Any]:
    out: dict[str, Any] = {"model": model_name, "repos": []}
    try:
        cache = scan_cache_dir()
        for repo in cache.repos:
            if repo.repo_id != model_name:
                continue
            repo_info = {"repo_id": repo.repo_id, "repo_path": str(repo.repo_path), "revisions": []}
            for rev in repo.revisions:
                files = []
                for file in rev.files:
                    path = Path(file.file_path)
                    files.append({
                        "file_name": file.file_name,
                        "size_on_disk": file.size_on_disk,
                        "exists": path.exists(),
                    })
                repo_info["revisions"].append({
                    "commit_hash": rev.commit_hash,
                    "snapshot_path": str(rev.snapshot_path),
                    "size_on_disk": rev.size_on_disk,
                    "files": sorted(files, key=lambda item: item["file_name"]),
                })
            out["repos"].append(repo_info)
    except Exception as exc:
        out["error"] = f"{type(exc).__name__}: {exc}"
    return out


def token_status(tokenizer, pairs: list[tuple[str, str]]) -> dict[str, Any]:
    tokens = tokenizer(
        [q for q, _ in pairs],
        [d for _, d in pairs],
        padding=True,
        truncation=True,
        max_length=512,
        return_tensors="pt",
    )
    return {
        "keys": sorted(tokens.keys()),
        "tensors": {key: finite_status_tensor(value) for key, value in tokens.items()},
        "tokens": tokens,
    }


def run_forward(model, tokens: dict[str, torch.Tensor], label: str) -> dict[str, Any]:
    embeddings_seen: list[dict[str, Any]] = []
    hidden_seen: list[dict[str, Any]] = []
    handles = []

    emb = model.get_input_embeddings()
    if emb is not None:
        handles.append(emb.register_forward_hook(lambda _m, _inp, out: embeddings_seen.append(finite_status_tensor(out))))

    encoder = getattr(getattr(model, "base_model", None), "encoder", None)
    layers = getattr(encoder, "layer", None)
    if layers is not None and len(layers) > 0:
        def hook(_m, _inp, out):
            tensor = out[0] if isinstance(out, (tuple, list)) else out
            hidden_seen.append(finite_status_tensor(tensor))
        handles.append(layers[0].register_forward_hook(hook))

    start = time.perf_counter()
    with torch.no_grad():
        model.eval()
        outputs = model(**tokens)
    latency_ms = (time.perf_counter() - start) * 1000

    for handle in handles:
        handle.remove()

    logits = outputs.logits
    scores = logits.squeeze(-1)
    return {
        "label": label,
        "latency_ms": round(latency_ms, 1),
        "embedding_outputs": embeddings_seen,
        "first_hidden_outputs": hidden_seen,
        "logits": finite_status_tensor(logits),
        "raw_logits": logits.detach().cpu().tolist(),
        "postprocessed_scores": finite_status_scores(scores.detach().cpu().tolist()),
    }


def sentence_transformers_checks(model_name: str, device: str, local_files_only: bool) -> dict[str, Any]:
    start = time.perf_counter()
    ce = CrossEncoder(model_name, max_length=512, device=device, local_files_only=local_files_only)
    load_ms = (time.perf_counter() - start) * 1000
    pairs = [(QUERY, doc) for doc in DOCUMENTS]
    checks = {"load_ms": round(load_ms, 1), "batches": {}}
    for batch_size in (1, 2, 3):
        start = time.perf_counter()
        scores = ce.predict(pairs, batch_size=batch_size)
        checks["batches"][str(batch_size)] = {
            "latency_ms": round((time.perf_counter() - start) * 1000, 1),
            **finite_status_scores(scores),
        }
    for idx, pair in enumerate(pairs):
        start = time.perf_counter()
        scores = ce.predict([pair], batch_size=1)
        checks[f"single_pair_{idx}"] = {
            "latency_ms": round((time.perf_counter() - start) * 1000, 1),
            **finite_status_scores(scores),
        }
    return checks


def main() -> None:
    parser = argparse.ArgumentParser(description="Diagnose local cross-encoder numerical behavior.")
    parser.add_argument("--model", default="cross-encoder/ms-marco-MiniLM-L-6-v2")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--local-files-only", action="store_true")
    parser.add_argument("--out")
    args = parser.parse_args()

    torch.set_default_dtype(torch.float32)
    pairs = [(QUERY, doc) for doc in DOCUMENTS]

    result: dict[str, Any] = {
        "model": args.model,
        "device": args.device,
        "torch": torch.__version__,
        "default_dtype": str(torch.get_default_dtype()),
        "local_files_only": args.local_files_only,
        "query": QUERY,
        "documents": DOCUMENTS,
        "cache": cache_info(args.model),
    }

    start = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(args.model, local_files_only=args.local_files_only)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model,
        torch_dtype=torch.float32,
        local_files_only=args.local_files_only,
    )
    model.to(args.device)
    model.eval()
    result["load_ms_transformers"] = round((time.perf_counter() - start) * 1000, 1)
    result["first_parameter"] = first_parameter_status(model)
    result["all_parameters"] = all_parameter_status(model)

    token_batch = token_status(tokenizer, pairs)
    result["tokenization"] = {k: v for k, v in token_batch.items() if k != "tokens"}
    result["forward_batch_3"] = run_forward(model, token_batch["tokens"].to(args.device), "batch_3")

    for batch_size in (1, 2):
        sub_pairs = pairs[:batch_size]
        sub_tokens = token_status(tokenizer, sub_pairs)
        result[f"forward_batch_{batch_size}"] = run_forward(model, sub_tokens["tokens"].to(args.device), f"batch_{batch_size}")

    for idx, pair in enumerate(pairs):
        single_tokens = token_status(tokenizer, [pair])
        result[f"forward_single_pair_{idx}"] = run_forward(model, single_tokens["tokens"].to(args.device), f"single_pair_{idx}")

    result["sentence_transformers"] = sentence_transformers_checks(args.model, args.device, args.local_files_only)
    result["rss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)

    text = json.dumps(result, indent=2, allow_nan=True)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
