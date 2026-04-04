import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useStudents(userId) {
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [studentsRes, groupsRes] = await Promise.all([
        supabase
          .from('students')
          .select('*')
          .eq('teacher_id', userId)
          .order('number', { ascending: true }),
        supabase
          .from('student_groups')
          .select('*')
          .eq('teacher_id', userId)
          .order('created_at', { ascending: true }),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (groupsRes.error) throw groupsRes.error;

      setStudents(studentsRes.data || []);
      setGroups(groupsRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const addStudent = useCallback(async (studentData) => {
    if (!userId) return null;

    try {
      setError(null);
      const { data, error: insertError } = await supabase
        .from('students')
        .insert({ ...studentData, teacher_id: userId })
        .select()
        .single();

      if (insertError) throw insertError;
      setStudents((prev) => [...prev, data]);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [userId]);

  const removeStudent = useCallback(async (studentId) => {
    if (!userId) return false;

    try {
      setError(null);
      const { error: deleteError } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId)
        .eq('teacher_id', userId);

      if (deleteError) throw deleteError;
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [userId]);

  const updateStudent = useCallback(async (studentId, updates) => {
    if (!userId) return null;

    try {
      setError(null);
      const { data, error: updateError } = await supabase
        .from('students')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', studentId)
        .eq('teacher_id', userId)
        .select()
        .single();

      if (updateError) throw updateError;
      setStudents((prev) => prev.map((s) => (s.id === studentId ? data : s)));
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [userId]);

  const addGroup = useCallback(async (groupData) => {
    if (!userId) return null;

    try {
      setError(null);
      const { data, error: insertError } = await supabase
        .from('student_groups')
        .insert({ ...groupData, teacher_id: userId })
        .select()
        .single();

      if (insertError) throw insertError;
      setGroups((prev) => [...prev, data]);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [userId]);

  const removeGroup = useCallback(async (groupId) => {
    if (!userId) return false;

    try {
      setError(null);
      const { error: deleteError } = await supabase
        .from('student_groups')
        .delete()
        .eq('id', groupId)
        .eq('teacher_id', userId);

      if (deleteError) throw deleteError;
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      // Clear group_id from students that belonged to this group
      setStudents((prev) =>
        prev.map((s) => (s.group_id === groupId ? { ...s, group_id: null } : s))
      );
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [userId]);

  const saveAll = useCallback(async (studentsList, groupsList) => {
    if (!userId) return false;

    try {
      setError(null);

      // Upsert groups
      if (groupsList && groupsList.length > 0) {
        const groupsPayload = groupsList.map((g) => ({
          ...g,
          teacher_id: userId,
        }));
        const { error: groupsError } = await supabase
          .from('student_groups')
          .upsert(groupsPayload, { onConflict: 'id' });
        if (groupsError) throw groupsError;
      }

      // Upsert students
      if (studentsList && studentsList.length > 0) {
        const studentsPayload = studentsList.map((s) => ({
          ...s,
          teacher_id: userId,
          updated_at: new Date().toISOString(),
        }));
        const { error: studentsError } = await supabase
          .from('students')
          .upsert(studentsPayload, { onConflict: 'id' });
        if (studentsError) throw studentsError;
      }

      await loadAll();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [userId, loadAll]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return {
    students,
    groups,
    loading,
    error,
    addStudent,
    removeStudent,
    updateStudent,
    addGroup,
    removeGroup,
    saveAll,
    loadAll,
  };
}
