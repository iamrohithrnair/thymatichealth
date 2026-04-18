import os
import shutil
import tempfile

from fastapi import APIRouter, File, Form, UploadFile

from app.services.pose import analyse_video

router = APIRouter()


@router.post("/video/analyse")
async def analyse(
    file: UploadFile = File(...),
    joint: str = Form(...),
    target: float = Form(...),
):
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        result = analyse_video(tmp_path, joint, target)
    finally:
        os.unlink(tmp_path)

    return result
