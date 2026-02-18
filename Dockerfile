# Dockerfile

FROM python:3.11

# Set the working directory in the container
WORKDIR /app

# Copy requirements file
COPY backend/requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the main application
COPY . .

# Command to run the FastAPI app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]