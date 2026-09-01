import { useEffect, useState } from 'react'
import type {
  AssetClass,
  CashSubType,
  NewPosition,
  Position,
  QuantityUnit,
  SymbolSearchResult
} from '@shared/types'
import { COMMODITY_PRESETS, commodityPricingUnit } from '@shared/commodities'
import { CURRENCY_ORDER, SUPPORTED_CURRENCIES } from '@shared/currencies'
import { ASSET_CLASS_LABELS, CASH_SUB_TYPE_LABELS } from '../../lib/format'
import { inputClass, labelClass } from './formStyles'
import { SymbolSearchInput } from './SymbolSearchInput'

interface PositionFormProps {
  initial?: Position | null
  onSubmit: (input: NewPosition) => void
  onCancel: () => void
  submitting: boolean
}

const ASSET_CLASSES: AssetClass[] = ['STOCK_ETF', 'CRYPTO', 'COMMODITY', 'CASH_OTHER']
const CASH_SUB_TYPES: CashSubType[] = ['CASH', 'BOND', 'REAL_ESTATE', 'OTHER']
const QUANTITY_UNIT_LABELS: Record<QuantityUnit, string> = {
  GRAM: 'Gramm (g)',
  KG: 'Kilogramm (kg)',
  TROY_OUNCE: 'Feinunze (oz t)',
  POUND: 'Pfund (lb)'
}

function emptyForm(): NewPosition {
  return {
    assetClass: 'STOCK_ETF',
    securityType: null,
    name: '',
    symbol: null,
    identifier: null,
    isin: null,
    quantity: 1,
    quantityUnit: null,
    currency: 'EUR',
    avgCostBasis: null,
    manualValue: null,
    sector: null,
    region: null,
    subType: null,
    purchaseDate: null,
    notes: null
  }
}

function toNewPosition(position: Position): NewPosition {
  return {
    assetClass: position.assetClass,
    securityType: position.securityType,
    name: position.name,
    symbol: position.symbol,
    identifier: position.identifier,
    isin: position.isin,
    quantity: position.quantity,
    quantityUnit: position.quantityUnit,
    currency: position.currency,
    avgCostBasis: position.avgCostBasis,
    manualValue: position.manualValue,
    sector: position.sector,
    region: position.region,
    subType: position.subType,
    purchaseDate: position.purchaseDate,
    notes: position.notes
  }
}

