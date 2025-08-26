// Rate limiting simples para proteção básica
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(identifier: string, maxRequests = 100, windowMs = 60000): boolean {
  const now = Date.now();
  const existing = requestCounts.get(identifier);
  
  if (!existing || now > existing.resetTime) {
    // Nova janela de tempo
    requestCounts.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (existing.count >= maxRequests) {
    return false; // Rate limit exceeded
  }
  
  existing.count++;
  return true;
}

export function getRateLimitIdentifier(request: Request): string {
  // Use IP + API key como identificador
  const ip = request.headers.get('CF-Connecting-IP') || 
             request.headers.get('X-Forwarded-For') || 
             'unknown';
  const apiKey = request.headers.get('x-abacatepay-key') || 
                 new URL(request.url).searchParams.get('key') || 
                 'anonymous';
  
  return `${ip}:${apiKey.substring(0, 10)}`;
}
