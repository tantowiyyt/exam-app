import { prisma } from './prisma';

export interface IPCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if an IP address is allowed based on whitelist/blacklist rules
 */
export async function checkIPAccess(ipAddress: string): Promise<IPCheckResult> {
  try {
    // Get IP rules from database
    const rules = await prisma.iPRule.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // If no rules, allow all
    if (rules.length === 0) {
      return { allowed: true };
    }

    // Check blacklist first (deny takes priority)
    const blacklistRules = rules.filter(r => r.type === 'BLACKLIST');
    for (const rule of blacklistRules) {
      if (matchIP(ipAddress, rule.ipAddress)) {
        return { allowed: false, reason: `IP ${ipAddress} is blacklisted: ${rule.keterangan || 'No reason'}` };
      }
    }

    // Check whitelist (if whitelist exists, only whitelisted IPs are allowed)
    const whitelistRules = rules.filter(r => r.type === 'WHITELIST');
    if (whitelistRules.length > 0) {
      for (const rule of whitelistRules) {
        if (matchIP(ipAddress, rule.ipAddress)) {
          return { allowed: true };
        }
      }
      return { allowed: false, reason: `IP ${ipAddress} is not in whitelist` };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking IP access:', error);
    // On error, allow access (fail open)
    return { allowed: true };
  }
}

/**
 * Match IP address with CIDR notation or exact match
 */
function matchIP(rawClientIP: string, rawRuleIP: string): boolean {
  // Normalisasi IPv4-mapped IPv6 (::ffff:192.168.1.5) dan localhost IPv6
  const normalize = (ip: string) => {
    const v = ip.trim().replace(/^::ffff:/i, '');
    return v === '::1' ? '127.0.0.1' : v;
  };
  const clientIP = normalize(rawClientIP);
  const ruleIP = normalize(rawRuleIP);

  // Exact match
  if (clientIP === ruleIP) return true;

  // CIDR notation (e.g., 192.168.1.0/24)
  if (ruleIP.includes('/')) {
    return matchCIDR(clientIP, ruleIP);
  }

  // Wildcard match (e.g., 192.168.1.*)
  if (ruleIP.includes('*')) {
    const pattern = ruleIP.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '\\d{1,3}');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(clientIP);
  }

  return false;
}

/**
 * Match IP with CIDR notation
 */
function matchCIDR(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr);
  const isIPv4 = (v: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(v);
  if (!isIPv4(ip) || !isIPv4(range) || isNaN(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;

  const ipNum = ipToNum(ip);
  const rangeNum = ipToNum(range);

  return ((ipNum & mask) >>> 0) === ((rangeNum & mask) >>> 0);
}

/**
 * Convert IP address to number
 */
function ipToNum(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

/**
 * Get client IP from request
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return '127.0.0.1';
}