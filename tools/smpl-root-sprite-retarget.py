#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

SCHEMA = "gameroad.animation-frontier.smpl-root-sprite-retarget.v1"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def alpha_centroid(frame: Image.Image) -> tuple[float, float]:
    rgba = np.asarray(frame.convert("RGBA"))
    alpha = rgba[:, :, 3].astype(np.float64)
    total = alpha.sum()
    if total <= 0:
        raise RuntimeError("SOURCE_FRAME_HAS_NO_VISIBLE_PIXELS")
    yy, xx = np.mgrid[: alpha.shape[0], : alpha.shape[1]]
    return float((xx * alpha).sum() / total), float((yy * alpha).sum() / total)


def visible_bbox(frame: Image.Image) -> tuple[int, int, int, int]:
    alpha = np.asarray(frame.convert("RGBA"))[:, :, 3]
    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        raise RuntimeError("SOURCE_FRAME_HAS_NO_VISIBLE_PIXELS")
    return int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)


def output_durations(frame_count: int, fps: float) -> list[int]:
    if frame_count < 1 or fps <= 0:
        raise ValueError("INVALID_TIMING")
    boundaries = [round(i * 1000.0 / fps) for i in range(frame_count + 1)]
    return [max(1, boundaries[i + 1] - boundaries[i]) for i in range(frame_count)]


def source_frame_at_ms(frames: list[Image.Image], durations_ms: list[int], time_ms: int) -> Image.Image:
    if not frames:
        raise RuntimeError("NO_SOURCE_FRAMES")
    if len(durations_ms) != len(frames):
        raise RuntimeError("SOURCE_DURATION_COUNT_MISMATCH")
    cycle = sum(durations_ms)
    if cycle <= 0:
        raise RuntimeError("SOURCE_DURATION_INVALID")
    position = time_ms % cycle
    elapsed = 0
    for frame, duration in zip(frames, durations_ms):
        elapsed += duration
        if position < elapsed:
            return frame
    return frames[-1]


