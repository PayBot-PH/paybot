"""
Generic CRUD router factory.

Use :func:`create_crud_router` to generate the nine standard endpoints
(GET /, GET /all, GET /{id}, POST /, POST /batch, PUT /{id}, PUT /batch,
DELETE /{id}, DELETE /batch) for any entity.  Each router file only needs
to define the entity-specific Pydantic schemas and call this factory.
"""

import inspect
import json
import logging
from typing import List, Optional, Type

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse


def create_crud_router(
    prefix: str,
    tags: List[str],
    service_class: type,
    entity_name: str,
    data_schema: Type[BaseModel],
    update_schema: Type[BaseModel],
    response_schema: Type[BaseModel],
    list_response_schema: Type[BaseModel],
    batch_create_schema: Type[BaseModel],
    batch_update_schema: Type[BaseModel],
    batch_delete_schema: Type[BaseModel],
    *,
    include_create: bool = True,
) -> APIRouter:
    """Return an :class:`APIRouter` with nine standard CRUD endpoints.

    Parameters
    ----------
    prefix:
        URL prefix (e.g. ``"/api/v1/entities/customers"``).
    tags:
        OpenAPI tags list (e.g. ``["customers"]``).
    service_class:
        The ``BaseCRUDService`` subclass to instantiate per request.
    entity_name:
        Human-readable entity label used in log messages and HTTP responses
        (e.g. ``"Customers"``).
    data_schema:
        Pydantic model for create requests.
    update_schema:
        Pydantic model for partial update requests.
    response_schema:
        Pydantic model for a single entity response.
    list_response_schema:
        Pydantic model for paginated list responses.
    batch_create_schema:
        Pydantic model wrapping a list of ``data_schema`` items.
    batch_update_schema:
        Pydantic model wrapping a list of update items.
    batch_delete_schema:
        Pydantic model with an ``ids: List[int]`` field.
    include_create:
        When *False*, the ``POST /`` (single-create) endpoint is omitted so
        the caller can register a custom create handler.  Defaults to True.
    """

    router = APIRouter(prefix=prefix, tags=tags)
    _log = logging.getLogger(__name__)

    # ------------------------------------------------------------------
    # Helper: build a dynamic async function whose __signature__ FastAPI
    # can introspect correctly.  FastAPI resolves dependencies and request
    # bodies entirely from inspect.signature(), so we set __signature__
    # explicitly after defining each handler.
    # ------------------------------------------------------------------

    def _common_query_params() -> List[inspect.Parameter]:
        return [
            inspect.Parameter(
                "query",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Optional[str],
                default=Query(None, description="Query conditions (JSON string)"),
            ),
            inspect.Parameter(
                "sort",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Optional[str],
                default=Query(None, description="Sort field (prefix with '-' for descending)"),
            ),
            inspect.Parameter(
                "skip",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=int,
                default=Query(0, ge=0, description="Number of records to skip"),
            ),
            inspect.Parameter(
                "limit",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=int,
                default=Query(20, ge=1, le=2000, description="Max number of records to return"),
            ),
            inspect.Parameter(
                "fields",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Optional[str],
                default=Query(None, description="Comma-separated list of fields to return"),
            ),
        ]

    def _dep_params(*, auth: bool = True) -> List[inspect.Parameter]:
        params: List[inspect.Parameter] = []
        if auth:
            params.append(
                inspect.Parameter(
                    "current_user",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    annotation=UserResponse,
                    default=Depends(get_current_user),
                )
            )
        params.append(
            inspect.Parameter(
                "db",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=AsyncSession,
                default=Depends(get_db),
            )
        )
        return params

    def _set_sig(fn, params: List[inspect.Parameter]) -> None:
        fn.__signature__ = inspect.Signature(params)

    def _parse_query(raw: Optional[str]) -> Optional[dict]:
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid query JSON format")

    # ------------------------------------------------------------------
    # GET /  – user-scoped list
    # ------------------------------------------------------------------
    async def query_entities(query, sort, skip, limit, fields, current_user, db):
        _log.debug(
            f"Querying {entity_name}: query={query}, sort={sort}, skip={skip}, limit={limit}"
        )
        service = service_class(db)
        try:
            result = await service.get_list(
                skip=skip,
                limit=limit,
                query_dict=_parse_query(query),
                sort=sort,
                user_id=str(current_user.id),
            )
            _log.debug(f"Found {result['total']} {entity_name}")
            return result
        except HTTPException:
            raise
        except Exception as e:
            _log.error(f"Error querying {entity_name}: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    _set_sig(query_entities, _common_query_params() + _dep_params(auth=True))
    query_entities.__name__ = f"query_{entity_name.lower()}"
    router.add_api_route(
        "",
        query_entities,
        methods=["GET"],
        response_model=list_response_schema,
        summary=f"Query {entity_name} with filtering, sorting, and pagination "
        f"(user can only see their own records)",
    )

    # ------------------------------------------------------------------
    # GET /all  – unrestricted list (no auth)
    # ------------------------------------------------------------------
    async def query_entities_all(query, sort, skip, limit, fields, db):
        _log.debug(
            f"Querying {entity_name} (all): query={query}, sort={sort}, skip={skip}, limit={limit}"
        )
        service = service_class(db)
        try:
            result = await service.get_list(
                skip=skip,
                limit=limit,
                query_dict=_parse_query(query),
                sort=sort,
            )
            _log.debug(f"Found {result['total']} {entity_name}")
            return result
        except HTTPException:
            raise
        except Exception as e:
            _log.error(f"Error querying {entity_name}: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    _set_sig(query_entities_all, _common_query_params() + _dep_params(auth=False))
    query_entities_all.__name__ = f"query_{entity_name.lower()}_all"
    router.add_api_route(
        "/all",
        query_entities_all,
        methods=["GET"],
        response_model=list_response_schema,
        summary=f"Query {entity_name} without user scope",
    )

    # ------------------------------------------------------------------
    # GET /{id}
    # ------------------------------------------------------------------
    async def get_entity(id, fields, current_user, db):
        _log.debug(f"Fetching {entity_name} with id: {id}, fields={fields}")
        service = service_class(db)
        try:
            result = await service.get_by_id(id, user_id=str(current_user.id))
            if not result:
                _log.warning(f"{entity_name} with id {id} not found")
                raise HTTPException(status_code=404, detail=f"{entity_name} not found")
            return result
        except HTTPException:
            raise
        except Exception as e:
            _log.error(f"Error fetching {entity_name} {id}: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    _set_sig(
        get_entity,
        [
            inspect.Parameter("id", inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=int),
            inspect.Parameter(
                "fields",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Optional[str],
                default=Query(None, description="Comma-separated list of fields to return"),
            ),
        ]
        + _dep_params(auth=True),
    )
    get_entity.__name__ = f"get_{entity_name.lower()}"
    router.add_api_route(
        "/{id}",
        get_entity,
        methods=["GET"],
        response_model=response_schema,
        summary=f"Get a single {entity_name} by ID (user can only see their own records)",
    )

    # ------------------------------------------------------------------
    # POST /  – create single (can be skipped via include_create=False)
    # ------------------------------------------------------------------
    if include_create:
        async def create_entity(data, current_user, db):
            _log.debug(f"Creating new {entity_name} with data: {data}")
            service = service_class(db)
            try:
                result = await service.create(data.model_dump(), user_id=str(current_user.id))
                if not result:
                    raise HTTPException(status_code=400, detail=f"Failed to create {entity_name}")
                _log.info(f"{entity_name} created successfully with id: {result.id}")
                return result
            except HTTPException:
                raise
            except ValueError as e:
                _log.error(f"Validation error creating {entity_name}: {str(e)}")
                raise HTTPException(status_code=400, detail=str(e))
            except Exception as e:
                _log.error(f"Error creating {entity_name}: {str(e)}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

        _set_sig(
            create_entity,
            [
                inspect.Parameter(
                    "data", inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=data_schema
                ),
            ]
            + _dep_params(auth=True),
        )
        create_entity.__name__ = f"create_{entity_name.lower()}"
        router.add_api_route(
            "",
            create_entity,
            methods=["POST"],
            response_model=response_schema,
            status_code=201,
            summary=f"Create a new {entity_name}",
        )

    # ------------------------------------------------------------------
    # POST /batch  – bulk create
    # ------------------------------------------------------------------
    async def create_entity_batch(request, current_user, db):
        _log.debug(f"Batch creating {len(request.items)} {entity_name}")
        service = service_class(db)
        try:
            results = await service.bulk_create(
                [item.model_dump() for item in request.items],
                user_id=str(current_user.id),
            )
            _log.info(f"Batch created {len(results)} {entity_name} successfully")
            return results
        except Exception as e:
            await db.rollback()
            _log.error(f"Error in batch create: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")

    _set_sig(
        create_entity_batch,
        [
            inspect.Parameter(
                "request",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=batch_create_schema,
            ),
        ]
        + _dep_params(auth=True),
    )
    create_entity_batch.__name__ = f"create_{entity_name.lower()}_batch"
    router.add_api_route(
        "/batch",
        create_entity_batch,
        methods=["POST"],
        response_model=List[response_schema],
        status_code=201,
        summary=f"Create multiple {entity_name} in a single request",
    )

    # ------------------------------------------------------------------
    # PUT /batch  – bulk update
    # ------------------------------------------------------------------
    async def update_entity_batch(request, current_user, db):
        _log.debug(f"Batch updating {len(request.items)} {entity_name}")
        service = service_class(db)
        results = []
        try:
            for item in request.items:
                update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
                result = await service.update(item.id, update_dict, user_id=str(current_user.id))
                if result:
                    results.append(result)
            _log.info(f"Batch updated {len(results)} {entity_name} successfully")
            return results
        except Exception as e:
            await db.rollback()
            _log.error(f"Error in batch update: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")

    _set_sig(
        update_entity_batch,
        [
            inspect.Parameter(
                "request",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=batch_update_schema,
            ),
        ]
        + _dep_params(auth=True),
    )
    update_entity_batch.__name__ = f"update_{entity_name.lower()}_batch"
    router.add_api_route(
        "/batch",
        update_entity_batch,
        methods=["PUT"],
        response_model=List[response_schema],
        summary=f"Update multiple {entity_name} in a single request (requires ownership)",
    )

    # ------------------------------------------------------------------
    # PUT /{id}  – update single
    # ------------------------------------------------------------------
    async def update_entity(id, data, current_user, db):
        _log.debug(f"Updating {entity_name} {id} with data: {data}")
        service = service_class(db)
        try:
            update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
            result = await service.update(id, update_dict, user_id=str(current_user.id))
            if not result:
                _log.warning(f"{entity_name} with id {id} not found for update")
                raise HTTPException(status_code=404, detail=f"{entity_name} not found")
            _log.info(f"{entity_name} {id} updated successfully")
            return result
        except HTTPException:
            raise
        except ValueError as e:
            _log.error(f"Validation error updating {entity_name} {id}: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            _log.error(f"Error updating {entity_name} {id}: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    _set_sig(
        update_entity,
        [
            inspect.Parameter("id", inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=int),
            inspect.Parameter(
                "data", inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=update_schema
            ),
        ]
        + _dep_params(auth=True),
    )
    update_entity.__name__ = f"update_{entity_name.lower()}"
    router.add_api_route(
        "/{id}",
        update_entity,
        methods=["PUT"],
        response_model=response_schema,
        summary=f"Update an existing {entity_name} (requires ownership)",
    )

    # ------------------------------------------------------------------
    # DELETE /batch  – bulk delete
    # ------------------------------------------------------------------
    async def delete_entity_batch(request, current_user, db):
        _log.debug(f"Batch deleting {len(request.ids)} {entity_name}")
        service = service_class(db)
        try:
            deleted_count = await service.batch_delete(request.ids, user_id=str(current_user.id))
            _log.info(f"Batch deleted {deleted_count} {entity_name} successfully")
            return {
                "message": f"Successfully deleted {deleted_count} {entity_name}",
                "deleted_count": deleted_count,
            }
        except Exception as e:
            await db.rollback()
            _log.error(f"Error in batch delete: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")

    _set_sig(
        delete_entity_batch,
        [
            inspect.Parameter(
                "request",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=batch_delete_schema,
            ),
        ]
        + _dep_params(auth=True),
    )
    delete_entity_batch.__name__ = f"delete_{entity_name.lower()}_batch"
    router.add_api_route(
        "/batch",
        delete_entity_batch,
        methods=["DELETE"],
        summary=f"Delete multiple {entity_name} by their IDs (requires ownership)",
    )

    # ------------------------------------------------------------------
    # DELETE /{id}  – delete single
    # ------------------------------------------------------------------
    async def delete_entity(id, current_user, db):
        _log.debug(f"Deleting {entity_name} with id: {id}")
        service = service_class(db)
        try:
            success = await service.delete(id, user_id=str(current_user.id))
            if not success:
                _log.warning(f"{entity_name} with id {id} not found for deletion")
                raise HTTPException(status_code=404, detail=f"{entity_name} not found")
            _log.info(f"{entity_name} {id} deleted successfully")
            return {"message": f"{entity_name} deleted successfully", "id": id}
        except HTTPException:
            raise
        except Exception as e:
            _log.error(f"Error deleting {entity_name} {id}: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    _set_sig(
        delete_entity,
        [
            inspect.Parameter("id", inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=int),
        ]
        + _dep_params(auth=True),
    )
    delete_entity.__name__ = f"delete_{entity_name.lower()}"
    router.add_api_route(
        "/{id}",
        delete_entity,
        methods=["DELETE"],
        summary=f"Delete a single {entity_name} by ID (requires ownership)",
    )

    return router
