export function BrandMark({
  className = "brand-mark",
}: {
  className?: string;
}) {
  return (
    <span className={className} aria-hidden="true">
      <img src="/brand-mark.png" alt="" />
    </span>
  );
}
