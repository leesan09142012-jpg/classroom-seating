import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useClassroom(userId) {
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadLayout = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('classroom_layouts')
        .select('*')
        .eq('teacher_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      setLayout(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const saveLayout = useCallback(async (layoutData) => {
    if (!userId) return;

    try {
      setError(null);
      const payload = {
        ...layoutData,
        teacher_id: userId,
        updated_at: new Date().toISOString(),
      };

      let result;

      if (layout?.id) {
        // Update existing layout
        const { data, error: updateError } = await supabase
          .from('classroom_layouts')
          .update(payload)
          .eq('id', layout.id)
          .eq('teacher_id', userId)
          .select()
          .single();

        if (updateError) throw updateError;
        result = data;
      } else {
        // Insert new layout
        const { data, error: insertError } = await supabase
          .from('classroom_layouts')
          .insert(payload)
          .select()
          .single();

        if (insertError) throw insertError;
        result = data;
      }

      setLayout(result);
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [userId, layout?.id]);

  useEffect(() => {
    loadLayout();
  }, [loadLayout]);

  return { layout, loading, error, saveLayout, loadLayout };
}
