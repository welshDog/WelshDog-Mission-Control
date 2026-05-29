import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

vi.mock('../lib/supabase', () => {
  const sessionRes = Promise.resolve({ data: { session: null } })
  return {
    supabase: {
      auth: {
        getSession: () => sessionRes,
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: () => Promise.resolve(),
      },
    },
  }
})

describe('Mission Control App', () => {
  it('shows auth gate when not logged in', async () => {
    render(<App />)
    expect(await screen.findByText(/Restricted Access/i)).toBeInTheDocument()
  })
})
