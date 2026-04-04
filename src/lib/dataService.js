import { supabase, isSupabaseEnabled } from './supabase'

// ─── localStorage helpers ──────────────────────────────────────────

function localGet(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function localSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore */ }
}

function localRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch { /* ignore */ }
}

// ─── Keys ──────────────────────────────────────────────────────────

const KEYS = {
  layout: 'classroom-layout',
  students: 'student-list',
  history: 'seat-history',
  settings: 'app-settings',
}

// ─── Layout ────────────────────────────────────────────────────────

export async function loadLayout(userId) {
  if (isSupabaseEnabled() && userId) {
    const { data, error } = await supabase
      .from('classroom_layouts')
      .select('*')
      .eq('teacher_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
    if (!error && data) {
      return { rows: data.rows, cols: data.cols, grid: data.grid }
    }
  }
  return localGet(KEYS.layout)
}

export async function saveLayout(userId, rows, cols, grid) {
  localSet(KEYS.layout, { rows, cols, grid })

  if (isSupabaseEnabled() && userId) {
    const payload = { teacher_id: userId, rows, cols, grid, updated_at: new Date().toISOString() }
    const { data: existing } = await supabase
      .from('classroom_layouts')
      .select('id')
      .eq('teacher_id', userId)
      .limit(1)
      .single()

    if (existing) {
      await supabase.from('classroom_layouts').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('classroom_layouts').insert(payload)
    }
  }
}

// ─── Students ──────────────────────────────────────────────────────

export async function loadStudents(userId) {
  if (isSupabaseEnabled() && userId) {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('teacher_id', userId)
      .single()
    if (!error && data) {
      return { students: data.students || [], groups: data.groups || [] }
    }
  }
  return localGet(KEYS.students) || { students: [], groups: [] }
}

export async function saveStudents(userId, studentData) {
  localSet(KEYS.students, studentData)

  if (isSupabaseEnabled() && userId) {
    const payload = { teacher_id: userId, ...studentData, updated_at: new Date().toISOString() }
    const { data: existing } = await supabase
      .from('students')
      .select('id')
      .eq('teacher_id', userId)
      .limit(1)
      .single()

    if (existing) {
      await supabase.from('students').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('students').insert(payload)
    }
  }
}

// ─── History ───────────────────────────────────────────────────────

export async function loadHistory(userId) {
  if (isSupabaseEnabled() && userId) {
    const { data, error } = await supabase
      .from('seat_history')
      .select('*')
      .eq('teacher_id', userId)
      .order('date', { ascending: false })
    if (!error && data) {
      return data.map((r) => ({
        id: r.id,
        date: r.date,
        assignment: r.assignment,
        adjacencyPairs: r.adjacency_pairs,
        layout: r.layout,
      }))
    }
  }
  const raw = localGet(KEYS.history)
  return Array.isArray(raw) ? raw : []
}

export async function saveHistoryRecord(userId, record) {
  // Also update localStorage
  const local = localGet(KEYS.history) || []
  local.push(record)
  localSet(KEYS.history, local)

  if (isSupabaseEnabled() && userId) {
    await supabase.from('seat_history').insert({
      teacher_id: userId,
      date: record.date,
      assignment: record.assignment,
      adjacency_pairs: record.adjacencyPairs || [],
      layout: record.layout,
    })
  }
}

export async function deleteHistoryRecord(userId, index) {
  // localStorage: remove by index
  const local = localGet(KEYS.history) || []
  const removed = local[index]
  local.splice(index, 1)
  localSet(KEYS.history, local)

  if (isSupabaseEnabled() && userId && removed?.id) {
    await supabase.from('seat_history').delete().eq('id', removed.id)
  }
}

export async function clearAllHistory(userId) {
  localSet(KEYS.history, [])

  if (isSupabaseEnabled() && userId) {
    await supabase.from('seat_history').delete().eq('teacher_id', userId)
  }
}

// ─── Full reset ────────────────────────────────────────────────────

export async function resetAllData(userId) {
  localRemove(KEYS.layout)
  localRemove(KEYS.students)
  localRemove(KEYS.history)
  localRemove('loaded-assignment')
  localRemove('app-settings')

  if (isSupabaseEnabled() && userId) {
    await Promise.all([
      supabase.from('classroom_layouts').delete().eq('teacher_id', userId),
      supabase.from('students').delete().eq('teacher_id', userId),
      supabase.from('seat_history').delete().eq('teacher_id', userId),
      supabase.from('app_settings').delete().eq('teacher_id', userId),
    ])
  }
}

// ─── JSON Backup / Restore ─────────────────────────────────────────

export function exportBackup() {
  return {
    version: 1,
    exportDate: new Date().toISOString(),
    data: {
      [KEYS.layout]: localGet(KEYS.layout),
      [KEYS.students]: localGet(KEYS.students),
      [KEYS.history]: localGet(KEYS.history),
    },
  }
}

export async function importBackup(userId, backupData) {
  const { data } = backupData
  if (!data || typeof data !== 'object') throw new Error('Invalid backup format')

  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      localSet(key, value)
    }
  })

  // If Supabase enabled, sync local data to cloud
  if (isSupabaseEnabled() && userId) {
    const layout = localGet(KEYS.layout)
    if (layout) await saveLayout(userId, layout.rows, layout.cols, layout.grid)

    const students = localGet(KEYS.students)
    if (students) await saveStudents(userId, students)

    // History: clear and re-insert
    await clearAllHistory(userId)
    const history = localGet(KEYS.history) || []
    for (const record of history) {
      await saveHistoryRecord(userId, record)
    }
  }
}
