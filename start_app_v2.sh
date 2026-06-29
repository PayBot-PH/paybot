#!/bin/bash

# Startup script - Automatically assign ports and start frontend/backend services
# Author: AI Assistant
# Date: $(date)

set -e  # Exit immediately on error

# Logging functions
log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_success() {
    echo "[SUCCESS] $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warning() {
    echo "[WARNING] $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_debug() {
    echo "[DEBUG] $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Get local IP address
get_local_ip() {
    # Try multiple methods to get local IP
    local ip=""
    
    # Method 1: Get through routing table
    if command -v ip >/dev/null 2>&1; then
        ip=$(ip route get 8.8.8.8 2>/dev/null | grep -oP 'src \K\S+' | head -1)
    fi
    
    # Method 2: Get through ifconfig
    if [ -z "$ip" ] && command -v ifconfig >/dev/null 2>&1; then
        ip=$(ifconfig | grep -E "inet [0-9]" | grep -v "127.0.0.1" | head -1 | awk '{print $2}' | sed 's/addr://')
    fi
    
    # Method 3: Get through hostname
    if [ -z "$ip" ]; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    
    # If still cannot get, use default value
    if [ -z "$ip" ]; then
        ip="192.168.1.100"
        log_warning "Unable to automatically get IP address, using default: $ip"
    fi
    
    echo "$ip"
}

# Check if port is available using multiple methods
is_port_available() {
    local port=$1
    log_info "Checking port $port availability..." >&2

    # Method 1: Use lsof to check for processes using the port
    local lsof_available=true
    if command -v lsof >/dev/null 2>&1; then
        log_info "Using lsof to check port $port" >&2
        local lsof_result
        lsof_result=$(lsof -i :$port 2>&1)
        log_info "lsof -i :$port result: '$lsof_result'" >&2
        if lsof -i :$port >/dev/null 2>&1; then
            lsof_available=false
            log_info "lsof detected port $port is in use" >&2
        else
            log_info "lsof detected port $port is free" >&2
        fi
    else
        log_warning "lsof not available, skipping lsof check" >&2
        lsof_available="skipped"
    fi

    # Method 2: Use nc to test port connectivity
    local nc_available=true
    if command -v nc >/dev/null 2>&1; then
        log_info "Using nc to test port $port connectivity" >&2
        local nc_result
        nc_result=$(nc -z localhost $port 2>&1)
        log_info "nc -z localhost $port result: '$nc_result'" >&2
        if nc -z localhost $port 2>/dev/null; then
            nc_available=false
            log_info "nc detected port $port is in use" >&2
        else
            log_info "nc detected port $port is free" >&2
        fi
    else
        log_warning "nc not available, skipping nc check" >&2
        nc_available="skipped"
    fi

    # Method 3: Use netstat to check for processes using the port
    local netstat_available=true
    if command -v netstat >/dev/null 2>&1; then
        log_info "Using netstat to check port $port" >&2
        local netstat_result
        netstat_result=$(netstat -an 2>&1 | grep ":$port ")
        log_info "netstat -an | grep ':$port ' result: '$netstat_result'" >&2
        if echo "$netstat_result" | grep -q ":$port "; then
            netstat_available=false
            log_info "netstat detected port $port is in use" >&2
        else
            log_info "netstat detected port $port is free" >&2
        fi
    else
        log_warning "netstat not available, skipping netstat check" >&2
        netstat_available="skipped"
    fi

    # Port is available only if all available methods agree it's free
    local available_methods=0
    local free_methods=0
    
    if [ "$lsof_available" != "skipped" ]; then
        available_methods=$((available_methods + 1))
        [ "$lsof_available" = true ] && free_methods=$((free_methods + 1))
    fi
    
    if [ "$nc_available" != "skipped" ]; then
        available_methods=$((available_methods + 1))
        [ "$nc_available" = true ] && free_methods=$((free_methods + 1))
    fi
    
    if [ "$netstat_available" != "skipped" ]; then
        available_methods=$((available_methods + 1))
        [ "$netstat_available" = true ] && free_methods=$((free_methods + 1))
    fi

    if [ $free_methods -eq $available_methods ] && [ $available_methods -gt 0 ]; then
        log_info "Port $port is confirmed available by all methods (lsof: $lsof_available, nc: $nc_available, netstat: $netstat_available)" >&2
        return 0
    else
        log_info "Port $port is not available (lsof: $lsof_available, nc: $nc_available, netstat: $netstat_available)" >&2
        return 1
    fi
}

# Find process ID by port
find_process_by_port() {
    local port=$1
    local pid=""
    
    if command -v lsof >/dev/null 2>&1; then
        pid=$(lsof -ti :$port 2>/dev/null | head -1)
    elif command -v netstat >/dev/null 2>&1; then
        # For systems with netstat, we need to parse the output
        local netstat_output=$(netstat -tulnp 2>/dev/null | grep ":$port ")
        if [ ! -z "$netstat_output" ]; then
            pid=$(echo "$netstat_output" | awk '{print $7}' | cut -d'/' -f1 | head -1)
        fi
    fi
    
    echo "$pid"
}

# Kill process by port
kill_process_by_port() {
    local port=$1
    local service_name=$2
    
    local pid=$(find_process_by_port $port)
    if [ ! -z "$pid" ] && [ "$pid" != "" ]; then
        log_info "Found running $service_name service on port $port (PID: $pid), stopping it..."
        kill $pid 2>/dev/null || true
        sleep 2
        
        # Force kill if still running
        if kill -0 $pid 2>/dev/null; then
            log_warning "Force killing $service_name service (PID: $pid)..."
            kill -9 $pid 2>/dev/null || true
            sleep 1
        fi
        
        log_success "$service_name service stopped"
    else
        log_info "No running $service_name service found on port $port"
    fi
}

# Find available port
find_available_port() {
    local start_port=$1
    local port=$start_port
    
    while [ $port -le $((start_port + 100)) ]; do
        if is_port_available $port; then
            echo $port
            return 0
        fi
        port=$((port + 1))
    done
    
    log_error "No available port found in range $start_port-$((start_port + 100))"
    exit 1
}

# Wait for backend health endpoint to be ready
wait_for_backend_health() {
    local max_attempts=60
    local attempt=1
    local health_url="http://$LOCAL_IP:$BACKEND_PORT/health"
    
    log_info "Waiting for backend health endpoint to be ready..."
    log_info "Checking: $health_url"
    
    while [ $attempt -le $max_attempts ]; do
        if [ -n "$USERNAME" ]; then
            if curl -f -s "$health_url" -H "username: $USERNAME" >/dev/null 2>&1; then
                log_success "Backend health endpoint is ready"
                return 0
            fi
        else
            if curl -f -s "$health_url" >/dev/null 2>&1; then
                log_success "Backend health endpoint is ready"
                return 0
            fi
        fi
        
        if [ $((attempt % 5)) -eq 0 ]; then
            log_info "Still waiting for backend health endpoint... (attempt $attempt/$max_attempts)"
        fi
        
        sleep 1
        attempt=$((attempt + 1))
    done
    
    log_warning "Backend health endpoint did not become ready after $max_attempts attempts"
    return 1
}

# Reset dirty signal to S2S API
reset_dirty_signal() {
    local base_url=${S2S_JWT_BASE_URL:-"http://localhost:8686"}
    local access_token=${S2S_JWT_ACCESS_TOKEN:-""}
    local app_id=${S2S_APP_ID:-""}
    local value=${1:-"0"}
    
    if [ -z "$access_token" ] || [ -z "$app_id" ]; then
        log_warning "S2S API credentials not provided, skipping reset signal"
        return 0
    fi
    
    local api_url="${base_url}/api/v1/chats/${app_id}/signals/reset"
    
    log_info "Resetting dirty signal to: $api_url"
    
    local response
    local http_code
    if [ -n "$USERNAME" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$api_url" \
            -H "Authorization: Bearer $access_token" \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" \
            -H "username: $USERNAME" \
            --data-raw "{\"value\": \"$value\"}" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$api_url" \
            -H "Authorization: Bearer $access_token" \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" \
            --data-raw "{\"value\": \"$value\"}" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    response=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        log_success "Dirty signal reset successfully"
        return 0
    else
        log_warning "Failed to reset dirty signal (HTTP $http_code): $response"
        return 1
    fi
}

# Reset running signal to S2S API
reset_running_signal() {
    local base_url=${S2S_JWT_BASE_URL:-"http://localhost:8686"}
    local access_token=${S2S_JWT_ACCESS_TOKEN:-""}
    local app_id=${S2S_APP_ID:-""}
    local value="0"
    
    if [ -z "$access_token" ] || [ -z "$app_id" ]; then
        log_warning "S2S API credentials not provided, skipping set running signal"
        return 0
    fi
    
    local api_url="${base_url}/api/v1/chats/${app_id}/signals/running"
    
    log_info "Setting running signal to: $api_url"
    
    local response
    local http_code
    if [ -n "$USERNAME" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$api_url" \
            -H "Authorization: Bearer $access_token" \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" \
            -H "username: $USERNAME" \
            --data-raw "{\"value\": \"$value\"}" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$api_url" \
            -H "Authorization: Bearer $access_token" \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" \
            --data-raw "{\"value\": \"$value\"}" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    response=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        log_success "Running signal reset successfully"
        return 0
    else
        log_warning "Failed to reset running signal (HTTP $http_code): $response"
        return 1
    fi
}

# Get dirty signal status from S2S API
# Returns: 0 if dirty, 1 if not dirty or error
get_dirty_signal() {
    local base_url=${S2S_JWT_BASE_URL:-"http://localhost:8686"}
    local access_token=${S2S_JWT_ACCESS_TOKEN:-""}
    local app_id=${S2S_APP_ID:-""}
    
    if [ -z "$access_token" ] || [ -z "$app_id" ]; then
        log_warning "S2S API credentials not provided, skipping get dirty signal"
        return 1
    fi
    
    local api_url="${base_url}/api/v1/chats/${app_id}/signals/dirty"
    
    log_info "Getting dirty signal status from: $api_url"
    
    local response
    local http_code
    if [ -n "$USERNAME" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "$api_url" \
            -H "Authorization: Bearer $access_token" \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" \
            -H "username: $USERNAME" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X GET "$api_url" \
            -H "Authorization: Bearer $access_token" \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    response=$(echo "$response" | sed '$d')
    
    if [ "$http_code" != "200" ]; then
        log_warning "Failed to get dirty signal (HTTP $http_code): $response"
        return 1
    fi
    
    log_success "Dirty signal status retrieved successfully"
    
    # Parse JSON response to check if dirty
    # Expected format: {"code": 0, "message": "SUCCESS", "data": {"value": "1"}}
    local is_dirty=false
    if command -v python3 >/dev/null 2>&1; then
        # Use Python to parse JSON
        local response_b64=$(echo "$response" | python3 -c "import sys, base64; print(base64.b64encode(sys.stdin.buffer.read()).decode())")
        is_dirty=$(echo "$response_b64" | python3 -c "
import json
import sys
import base64

try:
    response_b64 = sys.stdin.read().strip()
    response = base64.b64decode(response_b64).decode('utf-8')
    data = json.loads(response)
    
    # Check if code is 0 (success)
    if data.get('code') != 0:
        print('false')
        sys.exit(0)
    
    # Check data.value format: {"code": 0, "data": {"value": "1"}}
    if 'data' in data and isinstance(data['data'], dict):
        if 'value' in data['data']:
            value = str(data['data']['value'])
            is_dirty = value in ['1', 'true', 'True', 'TRUE']
        elif 'dirty' in data['data']:
            is_dirty = bool(data['data']['dirty'])
    # Check direct dirty/value fields
    elif 'dirty' in data:
        is_dirty = bool(data['dirty'])
    elif 'value' in data:
        value = str(data['value'])
        is_dirty = value in ['1', 'true', 'True', 'TRUE']
    
    print('true' if is_dirty else 'false')
except Exception as e:
    print('false', file=sys.stderr)
    sys.exit(1)
")
    else
        # Fallback: simple string matching
        # Check for {"code": 0, "data": {"value": "1"}}
        if echo "$response" | grep -qiE '"code"[[:space:]]*:[[:space:]]*0' && \
           echo "$response" | grep -qiE '"data"[[:space:]]*:[[:space:]]*\{[^}]*"value"[[:space:]]*:[[:space:]]*"1"'; then
            is_dirty=true
        elif echo "$response" | grep -qiE '"dirty"[[:space:]]*:[[:space:]]*(true|1)'; then
            is_dirty=true
        elif echo "$response" | grep -qiE '"value"[[:space:]]*:[[:space:]]*("1"|"true")'; then
            is_dirty=true
        fi
    fi
    
    if [ "$is_dirty" = "true" ]; then
        return 0  # Dirty
    else
        return 1  # Not dirty
    fi
}

# Check dirty signal and reload environment variables if dirty
check_and_reload_env_if_dirty() {
    local local_ip=$1
    local backend_port=$2
    local frontend_port=$3
    local local_mode=$4
    
    log_info "Checking dirty signal status..."
    
    if get_dirty_signal; then
        log_warning "Dirty signal detected, reloading environment variables..."
        cd "$BACKEND_DIR"
        process_env_with_placeholders "$local_ip" "$backend_port" "$frontend_port" "$local_mode"
        log_success "Environment variables reloaded successfully"
        return 0
    else
        log_info "Dirty signal is clean, no need to reload environment variables"
        return 0
    fi
}


# Fetch environment variables from API
fetch_env_from_api() {
    local base_url=$1
    local access_token=$2
    local app_id=$3
    
    if [ -z "$base_url" ] || [ -z "$access_token" ]; then
        log_error "Base URL and access token are required for API fetch" >&2
        return 1
    fi
    
    # Construct API URL
    # App ID is required
    # Environment is fixed to "dev"
    local api_url
    if [ -n "$app_id" ]; then
        api_url="${base_url}/api/v1/chats/${app_id}/kvs/app?env=dev"
    else
        log_error "App ID is required. Please provide --s2s-app-id parameter" >&2
        return 1
    fi
    
    log_info "Fetching environment variables from API: $api_url" >&2
    
    # Make API call
    local response
    local http_code
    if [ -n "$USERNAME" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "$api_url" \
            -H "Authorization: Bearer $access_token" \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" \
            -H "username: $USERNAME" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X GET "$api_url" \
            -H "Authorization: Bearer $access_token" \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    response=$(echo "$response" | sed '$d')
    
    if [ "$http_code" != "200" ]; then
        { log_error "API call failed with HTTP code $http_code"; } >&2
        { log_error "Response: $response"; } >&2
        return 1
    fi
    
    # Check if response is valid JSON and contains data
    if ! echo "$response" | grep -q '"code"'; then
        { log_error "Invalid API response format"; } >&2
        { log_error "Response: $response"; } >&2
        return 1
    fi
    
    # Check if code is 0 (success)
    local code=$(echo "$response" | grep -o '"code"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*')
    if [ "$code" != "0" ]; then
        { log_error "API returned error code: $code"; } >&2
        { log_error "Response: $response"; } >&2
        return 1
    fi
    
    # Extract data array and parse it
    # The response format is: {"code":0,"message":"SUCCESS","data":[{"conf_key":"KEY","conf_value":"VALUE"},...]}
    # We need to extract the data array and parse each conf_key/conf_value pair
    
    # Parse JSON and return environment variables content directly (no temp file)
    local env_content=""
    
    # Parse JSON using Python if available
    if command -v python3 >/dev/null 2>&1; then
        # Use base64 encoding to safely pass JSON to Python
        local response_b64=$(echo "$response" | python3 -c "import sys, base64; print(base64.b64encode(sys.stdin.buffer.read()).decode())")
        env_content=$(echo "$response_b64" | python3 -c "
import json
import sys
import base64

try:
    response_b64 = sys.stdin.read().strip()
    response = base64.b64decode(response_b64).decode('utf-8')
    data = json.loads(response)
    if data.get('code') == 0 and 'data' in data:
        for item in data['data']:
            conf_key = item.get('conf_key', '')
            conf_value = item.get('conf_value', '')
            if conf_key:
                print(f\"{conf_key}={conf_value}\")
    else:
        print(f\"Error: API returned code {data.get('code')}\", file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f\"Error parsing JSON: {e}\", file=sys.stderr)
    sys.exit(1)
")
        local parse_exit_code=$?
        if [ $parse_exit_code -eq 0 ] && [ -n "$env_content" ]; then
            { log_success "Successfully fetched environment variables from API"; } >&2
            { log_debug "Fetched $(echo "$env_content" | wc -l | tr -d ' ') environment variables"; } >&2
            # Output the content to stdout
            echo "$env_content"
            return 0
        else
            { log_error "Failed to parse API response (exit code: $parse_exit_code)"; } >&2
            return 1
        fi
    else
        # Fallback: try to parse manually (less reliable)
        { log_warning "python3 not available, attempting manual JSON parsing"; } >&2
        # This is a simplified parser - may not work for all cases
        while IFS= read -r line; do
            local key=$(echo "$line" | sed -n 's/.*"conf_key":"\([^"]*\)".*/\1/p')
            local value=$(echo "$line" | sed -n 's/.*"conf_value":"\([^"]*\)".*/\1/p')
            if [ -n "$key" ] && [ -n "$value" ]; then
                env_content="${env_content}${key}=${value}"$'\n'
            fi
        done < <(echo "$response" | grep -o '"conf_key":"[^"]*","conf_value":"[^"]*"')
        
        if [ -n "$env_content" ]; then
            { log_success "Successfully fetched environment variables from API (manual parsing)"; } >&2
            echo "$env_content"
            return 0
        else
            { log_error "Failed to parse API response manually"; } >&2
            return 1
        fi
    fi
}

# Process environment variables with placeholder replacement
process_env_with_placeholders() {
    local local_ip=$1
    local backend_port=$2
    local frontend_port=$3
    local local_mode=$4
    
    local temp_env_file=""
    
    # Check if API parameters are provided
    if [ -z "$S2S_JWT_ACCESS_TOKEN" ] || [ -z "$S2S_JWT_BASE_URL" ] || [ -z "$S2S_APP_ID" ]; then
        log_error "API parameters are required. Please provide via environment variables:"
        log_error "  - S2S_JWT_TOKEN"
        log_error "  - S2S_JWT_BASE_URL"
        log_error "  - CHAT_ID"
        return 1
    fi
    
    # Fetch environment variables from API
    local env_content=""
    if ! env_content=$(fetch_env_from_api "$S2S_JWT_BASE_URL" "$S2S_JWT_ACCESS_TOKEN" "$S2S_APP_ID"); then
        log_error "Failed to fetch environment variables from API"
        return 1
    fi
    
    if [ -z "$env_content" ]; then
        log_error "No environment variables fetched from API"
        return 1
    fi

    reset_dirty_signal
    
    log_info "Using environment variables from API"
    log_debug "Fetched $(echo "$env_content" | wc -l | tr -d ' ') environment variables"
    log_info "Parameters: local_ip=$local_ip, backend_port=$backend_port, frontend_port=$frontend_port"
    log_debug "Function parameters - local_ip='$local_ip', backend_port='$backend_port', frontend_port='$frontend_port', local_mode='$local_mode'"
    
    # First pass: Read DEV_BASE_URL if it exists (needed for non-local mode only)
    # These variables are only used in non-local mode to replace domain placeholders
    local dev_base_url=""
    local dev_base_domain=""
    if [ "$local_mode" != true ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            # Skip empty lines and comments
            if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
                continue
            fi
            
            # Check if line contains DEV_BASE_URL assignment
            if [[ "$line" =~ ^[[:space:]]*DEV_BASE_URL[[:space:]]*=(.*)$ ]]; then
                dev_base_url="${BASH_REMATCH[1]}"
                # Remove leading/trailing whitespace and quotes
                dev_base_url=$(echo "$dev_base_url" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                dev_base_url=$(echo "$dev_base_url" | sed 's/^["'\'']//;s/["'\'']$//')
                
                # Extract domain part (remove protocol if present)
                # DEV_BASE_URL format: protocol://domain[:port] or domain[:port] (no path)
                # Remove protocol to get domain (and port if present)
                if [[ "$dev_base_url" =~ ^https?://(.+)$ ]]; then
                    dev_base_domain="${BASH_REMATCH[1]}"
                else
                    dev_base_domain="$dev_base_url"
                fi
                
                log_info "Found DEV_BASE_URL: $dev_base_url"
                log_info "Extracted domain: $dev_base_domain"
                break
            fi
        done <<< "$env_content"
    fi
    # Note: In local_mode, dev_base_url and dev_base_domain remain empty and are not used
    
    # Second pass: Process each line from env_content
    # Format: key=value (no quotes)
    local line_count=0
    local processed_count=0
    local skipped_count=0
    
    while IFS= read -r line || [ -n "$line" ]; do
        line_count=$((line_count + 1))
        
        # Skip empty lines and comments
        if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
            log_debug "Line $line_count: Skipping empty/comment line"
            continue
        fi
        
        # Skip BACKEND_PORT and FRONTEND_PORT as they are set manually
        if [[ "$line" =~ ^[[:space:]]*BACKEND_PORT= ]] || [[ "$line" =~ ^[[:space:]]*FRONTEND_PORT= ]]; then
            skipped_count=$((skipped_count + 1))
            log_info "Skipping $(echo "$line" | cut -d= -f1) as it's set manually"
            continue
        fi
        
        processed_count=$((processed_count + 1))
        log_debug "Line $line_count: Before replacement: $line"
        
        # Apply placeholder replacements directly to the line
        if [ "$local_mode" = true ]; then
            # Local mode: Replace domain placeholders with local IP and ports
            line="${line//\$\$BACKEND_DOMAIN\$\$/$local_ip:$backend_port}"
            line="${line//\$\$FRONTEND_DOMAIN\$\$/$local_ip:$frontend_port}"
        else
            # Non-local mode: Replace domain placeholders with DEV_BASE_URL domain
            if [ -n "$dev_base_domain" ]; then
                line="${line//\$\$BACKEND_DOMAIN\$\$/$dev_base_domain}"
                line="${line//\$\$FRONTEND_DOMAIN\$\$/$dev_base_domain}"
            else
                line="${line//\$\$BACKEND_DOMAIN\$\$/\/}"
                line="${line//\$\$FRONTEND_DOMAIN\$\$/\/}"
            fi
        fi
        
        # Replace $$SERVER_ADDR$$ placeholder
        line="${line//\$\$SERVER_ADDR\$\$/$local_ip}"
        
        log_debug "Line $line_count: After replacement: $line"
        
        # Export directly: export "KEY=VALUE"
        if export "$line" 2>&1; then
            log_info "Exported: $line"
        else
            log_error "Failed to export: $line (exit code: $?)"
        fi
    done <<< "$env_content"
    
    log_debug "Finished processing. Total lines: $line_count, Processed: $processed_count, Skipped: $skipped_count"
    
    # Debug: Show all exported environment variables (extract variable names from env_content)
    log_debug "All exported environment variables:"
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ "$line" =~ ^[[:space:]]*([^=]+)= ]]; then
            local var_name="${BASH_REMATCH[1]}"
            var_name=$(echo "$var_name" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            if [ -n "${!var_name}" ]; then
                log_debug "  $var_name=${!var_name}"
            fi
        fi
    done <<< "$env_content"
}

# Process environment variables with placeholder replacement
process_env_with_placeholders_from_file() {
    local env_file=$1
    local local_ip=$2
    local backend_port=$3
    local frontend_port=$4
    local local_mode=$5

    # If .env doesn't exist
    if [ ! -f "$env_file" ]; then
        log_warning "Environment file not found: $env_file"
        return 1
    fi

    log_info "Processing environment variables from: $env_file"
    log_info "Parameters: local_ip=$local_ip, backend_port=$backend_port, frontend_port=$frontend_port"
    log_info "DEBUG: Function parameters - local_ip='$local_ip', backend_port='$backend_port', frontend_port='$frontend_port', local_mode='$local_mode'"

    # First pass: Read DEV_BASE_URL if it exists (needed for non-local mode only)
    # These variables are only used in non-local mode to replace domain placeholders
    local dev_base_url=""
    local dev_base_domain=""
    if [ "$local_mode" != true ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            # Skip empty lines and comments
            if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
                continue
            fi

            # Check if line contains DEV_BASE_URL assignment
            if [[ "$line" =~ ^[[:space:]]*DEV_BASE_URL[[:space:]]*=(.*)$ ]]; then
                dev_base_url="${BASH_REMATCH[1]}"
                # Remove leading/trailing whitespace and quotes
                dev_base_url=$(echo "$dev_base_url" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                dev_base_url=$(echo "$dev_base_url" | sed 's/^["'\'']//;s/["'\'']$//')

                # Extract domain part (remove protocol if present)
                # DEV_BASE_URL format: protocol://domain[:port] or domain[:port] (no path)
                # Remove protocol to get domain (and port if present)
                if [[ "$dev_base_url" =~ ^https?://(.+)$ ]]; then
                    dev_base_domain="${BASH_REMATCH[1]}"
                else
                    dev_base_domain="$dev_base_url"
                fi

                log_info "Found DEV_BASE_URL: $dev_base_url"
                log_info "Extracted domain: $dev_base_domain"
                break
            fi
        done < "$env_file"
    fi
    # Note: In local_mode, dev_base_url and dev_base_domain remain empty and are not used

    # Second pass: Read the .env file and process each line
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines and comments
        if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
            continue
        fi

        # Check if line contains an assignment
        if [[ "$line" =~ ^[[:space:]]*([^=]+)=(.*)$ ]]; then
            local key="${BASH_REMATCH[1]}"
            local value="${BASH_REMATCH[2]}"

            # Remove leading/trailing whitespace
            key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

            # Remove quotes if present
            value=$(echo "$value" | sed 's/^["'\'']//;s/["'\'']$//')

            # Skip BACKEND_PORT and FRONTEND_PORT as they are set manually
            if [ "$key" = "BACKEND_PORT" ] || [ "$key" = "FRONTEND_PORT" ]; then
                log_info "Skipping $key as it's set manually"
                continue
            fi

            # Apply placeholder replacements
            # log_info "Before replacement: $key=$value"

            if [ "$local_mode" = true ]; then
                # Local mode: Replace domain placeholders with local IP and ports
                # log_info "DEBUG: Local mode replacement - frontend_port='$frontend_port'"
                # 1. Replace $$BACKEND_DOMAIN$$ with local IP and backend port
                value="${value//\$\$BACKEND_DOMAIN\$\$/$local_ip:$backend_port}"
                # log_info "DEBUG: After BACKEND_DOMAIN replacement: $key=$value"

                # 2. Replace $$FRONTEND_DOMAIN$$ with local IP and frontend port
                # log_info "DEBUG: Before FRONTEND_DOMAIN replacement - frontend_port='$frontend_port', value='$value'"
                value="${value//\$\$FRONTEND_DOMAIN\$\$/$local_ip:$frontend_port}"
                # log_info "DEBUG: After FRONTEND_DOMAIN replacement: $key=$value"
            else
                # Non-local mode: Replace domain placeholders with DEV_BASE_URL domain
                # dev_base_domain was extracted in the first pass (or remains empty if not found)
                if [ -n "$dev_base_domain" ]; then
                    # log_info "DEBUG: Non-local mode replacement using DEV_BASE_URL domain='$dev_base_domain'"
                    value="${value//\$\$BACKEND_DOMAIN\$\$/$dev_base_domain}"
                    value="${value//\$\$FRONTEND_DOMAIN\$\$/$dev_base_domain}"
                    # log_info "DEBUG: After domain replacement: $key=$value"
                else
                    # log_warning "DEV_BASE_URL not found, using '/' as fallback"
                    value="${value//\$\$BACKEND_DOMAIN\$\$/\/}"
                    value="${value//\$\$FRONTEND_DOMAIN\$\$/\/}"
                fi
            fi

            # log_info "After replacement: $key=$value"

            # Export the processed environment variable
            export "$key=$value"
            log_info "Exported: $key=$value"
        fi
    done < "$env_file"
}


# Find available port pair with same offset
find_available_port_pair() {
    local backend_start=$1
    local frontend_start=$2
    local max_offset=10000
    local offset=0
    
    while [ $offset -le $max_offset ]; do
        local backend_port=$((backend_start + offset))
        local frontend_port=$((frontend_start + offset))
        
        if is_port_available $backend_port && is_port_available $frontend_port; then
            echo "$backend_port $frontend_port"
            return 0
        fi
        
        offset=$((offset + 1))
    done
    
    log_error "No available port pair found in range $backend_start-$((backend_start + max_offset)) and $frontend_start-$((frontend_start + max_offset))"
    return 1
}

# Start services with retry mechanism
start_services_with_retry() {
    local max_retries=3
    local retry_count=0
    local current_offset=0
    
    # Determine which function to use based on S2S JWT parameters
    # Priority: API mode if S2S JWT parameters are available, otherwise file mode
    local use_file_mode=false
    local env_file_path=""

    if [ -n "$S2S_JWT_ACCESS_TOKEN" ] && [ -n "$S2S_JWT_BASE_URL" ] && [ -n "$S2S_APP_ID" ]; then
        # If S2S JWT parameters are available, use API-based environment variable processing
        log_info "Using API-based environment variable processing"
    else
        # If S2S JWT parameters are not available, use file mode with ENV_FILENAME (default: .env)
        use_file_mode=true
        env_file_path="$SCRIPT_DIR/$ENV_FILENAME"
        log_info "Using file-based environment variable processing with file: $env_file_path"
    fi

    while [ $retry_count -lt $max_retries ]; do
        retry_count=$((retry_count + 1))
        log_info "Service startup attempt $retry_count/$max_retries..."

        # Find available port pair starting from current offset
        local port_pair
        if ! port_pair=$(find_available_port_pair $((8000 + current_offset)) $((3000 + current_offset))); then
            log_error "Failed to find available port pair"
            return 1
        fi

        BACKEND_PORT=$(echo $port_pair | awk '{print $1}')
        FRONTEND_PORT=$(echo $port_pair | awk '{print $2}')
        log_info "Assigned backend port: $BACKEND_PORT"
        log_info "Assigned frontend port: $FRONTEND_PORT"

        # Export the port variables to override any .env values
        export BACKEND_PORT=$BACKEND_PORT
        export FRONTEND_PORT=$FRONTEND_PORT

        # Switch to backend directory
        cd "$BACKEND_DIR"

        # Update backend environment configuration
        log_info "Updating Backend environment configuration..."
        log_debug "Before backend env processing - FRONTEND_PORT='$FRONTEND_PORT'"
        if [ "$use_file_mode" = true ]; then
            # Use env file from project root (app/.env)
            process_env_with_placeholders_from_file "$env_file_path" "$LOCAL_IP" "$BACKEND_PORT" "$FRONTEND_PORT" "$LOCAL_MODE"
        else
            # Use API-based environment variable processing
            process_env_with_placeholders "$LOCAL_IP" "$BACKEND_PORT" "$FRONTEND_PORT" "$LOCAL_MODE"
        fi
        # Ensure IS_LAMBDA is always set to false for local development
        export IS_LAMBDA=false
        export ENVIRONMENT=dev
        log_info "Ensured IS_LAMBDA=$IS_LAMBDA and ENVIRONMENT=$ENVIRONMENT for local development"

        # Start backend service
        log_info "Starting Backend service...$BACKEND_PORT"
        uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT --reload &
        BACKEND_RELOADER_PID=$!  # Parent process (reloader)

        # Wait for backend to start
        log_info "Waiting for Backend service to start..."
        # sleep 25

        # Check if backend started successfully
        if ! kill -0 $BACKEND_RELOADER_PID 2>/dev/null; then
            log_warning "Backend startup attempt $retry_count failed"
            # Clean up failed backend process: kill child processes first, then reloader
            local child_pids=$(pgrep -P $BACKEND_RELOADER_PID 2>/dev/null || true)
            if [ ! -z "$child_pids" ]; then
                for child_pid in $child_pids; do
                    kill $child_pid 2>/dev/null || true
                done
                sleep 1
            fi
            kill $BACKEND_RELOADER_PID 2>/dev/null || true
            # Increment offset for next attempt with random number (1-9)
            local random_offset=$((RANDOM % 9 + 1))
            current_offset=$((current_offset + random_offset))
            log_info "Next attempt will use offset +$random_offset (total offset: $current_offset)"
            sleep 2
            continue
        fi

        log_success "Backend started (URL: http://$LOCAL_IP:$BACKEND_PORT)"

        # Switch to frontend directory
        cd "$FRONTEND_DIR"

        # Update frontend environment configuration
        # log_info "Updating Frontend environment configuration..."
        # log_debug "Before frontend env processing - FRONTEND_PORT='$FRONTEND_PORT'"
        if [ "$use_file_mode" = true ]; then
            # Use env file from project root (app/.env)
            process_env_with_placeholders_from_file "$env_file_path" "$LOCAL_IP" "$BACKEND_PORT" "$FRONTEND_PORT" "$LOCAL_MODE"
        else
            # Use API-based environment variable processing
            process_env_with_placeholders "$LOCAL_IP" "$BACKEND_PORT" "$FRONTEND_PORT" "$LOCAL_MODE"
        fi

        # Start frontend service
        log_info "Starting Frontend service...$FRONTEND_PORT"
        $PACKAGE_MANAGER dev --host "0.0.0.0" --port $FRONTEND_PORT &
        FRONTEND_PID=$!

        # Wait for frontend to start
        log_info "Waiting for Frontend service to start..."
        # sleep 5

        # Check if frontend started successfully
        if ! kill -0 $FRONTEND_PID 2>/dev/null; then
            log_warning "Frontend startup attempt $retry_count failed"
            # Clean up failed processes
            # Kill backend: child processes first, then reloader
            if [ ! -z "$BACKEND_RELOADER_PID" ]; then
                local backend_child_pids=$(pgrep -P $BACKEND_RELOADER_PID 2>/dev/null || true)
                if [ ! -z "$backend_child_pids" ]; then
                    for child_pid in $backend_child_pids; do
                        kill $child_pid 2>/dev/null || true
                    done
                    sleep 1
                fi
                kill $BACKEND_RELOADER_PID 2>/dev/null || true
            fi
            kill $FRONTEND_PID 2>/dev/null || true
            # Increment offset for next attempt with random number (1-9)
            local random_offset=$((RANDOM % 9 + 1))
            current_offset=$((current_offset + random_offset))
            log_info "Next attempt will use offset +$random_offset (total offset: $current_offset)"
            sleep 2
            continue
        fi

        log_success "Frontend started (PID: $FRONTEND_PID, URL: http://$LOCAL_IP:$FRONTEND_PORT)"

        # Both services started successfully
        return 0
    done

    # All retries failed
    log_error "Service startup failed after $max_retries attempts"
    return 1
}

# Cleanup function
cleanup() {
    log_info "Cleaning up processes..."

    # Kill backend process: child processes first, then reloader
    if [ ! -z "$BACKEND_RELOADER_PID" ]; then
        local backend_child_pids=$(pgrep -P $BACKEND_RELOADER_PID 2>/dev/null || true)
        if [ ! -z "$backend_child_pids" ]; then
            for child_pid in $backend_child_pids; do
                kill $child_pid 2>/dev/null || true
            done
            sleep 1
        fi
        kill $BACKEND_RELOADER_PID 2>/dev/null || true
        log_info "Backend process stopped (PID: $BACKEND_RELOADER_PID)"
    fi

    # Kill frontend process
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        log_info "Frontend process stopped (PID: $FRONTEND_PID)"
    fi

    # Wait for processes to exit completely
    sleep 2

    log_success "Cleanup completed"
}

# Set signal handling
trap cleanup EXIT INT TERM

# Parse command line arguments
parse_arguments() {
    NO_START=false
    LOCAL_MODE=false
    # Initialize from environment variables first
    # Only convert variables that need mapping from different env var names
    S2S_JWT_ACCESS_TOKEN="${S2S_JWT_TOKEN:-}"
    S2S_JWT_BASE_URL="${S2S_JWT_BASE_URL:-}"
    S2S_APP_ID="${CHAT_ID:-}"
    USERNAME="${USERNAME:-}"
    ENV_FILENAME="${ENV_FILENAME:-.env}"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-start)
                NO_START=true
                shift
                ;;
            --local)
                LOCAL_MODE=true
                shift
                ;;
            --env-filename)
                # Optional parameter: if value is provided and not empty, use it
                if [ -n "$2" ]; then
                    ENV_FILENAME="$2"
                    shift 2
                else
                    # If no value provided, just shift and continue (parameter is optional)
                    log_warning "--env-filename provided but no value given, ignoring"
                    shift
                fi
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --no-start                  Only install dependencies, do not start services"
                echo "  --local                     Use local mode (replace URLs with '/')"
                echo "  --env-filename FILENAME     Use specified .env file for environment variables (enables file-based processing, default: .env)"
                echo "  --help, -h                    Show this help message"
                echo ""
                echo "This script automatically assigns ports and starts frontend/backend services."
                echo "Use --no-start to only install dependencies without starting services."
                echo "Use --local to replace server URLs with '/' for local development."
                echo ""
                echo "When --env-filename is provided, environment variables will be processed from the specified file."
                echo "Default ENV_FILENAME is '.env' if not specified."
                echo ""
                echo "Parameters can be provided via environment variables:"
                echo "  - S2S_JWT_TOKEN: Used for s2s-jwt-access-token"
                echo "  - S2S_JWT_BASE_URL: Used for s2s-jwt-base-url"
                echo "  - CHAT_ID: Used for s2s-app-id"
                echo "  - USERNAME: Optional username to include in curl request headers (for local debugging)"
                echo "When S2S API parameters are available (via env vars),"
                echo "environment variables will be fetched from the API instead of .env file."
                echo "The API environment is fixed to 'dev'."
                exit 0
                ;;
            *)
                log_warning "Unknown option: $1 (ignoring)"
                shift
                ;;
        esac
    done

    # Export variables for use in other functions
    export S2S_JWT_ACCESS_TOKEN
    export S2S_JWT_BASE_URL
    export S2S_APP_ID
    export USERNAME
    export ENV_FILENAME
    
    # Log the values of S2S API parameters
    if [ -z "$S2S_JWT_ACCESS_TOKEN" ]; then
        log_info "S2S_JWT_ACCESS_TOKEN is empty"
    else
        log_info "S2S_JWT_ACCESS_TOKEN is set (length: ${#S2S_JWT_ACCESS_TOKEN})"
    fi
    
    if [ -z "$S2S_JWT_BASE_URL" ]; then
        log_info "S2S_JWT_BASE_URL is empty"
    else
        log_info "S2S_JWT_BASE_URL is set: $S2S_JWT_BASE_URL"
    fi
    
    if [ -z "$S2S_APP_ID" ]; then
        log_info "S2S_APP_ID is empty"
    else
        log_info "S2S_APP_ID is set: $S2S_APP_ID"
    fi
}

# Main function
main() {
    # Parse command line arguments
    parse_arguments "$@"
    
    if [ "$NO_START" = true ]; then
        log_info "Installing dependencies only (--no-start mode)..."
    else
        log_info "Starting application..."
    fi
    
    # Get project root directory
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    BACKEND_DIR="$SCRIPT_DIR/backend"
    FRONTEND_DIR="$SCRIPT_DIR/frontend"
    
    # Check if directories exist
    if [ ! -d "$BACKEND_DIR" ]; then
        log_error "Backend directory does not exist: $BACKEND_DIR"
        exit 1
    fi
    
    if [ ! -d "$FRONTEND_DIR" ]; then
        log_error "Frontend directory does not exist: $FRONTEND_DIR"
        exit 1
    fi

    # Only check and kill existing services if we're starting services
    if [ "$NO_START" = false ]; then
        # Get local IP address
        LOCAL_IP=$(get_local_ip)
        log_info "Detected local IP address: $LOCAL_IP"
    fi
    
    # Detect package manager with functionality test
    PACKAGE_MANAGER=""
    
    # Test pnpm first
    if command -v pnpm >/dev/null 2>&1; then
        log_info "Testing pnpm functionality..."
        if pnpm --version >/dev/null 2>&1; then
            PACKAGE_MANAGER="pnpm"
            log_info "Using pnpm as package manager (version: $(pnpm --version))"
        else
            log_warning "pnpm is installed but not working properly, falling back to npm"
        fi
    fi
    
    # Fallback to npm if pnpm is not available or not working
    if [ -z "$PACKAGE_MANAGER" ]; then
        if command -v npm >/dev/null 2>&1; then
            log_info "Testing npm functionality..."
            if npm --version >/dev/null 2>&1; then
                PACKAGE_MANAGER="npm"
                log_info "Using npm as package manager (version: $(npm --version))"
            else
                log_error "npm is installed but not working properly"
                exit 1
            fi
        else
            log_error "Neither pnpm nor npm is installed, please install one of them first"
            exit 1
        fi
    fi
    
    # Backend setup
    log_info "Setting up Backend..."
    cd "$BACKEND_DIR"
    
    # Activate virtual environment and install dependencies
    export UV_VENV_CLEAR=1
    if [ "$LOCAL_MODE" = true ]; then
        uv venv
        source .venv/bin/activate
        uv pip install  -r requirements.txt -i http://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com || true
        uv pip install  -r requirements.default -i http://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com
    else
        uv pip install  -r requirements.txt || true
        uv pip install  -r requirements.default
    fi
    
    # Pre-install frontend dependencies
    log_info "Pre-installing frontend dependencies..."
    cd "$FRONTEND_DIR"
    $PACKAGE_MANAGER install
    $PACKAGE_MANAGER install @metagptx/web-sdk@latest
    log_success "Frontend dependencies installed successfully"
    
    cd "$BACKEND_DIR"
    
    if [ "$NO_START" = false ]; then
        # Start both services with retry mechanism
        if ! start_services_with_retry; then
            log_error "Failed to start services after all retry attempts"
            exit 1
        fi
    else
        log_success "Backend dependencies installed successfully"
        log_success "Frontend dependencies installed successfully"
    fi
    
    # Display completion information
    echo ""
    if [ "$NO_START" = true ]; then
        log_success "=== Dependencies Installation Completed ==="
        echo "Backend dependencies: Installed successfully"
        echo "Frontend dependencies: Installed successfully"
        echo ""
        log_info "To start the services, run: $0"
    else
        # Wait for backend health endpoint to be ready before displaying success message
        wait_for_backend_health
        
        log_success "=== Application Started Successfully ==="
        echo "Backend URL:  http://$LOCAL_IP:$BACKEND_PORT"
        echo "Frontend URL: http://$LOCAL_IP:$FRONTEND_PORT"
        echo "Backend Reloader PID:  $BACKEND_RELOADER_PID"
        echo "Frontend PID: $FRONTEND_PID"
        echo "API Documentation:      http://$LOCAL_IP:$BACKEND_PORT/docs"
        echo ""
        log_info "Press Ctrl+C to stop all services"

        reset_running_signal

        # 再次检查环境变量是否dirty，如果dirty再此更新环境变量
        # Only check dirty signal if using API mode (.env not exists)
        local env_file="$SCRIPT_DIR/.env"
        if [ ! -f "$env_file" ]; then
            check_and_reload_env_if_dirty "$LOCAL_IP" "$BACKEND_PORT" "$FRONTEND_PORT" "$LOCAL_MODE"
        else
            log_info "Using file-based mode, skipping dirty signal check"
        fi

        # Wait for user interrupt
        wait
    fi
}

# Run main function
main "$@"
