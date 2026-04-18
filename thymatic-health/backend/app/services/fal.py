from dotenv import load_dotenv
from pathlib import Path

# env already loaded by main.py; this is a no-op safety net
load_dotenv(Path(__file__).resolve().parents[4] / ".env")

import fal_client

IMAGE_MODEL = "fal-ai/flux/schnell"
VIDEO_MODEL = "fal-ai/wan/v2.2/text-to-video"


async def generate_image(prompt: str) -> str:
    """Returns image URL."""
    result = await fal_client.run_async(
        IMAGE_MODEL,
        arguments={"prompt": prompt, "num_images": 1},
    )
    # fal-ai/flux/schnell returns {"images": [{"url": "...", ...}], ...}
    images = result.get("images") or result.get("image") or []
    if isinstance(images, list) and images:
        item = images[0]
        url = item.get("url") if isinstance(item, dict) else item
        if url:
            return str(url)
    raise ValueError(f"Unexpected fal image response: {result}")


async def generate_video(prompt: str, timeout: float = 300.0) -> str:
    """Returns video URL.

    Note: video generation is queued by fal and can take 60–300 s.
    The `timeout` parameter (default 300 s) is passed as the client-side
    HTTP timeout.  If the job exceeds this, a FalClientTimeoutError is raised;
    callers should catch it and either retry or return a graceful degradation.
    """
    result = await fal_client.run_async(
        VIDEO_MODEL,
        arguments={"prompt": prompt},
        timeout=timeout,
    )
    # fal-ai/wan returns {"video": {"url": "..."}} or {"videos": [...]}
    video = result.get("video")
    if isinstance(video, dict):
        return video["url"]
    videos = result.get("videos") or []
    if isinstance(videos, list) and videos:
        item = videos[0]
        url = item.get("url") if isinstance(item, dict) else item
        if url:
            return str(url)
    raise ValueError(f"Unexpected fal video response: {result}")
