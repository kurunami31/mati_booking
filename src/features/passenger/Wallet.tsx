import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../stores/auth'
import { supabase } from '../../lib/supabase'
import { useTableSubscription } from '../../hooks/useRealtime'
import { formatPeso, formatDateTime } from '../../lib/format'
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from '../../components/UI'
import type { WalletTransactionRow } from '../../types/db'

const TOPUPS = [100, 200, 500]

/** Mock in-app wallet (GrabPay-style). No real money moves. */
export function Wallet() {
  const { profile } = useAuth()
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<WalletTransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    const [walletRes, txRes] = await Promise.all([
      supabase.from('wallets').select('balance').eq('profile_id', profile.id).maybeSingle(),
      supabase
        .from('wallet_transactions')
        .select('*')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    setBalance(Number(walletRes.data?.balance ?? 0))
    setTransactions((txRes.data ?? []) as WalletTransactionRow[])
    setLoading(false)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  useTableSubscription({
    table: 'wallet_transactions',
    enabled: Boolean(profile),
    filter: profile ? `profile_id=eq.${profile.id}` : undefined,
    onChange: load,
  })

  async function topup(amount: number) {
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.rpc('wallet_topup', { p_amount: amount })
    setBusy(false)
    if (error) {
      setMessage(error.message)
    } else {
      setMessage(`Added ${formatPeso(amount)} (simulated).`)
      await load()
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8 text-brand-700" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="SakayTa Wallet" subtitle="Simulated balance for cashless rides." />

      {message && <Alert tone="info">{message}</Alert>}

      <Card>
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Balance</p>
        <p className="mt-1 text-4xl font-extrabold text-slate-900">{formatPeso(balance)}</p>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Top up (simulated)</p>
        <div className="grid grid-cols-3 gap-2">
          {TOPUPS.map((amount) => (
            <Button key={amount} variant="secondary" disabled={busy} onClick={() => void topup(amount)}>
              +{formatPeso(amount)}
            </Button>
          ))}
        </div>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Transactions
        </h2>
        {transactions.length === 0 ? (
          <EmptyState title="No transactions yet" />
        ) : (
          <ul className="space-y-2">
            {transactions.map((tx) => (
              <Card as="li" key={tx.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {tx.kind === 'topup'
                        ? 'Top-up'
                        : tx.kind === 'ride_payment'
                          ? 'Ride payment'
                          : 'Refund'}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTime(tx.created_at)}</p>
                  </div>
                  <p
                    className={
                      'font-extrabold ' + (tx.kind === 'topup' ? 'text-emerald-700' : 'text-slate-900')
                    }
                  >
                    {tx.kind === 'topup' ? '+' : '-'}
                    {formatPeso(Number(tx.amount))}
                  </p>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-500">
        No real money moves. A real gateway can replace this later.
      </p>
    </div>
  )
}
