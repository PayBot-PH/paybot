*** Begin Patch
*** Update File: backend/Dockerfile
@@
 COPY backend/ .
 
 # Copy the freshly built frontend assets into the static directory
 COPY --from=frontend-builder /app/frontend/dist/ ./static/
 
 # Expose port 8000 (Railway will use $PORT environment variable)
 EXPOSE 8000
 
 # Set environment variables
 ENV PYTHONUNBUFFERED=1
 ENV ENVIRONMENT=production
 ENV LOG_LEVEL=info
-
-# Start the server — attempt migrations with a 35s timeout (non-fatal), then start uvicorn.
-# The asyncpg connection timeout in alembic/env.py is 30 s, so 35 s is enough headroom.
-# `exec` replaces the shell with uvicorn so that uvicorn becomes PID 1 and receives
-# SIGTERM directly from the container runtime for graceful shutdown.
-CMD ["sh", "-c", "timeout 35 alembic upgrade head || echo 'Alembic migration timed out or failed, continuing...' ; exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info --no-a[..."]
+# Copy entrypoint and ensure it is executable
+COPY backend/entrypoint.sh /entrypoint.sh
+RUN chmod +x /entrypoint.sh
+
+# Use the entrypoint which waits for DB, runs migrations, and starts uvicorn
+ENTRYPOINT ["/entrypoint.sh"]
*** End Patch
