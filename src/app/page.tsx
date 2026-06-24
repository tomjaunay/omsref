import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/Dashboard'

export default function Home() {
  const cookieStore = cookies()
  const auth = cookieStore.get('auth')
  const password = process.env.SITE_PASSWORD ?? 'changeme'
  
  if (auth?.value !== password) {
    redirect('/login')
  }

  return <Dashboard />
}
