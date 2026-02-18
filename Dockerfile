# Use the official fastapi base image
FROM tiangolo/uvicorn-gunicorn-fastapi:python3.9

# Set working directory
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Set environment variables
ENV PORT=8000
ENV VARIABLE1=value1  # Replace with actual environment variables needed
ENV VARIABLE2=value2  # Replace with actual environment variables needed

# Expose the port
EXPOSE ${PORT}

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${PORT}"]