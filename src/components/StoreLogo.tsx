import { Store as StoreIcon } from "lucide-react";
import { useState } from "react";

function domainOf(website?: string | null, chain?: string | null, name?: string | null) {
  if (website) {
    try {
      const u = new URL(website.startsWith("http") ? website : `https://${website}`);
      return u.hostname.replace(/^www\./, "");
    } catch {}
  }
  const guess = (chain || name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return guess ? `${guess}.com` : null;
}

export function StoreLogo({
  website,
  chain,
  name,
  size = 40,
  className = "",
}: {
  website?: string | null;
  chain?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const domain = domainOf(website, chain, name);
  const [errored, setErrored] = useState(false);

  return (
    <div
      className={`shrink-0 grid place-items-center rounded-xl bg-white border border-border overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      {domain && !errored ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt={`${name ?? chain ?? "Store"} logo`}
          width={size - 12}
          height={size - 12}
          className="object-contain"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : (
        <StoreIcon className="w-1/2 h-1/2 text-muted-foreground" />
      )}
    </div>
  );
}