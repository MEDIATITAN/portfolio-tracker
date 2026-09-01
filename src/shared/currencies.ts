/**
 * Währungen, für die ein Wechselkurs abrufbar ist.
 *
 * Die Liste ist nicht ausgedacht, sondern der Bestand von frankfurter.dev (v1/currencies), unserer
 * Kursquelle - Stand 31.08.2026. Wichtig für Cash-Positionen: Wird dort eine Währung eingetragen,
 * die es hier nicht gibt, kommt kein Wechselkurs zurück und die Position bliebe ohne Eurowert.
 * Deshalb ist das Feld eine Auswahl und kein Freitext.
 */
export const SUPPORTED_CURRENCIES: Record<string, string> = {
  EUR: 'Euro',
  USD: 'US-Dollar',
  CHF: 'Schweizer Franken',
  GBP: 'Britisches Pfund',
  AUD: 'Australischer Dollar',
  BRL: 'Brasilianischer Real',
  CAD: 'Kanadischer Dollar',
  CNY: 'Chinesischer Renminbi Yuan',
  CZK: 'Tschechische Krone',
  DKK: 'Dänische Krone',
  HKD: 'Hongkong-Dollar',
  HUF: 'Ungarischer Forint',
  IDR: 'Indonesische Rupiah',
  ILS: 'Israelischer Schekel',
  INR: 'Indische Rupie',
  ISK: 'Isländische Krone',
  JPY: 'Japanischer Yen',
  KRW: 'Südkoreanischer Won',
  MXN: 'Mexikanischer Peso',
  MYR: 'Malaysischer Ringgit',
  NOK: 'Norwegische Krone',
  NZD: 'Neuseeland-Dollar',
  PHP: 'Philippinischer Peso',
  PLN: 'Polnischer Złoty',
  RON: 'Rumänischer Leu',
  SEK: 'Schwedische Krone',
  SGD: 'Singapur-Dollar',
  THB: 'Thailändischer Baht',
  TRY: 'Türkische Lira',
  ZAR: 'Südafrikanischer Rand'
}

/** Reihenfolge fürs Auswahlfeld: die gängigen zuerst, der Rest alphabetisch. */
export const CURRENCY_ORDER: string[] = [
  'EUR',
  'USD',
  'CHF',
  'GBP',
  ...Object.keys(SUPPORTED_CURRENCIES)
    .filter((c) => !['EUR', 'USD', 'CHF', 'GBP'].includes(c))
    .sort()
]

export function isSupportedCurrency(code: string): boolean {
  return code.toUpperCase() in SUPPORTED_CURRENCIES
}
