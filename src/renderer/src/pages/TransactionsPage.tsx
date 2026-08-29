import { formatDate, formatEur, formatNumber } from '../lib/format'
import { useTransactions } from '../lib/queries'

const BROKER_LABELS: Record<string, string> = {
  FINANZEN_ZERO: 'finanzen.net Zero'
}

export function TransactionsPage(): React.JSX.Element {
  const { data: transactions, isLoading, error } = useTransactions()

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Verlauf</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Alle Käufe und Verkäufe</p>
      </header>

      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Lade Verlauf…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">Fehler beim Laden: {String(error)}</p>}

      {transactions && transactions.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Noch keine Transaktionen erfasst. Käufe/Verkäufe entstehen automatisch beim CSV-Import auf der
          Positionen-Seite.
        </p>
      )}

      {transactions && transactions.length > 0 && (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-900">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Datum</th>
              <th className="px-3 py-2 font-medium">Position</th>
              <th className="px-3 py-2 font-medium">Typ</th>
              <th className="px-3 py-2 font-medium">Menge</th>
              <th className="px-3 py-2 font-medium">Preis</th>
              <th className="px-3 py-2 font-medium">Wert</th>
              <th className="px-3 py-2 font-medium">Quelle</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 text-slate-900 dark:border-slate-800 dark:text-slate-100">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="px-3 py-2">{t.positionName}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.type === 'BUY'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                    }`}
                  >
                    {t.type === 'BUY' ? 'Kauf' : 'Verkauf'}
                  </span>
                </td>
                <td className="px-3 py-2">{formatNumber(t.quantity)}</td>
                <td className="px-3 py-2">{formatEur(t.price)}</td>
                <td className="px-3 py-2 font-medium">{formatEur(t.quantity * t.price)}</td>
                <td className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                  {t.broker ? (BROKER_LABELS[t.broker] ?? t.broker) : 'manuell'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
