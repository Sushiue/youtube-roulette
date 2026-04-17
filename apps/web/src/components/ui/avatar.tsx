import Image from "next/image";

export function Avatar({
  src,
  alt,
  size = 44
}: {
  src?: string | null;
  alt: string;
  size?: number;
}) {
  if (!src) {
    return (
      <div
        className="grid place-items-center rounded-full bg-white/10 text-sm font-bold text-cream/80"
        style={{ width: size, height: size }}
      >
        {alt.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="rounded-full object-cover"
    />
  );
}
