import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useConfig } from '../app/ConfigProvider'

export function useAdminResource(path, { auto = true } = {}) {
  const { reload: reloadConfig } = useConfig()

  const [data, setData] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(auto)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async (query = '') => {
    setLoading(true)
    try {
      const res = await api.get(`${path}${query}`)
      setData(res.data)
      setMeta(res)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    if (auto) load()
  }, [auto, load])

  /** Runs a mutation, surfaces its message, then refreshes list + config. */
  const mutate = useCallback(
    async (fn, { successMessage, query = '' } = {}) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fn()
        setNotice(successMessage || res?.message || 'Saved')
        await load(query)
        await reloadConfig()
        return res
      } catch (err) {
        setError(err.message)
        return null
      } finally {
        setBusy(false)
      }
    },
    [load, reloadConfig],
  )

  return {
    data, meta, loading, error, busy, notice,
    setError, setNotice, load, mutate,
    api,
  }
}
