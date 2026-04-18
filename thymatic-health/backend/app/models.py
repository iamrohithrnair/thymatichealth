from pydantic import BaseModel
from typing import Optional, List

class JointAngle(BaseModel):
    joint: str
    target: float
    observed: float

class ScoreRequest(BaseModel):
    angles: List[JointAngle]
    round: int = 1

class ScoreResponse(BaseModel):
    score: float
    feedback: str

class SessionStartResponse(BaseModel):
    session_id: str
    policies: List[str]

class VisualRequest(BaseModel):
    theme: str
    want_video: bool = False

class VisualResponse(BaseModel):
    image_url: str
    video_url: Optional[str] = None
