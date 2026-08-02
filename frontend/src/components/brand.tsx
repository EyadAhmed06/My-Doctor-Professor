import Image from "next/image";
import Link from "next/link";

export const BRAND_NAME = "My Doctor & The Professor";
export const BRAND_TAGLINE = "The Professor’s Wisdom. The Doctor’s Precision.";
export const BRAND_EMBLEM = "/brand/my-doctor-professor-emblem.png";

export function BrandLockup({
  href = "/",
  className = "",
  stacked = false,
  showTagline = false,
}: {
  href?: string;
  className?: string;
  stacked?: boolean;
  showTagline?: boolean;
}) {
  return <Link href={href} className={`brand-lockup ${stacked ? "brand-lockup-stacked" : ""} ${className}`.trim()} aria-label={`${BRAND_NAME} home`}>
    <Image className="brand-emblem" src={BRAND_EMBLEM} alt="" width={1254} height={1254} priority />
    <span className="brand-words"><strong>{BRAND_NAME}</strong>{showTagline && <small>{BRAND_TAGLINE}</small>}</span>
  </Link>;
}
