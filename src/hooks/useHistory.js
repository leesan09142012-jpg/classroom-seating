import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useHistory(userId) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRecords = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('seat_history')
        .select('*')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setHistory(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const saveRecord = useCallback(async (record) => {
    if (!userId) return null;

    try {
      setError(null);
      const { data, error: insertError } = await supabase
        .from('seat_history')
        .insert({
          teacher_id: userId,
          layout_snapshot: record.layout_snapshot || {},
          assignment: record.assignment || [],
          adjacency_pairs: record.adjacency_pairs || [],
          memo: record.memo || '',
        })
        .select()
        .single();

      if (insertError) throw insertError;
      setHistory((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [userId]);

  const deleteRecord = useCallback(async (recordId) => {
    if (!userId) return false;

    try {
      setError(null);
      const { error: deleteError } = await supabase
        .from('seat_history')
        .delete()
        .eq('id', recordId)
        .eq('teacher_id', userId);

      if (deleteError) throw deleteError;
      setHistory((prev) => prev.filter((r) => r.id !== recordId));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [userId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  return { history, loading, error, saveRecord, loadRecords, deleteRecord };
}
