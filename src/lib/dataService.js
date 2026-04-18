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

// ─── Keys (계정별 분리, localStorage 폴백 시에만 사용) ────────────

const BASE_KEYS = {
  layout: 'classroom-layout',
  students: 'student-list',
  history: 'seat-history',
  settings: 'app-settings',
}

function KEYS(userId) {
  const suffix = userId ? ':' + userId : ''
  return {
    layout: BASE_KEYS.layout + suffix,
    students: BASE_KEYS.students + suffix,
    history: BASE_KEYS.history + suffix,
    settings: BASE_KEYS.settings + suffix,
  }
}

// Supabase 활성화 여부 (userId 필수)
function useDb(userId) {
  return isSupabaseEnabled() && !!userId
}

// ─── Layout ────────────────────────────────────────────────────────

export async function loadLayout(userId) {
  if (useDb(userId)) {
    const { data, error } = await supabase
      .from('classroom_layouts')
      .select('*')
      .eq('teacher_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('loadLayout error:', error)
      return null
    }
    if (!data) return null
    return { rows: data.rows, cols: data.cols, grid: data.grid }
  }
  return localGet(KEYS(userId).layout)
}

export async function saveLayout(userId, rows, cols, grid) {
  if (useDb(userId)) {
    const payload = { teacher_id: userId, rows, cols, grid, updated_at: new Date().toISOString() }
    const { data: existing } = await supabase
      .from('classroom_layouts')
      .select('id')
      .eq('teacher_id', userId)
      .limit(1)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase.from('classroom_layouts').update(payload).eq('id', existing.id)
      if (error) console.error('saveLayout update error:', error)
    } else {
      const { error } = await supabase.from('classroom_layouts').insert(payload)
      if (error) console.error('saveLayout insert error:', error)
    }
    return
  }
  localSet(KEYS(userId).layout, { rows, cols, grid })
}

// ─── Students ──────────────────────────────────────────────────────

export async function loadStudents(userId) {
  if (useDb(userId)) {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('teacher_id', userId)
      .maybeSingle()
    if (error) {
      console.error('loadStudents error:', error)
      return { students: [], groups: [] }
    }
    if (!data) return { students: [], groups: [] }
    return { students: data.students || [], groups: data.groups || [] }
  }
  return localGet(KEYS(userId).students) || { students: [], groups: [] }
}

export async function saveStudents(userId, studentData) {
  if (useDb(userId)) {
    const payload = { teacher_id: userId, ...studentData, updated_at: new Date().toISOString() }
    const { data: existing } = await supabase
      .from('students')
      .select('id')
      .eq('teacher_id', userId)
      .limit(1)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase.from('students').update(payload).eq('id', existing.id)
      if (error) console.error('saveStudents update error:', error)
    } else {
      const { error } = await supabase.from('students').insert(payload)
      if (error) console.error('saveStudents insert error:', error)
    }
    return
  }
  localSet(KEYS(userId).students, studentData)
}

// ─── History ───────────────────────────────────────────────────────

export async function loadHistory(userId) {
  if (useDb(userId)) {
    const { data, error } = await supabase
      .from('seat_history')
      .select('*')
      .eq('teacher_id', userId)
      .order('date', { ascending: false })
    if (error) {
      console.error('loadHistory error:', error)
      return []
    }
    return (data || []).map((r) => ({
      id: r.id,
      date: r.date,
      assignment: r.assignment,
      adjacencyPairs: r.adjacency_pairs,
      layout: r.layout,
    }))
  }
  const raw = localGet(KEYS(userId).history)
  return Array.isArray(raw) ? raw : []
}

export async function saveHistoryRecord(userId, record) {
  if (useDb(userId)) {
    const { error } = await supabase.from('seat_history').insert({
      teacher_id: userId,
      date: record.date,
      assignment: record.assignment,
      adjacency_pairs: record.adjacencyPairs || [],
      layout: record.layout,
    })
    if (error) console.error('saveHistoryRecord error:', error)
    return
  }
  const local = localGet(KEYS(userId).history) || []
  local.push(record)
  localSet(KEYS(userId).history, local)
}

export async function deleteHistoryRecord(userId, indexOrRecord) {
  if (useDb(userId)) {
    const recordId = typeof indexOrRecord === 'object' ? indexOrRecord?.id : null
    if (recordId) {
      const { error } = await supabase.from('seat_history').delete().eq('id', recordId)
      if (error) console.error('deleteHistoryRecord error:', error)
    }
    return
  }
  const local = localGet(KEYS(userId).history) || []
  local.splice(indexOrRecord, 1)
  localSet(KEYS(userId).history, local)
}

export async function clearAllHistory(userId) {
  if (useDb(userId)) {
    const { error } = await supabase.from('seat_history').delete().eq('teacher_id', userId)
    if (error) console.error('clearAllHistory error:', error)
    return
  }
  localSet(KEYS(userId).history, [])
}

// ─── Full reset ────────────────────────────────────────────────────

export async function resetAllData(userId) {
  if (useDb(userId)) {
    await Promise.all([
      supabase.from('classroom_layouts').delete().eq('teacher_id', userId),
      supabase.from('students').delete().eq('teacher_id', userId),
      supabase.from('seat_history').delete().eq('teacher_id', userId),
      supabase.from('app_settings').delete().eq('teacher_id', userId),
    ])
    return
  }
  const keys = KEYS(userId)
  localRemove(keys.layout)
  localRemove(keys.students)
  localRemove(keys.history)
  localRemove('loaded-assignment')
  localRemove(keys.settings)
}

// ─── JSON Backup / Restore ─────────────────────────────────────────

export async function exportBackup(userId) {
  if (useDb(userId)) {
    const [layout, students, history] = await Promise.all([
      loadLayout(userId),
      loadStudents(userId),
      loadHistory(userId),
    ])
    return {
      version: 1,
      exportDate: new Date().toISOString(),
      data: {
        [BASE_KEYS.layout]: layout,
        [BASE_KEYS.students]: students,
        [BASE_KEYS.history]: history,
      },
    }
  }
  const keys = KEYS(userId)
  return {
    version: 1,
    exportDate: new Date().toISOString(),
    data: {
      [BASE_KEYS.layout]: localGet(keys.layout),
      [BASE_KEYS.students]: localGet(keys.students),
      [BASE_KEYS.history]: localGet(keys.history),
    },
  }
}

export async function importBackup(userId, backupData) {
  const { data } = backupData
  if (!data || typeof data !== 'object') throw new Error('Invalid backup format')

  const layout = data[BASE_KEYS.layout]
  const students = data[BASE_KEYS.students]
  const history = data[BASE_KEYS.history]

  if (useDb(userId)) {
    if (layout) await saveLayout(userId, layout.rows, layout.cols, layout.grid)
    if (students) await saveStudents(userId, students)

    await clearAllHistory(userId)
    const list = Array.isArray(history) ? history : []
    for (const record of list) {
      await saveHistoryRecord(userId, record)
    }
    return
  }

  const userSuffix = userId ? ':' + userId : ''
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      localSet(key + userSuffix, value)
    }
  })
}
