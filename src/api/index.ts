export const API_BASE_URL = '/api'

export const api = {
  projects: {
    list: async () => {
      const res = await fetch(`${API_BASE_URL}/projects`)
      return res.json()
    },
    create: async (data: any) => {
      const res = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return res.json()
    },
    get: async (id: string) => {
      const res = await fetch(`${API_BASE_URL}/projects/${id}`)
      return res.json()
    },
    update: async (id: string, data: any) => {
      const res = await fetch(`${API_BASE_URL}/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return res.json()
    },
    delete: async (id: string) => {
      const res = await fetch(`${API_BASE_URL}/projects/${id}`, {
        method: 'DELETE',
      })
      return res.json()
    },
  },
  tasks: {
    create: async (data: any) => {
      const res = await fetch(`${API_BASE_URL}/tasks/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return res.json()
    },
    getStatus: async (id: string) => {
      const res = await fetch(`${API_BASE_URL}/tasks/${id}/status`)
      return res.json()
    },
    cancel: async (id: string) => {
        const res = await fetch(`${API_BASE_URL}/tasks/${id}/cancel`, {
            method: 'POST'
        })
        return res.json()
    }
  },
}
