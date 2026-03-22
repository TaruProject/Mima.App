import { createClient } from "@supabase/supabase-js";

// Helper to get Supabase client with latest environment variables
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    console.error('❌ Supabase configuration missing for UserPreferencesService');
  }
  return createClient(url, key);
}

/**
 * User Preferences Service
 * Manages user preferences stored in Supabase (not localStorage)
 */

export interface UserPreferences {
  user_id: string;
  onboarding_done: boolean;
  voice_id: string;
  language: string;
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

// Get user preferences
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
        // No preferences found, return defaults
        return {
          user_id: userId,
          onboarding_done: false,
          voice_id: 'DODLEQrClDo8wCz460ld',
          language: 'en',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
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

// Update user preferences
export async function updateUserPreferences(
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<boolean> {
  try {
    const supabase = getSupabase();
    
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        ...preferences,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

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

// Get chat history for user
export async function getChatHistory(
  userId: string,
  limit: number = 50
): Promise<ChatMessage[]> {
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

// Save chat message
export async function saveChatMessage(message: ChatMessage): Promise<boolean> {
  try {
    const supabase = getSupabase();
    
    const { error } = await supabase
      .from('chat_messages')
      .insert({
        ...message,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
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

// Save multiple chat messages (for batch saves)
export async function saveChatMessages(messages: ChatMessage[]): Promise<boolean> {
  try {
    const supabase = getSupabase();
    
    const messagesWithTimestamps = messages.map(msg => ({
      ...msg,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('chat_messages')
      .insert(messagesWithTimestamps);

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

// Clear chat history for user
export async function clearChatHistory(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabase();
    
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', userId);

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

// Delete old chat messages (keep only last N messages)
export async function pruneOldMessages(userId: string, keepCount: number = 100): Promise<boolean> {
  try {
    const supabase = getSupabase();
    
    // Get IDs of messages to keep
    const { data: messagesToKeep } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(keepCount);

    const keepIds = messagesToKeep?.map(m => m.id) || [];

    if (keepIds.length === 0) {
      return true; // No messages to prune
    }

    // Delete messages not in the keep list
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
