import { ArrowLeftRight, BarChart3, CheckCircle2, CreditCard, QrCode, ShieldCheck, Sparkles, WalletCards, Zap } from 'lucide-react'

const capabilities = [
  { icon: ArrowLeftRight, title: 'Instant transfers', detail: 'Send pula between wallets with clear transaction records.' },
  { icon: QrCode, title: 'QR payments', detail: 'Pay or receive funds using secure payment codes.' },
  { icon: BarChart3, title: 'Spending clarity', detail: 'Track wallet activity, balances, and payment history.' },
]

export function AuthShowcase({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup'

  return (
    <section className="page-enter space-y-7">
      <div className="space-y-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary"><Sparkles className="size-4" />{signup ? 'Built for everyday Botswana payments' : 'Your secure financial workspace'}</span>
        <div className="space-y-3">
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{signup ? 'One wallet for the way you pay.' : 'Welcome back to smarter payments.'}</h1>
          <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">{signup ? 'Create your BotsPay account and manage transfers, card top-ups, and QR payments in Botswana pula from one secure place.' : 'Sign in to manage your pula balance, review activity, and make secure payments without the paperwork.'}</p>
        </div>
      </div>

      {signup ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {capabilities.map((item, index) => <div key={item.title} className="group rounded-2xl border bg-card/75 p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg"><span className="mb-4 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><item.icon className="size-5" /></span><p className="font-semibold">{item.title}</p><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.detail}</p><span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><CheckCircle2 className="size-3.5" />Included</span></div>)}
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border bg-card/80 shadow-[0_30px_80px_-45px_rgba(14,165,233,0.45)] backdrop-blur-xl">
          <div className="border-b p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Wallet preview</p><p className="mt-2 text-3xl font-bold tabular-nums">P12,450.00</p><p className="mt-1 text-xs text-muted-foreground">Example available balance</p></div><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><WalletCards className="size-5" /></span></div></div>
          <div className="grid grid-cols-3 divide-x"><div className="p-4 sm:p-5"><CreditCard className="mb-2 size-4 text-primary" /><p className="text-sm font-semibold">Top up</p><p className="mt-1 text-xs text-muted-foreground">By card</p></div><div className="p-4 sm:p-5"><ArrowLeftRight className="mb-2 size-4 text-primary" /><p className="text-sm font-semibold">Transfer</p><p className="mt-1 text-xs text-muted-foreground">Wallet to wallet</p></div><div className="p-4 sm:p-5"><QrCode className="mb-2 size-4 text-secondary" /><p className="text-sm font-semibold">Scan</p><p className="mt-1 text-xs text-muted-foreground">Pay by QR</p></div></div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-2xl border bg-muted/35 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-[18px]" /></span><div><p className="text-sm font-semibold">Protected access</p><p className="text-xs text-muted-foreground">Secure account authentication</p></div></div>
        <div className="flex items-center gap-3 rounded-2xl border bg-muted/35 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary/10 text-secondary"><Zap className="size-[18px]" /></span><div><p className="text-sm font-semibold">Always available</p><p className="text-xs text-muted-foreground">Manage payments anytime</p></div></div>
      </div>
    </section>
  )
}