export function PositionForm({
  initial,
  onSubmit,
  onCancel,
  submitting
}: PositionFormProps): React.JSX.Element {
  const [form, setForm] = useState<NewPosition>(initial ? toNewPosition(initial) : emptyForm())
  /** Eingabehilfe "Gesamt investiert" - siehe handleInvestedChange weiter unten. */
  const [investedText, setInvestedText] = useState<string | null>(null)

  useEffect(() => {
    setForm(initial ? toNewPosition(initial) : emptyForm())
    // Auch die Eingabehilfe zurücksetzen - sonst würde ein für die vorige Position eingetippter
    // Gesamtbetrag auf die neue angewandt.
    setInvestedText(null)
  }, [initial])

  const isCashOther = form.assetClass === 'CASH_OTHER'
  const isCommodity = form.assetClass === 'COMMODITY'
  // Bestand/Einstandspreis werden aus dem Transaktions-Ledger berechnet (siehe ledgerService.ts),
  // sobald eine Position Buchungen hat (CSV-Import oder migrierter Altbestand) - dann sind diese
  // Felder nur noch Anzeige, keine manuelle Eingabe mehr.
  const isLedgerBacked = initial?.hasTransactions ?? false

  function update<K extends keyof NewPosition>(key: K, value: NewPosition[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /**
   * Der insgesamt investierte Betrag ist KEIN eigenes Datenfeld - gespeichert wird weiterhin nur
   * der Einstandspreis je Stück. Er ist eine Eingabehilfe: Wer "500 EUR für 3,5 Stück" im Kopf hat,
   * soll nicht selbst dividieren müssen.
   *
   * Solange hier nichts getippt wurde (investedText === null), zeigt das Feld den aus Einstandspreis
   * mal Menge errechneten Betrag an. Sobald etwas eingetippt wird, dreht sich die Richtung um: dann
   * ist der Betrag die maßgebliche Angabe und der Einstandspreis folgt - auch wenn danach die Menge
   * geändert wird.
   */
  const investedValue = investedText === null ? null : Number(investedText.replace(',', '.'))
  const investedDisplay =
    investedText ??
    (form.avgCostBasis !== null && form.quantity > 0
      ? String(Math.round(form.avgCostBasis * form.quantity * 100) / 100)
      : '')

  function handleInvestedChange(text: string): void {
    setInvestedText(text)
    const total = Number(text.replace(',', '.'))
    if (text.trim() === '') update('avgCostBasis', null)
    else if (!Number.isNaN(total) && form.quantity > 0)
      update('avgCostBasis', total / form.quantity)
  }

  function handleQuantityChange(text: string): void {
    const quantity = Number(text)
    setForm((prev) => {
      const next = { ...prev, quantity }
      // Betrag wurde eingetippt: er bleibt stehen, der Einstandspreis wird neu verteilt.
      if (investedValue !== null && !Number.isNaN(investedValue) && quantity > 0) {
        next.avgCostBasis = investedValue / quantity
      }
      return next
    })
  }

  function handleSymbolText(text: string): void {
    const value = text.trim() || null
    setForm((prev) => ({ ...prev, symbol: value, identifier: value, quantityUnit: null }))
  }

  function handleSymbolSelect(result: SymbolSearchResult): void {
    setForm((prev) => ({
      ...prev,
      symbol: result.symbol,
      identifier: result.identifier,
      name: prev.name.trim() ? prev.name : result.name,
      securityType: result.securityType,
      sector: result.sector,
      region: result.region,
      currency: result.currency ?? prev.currency
    }))

    // Land/Region kommt nicht aus der Suche selbst (Yahoo liefert das nur über einen separaten
    // Call) - für Einzelaktien direkt nachladen. ETFs bleiben bewusst ohne Land (siehe
    // sector/regionBreakdown: die laufen ohnehin als "ETF/Diversifiziert").
    if (result.securityType === 'STOCK') {
      const requestedIdentifier = result.identifier
      window.api.positions.getAssetProfile(requestedIdentifier).then((profile) => {
        setForm((prev) =>
          prev.identifier === requestedIdentifier ? { ...prev, ...profile } : prev
        )
      })
    }
  }

  function handleCommodityPreset(preset: {
    identifier: string
    name: string
    pricingUnit: QuantityUnit | null
  }): void {
    setForm((prev) => ({
      ...prev,
      symbol: preset.identifier,
      identifier: preset.identifier,
      name: prev.name.trim() ? prev.name : preset.name,
      quantityUnit: preset.pricingUnit
    }))
  }

  const commodityPricing = isCommodity ? commodityPricingUnit(form.identifier) : null
  const isWeighableCommodity = commodityPricing !== null
  const availableUnits: QuantityUnit[] = commodityPricing
    ? (['GRAM', 'KG', commodityPricing].filter(
        (u, i, arr) => arr.indexOf(u) === i
      ) as QuantityUnit[])
    : []

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    if (!form.name.trim()) return
    onSubmit(form)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <label className={labelClass}>
        Anlageklasse
        <select
          className={inputClass}
          value={form.assetClass}
          onChange={(e) => update('assetClass', e.target.value as AssetClass)}
        >
          {ASSET_CLASSES.map((ac) => (
            <option key={ac} value={ac}>
              {ASSET_CLASS_LABELS[ac]}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Name
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder={isCashOther ? 'z.B. Tagesgeldkonto ING' : 'z.B. Apple Inc.'}
          required
        />
      </label>

      {(form.assetClass === 'STOCK_ETF' || form.assetClass === 'CRYPTO') && (
        <label className={labelClass}>
          {form.assetClass === 'CRYPTO' ? 'Krypto suchen' : 'Aktie / ETF suchen'}
          <SymbolSearchInput
            assetClass={form.assetClass}
            value={form.symbol ?? ''}
            onChangeText={handleSymbolText}
            onSelect={handleSymbolSelect}
            placeholder={
              form.assetClass === 'CRYPTO'
                ? 'z.B. Bitcoin, Ethereum…'
                : 'z.B. Apple, SAP, oder WKN…'
            }
          />
        </label>
      )}

      {form.assetClass === 'STOCK_ETF' && form.securityType === 'ETF' && (
        <label className={labelClass}>
          ISIN
          <input
            className={inputClass}
            value={form.isin ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, isin: e.target.value.trim() || null }))}
            placeholder="wird automatisch ermittelt"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
            Bestimmt die Länderaufteilung des Fonds. Wird beim Kursabruf automatisch gesucht - hier
            prüfen und bei Bedarf korrigieren (thesaurierend und ausschüttend haben unterschiedliche
            ISINs).
          </span>
        </label>
      )}

      {isCommodity && (
        <label className={labelClass}>
          Rohstoff
          <input
            className={inputClass}
            value={form.symbol ?? ''}
            onChange={(e) => handleSymbolText(e.target.value)}
            placeholder="z.B. GC=F (Gold), SI=F (Silber), HG=F (Kupfer)"
          />
          <div className="mt-1 flex flex-wrap gap-1">
            {COMMODITY_PRESETS.map((preset) => (
              <button
                key={preset.identifier}
                type="button"
                onClick={() => handleCommodityPreset(preset)}
                className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </label>
      )}

      {isCashOther && (
        <label className={labelClass}>
          Unterkategorie
          <select
            className={inputClass}
            value={form.subType ?? 'CASH'}
            onChange={(e) => update('subType', e.target.value as CashSubType)}
          >
            {CASH_SUB_TYPES.map((st) => (
              <option key={st} value={st}>
                {CASH_SUB_TYPE_LABELS[st]}
              </option>
            ))}
          </select>
        </label>
      )}

      {!isCashOther && (
        <label className={labelClass}>
          Menge{isLedgerBacked && ' (aus Verlauf berechnet)'}
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              className={`${inputClass} flex-1`}
              value={form.quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              disabled={isLedgerBacked}
              required
            />
            {isWeighableCommodity && commodityPricing && (
              <select
                className={inputClass}
                value={form.quantityUnit ?? commodityPricing}
                onChange={(e) => update('quantityUnit', e.target.value as QuantityUnit)}
              >
                {availableUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {QUANTITY_UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            )}
          </div>
        </label>
      )}

      {isCashOther && (
        <label className={labelClass}>
          Aktueller Wert{form.currency !== 'EUR' ? ` (in ${form.currency})` : ''}
          <input
            type="number"
            step="any"
            className={inputClass}
            value={form.manualValue ?? ''}
            onChange={(e) => update('manualValue', e.target.value ? Number(e.target.value) : null)}
            required
          />
        </label>
      )}

      <label className={labelClass}>
        Währung
        {isCashOther ? (
          // Auswahl statt Freitext: ein Tippfehler ("USDD") würde sonst dazu führen, dass kein
          // Wechselkurs abrufbar ist und die Position ohne Eurowert dasteht.
          <select
            className={inputClass}
            value={form.currency}
            onChange={(e) => update('currency', e.target.value)}
            required
          >
            {CURRENCY_ORDER.map((code) => (
              <option key={code} value={code}>
                {code} – {SUPPORTED_CURRENCIES[code]}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={inputClass}
            value={form.currency}
            onChange={(e) => update('currency', e.target.value.toUpperCase())}
            maxLength={3}
            required
          />
        )}
        {isCashOther && form.currency !== 'EUR' && (
          <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
            Der Betrag wird mit dem tagesaktuellen Wechselkurs in Euro umgerechnet.
          </span>
        )}
      </label>

      {!isCashOther && (
        <label className={labelClass}>
          Einstandspreis{isLedgerBacked ? ' (aus Verlauf berechnet)' : ' (optional)'}, pro{' '}
          {commodityPricing ? QUANTITY_UNIT_LABELS[form.quantityUnit ?? commodityPricing] : 'Stück'}
          <input
            type="number"
            step="any"
            className={inputClass}
            value={form.avgCostBasis ?? ''}
            onChange={(e) => {
              // Wieder der Stückpreis ist maßgeblich - der Gesamtbetrag rechnet sich daraus.
              setInvestedText(null)
              update('avgCostBasis', e.target.value ? Number(e.target.value) : null)
            }}
            disabled={isLedgerBacked}
          />
        </label>
      )}

      {!isCashOther && (
        <label className={labelClass}>
          Gesamt investiert{isLedgerBacked ? ' (aus Verlauf berechnet)' : ' (optional)'}
          <input
            type="number"
            step="any"
            className={inputClass}
            value={investedDisplay}
            onChange={(e) => handleInvestedChange(e.target.value)}
            disabled={isLedgerBacked}
            placeholder={`z.B. 500 für ${form.quantity || 1} Stück`}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
            Beide Felder hängen zusammen: Trägst du den Gesamtbetrag ein, ergibt sich der
            Einstandspreis daraus – und umgekehrt.
          </span>
        </label>
      )}
      {isLedgerBacked && (
        <p className="col-span-2 -mt-2 text-xs text-slate-400 dark:text-slate-500">
          Diese Position hat Buchungen im Verlauf - Menge und Einstandspreis werden automatisch
          daraus berechnet.
        </p>
      )}

      <label className={labelClass}>
        Kaufdatum (optional)
        <input
          type="date"
          className={inputClass}
          value={form.purchaseDate ?? ''}
          onChange={(e) => update('purchaseDate', e.target.value || null)}
          max={new Date().toISOString().slice(0, 10)}
        />
      </label>

      <label className={`col-span-2 ${labelClass}`}>
        Notizen (optional)
        <input
          className={inputClass}
          value={form.notes ?? ''}
          onChange={(e) => update('notes', e.target.value || null)}
        />
      </label>

      <div className="col-span-2 flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {initial ? 'Speichern' : 'Hinzufügen'}
        </button>
      </div>
    </form>
  )
}
