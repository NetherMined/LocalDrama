import { useCallback } from 'react'
import { api } from '../api'
import { PageHeader } from '../components/ui'
import { ShowGrid } from '../components/ShowGrid'

export function Browse() {
  const load = useCallback((page: number) => api.latest(page), [])
  return (
    <>
      <PageHeader title="Browse" />
      <ShowGrid resetKey="latest" load={load} emptyTitle="No dramas found" emptyHint="The catalogue returned nothing. Try again later." />
    </>
  )
}
