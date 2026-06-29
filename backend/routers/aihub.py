"""
AI Hub router module.
Provides Generate Text (gentxt) and Generate Image (genimg) API endpoints.
"""

import ast
import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from schemas.aihub import GenImgRequest, GenImgResponse, GenTxtRequest
from services.aihub import AIHubService, InvalidImageInputError
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)


def _try_extract_message_from_dict(data: dict) -> str | None:
    """Try to extract message field from a dictionary."""
    # Try to extract error.message format
    if "error" in data and isinstance(data["error"], dict):
        if "message" in data["error"]:
            return data["error"]["message"]
    # Try to extract message field directly
    if "message" in data:
        return data["message"]
    return None


def _try_parse_dict(s: str) -> dict | None:
    """
    Try to parse a string as a dictionary.
    First attempts JSON parsing, then falls back to Python literal eval (for single quotes).
    """
    # Try JSON parsing (double quotes format)
    try:
        data = json.loads(s)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, TypeError):
        pass

    # Try Python literal eval (single quotes format)
    try:
        data = ast.literal_eval(s)
        if isinstance(data, dict):
            return data
    except (ValueError, SyntaxError, TypeError):
        pass

    return None


def extract_error_message(error: Any) -> str:
    """
    Extract a readable error message from an error object.
    Attempts to parse JSON/Python dict format and extract the message field.
    Falls back to the full error string if parsing fails.

    Supported formats:
    - Pure JSON: {"error": {"message": "..."}}
    - Python dict: {'error': {'message': '...'}}
    - With prefix: Error code: 400 - {'error': {'message': '...'}}

    Args:
        error: Error object, can be an Exception or other types

    Returns:
        Extracted error message string
    """
    error_str = str(error)

    # Try to parse the entire string directly
    error_data = _try_parse_dict(error_str)
    if error_data:
        message = _try_extract_message_from_dict(error_data)
        if message:
            return message

    # Try to extract dict portion from string (handles "Error code: 400 - {...}" format)
    start_idx = error_str.find("{")
    end_idx = error_str.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        dict_str = error_str[start_idx : end_idx + 1]
        error_data = _try_parse_dict(dict_str)
        if error_data:
            message = _try_extract_message_from_dict(error_data)
            if message:
                return message

    # If parsing fails, return the original error string
    return error_str


router = APIRouter(prefix="/api/v1/aihub", tags=["aihub"])


@router.post("/gentxt")
async def generate_text(
    request: GenTxtRequest,
):
    """
    Generate Text endpoint (supports text and image input).

    Use the `stream` request parameter to control streaming behavior:
    - stream=false: return a full JSON response
    - stream=true: return an SSE streaming response

    Available models:
    - gpt-5-chat: high stability and compliance, suitable for JSON output and customer service scenarios
    - gemini-2.5-pro: production-grade multimodal model for daily multimodal tasks
    - gemini-3-pro-preview: deep reasoning and ultra-long context (1M+ tokens)
    - claude-4-5-sonnet: ideal for complex engineering and cross-file code refactoring
    - deepseek-v3.2: large-scale batch processing in cost-sensitive scenarios (text only)
    """
    try:
        service = AIHubService()

        # Decide response mode based on the `stream` parameter
        if request.stream:
            # Streaming response - wrap content in JSON for SSE
            async def event_generator():
                try:
                    async for content in service.gentxt_stream(request):
                        yield json.dumps({"content": content})
                except Exception as e:
                    logger.error(f"Stream error: {e}")
                    yield json.dumps({"content": f"[ERROR] {extract_error_message(e)}"})
                finally:
                    yield "[DONE]"

            return EventSourceResponse(event_generator(), media_type="text/event-stream")
        else:
            # Non-streaming response
            response = await service.gentxt(request)
            return response

    except ValueError as e:
        logger.error(f"AI service configuration error: {e}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=extract_error_message(e))
    except Exception as e:
        logger.error(f"Text generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=extract_error_message(e),
        )


@router.post("/genimg", response_model=GenImgResponse)
async def generate_image(
    request: GenImgRequest,
):
    """
    Text-to-Image / Image-to-Image endpoint.

    Generate images based on the given prompt.
    If `image` is provided, the endpoint uses the OpenAI-compatible `images/edits` API to edit the input image.

    Available models:
    - gemini-2.5-flash-image: visual creativity and editing, marketing asset generation, partial image editing
    - gemini-3-pro-image-preview: higher quality image generation/editing

    Parameters:
    - image: optional input image(s). Supports a base64 data URI string or a list of base64 data URIs. If provided, runs image editing (img2img).
    - size: image size (1024x1024 / 1024x1792 / 1792x1024)
    - quality: image quality (standard / hd). Only effective for text-to-image; ignored when `image` is provided.
    - n: number of images to generate (1-4)
    """
    try:
        service = AIHubService()
        return await service.genimg(request)

    except InvalidImageInputError as e:
        logger.warning(f"Invalid image input: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        logger.error(f"AI service configuration error: {e}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=extract_error_message(e))
    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=extract_error_message(e),
        )
