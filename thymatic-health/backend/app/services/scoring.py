"""Pure-function angle scoring — no external calls."""

VALID_JOINTS = {
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_hip", "right_hip", "left_knee", "right_knee",
}


def _score_deviation(deviation: float) -> float:
    """Map angular deviation (degrees) to a 0-10 score."""
    if deviation <= 5:
        return 10.0
    elif deviation <= 10:
        return 8.0
    elif deviation <= 20:
        return 6.0
    elif deviation <= 30:
        return 4.0
    else:
        return 2.0


def score_angles(angles: list[dict]) -> tuple[float, str]:
    """Return (score_out_of_10, feedback_text).

    Each angle dict: {"joint": str, "target": float, "observed": float}

    Scoring bands:
      0-5°  → 10/10
      6-10° → 8/10
      11-20°→ 6/10
      21-30°→ 4/10
      >30°  → 2/10

    Average across all valid joints. Feedback lists joints with deviation > 10°
    and suggests adjustment direction.
    """
    if not angles:
        return 0.0, "No angle data provided."

    scores: list[float] = []
    needs_correction: list[str] = []

    for entry in angles:
        joint = entry.get("joint", "")
        target = float(entry.get("target", 0))
        observed = float(entry.get("observed", 0))

        deviation = abs(target - observed)
        joint_score = _score_deviation(deviation)
        scores.append(joint_score)

        if deviation > 10:
            direction = "increase" if observed < target else "decrease"
            needs_correction.append(
                f"{joint} ({direction} by ~{deviation:.0f}°)"
            )

    avg_score = sum(scores) / len(scores)

    if not needs_correction:
        feedback = "Great form! All joints are within acceptable range."
    else:
        corrections = "; ".join(needs_correction)
        feedback = f"Adjust the following joints: {corrections}."

    return round(avg_score, 2), feedback
