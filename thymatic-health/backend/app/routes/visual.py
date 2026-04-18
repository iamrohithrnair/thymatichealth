from fastapi import APIRouter, HTTPException
from app.models import VisualRequest, VisualResponse
from app.services import fal as fal_service

router = APIRouter()


@router.post("/coach/visual", response_model=VisualResponse)
async def generate_visual(req: VisualRequest):
    try:
        image_url = await fal_service.generate_image(req.theme)
        video_url = None
        if req.want_video:
            video_url = await fal_service.generate_video(req.theme)
        return VisualResponse(image_url=image_url, video_url=video_url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
