"""
Request and response models for the AI Hub module.
"""

from typing import List, Literal, Optional, Union

from pydantic import BaseModel, Field

# ==================== Generate Text ====================


class ImageUrl(BaseModel):
    """Image URL configuration."""

    url: str = Field(..., description="Image URL or base64 data URI.")


class ContentPartText(BaseModel):
    """Text content part."""

    type: str = Field(default="text", description="Content type.")
    text: str = Field(..., description="Text content.")


class ContentPartImage(BaseModel):
    """Image content part."""

    type: str = Field(default="image_url", description="Content type.")
    image_url: ImageUrl = Field(..., description="Image URL configuration.")


class ChatMessage(BaseModel):
    """
    Chat message format.

    Supports two `content` formats:
    1. Plain text: content = "Hello"
    2. Multimodal: content = [{"type": "text", "text": "..."}, {"type": "image_url", "image_url": {"url": "..."}}]
    """

    role: str = Field(..., description="Message role: system/user/assistant.")
    content: Union[str, List[Union[ContentPartText, ContentPartImage]]] = Field(
        ..., description="Message content: a string or a list of content parts (multimodal)."
    )


class GenTxtRequest(BaseModel):
    """Generate Text request parameters."""

    messages: List[ChatMessage] = Field(..., description="Conversation messages list.")
    model: str = Field(
        default="deepseek-v3.2",
        description="Model name: gpt-5-chat / gemini-2.5-pro / gemini-3-pro-preview / claude-4-5-sonnet / deepseek-v3.2.",
    )
    stream: bool = Field(default=False, description="Whether to enable streaming output.")
    temperature: Optional[float] = Field(default=0.7, description="Sampling temperature (0-2).")
    max_tokens: Optional[int] = Field(default=4096, description="Maximum number of generated tokens.")


class GenTxtResponse(BaseModel):
    """Generate Text response (non-streaming)."""

    content: str = Field(..., description="Generated text content.")
    model: str = Field(..., description="Name of the model used.")
    usage: Optional[dict] = Field(default=None, description="Token usage statistics.")


# ==================== Generate Image ====================


class GenImgRequest(BaseModel):
    """Generate Image request parameters."""

    prompt: str = Field(..., description="Prompt for image generation.")
    image: Optional[Union[str, List[str]]] = Field(
        default=None,
        description=(
            "Optional input image(s) for editing (base64 data URI). "
            "Supports a single string or a list of strings, e.g. `data:image/png;base64,...` or [`data:...`, `data:...`]. "
            "If provided, the API performs image editing (img2img) instead of text-to-image."
        ),
    )
    model: str = Field(
        default="gemini-2.5-flash-image",
        description="Model name",
    )
    size: str = Field(default="1024x1024", description="Image size: 1024x1024 / 1024x1792 / 1792x1024.")
    quality: Literal["standard", "hd"] = Field(
        default="standard",
        description="Image quality (only for text-to-image; ignored when `image` is provided).",
    )
    n: int = Field(default=1, description="Number of images to generate (1-4).")


class GenImgResponse(BaseModel):
    """Generate Image response."""

    images: List[str] = Field(
        ...,
        description=(
            "Generated image references list. Prefer HTTP URL to avoid huge response bodies; "
            "fallback to base64 data URI when url is not available."
        ),
    )
    model: str = Field(..., description="Name of the model used.")
    revised_prompt: Optional[str] = Field(default=None, description="Refined prompt used for generation.")
