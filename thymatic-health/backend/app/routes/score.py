from fastapi import APIRouter
from app.models import ScoreRequest, ScoreResponse
from app.services.scoring import score_angles

router = APIRouter()


@router.post("/score", response_model=ScoreResponse)
async def score(req: ScoreRequest):
    angles_list = [a.model_dump() for a in req.angles]
    score_val, feedback = score_angles(angles_list)
    return ScoreResponse(score=score_val, feedback=feedback)
