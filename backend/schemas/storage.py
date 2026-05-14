import os
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class OSSBaseModel(BaseModel):
    bucket_name: str = Field(..., description="The bucket name")

    @field_validator("bucket_name")
    @classmethod
    def validate_bucket_name(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("bucket_name cannot be empty")
        valid_bucket_name = re.sub(r"[^a-z0-9]", "-", v)
        if len(valid_bucket_name) < 3 or len(valid_bucket_name) > 63:
            raise ValueError("bucket_name length should between 3 and 63")
        return valid_bucket_name


class BucketRequest(OSSBaseModel):
    """Request to create bucket"""

    visibility: Literal["public", "private"] = "public"


class BucketResponse(BucketRequest):
    """Response to create bucket"""

    created_at: str = ""


class ObjectInfo(OSSBaseModel):
    object_key: str = ""
    size: int = 0
    last_modified: str = ""
    etag: str = ""


class ObjectListResponse(BaseModel):
    objects: list[ObjectInfo] = []


class BucketInfo(BucketRequest):
    pass


class BucketListResponse(BaseModel):
    buckets: list[BucketInfo] = []


class ObjectRequest(OSSBaseModel):
    object_key: str = ""


class FileUpDownRequest(OSSBaseModel):
    """Request for generating presigned upload URL."""

    object_key: str = Field(..., description="Name of the file to upload")

    @field_validator("object_key")
    @classmethod
    def validate_object_key(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("object_key cannot be empty")

        base_name = os.path.basename(v.strip())
        if not base_name:
            raise ValueError("object_key cannot be empty")

        safe_object_key = re.sub(r"[^A-Za-z0-9._-]", "-", base_name)

        if len(safe_object_key) > 255:
            raise ValueError("object_key too long")

        return safe_object_key


class FileUpDownResponse(BaseModel):
    """Response with presigned upload&download URL and access URL."""

    upload_url: str = Field(default="", description="Presigned URL for uploading the file")
    download_url: str = Field(default="", description="Presigned URL for downloading the file")
    expires_at: str = Field(..., description="Upload URL expiration time")


class RenameRequest(OSSBaseModel):
    source_key: str = ""
    target_key: str = ""
    overwrite_key: bool = True


class RenameResponse(BaseModel):
    success: bool = False


class DeleteResponse(BaseModel):
    success: bool = False
