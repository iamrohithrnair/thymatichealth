"""MediaPipe BlazePose pipeline using the Tasks API (mediapipe >= 0.10)."""

from __future__ import annotations

import math
import os
import urllib.request
from pathlib import Path
from typing import Any

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Model management
# ---------------------------------------------------------------------------

_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)
_MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models"
_MODEL_PATH = _MODEL_DIR / "pose_landmarker_lite.task"


def _ensure_model() -> str:
    """Download the BlazePose Tasks model on first use; return local path."""
    if not _MODEL_PATH.exists():
        _MODEL_DIR.mkdir(parents=True, exist_ok=True)
        print(f"[pose] Downloading BlazePose model to {_MODEL_PATH} …")
        urllib.request.urlretrieve(_MODEL_URL, _MODEL_PATH)
        print("[pose] Model downloaded.")
    return str(_MODEL_PATH)


# ---------------------------------------------------------------------------
# Joint → landmark-index mapping
# Each tuple is (proximal_idx, distal_idx).
# The angle is computed AT the *first* index using:
#   proximal ← joint_point → distal
# For shoulder/hip the joint point IS the first index, for elbow/knee it's the
# middle point in the chain.
# ---------------------------------------------------------------------------

# Triplets: (A, B, C) — angle measured AT B
JOINT_TRIPLETS: dict[str, tuple[int, int, int]] = {
    "left_shoulder":  (13, 11, 23),   # elbow → shoulder → hip
    "right_shoulder": (14, 12, 24),
    "left_elbow":     (11, 13, 15),   # shoulder → elbow → wrist
    "right_elbow":    (12, 14, 16),
    "left_hip":       (11, 23, 25),   # shoulder → hip → knee
    "right_hip":      (12, 24, 26),
    "left_knee":      (23, 25, 27),   # hip → knee → ankle
    "right_knee":     (24, 26, 28),
}

# Legacy two-index map kept for API compatibility reference
JOINT_LANDMARKS: dict[str, tuple[int, int]] = {
    "left_shoulder":  (11, 13),
    "right_shoulder": (12, 14),
    "left_elbow":     (13, 15),
    "right_elbow":    (14, 16),
    "left_hip":       (23, 25),
    "right_hip":      (24, 26),
    "left_knee":      (25, 27),
    "right_knee":     (26, 28),
}


# ---------------------------------------------------------------------------
# Geometry helper
# ---------------------------------------------------------------------------

def _angle_at_b(
    ax: float, ay: float, az: float,
    bx: float, by: float, bz: float,
    cx: float, cy: float, cz: float,
) -> float:
    """Return angle in degrees at point B in the triangle A-B-C."""
    ba = (ax - bx, ay - by, az - bz)
    bc = (cx - bx, cy - by, cz - bz)

    dot = ba[0] * bc[0] + ba[1] * bc[1] + ba[2] * bc[2]
    mag_ba = math.sqrt(ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2)
    mag_bc = math.sqrt(bc[0] ** 2 + bc[1] ** 2 + bc[2] ** 2)

    if mag_ba < 1e-9 or mag_bc < 1e-9:
        return 0.0

    cos_angle = max(-1.0, min(1.0, dot / (mag_ba * mag_bc)))
    return math.degrees(math.acos(cos_angle))


def _score_deviation(deviation: float) -> float:
    if deviation <= 5:
        return 10.0
    elif deviation <= 10:
        return 8.0
    elif deviation <= 20:
        return 6.0
    elif deviation <= 30:
        return 4.0
    return 2.0


# ---------------------------------------------------------------------------
# Main analysis function
# ---------------------------------------------------------------------------

