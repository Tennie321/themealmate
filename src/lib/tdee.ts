export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "very" | "extra";

export function calcTDEE(args: {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: Activity;
}): number {
  const { sex, age, height_cm, weight_kg, activity } = args;
  // Mifflin-St Jeor
  const bmr =
    sex === "male"
      ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
      : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;
  const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 }[activity];
  return Math.round(bmr * mult);
}

export function goalAdjustments(goal: string, tdee: number, weight_kg: number) {
  const proteinPerKg = goal === "cut" ? 2.2 : goal === "lean_bulk" ? 2.0 : 1.8;
  const calorieDelta = goal === "cut" ? -400 : goal === "lean_bulk" ? 300 : 0;
  return {
    calorie_target: Math.max(1200, Math.round(tdee + calorieDelta)),
    protein_target: Math.round(weight_kg * proteinPerKg),
  };
}