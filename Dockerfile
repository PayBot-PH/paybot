# Updated CMD to handle Railway's PORT environment variable properly
# Use shell form with sh -c to expand ${PORT:-8000}

FROM your-base-image

# Other commands...

CMD ["sh", "-c", "your_application_command --port=${PORT:-8000}"]