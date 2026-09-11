import { useState } from 'react'
import { formatDate } from '../../lib/format'

/**
 * Ab wie vielen Tagen ohne Kurs eine Position gemeldet wird.
 *
 * Ein bis zwei Tage entstehen ganz normal, wenn ein Papier am Tag vor seinem ersten Kurspunkt
 * gekauft wurde - das als Warnung zu zeigen wäre Lärm. Erst eine längere Lücke verzerrt den
 * Vergleich wirklich.
 */
const RELEVANT_GAP_DAYS = 5

interface DataQualityNoteProps {
  /** Gehaltene Positionen ohne Kurs, mit der Zahl der betroffenen Tage. */
  withoutPrices: { name: string; days: number }[]
  /** Tag, an dem der Vergleich tatsächlich beginnt - kann später liegen als der gewählte Zeitraum. */
  actualStart: string
  requestedStart: string
}

export function DataQualityNote({
  withoutPrices,
  actualStart,
  requestedStart
}: DataQualityNoteProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const startsLater = actualStart > requestedStart
  const relevantGaps = withoutPrices.filter((p) => p.days >= RELEVANT_GAP_DAYS)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="font-medium text-slate-900 dark:text-slate-100">
          Wie diese Zahlen zustande kommen
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {open ? 'Einklappen' : 'Aufklappen'}
        </span>
      </button>

      {startsLater && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Der Vergleich beginnt erst am {formatDate(actualStart)} – vorher fehlen Kurse für
          mindestens eine der Reihen.
        </p>
      )}

      {relevantGaps.length > 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Zeitweise ohne Kursdaten und an diesen Tagen nicht mitgerechnet:{' '}
          {relevantGaps.map((p) => `${p.name} (${p.days} Tage)`).join(', ')}.
        </p>
      )}

      {open && (
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-xs text-slate-600 dark:text-slate-400">
          <li>
            Die Depotkurve ist um Ein- und Auszahlungen bereinigt. An einem Tag, an dem gekauft
            wird, steigt sie deshalb nicht – gemessen wird nur, was die Kurse gemacht haben.
          </li>
          <li>
            Die Vergleichsmaßstäbe rechnen mit wiederangelegten Ausschüttungen. Bei thesaurierenden
            ETFs ist das dasselbe wie der reine Kurs; bei ausschüttenden Positionen wird die eigene
            Rendite dadurch etwas zu niedrig ausgewiesen – es sei denn, die Wiederanlage steht als
            Kauf im Verlauf.
          </li>
          <li>
            Die Modelle werden einmal jährlich zum 1. Januar auf ihre Zielgewichte zurückgesetzt.
          </li>
          <li>
            Tagesgeld, Bargeld und Sonstiges bleiben außen vor – dafür gibt es keinen Kursverlauf.
          </li>
          <li>Steuern und Ordergebühren sind in keiner der Reihen enthalten.</li>
          <li>
            &bdquo;Rendite/Risiko&ldquo; ist die Jahresrendite geteilt durch die Schwankungsbreite
            (Sharpe-Verhältnis mit risikofreiem Zins 0).
          </li>
        </ul>
      )}
    </div>
  )
}
