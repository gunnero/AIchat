export function BrandMark({
  className = "brand-mark",
}: {
  className?: string;
}) {
  return (
    <span className={className} aria-hidden="true">
      <img src={import.meta.env.BASE_URL + "brand-mark.png"} alt="" />
    </span>
  );
}
