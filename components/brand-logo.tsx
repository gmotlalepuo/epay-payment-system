import Image from 'next/image'
import { cn } from '@/lib/utils'

export function BrandLogo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <span className={cn('relative block h-12 w-40 shrink-0 overflow-hidden rounded-lg bg-white', className)}>
      <Image
        src="/botspay-logo.png"
        alt="BotsPay"
        fill
        sizes="192px"
        priority={priority}
        unoptimized
        className="object-cover object-center"
      />
    </span>
  )
}
