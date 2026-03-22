preDeployCommand = "cd /app/backend && alembic upgrade head"preDeployCommand = "cd /app/backend && alembic upgrade head"preDeployCommand = "cd /app/backend && alembic upgrade head"preDeployCommand = "cd /app/backend && alembic upgrade head"FROM alpine:latest
LABEL Name=paybot Version=0.0.1
RUN apk add --no-cache fortune
ENTRYPOINT ["sh", "-c", "fortune -a | cat"]
preDeployCommand = "cd /app/backend && alembic upgrade head"