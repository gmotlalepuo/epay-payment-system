import { ReactNode } from 'react'
import { getCurrentUser, getUserRole } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminShell from '@/components/admin-shell'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) return redirect(`/auth/login?next=/admin`)

  const role = await getUserRole()
  if (role !== 'super_admin') return redirect('/dashboard')

  return <AdminShell>{children}</AdminShell>
}
