import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { EmptyState, PageHeader } from '../components/ui'
import { ShowGrid } from '../components/ShowGrid'

export function Search() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const load = useCallback((page: number) => api.search(q, page), [q])

  if (!q) {
    return (
      <>
        <PageHeader title="Search" />
        <EmptyState title="Type a drama name in the search box" />
      </>
    )
  }

  return (
    <>
      <PageHeader title={`Results for "${q}"`} />
      <ShowGrid
        resetKey={`search:${q}`}
        load={load}
        emptyTitle={`No dramas match "${q}"`}
        emptyHint="Try a different spelling or a shorter query."
      />
    </>
  )
}
