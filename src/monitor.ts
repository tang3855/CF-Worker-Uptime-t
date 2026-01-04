import { connect } from 'cloudflare:sockets';
import { type Monitor } from './types';

export interface CheckResult {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  latency: number;
  message: string | null;
}

export async function checkMonitor(monitor: Monitor): Promise<CheckResult> {
  if (monitor.type === 'http') {
    return checkHttp(monitor);
  } else if (monitor.type === 'tcp') {
    return checkTcp(monitor);
  }
  return { status: 'DOWN', latency: 0, message: 'Unknown monitor type' };
}

async function checkHttp(monitor: Monitor): Promise<CheckResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), monitor.timeout);

  try {
    const options: RequestInit = {
      method: monitor.method,
      headers: {
        'User-Agent': 'CF-Worker-Uptime/1.0 (Mozilla/5.0 compatible)',
        ...monitor.headers,
      },
      body: monitor.body,
      signal: controller.signal,
      redirect: 'follow',
      // cache: 'no-store', // Cloudflare Workers fetch does not support 'cache' option in RequestInit
    };

    console.log(`[Monitor] Fetching ${monitor.url} with method ${monitor.method}`);
    const response = await fetch(monitor.url, options);
    const latency = Date.now() - start;
    clearTimeout(timeoutId);

    // 1. Check Timeout (implicitly handled by AbortController, but logic check)
    if (latency > monitor.timeout) {
      console.warn(`[Monitor] ${monitor.id} timed out after ${latency}ms`);
      return { status: 'DOWN', latency, message: 'Timeout' };
    }

    // 2. Validate Status
    let expectedStatuses: number[] = [200];
    if (monitor.validation?.status) {
      if (Array.isArray(monitor.validation.status)) {
        expectedStatuses = monitor.validation.status;
      } else {
        expectedStatuses = [monitor.validation.status];
      }
    }

    if (!expectedStatuses.includes(response.status)) {
      console.warn(`[Monitor] ${monitor.id} returned status ${response.status}, expected ${expectedStatuses.join(' or ')}`);
      return { 
        status: 'DOWN', 
        latency, 
        message: `Status ${response.status} (expected ${expectedStatuses.join(',')})` 
      };
    }

    // 3. Validate Body
    if (monitor.validation?.body_match) {
      const text = await response.text();
      const regex = new RegExp(monitor.validation.body_match);
      if (!regex.test(text)) {
        return { status: 'DOWN', latency, message: 'Body match failed' };
      }
    }

    // 4. Validate Headers
    if (monitor.validation?.headers_match) {
      for (const [key, pattern] of Object.entries(monitor.validation.headers_match)) {
        const val = response.headers.get(key);
        if (!val || !new RegExp(pattern).test(val)) {
          return { status: 'DOWN', latency, message: `Header ${key} mismatch` };
        }
      }
    }

    // 5. Check Performance
    if (latency > monitor.expected_latency) {
      return { status: 'DEGRADED', latency, message: 'High latency' };
    }

    return { status: 'UP', latency, message: 'OK' };

  } catch (error: any) {
    clearTimeout(timeoutId);
    return { 
      status: 'DOWN', 
      latency: Date.now() - start, 
      message: error.name === 'AbortError' ? 'Timeout' : (error.message || 'Fetch failed')
    };
  }
}

async function checkTcp(monitor: Monitor): Promise<CheckResult> {
  const start = Date.now();
  // Parse host:port
  const [hostname, portStr] = monitor.url.split(':');
  const port = parseInt(portStr);
  
  if (!hostname || isNaN(port)) {
    return { status: 'DOWN', latency: 0, message: 'Invalid host:port' };
  }

  try {
    // Basic TCP Connect check
    // We assume if we can connect and write/read (optional), it's UP.
    // For simple uptime, just connecting is often enough.
    // However, connect() in Workers is for sending data.
    // We'll try to connect.
    const socket = connect({ hostname, port });
    
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();

    // We need to wait for connection? connect() returns immediately usually.
    // We can try to write a byte or wait for `opened` promise if available.
    // The standard `connect` returns a Socket object.
    // We can verify connection by writing/reading or just `opened`.
    // cloudflare:sockets `connect` returns a socket that you can read/write to.
    // If connection fails, it might throw on first read/write or strictly on connect?
    // Let's try to wait for `opened` if it exists (it exists in TS types usually).
    // Actually, `opened` is a promise on the socket.
    
    await socket.opened;
    
    const latency = Date.now() - start;
    
    // Cleanup
    await writer.close();
    await reader.cancel();
    // socket.close() might be needed if available
    
    if (latency > monitor.timeout) {
       return { status: 'DOWN', latency, message: 'Timeout' };
    }
    
    if (latency > monitor.expected_latency) {
      return { status: 'DEGRADED', latency, message: 'High latency' };
    }
    
    return { status: 'UP', latency, message: 'OK' };

  } catch (error: any) {
    return { 
      status: 'DOWN', 
      latency: Date.now() - start, 
      message: error.message || 'Connection failed' 
    };
  }
}
