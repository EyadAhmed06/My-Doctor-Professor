import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a controller or route out of the global JWT guard.
 * Public access must be explicit and security-reviewed.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
