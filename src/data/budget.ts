import { estimate } from './brief'
import { briefOf } from './tripEdit'
import type { Expense, Trip } from './types'

/** Approximate shekels per euro (the same rate the new-trip wizard shows estimates with) */
export const ILS_PER_EUR = 4

export type Currency = 'ILS' | 'EUR'

/** Amounts are stored in euros; shown in the chosen currency */
export function money(eur: number, cur: Currency) {
  const v = cur === 'ILS' ? eur * ILS_PER_EUR : eur
  const n = Math.round(v).toLocaleString('en-US')
  return cur === 'ILS' ? `₪${n}` : `€${n}`
}
export const toEur = (v: number, cur: Currency) => (cur === 'ILS' ? v / ILS_PER_EUR : v)
export const fromEur = (eur: number, cur: Currency) => (cur === 'ILS' ? eur * ILS_PER_EUR : eur)

const CUR_KEY = 'trip-planner:currency'
export function savedCurrency(): Currency {
  try {
    return localStorage.getItem(CUR_KEY) === 'EUR' ? 'EUR' : 'ILS'
  } catch {
    return 'ILS'
  }
}
export function saveCurrency(c: Currency) {
  try {
    localStorage.setItem(CUR_KEY, c)
  } catch {
    /* not remembered: shekels next time */
  }
}

/**
 * Planned amount per category, in euros. Set by the user when they edited the budget; until then the
 * new-trip wizard's estimate for the trip (lodging, flights, food, transfers, attractions).
 */
export function plannedByCategory(trip: Trip): { planned: Record<string, number>; estimated: boolean } {
  const own = Object.fromEntries(trip.budget.categories.map((c) => [c.id, c.planned]))
  if (Object.values(own).some((v) => v > 0) || !trip.brief?.legs.length) return { planned: own, estimated: false }
  const b = briefOf(trip)
  const tier = b.tier === 'custom' ? 'comfort' : b.tier
  const e = estimate(b, tier)
  // A custom total keeps the comfort tier's proportions
  const scale = b.tier === 'custom' && b.customBudget && e.total ? b.customBudget / e.total : 1
  const eur = (ils: number) => Math.round((ils * scale) / ILS_PER_EUR / 10) * 10
  return {
    planned: { stay: eur(e.lodging), flights: eur(e.flights), food: eur(e.food), transport: eur(e.intercity), tickets: eur(e.attractions) },
    estimated: true,
  }
}

/** Spent per category: totals recorded before itemized expenses, plus the expenses */
export function spentByCategory(trip: Trip) {
  const out: Record<string, number> = Object.fromEntries(trip.budget.categories.map((c) => [c.id, c.spent]))
  for (const e of trip.expenses ?? []) out[e.categoryId] = (out[e.categoryId] ?? 0) + e.amount
  return out
}

export const prepaidByCategory = (expenses: Expense[]) =>
  expenses.filter((e) => e.prepaid).reduce<Record<string, number>>((m, e) => ({ ...m, [e.categoryId]: (m[e.categoryId] ?? 0) + e.amount }), {})

export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** A receipt photo made small enough to keep on the device (about 50 KB) */
export async function shrinkPhoto(file: File, max = 900): Promise<string> {
  const img = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * k)
  canvas.height = Math.round(img.height * k)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.6)
}
