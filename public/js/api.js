/**
 * API and SSE connection management for Command Center
 */

// SSE connection state
let eventSource = null;
let sseConnected = false;
let sseReconnectAttempts = 0;
let pollInterval = null;

const SSE_MAX_RECONNECT_DELAY = 30000;

/**
 * Get stored JWT token from localStorage
 */
export function getAuthToken() {
  return localStorage.getItem("cc_jwt") || "";
}

/**
 * Build Authorization headers object
 */
export function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Authenticated fetch wrapper - adds JWT header and handles 401 → redirect to login
 */
export async function apiFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Token expired or invalid — redirect to login
    localStorage.removeItem("cc_jwt");
    localStorage.removeItem("cc_user");
    location.replace("/login?from=" + encodeURIComponent(location.pathname));
    return null;
  }

  return response;
}

/**
 * Fetch the unified state from the server
 * @returns {Promise<Object>} Dashboard state
 */
export async function fetchState() {
  const response = await apiFetch("/api/state");
  if (!response) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Logout - clear token and redirect to login
 */
export function logout() {
  localStorage.removeItem("cc_jwt");
  localStorage.removeItem("cc_user");
  location.replace("/login");
}

/**
 * Connect to SSE for real-time updates
 * @param {Function} onUpdate - Callback when state updates
 * @param {Function} onStatusChange - Callback for connection status changes
 */
export function connectSSE(onUpdate, onStatusChange) {
  if (typeof EventSource === "undefined") {
    console.warn("[SSE] EventSource not supported, using polling fallback");
    onStatusChange?.("polling", "Polling Mode");
    startPolling(onUpdate);
    return;
  }

  onStatusChange?.("connecting", "Connecting...");

  try {
    // Pass JWT token via URL query param (EventSource doesn't support custom headers)
    const token = getAuthToken();
    const sseUrl = token ? `/api/events?token=${encodeURIComponent(token)}` : "/api/events";
    eventSource = new EventSource(sseUrl);

    eventSource.onopen = function () {
      console.log("[SSE] Connected");
      sseConnected = true;
      sseReconnectAttempts = 0;
      onStatusChange?.("connected", "🟢 Live");
      stopPolling();
    };

    eventSource.addEventListener("connected", function (e) {
      try {
        const data = JSON.parse(e.data);
        console.log("[SSE] Server greeting:", data.message);
      } catch (err) {}
    });

    eventSource.addEventListener("update", function (e) {
      try {
        const data = JSON.parse(e.data);
        onUpdate?.(data);
      } catch (err) {
        console.error("[SSE] Failed to parse update:", err);
      }
    });

    eventSource.addEventListener("heartbeat", function (e) {
      try {
        const data = JSON.parse(e.data);
        console.log("[SSE] Heartbeat, clients:", data.clients);
      } catch (err) {}
    });

    eventSource.onerror = function (e) {
      console.error("[SSE] Connection error");
      sseConnected = false;
      eventSource.close();
      eventSource = null;
      onStatusChange?.("disconnected", "🔴 Disconnected");

      // Exponential backoff for reconnection
      sseReconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, sseReconnectAttempts - 1), SSE_MAX_RECONNECT_DELAY);
      console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${sseReconnectAttempts})`);

      // Start polling as fallback while disconnected
      startPolling(onUpdate);

      setTimeout(() => connectSSE(onUpdate, onStatusChange), delay);
    };
  } catch (err) {
    console.error("[SSE] Failed to create EventSource:", err);
    onStatusChange?.("disconnected", "🔴 Error");
    startPolling(onUpdate);
  }
}

function startPolling(onUpdate) {
  if (pollInterval) return;
  console.log("[Polling] Starting fallback polling");
  pollInterval = setInterval(async () => {
    try {
      const state = await fetchState();
      if (state) onUpdate?.(state);
    } catch (err) {
      console.error("[Polling] Failed:", err);
    }
  }, 2000);
}

function stopPolling() {
  if (pollInterval) {
    console.log("[Polling] Stopping fallback polling (SSE connected)");
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export function isConnected() {
  return sseConnected;
}
