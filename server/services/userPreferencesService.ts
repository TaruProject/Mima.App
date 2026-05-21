import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseUrl = '';
let supabaseServiceKey = '';

export function initUserPreferencesService(url: string, key: string) {
  supabaseUrl = url;
  supabaseServiceKey = key;
}

function getSupabase(): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export interface UserPreferences {
  user_id: string;
  onboarding_done: boolean;
  voice_id: string;
  language: string;
  last_daily_briefing_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessage {
  id?: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode?: string;
  audio_data?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          user_id: userId,
          onboarding_done: false,
          voice_id: 'DODLEQrClDo8wCz460ld',
          language: 'en',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      console.error('Error fetching user preferences:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getUserPreferences:', error);
    return null;
  }
}

export async function updateUserPreferences(
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<boolean> {
  try {
    const supabase = getSupabase();

    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: userId,
        ...preferences,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    );

    if (error) {
      console.error('Error updating user preferences:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateUserPreferences:', error);
    return false;
  }
}

export async function getChatHistory(userId: string, limit: number = 50): Promise<ChatMessage[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error fetching chat history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getChatHistory:', error);
    return [];
  }
}

export async function saveChatMessage(message: ChatMessage): Promise<boolean> {
  try {
    const supabase = getSupabase();

    const { error } = await supabase.from('chat_messages').insert({
      ...message,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Error saving chat message:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in saveChatMessage:', error);
    return false;
  }
}

export async function saveChatMessages(messages: ChatMessage[]): Promise<boolean> {
  try {
    const supabase = getSupabase();

    const messagesWithTimestamps = messages.map((msg) => ({
      ...msg,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('chat_messages').insert(messagesWithTimestamps);

    if (error) {
      console.error('Error saving chat messages:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in saveChatMessages:', error);
    return false;
  }
}

export async function clearChatHistory(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabase();

    const { error } = await supabase.from('chat_messages').delete().eq('user_id', userId);

    if (error) {
      console.error('Error clearing chat history:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in clearChatHistory:', error);
    return false;
  }
}

export async function pruneOldMessages(userId: string, keepCount: number = 100): Promise<boolean> {
  try {
    const supabase = getSupabase();

    const { data: messagesToKeep } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(keepCount);

    const keepIds = messagesToKeep?.map((m) => m.id) || [];

    if (keepIds.length === 0) {
      return true;
    }

    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', userId)
      .not('id', 'in', `(${keepIds.join(',')})`);

    if (error) {
      console.error('Error pruning old messages:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in pruneOldMessages:', error);
    return false;
  }
}
