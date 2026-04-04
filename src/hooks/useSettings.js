import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const DEFAULT_SETTINGS = {
  theme: 'light',
  language: 'ko',
  animation_enabled: true,
  sound_enabled: true,
};

export function useSettings(userId) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSettings = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('app_settings')
        .select('*')
        .eq('teacher_id', userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setSettings({
          theme: data.theme,
          language: data.language,
          animation_enabled: data.animation_enabled,
          sound_enabled: data.sound_enabled,
        });
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const updateSettings = useCallback(async (updates) => {
    if (!userId) return null;

    try {
      setError(null);
      const payload = {
        teacher_id: userId,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const { data, error: upsertError } = await supabase
        .from('app_settings')
        .upsert(payload, { onConflict: 'teacher_id' })
        .select()
        .single();

      if (upsertError) throw upsertError;

      setSettings({
        theme: data.theme,
        language: data.language,
        animation_enabled: data.animation_enabled,
        sound_enabled: data.sound_enabled,
      });
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [userId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return { settings, loading, error, updateSettings };
}