def translated_exact(frame: Image.Image, dx: int, dy: int) -> Image.Image:
    frame = frame.convert("RGBA")
    width, height = frame.size
    left, top, right, bottom = visible_bbox(frame)
    if left + dx < 0 or top + dy < 0 or right + dx > width or bottom + dy > height:
        raise RuntimeError(f"RETARGET_WOULD_CLIP:{dx}:{dy}:{left}:{top}:{right}:{bottom}")
    out = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    out.alpha_composite(frame, dest=(dx, dy))
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--motion", required=True)
    parser.add_argument("--sprite", required=True)
    parser.add_argument("--source-durations-ms", required=True, help="comma-separated per-frame durations")
    parser.add_argument("--out-webp", required=True)
    parser.add_argument("--out-manifest", required=True)
    parser.add_argument("--subject-id", required=True)
    parser.add_argument("--state-id", default="light_sway_candidate")
    args = parser.parse_args()

    motion_path = Path(args.motion)
    sprite_path = Path(args.sprite)
    out_path = Path(args.out_webp)
    manifest_path = Path(args.out_manifest)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    sprite = Image.open(sprite_path)
    source_frames = []
    for index in range(getattr(sprite, "n_frames", 1)):
        sprite.seek(index)
        source_frames.append(sprite.convert("RGBA").copy())
    source_durations = [int(value) for value in args.source_durations_ms.split(",") if value.strip()]
    if len(source_durations) != len(source_frames):
        raise RuntimeError(f"SOURCE_DURATION_COUNT_MISMATCH:{len(source_frames)}:{len(source_durations)}")

    centroids = np.asarray([alpha_centroid(frame) for frame in source_frames], dtype=np.float64)
    source_x_envelope_px = float(np.ptp(centroids[:, 0]))
    source_y_envelope_px = float(np.ptp(centroids[:, 1]))
    if source_x_envelope_px <= 0:
        raise RuntimeError("SOURCE_IDLE_X_ENVELOPE_ZERO")

    with np.load(motion_path, allow_pickle=False) as data:
        trans = np.asarray(data["trans"], dtype=np.float64)
        fps = float(np.asarray(data["fps"]).reshape(-1)[0])
        pose_frames = int(np.asarray(data["poses"]).shape[0])
    if trans.ndim != 2 or trans.shape[1] < 3 or len(trans) != pose_frames:
        raise RuntimeError("MOTION_TRANSLATION_SHAPE_INVALID")
    if not np.isfinite(trans).all() or not np.isfinite(fps) or fps <= 0:
        raise RuntimeError("MOTION_NONFINITE_OR_INVALID_FPS")

    world_x_range = float(np.ptp(trans[:, 0]))
    if world_x_range <= 1e-9:
        raise RuntimeError("MOTION_X_RANGE_ZERO")
    pixels_per_world_unit = source_x_envelope_px / world_x_range
    x_center = (float(trans[:, 0].min()) + float(trans[:, 0].max())) / 2.0
    y_center = (float(trans[:, 1].min()) + float(trans[:, 1].max())) / 2.0
    dx_values = np.rint((trans[:, 0] - x_center) * pixels_per_world_unit).astype(int)
    dy_values = np.rint(-(trans[:, 1] - y_center) * pixels_per_world_unit).astype(int)

    target_durations = output_durations(len(trans), fps)
    target_frames = []
    elapsed_ms = 0
    max_abs_dx = 0
    max_abs_dy = 0
    for index, (dx, dy, duration) in enumerate(zip(dx_values, dy_values, target_durations)):
        base = source_frame_at_ms(source_frames, source_durations, elapsed_ms)
        target_frames.append(translated_exact(base, int(dx), int(dy)))
        max_abs_dx = max(max_abs_dx, abs(int(dx)))
        max_abs_dy = max(max_abs_dy, abs(int(dy)))
        elapsed_ms += duration

    target_frames[0].save(
        out_path,
        save_all=True,
        append_images=target_frames[1:],
        duration=target_durations,
        loop=0,
        lossless=True,
        method=6,
    )

    check = Image.open(out_path)
    if check.n_frames != len(target_frames):
        raise RuntimeError(f"OUTPUT_FRAME_COUNT_MISMATCH:{len(target_frames)}:{check.n_frames}")
    if check.size != source_frames[0].size:
        raise RuntimeError("OUTPUT_CANVAS_CHANGED")

    manifest = {
        "schema": SCHEMA,
        "subjectId": args.subject_id,
        "stateId": args.state_id,
        "formalAsset": False,
        "sourceSprite": {
            "path": str(sprite_path),
            "sha256": sha256_file(sprite_path),
            "canvas": list(source_frames[0].size),
            "frameCount": len(source_frames),
            "durationsMs": source_durations,
            "observedCentroidEnvelopePx": {
                "x": round(source_x_envelope_px, 9),
                "y": round(source_y_envelope_px, 9),
            },
        },
        "motionSource": {
            "path": str(motion_path),
            "sha256": sha256_file(motion_path),
            "frameCount": len(trans),
            "fps": fps,
            "worldXRange": round(world_x_range, 9),
        },
        "retarget": {
            "mapping": "SMPL trans.x -> sprite x; SMPL trans.y -> inverse sprite y",
            "scaleRule": "single scale derived from current source idle centroid X envelope divided by generated SMPL world-X range; same scale is reused for Y to preserve generated axis ratio",
            "pixelsPerWorldUnit": round(float(pixels_per_world_unit), 9),
            "maxAbsDxPx": int(max_abs_dx),
            "maxAbsDyPx": int(max_abs_dy),
            "resampling": "none; integer translation only",
            "visiblePixelMutation": "none; source RGBA pixels are moved without recolor/warp/interpolation",
            "clipping": False,
        },
        "output": {
            "path": str(out_path),
            "sha256": sha256_file(out_path),
            "frameCount": len(target_frames),
            "durationsMs": target_durations,
            "durationMs": sum(target_durations),
            "canvas": list(target_frames[0].size),
            "format": "animated-webp-lossless",
        },
        "acceptance": "TECHNICAL_CANDIDATE_RETARGET_ONLY",
        "notClaimed": [
            "FORMAL_CHARACTER_ASSET",
            "HUMAN_AESTHETIC_ACCEPTANCE",
            "GAME_RUNTIME_MOUNT",
            "DEVICE_ACCEPTANCE",
            "PRODUCT_PROGRESS",
        ],
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
