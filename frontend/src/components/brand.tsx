import Image from "next/image";
import Link from "next/link";

export const BRAND_NAME = "My Doctor & The Professor";
export const BRAND_TAGLINE = "The Professor’s Wisdom. The Doctor’s Precision.";
export const BRAND_EMBLEM = "/brand/my-doctor-professor-emblem.png";

export function BrandLockup({
  href = "/",
  className = "",
  showTagline = false,
}: {
  href?: string;
  className?: string;
  showTagline?: boolean;
}) {
  return <Link href={href} className={`brand-lockup ${className}`.trim()} aria-label={`${BRAND_NAME} home`}>
    <Image className="brand-emblem" src={BRAND_EMBLEM} alt="" width={256} height={256} priority unoptimized />
    <span className="brand-words">
      <strong aria-hidden="true"><span>My Doctor &amp;</span><span>The Professor</span></strong>
      {showTagline && <small>{BRAND_TAGLINE}</small>}
    </span>
  </Link>;
}
