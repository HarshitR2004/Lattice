from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


def uid() -> str:
    return str(uuid4())


class CaptureField(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(default="", max_length=500)
    type: Literal["text", "number", "choice", "confirmation"]
    unit: str = Field(default="", max_length=100)
    required: bool = True
    options: str = Field(default="", max_length=10000)
    min: str = Field(default="", max_length=100)
    max: str = Field(default="", max_length=100)
    handling: Literal["record", "flag", "resolve"] = "record"


class WorkStep(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(default="", max_length=500)
    instructions: str = Field(default="", max_length=20000)
    fields: list[CaptureField] = Field(default_factory=list, max_length=100)


class WorkflowContent(BaseModel):
    title: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=20000)
    reference: str = Field(default="", max_length=2000)
    procedure: str = Field(default="", max_length=100000)
    setup: list[CaptureField] = Field(default_factory=list, max_length=100)
    steps: list[WorkStep] = Field(default_factory=list, max_length=200)


class CreateWorkflow(WorkflowContent):
    id: str = Field(default_factory=uid, min_length=1, max_length=100)


class UpdateWorkflow(BaseModel):
    content: WorkflowContent
    revision: int = Field(ge=1)


class RevisionRequest(BaseModel):
    revision: int = Field(ge=1)


class ImportWorkflow(CreateWorkflow):
    status: Literal["draft", "ready"] = "draft"
    version: int = Field(default=0, ge=0)
    published: dict | None = None


class ImportRequest(BaseModel):
    workflows: list[ImportWorkflow] = Field(max_length=200)


class StartSession(BaseModel):
    workflowId: str
    label: str = Field(default="", max_length=500)
    requestId: str = Field(default_factory=uid)


class SessionCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["draft", "record", "next", "go", "pause", "resume", "finish"]
    revision: int = Field(ge=1)
    requestId: str = Field(min_length=1, max_length=100)
    fieldId: str | None = None
    value: str = Field(default="", max_length=20000)
    position: int | None = None
