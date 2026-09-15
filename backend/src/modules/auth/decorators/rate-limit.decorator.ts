import { SetMetadata } from '@nestjs/common';

export interface RateLimitPolicy {
  key: string;
  maximum: number;
  windowSeconds: number;
  scope?: 'user' | 'ip';
}

export const RATE_LIMIT_KEY = 'rateLimitPolicy';
export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

export const RateLimit = (policy: RateLimitPolicy) => {
  if (!policy.key || !Number.isSafeInteger(policy.maximum) || policy.maximum <= 0
    || !Number.isSafeInteger(policy.windowSeconds) || policy.windowSeconds <= 0) {
    throw new Error('Invalid rate-limit policy');
  }
  return SetMetadata(RATE_LIMIT_KEY, policy);
};

export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
