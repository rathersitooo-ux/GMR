#!/usr/bin/env python3
import argparse
import hashlib
import html as html_lib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from gradio_client import Client

SPACE_ID = "tencent/HY-Motion-1.0"
SOURCE_REPO = "Tencent-Hunyuan/HY-Motion-1.0"
SOURCE_COMMIT = "4e426f5a1021cbcf7f375458c37b840ee7225229"
MODEL_ID = "tencent/HY-Motion-1.0/HY-Motion-1.0-Lite"
MODEL_LICENSE = "tencent-hunyuan-community"
MODEL_FPS = 30.0
SCHEMA = "gameroad.animation-frontier.hymotion-hosted-smpl.v1"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def strings_in(value: Any):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from strings_in(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            yield from strings_in(child)


def endpoint_candidates(api_info: dict) -> list[str]:
    names: list[str] = []
    named = api_info.get("named_endpoints", {}) if isinstance(api_info, dict) else {}
    if isinstance(named, dict):
        names.extend(str(name) for name in named.keys())
    elif isinstance(named, list):
        for item in named:
            if isinstance(item, dict):
                name = item.get("api_name") or item.get("name")
                if name:
                    names.append(str(name))
            elif isinstance(item, str):
                names.append(item)

    preferred = [name for name in names if "generate" in name.lower() and "rewrite" not in name.lower()]
    fallbacks = ["/_generate_motion", "/generate_motion"]
    ordered: list[str] = []
    for name in preferred + fallbacks:
        if not name.startswith("/"):
            name = "/" + name
        if name not in ordered:
            ordered.append(name)
    return ordered


def decode_until_stable(text: str, rounds: int = 4) -> str:
    current = text
    for _ in range(rounds):
        decoded = html_lib.unescape(current)
        if decoded == current:
            break
        current = decoded
    return current


def extract_smpl_frames(result: Any) -> tuple[list, str]:
    candidates = sorted(strings_in(result), key=len, reverse=True)
    pattern = re.compile(
        r'<script[^>]*id=["\']smpl-data-json["\'][^>]*>\s*(.*?)\s*</script>',
        re.IGNORECASE | re.DOTALL,
    )
    for raw in candidates:
        decoded = decode_until_stable(raw)
        match = pattern.search(decoded)
        if not match:
            continue
        frames = json.loads(match.group(1))
        if isinstance(frames, list) and frames:
            return frames, decoded
    raise RuntimeError("SMPL_DATA_NOT_FOUND_IN_API_RESULT")


def person_from_frame(frame: Any) -> dict:
    if not isinstance(frame, list) or not frame or not isinstance(frame[0], dict):
        raise RuntimeError("SMPL_FRAME_SHAPE_INVALID")
    return frame[0]


def array_from_frames(frames: list, key: str) -> np.ndarray:
    values = []
    for frame in frames:
        person = person_from_frame(frame)
        if key not in person:
            raise RuntimeError(f"SMPL_KEY_MISSING:{key}")
        value = np.asarray(person[key], dtype=np.float32)
        values.append(value.reshape(-1))
    widths = {value.shape[0] for value in values}
    if len(widths) != 1:
        raise RuntimeError(f"SMPL_WIDTH_MISMATCH:{key}:{sorted(widths)}")
    return np.stack(values, axis=0)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--prompt",
        default="A person slowly shifts their weight from the left foot to the right foot and back, with small relaxed arm movements.",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--duration", type=float, default=2.5)
    parser.add_argument("--cfg", type=float, default=5.0)
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(timezone.utc).isoformat()

    client = Client(SPACE_ID)
    api_info = client.view_api(return_format="dict")
    write_json(out / "api-info.json", api_info)

    attempts = []
    result = None
    selected_endpoint = None
    frames = None
    decoded_html = None

    for endpoint in endpoint_candidates(api_info):
        try:
            current = client.predict(
                args.prompt,
                "",
                str(args.seed),
                args.duration,
                args.cfg,
                api_name=endpoint,
            )
            current_frames, current_html = extract_smpl_frames(current)
            result = current
            frames = current_frames
            decoded_html = current_html
            selected_endpoint = endpoint
            attempts.append({"endpoint": endpoint, "result": "SMPL_DATA_EXTRACTED"})
            break
        except Exception as exc:  # preserve each remote failure as evidence
            attempts.append({"endpoint": endpoint, "result": "FAILED", "error": repr(exc)[:4000]})

    write_json(out / "attempts.json", attempts)
    if result is None or frames is None or decoded_html is None or selected_endpoint is None:
        raise RuntimeError("NO_HOSTED_MOTION_ENDPOINT_RETURNED_EXTRACTABLE_SMPL_DATA")

    (out / "raw-result.html").write_text(decoded_html, encoding="utf-8")
    write_json(out / "motion-smpl.json", frames)

    rh = array_from_frames(frames, "Rh")
    trans = array_from_frames(frames, "Th")
    poses = array_from_frames(frames, "poses")
    first = person_from_frame(frames[0])
    shapes = np.asarray(first.get("shapes", []), dtype=np.float32).reshape(-1)
    gender = str(first.get("gender", "neutral"))

    frame_count = int(len(frames))
    if frame_count < 2:
        raise RuntimeError(f"MOTION_TOO_SHORT:{frame_count}")
    if trans.shape[1] < 3:
        raise RuntimeError(f"TRANSLATION_WIDTH_INVALID:{trans.shape[1]}")
    if not all(np.isfinite(array).all() for array in (rh, trans, poses, shapes)):
        raise RuntimeError("NON_FINITE_SMPL_VALUE")

    npz_path = out / "motion-smpl.npz"
    np.savez_compressed(
        npz_path,
        Rh=rh,
        trans=trans,
        poses=poses,
        betas=shapes,
        gender=np.asarray([gender]),
        fps=np.asarray([MODEL_FPS], dtype=np.float32),
    )

    root_displacement = float(np.linalg.norm(trans[-1, :3] - trans[0, :3]))
    mean_abs_pose_delta = float(np.mean(np.abs(np.diff(poses, axis=0)))) if frame_count > 1 else 0.0
    temporal_span = (frame_count - 1) / MODEL_FPS
    playback_duration = frame_count / MODEL_FPS

    metrics = {
        "schema": SCHEMA,
        "frames": frame_count,
        "fps": MODEL_FPS,
        "temporalSpanSeconds": round(temporal_span, 9),
        "playbackDurationSeconds": round(playback_duration, 9),
        "rootDisplacementUnits": round(root_displacement, 9),
        "meanAbsolutePoseDelta": round(mean_abs_pose_delta, 9),
        "rhWidth": int(rh.shape[1]),
        "translationWidth": int(trans.shape[1]),
        "poseWidth": int(poses.shape[1]),
        "betaWidth": int(shapes.shape[0]),
        "gender": gender,
        "deterministicInput": True,
        "formalAsset": False,
        "productProgressCredit": 0,
    }
    write_json(out / "metrics.json", metrics)

    provenance = {
        "schema": SCHEMA,
        "generatedAtUtc": generated_at,
        "space": SPACE_ID,
        "apiEndpoint": selected_endpoint,
        "sourceRepository": SOURCE_REPO,
        "sourceCommitObserved": SOURCE_COMMIT,
        "model": MODEL_ID,
        "modelLicense": MODEL_LICENSE,
        "modelFpsSource": "HY-Motion config.yml output_mesh_fps=30",
        "prompt": args.prompt,
        "seed": args.seed,
        "requestedDurationSeconds": args.duration,
        "cfgScale": args.cfg,
        "npzSha256": sha256_file(npz_path),
        "smplJsonSha256": sha256_file(out / "motion-smpl.json"),
        "rawResultHtmlSha256": sha256_file(out / "raw-result.html"),
        "acceptance": "ACTUAL_HOSTED_GENERATION_AND_SMPL_EXTRACTION_ONLY",
        "notClaimed": [
            "GAMEROAD_RETARGET",
            "RUNTIME_MOUNT",
            "DEVICE_ACCEPTANCE",
            "HUMAN_AESTHETIC_ACCEPTANCE",
            "FORMAL_ASSET",
        ],
    }
    write_json(out / "provenance.json", provenance)

    if not math.isclose(float(np.load(npz_path)["fps"][0]), MODEL_FPS, rel_tol=0, abs_tol=1e-6):
        raise RuntimeError("NPZ_READBACK_FPS_MISMATCH")

    print(json.dumps({"endpoint": selected_endpoint, "metrics": metrics, "provenance": provenance}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