def analyse_video(video_path: str, joint: str, target_degrees: float) -> dict:
    """Analyse a video file and return per-frame angle measurements.

    Returns::

        {
          "summary": [
              {"frame": int, "observed": float, "deviation": float, "score": float},
              ...
          ],
          "meta": {
              "frames_detected": int,
              "smoothness": float,     # 1 - (std / range), clamped [0,1]
              "min_angle": float,
              "max_angle": float,
              "mean_angle": float,
          },
          "warning": str | None,       # present only on issues
        }
    """
    # Validate joint
    if joint not in JOINT_TRIPLETS:
        valid = sorted(JOINT_TRIPLETS.keys())
        return {
            "summary": [],
            "meta": {
                "frames_detected": 0,
                "smoothness": 0.0,
                "min_angle": 0.0,
                "max_angle": 0.0,
                "mean_angle": 0.0,
            },
            "warning": (
                f"Unknown joint '{joint}'. Valid joints: {valid}"
            ),
        }

    a_idx, b_idx, c_idx = JOINT_TRIPLETS[joint]

    # Lazy import to avoid heavy load at module level
    import mediapipe.tasks.python as mp_tasks
    from mediapipe.tasks.python.vision.core.image import Image as MpImage, ImageFormat
    from mediapipe.tasks.python.vision import (
        PoseLandmarker,
        PoseLandmarkerOptions,
        RunningMode,
    )
    from mediapipe.tasks.python.core import base_options as base_options_lib

    model_path = _ensure_model()

    options = PoseLandmarkerOptions(
        base_options=base_options_lib.BaseOptions(model_asset_path=model_path),
        running_mode=RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {
            "summary": [],
            "meta": {
                "frames_detected": 0,
                "smoothness": 0.0,
                "min_angle": 0.0,
                "max_angle": 0.0,
                "mean_angle": 0.0,
            },
            "warning": f"Could not open video file: {video_path}",
        }

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    summary: list[dict[str, Any]] = []
    frame_idx = 0

    with PoseLandmarker.create_from_options(options) as landmarker:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Process every 3rd frame
            if frame_idx % 3 == 0:
                # Convert BGR → RGB
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = MpImage(image_format=ImageFormat.SRGB, data=rgb)

                timestamp_ms = int((frame_idx / fps) * 1000)
                result = landmarker.detect_for_video(mp_image, timestamp_ms)

                if result.pose_world_landmarks:
                    lms = result.pose_world_landmarks[0]
                    if (
                        a_idx < len(lms)
                        and b_idx < len(lms)
                        and c_idx < len(lms)
                    ):
                        a, b, c = lms[a_idx], lms[b_idx], lms[c_idx]
                        angle = _angle_at_b(
                            a.x, a.y, a.z,
                            b.x, b.y, b.z,
                            c.x, c.y, c.z,
                        )
                        deviation = abs(target_degrees - angle)
                        summary.append({
                            "frame": frame_idx,
                            "observed": round(angle, 2),
                            "deviation": round(deviation, 2),
                            "score": _score_deviation(deviation),
                        })

            frame_idx += 1

    cap.release()

    if not summary:
        return {
            "summary": [],
            "meta": {
                "frames_detected": 0,
                "smoothness": 0.0,
                "min_angle": 0.0,
                "max_angle": 0.0,
                "mean_angle": 0.0,
            },
            "warning": (
                "No pose landmarks detected. Check video quality or that the "
                "subject is clearly visible."
            ),
        }

    angles = [s["observed"] for s in summary]
    min_angle = min(angles)
    max_angle = max(angles)
    mean_angle = sum(angles) / len(angles)
    angle_range = max_angle - min_angle

    if angle_range < 1e-6:
        smoothness = 1.0
    else:
        std_dev = float(np.std(angles))
        smoothness = float(np.clip(1.0 - (std_dev / angle_range), 0.0, 1.0))

    return {
        "summary": summary,
        "meta": {
            "frames_detected": len(summary),
            "smoothness": round(smoothness, 4),
            "min_angle": round(min_angle, 2),
            "max_angle": round(max_angle, 2),
            "mean_angle": round(mean_angle, 2),
        },
    }
