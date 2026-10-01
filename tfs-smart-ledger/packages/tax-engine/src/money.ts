/**
 * Money helpers. All amounts are integer minor units (fils: 1 AED = 100 fils).
 * JS numbers are exact for integers up to 2^53 (~AED 90 trillion), far above SME needs.
 * Never store or add floating-point AED values.
 */
export type Fils = number;

export const aed = (amount: number): Fils => Math.round(amount * 100);
export const toAed = (f: Fils): number => f / 100;

/** Round half away from zero to the nearest fils. */
export function roundHalfUp(value: number): Fils {
  return Math.sign(value) * Math.round(Math.abs(value) + Number.EPSILON);
}

/** Apply a rate in basis points (500 = 5%) to an amount in fils, rounding half-up. */
export function applyRateBp(amount: Fils, rateBp: number): Fils {
  return roundHalfUp((amount * rateBp) / 10_000);
}

export function assertInteger(f: Fils, label = "amount"): void {
  if (!Number.isInteger(f)) throw new Error(`${label} must be integer fils, got ${f}`);
}
