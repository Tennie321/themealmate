const KEYWORDS: Array<[RegExp, string]> = [
  [/water/i, "💧"],
  [/coffee|espresso|latte/i, "☕"],
  [/tea/i, "🍵"],
  [/milk|fairlife|core power|muscle milk|owyn|premier|shake|almond milk/i, "🥛"],
  [/celsius|monster|red bull|energy/i, "⚡"],
  [/egg/i, "🥚"],
  [/chicken/i, "🍗"],
  [/turkey/i, "🦃"],
  [/beef|steak|jerky/i, "🥩"],
  [/salmon|tuna|fish|shrimp/i, "🐟"],
  [/bacon|sausage|ham|pork/i, "🥓"],
  [/tofu|tempeh/i, "🍱"],
  [/yogurt|skyr|oikos|chobani/i, "🥣"],
  [/cottage cheese|cheese|string cheese/i, "🧀"],
  [/bar|quest|rxbar|built|pure protein/i, "🍫"],
  [/protein/i, "💪"],
  [/nut|almond|peanut|cashew|pistachio/i, "🥜"],
  [/hummus|bean|lentil|chickpea/i, "🫘"],
  [/oat|granola|cereal/i, "🥣"],
  [/rice|quinoa|grain/i, "🍚"],
  [/bread|tortilla|wrap|bagel|pita|english muffin/i, "🥖"],
  [/pasta|noodle/i, "🍜"],
  [/banana/i, "🍌"],
  [/apple/i, "🍎"],
  [/berry|strawberry|blueberry|raspberry/i, "🍓"],
  [/grape/i, "🍇"],
  [/orange|clementine|mandarin/i, "🍊"],
  [/avocado|guac/i, "🥑"],
  [/broccoli|spinach|kale|salad|lettuce|greens/i, "🥬"],
  [/carrot/i, "🥕"],
  [/sweet potato|potato/i, "🥔"],
  [/tomato|salsa/i, "🍅"],
  [/corn/i, "🌽"],
  [/butter|oil|olive/i, "🫒"],
  [/honey|jam|jelly|syrup/i, "🍯"],
  [/chocolate|cocoa/i, "🍫"],
  [/popcorn|chip|cracker|pretzel/i, "🍿"],
  [/soup/i, "🥣"],
  [/pizza/i, "🍕"],
  [/burrito|taco/i, "🌯"],
  [/sandwich/i, "🥪"],
  [/sushi/i, "🍣"],
];

const CATEGORY_FALLBACK: Record<string, string> = {
  protein: "🍗",
  drink: "🥤",
  snack: "🍫",
  carb: "🍞",
  produce: "🥬",
  fat: "🥑",
  meal: "🍱",
  condiment: "🧂",
};

const CATEGORY_BG: Record<string, string> = {
  protein: "bg-orange-100 text-orange-700",
  drink: "bg-sky-100 text-sky-700",
  snack: "bg-amber-100 text-amber-700",
  carb: "bg-yellow-100 text-yellow-800",
  produce: "bg-green-100 text-green-700",
  fat: "bg-lime-100 text-lime-700",
  meal: "bg-rose-100 text-rose-700",
  condiment: "bg-stone-100 text-stone-700",
};

export function FoodImage({
  name,
  category,
  imageUrl,
  size = "md",
  className = "",
}: {
  name?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = size === "sm" ? "w-10 h-10 text-lg" : size === "lg" ? "w-16 h-16 text-3xl" : "w-12 h-12 text-2xl";
  const radius = size === "sm" ? "rounded-xl" : "rounded-2xl";

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name ?? ""}
        className={`${dims} ${radius} object-cover shrink-0 ${className}`}
        loading="lazy"
      />
    );
  }

  let emoji: string | null = null;
  if (name) {
    for (const [re, e] of KEYWORDS) {
      if (re.test(name)) { emoji = e; break; }
    }
  }
  if (!emoji) emoji = CATEGORY_FALLBACK[category ?? ""] ?? "🍽️";
  const bg = CATEGORY_BG[category ?? ""] ?? "bg-secondary text-primary";

  return (
    <div
      aria-hidden
      className={`${dims} ${radius} ${bg} grid place-items-center shrink-0 leading-none ${className}`}
    >
      <span>{emoji}</span>
    </div>
  );
}