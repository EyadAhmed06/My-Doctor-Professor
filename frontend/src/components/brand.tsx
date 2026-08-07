import Image from "next/image";
import Link from "next/link";

export const BRAND_NAME = "My Doctor & The Professor";
export const BRAND_TAGLINE = "The Professor’s Wisdom. The Doctor’s Precision.";
export const BRAND_EMBLEM = "/brand/my-doctor-professor-emblem.png";

export function BrandLockup({
  href = "/",
  className = "",
  showTagline = false,
  tagline = BRAND_TAGLINE,
  ariaLabel = `${BRAND_NAME} home`,
}: {
  href?: string;
  className?: string;
  showTagline?: boolean;
  tagline?: string;
  ariaLabel?: string;
}) {
  return <Link href={href} className={`brand-lockup ${className}`.trim()} aria-label={ariaLabel}>
    <Image className="brand-emblem" src={BRAND_EMBLEM} alt="" width={256} height={256} priority unoptimized />
    <span className="brand-words">
      <strong aria-hidden="true"><span>My Doctor &amp;</span><span>The Professor</span></strong>
      {showTagline && <small>{tagline}</small>}
    </span>
  </Link>;
}
