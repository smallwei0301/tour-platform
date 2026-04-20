import { RateLimiter } from '../src/lib/rate-limit';

async function runPoC() {
  console.log('🚀 Starting Rate Limiter Fix Verification...');

  // Limit: 1 request per 60 seconds
  const limiter = new RateLimiter(1, 60 * 1000);

  const createReq = (headerValue: string) => {
    return new Request('http://localhost', {
      headers: {
        'x-forwarded-for': headerValue,
      },
    });
  };

  // Scenario: Simulation of a trusted proxy (like Vercel) appending the real IP.
  // Real IP is 203.0.113.5.
  
  // Request 1: Attacker spoofs 1.1.1.1, Proxy appends 203.0.113.5
  const req1 = createReq('1.1.1.1, 203.0.113.5');
  const ip1 = RateLimiter.getClientIp(req1);
  const res1 = limiter.check(ip1);
  console.log(`Request 1 [Header: 1.1.1.1, 203.0.113.5] -> Detected IP: ${ip1}, allowed=${res1.allowed}`);

  // Request 2: Attacker spoofs 2.2.2.2, Proxy appends 203.0.113.5
  const req2 = createReq('2.2.2.2, 203.0.113.5');
  const ip2 = RateLimiter.getClientIp(req2);
  const res2 = limiter.check(ip2);
  console.log(`Request 2 [Header: 2.2.2.2, 203.0.113.5] -> Detected IP: ${ip2}, allowed=${res2.allowed}`);

  if (!res2.allowed && ip1 === ip2) {
    console.log('✅ Fix Verified: Rate limit enforced on the real (last) IP, ignoring spoofed prefixes.');
  } else {
    console.error('❌ Fix Failed: Spoofing still works or IP detection is inconsistent.');
    process.exit(1);
  }
}

runPoC().catch(console.error);
